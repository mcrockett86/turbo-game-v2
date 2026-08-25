/**
 * Audio Manager — Web Audio API (no external dependencies)
 *
 * v2 (Sprint 6):
 *  - Music beds composed per zone from engine/music.ts (bass + arp + pad +
 *    optional melody), scheduled by a lookahead timer against ctx.currentTime.
 *  - A mix bus: sfx -> master, music -> duckGain -> master. Ducking lowers
 *    the music bed while SFX play (threat minigames, dialogue, pickups) so
 *    transient audio stays audible.
 *  - Real SFX: bark, select, pickup, threat start/success/fail, footsteps.
 *
 * Design rules:
 *  - Audio must NEVER break game flow. Every public call is try/caught.
 *  - init() is idempotent and must be called from a user gesture (autoplay
 *    policy). The app wires it to the first click.
 *  - dispose() tears down nodes + timers; call it on zone teardown if the
 *    renderer is destroyed.
 *  - Ducking is gain automation on the duckGain node (setTargetAtTime), so
 *    it's cheap and sample-accurate.
 */

import { TRACKS, chordForDegree, degreeToSemitones, midiToFreq, type TrackSpec } from './music';

// ---- Tunable audio constants (kept local; not game balance) ----
const SFX_LEVEL = 0.9;          // master SFX level
const MUSIC_LEVEL = 0.8;        // master music level (before duck)
const DUCK_FACTOR = 0.35;       // music drops to 35% during SFX
const DUCK_ATTACK = 0.05;       // s (fast dip)
const DUCK_RELEASE = 0.6;       // s (slow return)
const LOOKAHEAD_SEC = 0.12;     // schedule this far ahead
const TIMER_INTERVAL_MS = 40;   // scheduler tick
const BASS_WAVE: OscillatorType = 'triangle';
const ARP_WAVE: OscillatorType = 'sine';
const PAD_WAVE: OscillatorType = 'sawtooth';
const MELODY_WAVE: OscillatorType = 'triangle';

interface ScheduledNode { stopAt: number; osc?: OscillatorNode; }

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;   // per-zone bed level
  private duckGain: GainNode | null = null;    // ducking node (music only)

  private schedulerTimer: number | null = null;
  private nextNoteTime = 0;
  private currentTrack: TrackSpec | null = null;
  private trackName = '';
  private noteIndex = 0;

  // Live music voices we created (so we can stop them on track change).
  private liveVoices: ScheduledNode[] = [];
  // Ducking bookkeeping: how many SFX are currently "active" for ducking.
  private activeSfx = 0;

  // ===== Lifecycle =====

  /** Idempotent. Call from a user gesture. Safe to call repeatedly. */
  init(): void {
    if (this.ctx) {
      // Resume if suspended (autoplay policy / tab blur).
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // No Web Audio — game runs silent, never throws.

    this.ctx = new Ctor();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.ctx.destination);

    this.duckGain = this.ctx.createGain();
    this.duckGain.gain.value = 1.0;
    this.duckGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = MUSIC_LEVEL;
    this.musicGain.connect(this.duckGain);
  }

  /** Tear down all nodes + timers. Safe to call multiple times. */
  dispose(): void {
    this.stopScheduler();
    this.stopAllVoices();
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close();
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.duckGain = null;
    this.currentTrack = null;
    this.trackName = '';
    this.activeSfx = 0;
  }

  get isReady(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Number of music voices currently tracked (for stability assertions). */
  get liveVoiceCount(): number {
    return this.liveVoices.length;
  }

  // ===== Music =====

  /** Start (or restart) the music bed for a zone. Best-effort. */
  playMusic(track: string): void {
    if (!this.ctx || !this.musicGain) return;
    try {
      this.stopScheduler();
      this.stopAllVoices();
      this.currentTrack = TRACKS[track] ?? TRACKS.default;
      this.trackName = track;
      this.noteIndex = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.05;
      this.startScheduler();
    } catch (e) {
      console.warn('[Audio] playMusic failed:', (e as Error).message);
    }
  }

  stopMusic(): void {
    this.stopScheduler();
    this.stopAllVoices();
    this.currentTrack = null;
    this.trackName = '';
  }

  get currentTrackName(): string {
    return this.trackName;
  }

  // ===== SFX =====

  /**
   * Play a named SFX. Names: 'bark' | 'select' | 'pickup' | 'footstep' |
   * 'threat_start' | 'threat_success' | 'threat_fail'. Unknown names fall
   * back to a soft click. Best-effort — never throws.
   */
  playSfx(name: string): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      this.beginDuck();
      switch (name) {
        case 'bark': this.sfxBark(now); break;
        case 'select': this.sfxSelect(now); break;
        case 'pickup': this.sfxPickup(now); break;
        case 'footstep': this.sfxFootstep(now); break;
        case 'threat_start': this.sfxThreatStart(now); break;
        case 'threat_success': this.sfxThreatSuccess(now); break;
        case 'threat_fail': this.sfxThreatFail(now); break;
        default: this.sfxSelect(now);
      }
    } catch (e) {
      console.warn('[Audio] SFX failed:', (e as Error).message);
    }
  }

  // ===== Ducking =====

  /**
   * Externally request a duck (e.g. during a threat minigame or dialogue).
   * Pair with endDuck() to release. Ref-counted so overlapping sources don't
   * fight each other.
   */
  beginDuck(): void {
    if (!this.ctx || !this.duckGain) return;
    this.activeSfx += 1;
    if (this.activeSfx === 1) {
      const now = this.ctx.currentTime;
      this.duckGain.gain.cancelScheduledValues(now);
      this.duckGain.gain.setTargetAtTime(DUCK_FACTOR, now, DUCK_ATTACK);
    }
  }

  endDuck(): void {
    if (!this.ctx || !this.duckGain) return;
    this.activeSfx = Math.max(0, this.activeSfx - 1);
    if (this.activeSfx === 0) {
      const now = this.ctx.currentTime;
      this.duckGain.gain.cancelScheduledValues(now);
      this.duckGain.gain.setTargetAtTime(1.0, now, DUCK_RELEASE);
    }
  }

  // ===== Scheduler (music bed) =====

  private startScheduler(): void {
    if (this.schedulerTimer !== null) return;
    const tick = (): void => {
      if (!this.ctx || !this.currentTrack) return;
      const horizon = this.ctx.currentTime + LOOKAHEAD_SEC;
      while (this.nextNoteTime < horizon) {
        this.scheduleStep(this.noteIndex, this.nextNoteTime);
        this.advanceStep();
      }
    };
    tick(); // prime the first step immediately
    this.schedulerTimer = window.setInterval(tick, TIMER_INTERVAL_MS);
  }

  private stopScheduler(): void {
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  /** Seconds per 8th-note at the current tempo (steps are 8ths). */
  private stepDuration(): number {
    return (60 / this.currentTrack!.bpm) / 2;
  }

  private advanceStep(): void {
    this.noteIndex += 1;
    this.nextNoteTime += this.stepDuration();
  }

  /**
   * Schedule one 8th-note step: bass on the beat, arp as the 8ths, pad on
   * the bar start, melody on its motif degrees.
   */
  private scheduleStep(index: number, time: number): void {
    const track = this.currentTrack;
    if (!track) return;

    const stepsPerBar = 8;
    const bar = Math.floor(index / stepsPerBar);
    const inBar = index % stepsPerBar;
    const chordDeg = track.progression[bar % track.progression.length];

    // Bass: root on beats 0 and 4 (8ths 0 and 4).
    if (track.layers.bass && (inBar === 0 || inBar === 4)) {
      const midi = midiToFreqSafe(chordForDegree(track.root, chordDeg, track.scale)[0]);
      this.voice(time, midi, BASS_WAVE, 0.16, 0.28, track.level);
    }

    // Arp: every 8th, cycling the chord.
    if (track.layers.arp) {
      const chord = chordForDegree(track.root, chordDeg, track.scale);
      const note = chord[index % chord.length];
      this.voice(time, midiToFreqSafe(note), ARP_WAVE, 0.12, 0.16, track.level * 0.8);
    }

    // Pad: sustained chord at each bar start.
    if (track.layers.pad && inBar === 0) {
      const chord = chordForDegree(track.root, chordDeg, track.scale);
      const barLen = this.stepDuration() * stepsPerBar;
      for (const note of chord) {
        this.sustainedVoice(time, midiToFreqSafe(note + 12), PAD_WAVE, barLen, 0.05, track.level * 0.5);
      }
    }

    // Melody: only on motif degrees (motif is 8 steps = one bar).
    if (track.layers.melody && track.melodyMotif) {
      const deg = track.melodyMotif[inBar % track.melodyMotif.length];
      const midi = midiToFreqSafe(55 + degreeToSemitones(track.root, deg, track.scale) + 24);
      this.voice(time, midi, MELODY_WAVE, 0.18, 0.14, track.level * 0.9);
    }
  }

  // ===== Voice builders =====

  /** One-shot voice: attack -> decay. Returns nothing; tracked for cleanup. */
  private voice(time: number, midi: number, type: OscillatorType, dur: number, level: number, trackLevel: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = midiToFreq(midi);
    const peak = Math.max(0.001, level * trackLevel);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
    this.trackVoice(osc, time + dur + 0.02);
  }

  /** Sustained voice (pad): holds for `dur`, soft release. */
  private sustainedVoice(time: number, midi: number, type: OscillatorType, dur: number, level: number, trackLevel: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = midiToFreq(midi);
    const peak = Math.max(0.001, level * trackLevel);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.4);
    g.gain.setValueAtTime(peak, time + dur - 0.2);
    g.gain.linearRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.05);
    this.trackVoice(osc, time + dur + 0.05);
  }

  private trackVoice(osc: OscillatorNode, stopAt: number): void {
    this.liveVoices.push({ osc, stopAt });
    // Opportunistic GC of nodes that have already stopped (keeps the array
    // bounded during a long session — the stability-pass concern).
    if (this.liveVoices.length > 400) {
      const now = this.ctx ? this.ctx.currentTime : 0;
      this.liveVoices = this.liveVoices.filter(v => v.stopAt > now);
    }
  }

  private stopAllVoices(): void {
    if (!this.ctx) { this.liveVoices = []; return; }
    const now = this.ctx.currentTime;
    for (const v of this.liveVoices) {
      if (v.stopAt > now) {
        try { v.osc?.stop(now + 0.05); } catch { /* already stopped */ }
      }
    }
    this.liveVoices = [];
  }

  // ===== SFX builders (procedural, layered) =====

  private sfxBark(now: number): void {
    // Two quick rising "woof" blips.
    this.sfxTone(now, 180, 260, 0.12, 'sawtooth', 0.5, 0.06);
    this.sfxTone(now + 0.14, 160, 240, 0.14, 'sawtooth', 0.45, 0.06);
  }

  private sfxSelect(now: number): void {
    this.sfxTone(now, 660, 660, 0.07, 'sine', 0.3, 0.03);
  }

  private sfxPickup(now: number): void {
    this.sfxTone(now, 720, 980, 0.1, 'triangle', 0.4, 0.04);
    this.sfxTone(now + 0.08, 980, 1320, 0.1, 'triangle', 0.35, 0.04);
  }

  private sfxFootstep(now: number): void {
    // Short low thud.
    this.noiseBurst(now, 0.05, 0.12, 400);
  }

  private sfxThreatStart(now: number): void {
    this.sfxTone(now, 220, 160, 0.25, 'sawtooth', 0.4, 0.08);
    this.noiseBurst(now, 0.12, 0.15, 900);
  }

  private sfxThreatSuccess(now: number): void {
    this.sfxTone(now, 523, 523, 0.1, 'triangle', 0.4, 0.05);
    this.sfxTone(now + 0.1, 659, 659, 0.1, 'triangle', 0.4, 0.05);
    this.sfxTone(now + 0.2, 784, 784, 0.16, 'triangle', 0.45, 0.06);
  }

  private sfxThreatFail(now: number): void {
    this.sfxTone(now, 300, 180, 0.3, 'sawtooth', 0.4, 0.08);
    this.noiseBurst(now + 0.05, 0.15, 0.12, 600);
  }

  /** Expose duck release for external callers (e.g. dialogue dismissal). */
  releaseDuck(): void { this.endDuck(); }

  /** A pitched, filtered tone. */
  private sfxTone(now: number, from: number, to: number, dur: number, type: OscillatorType, level: number, attack: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(SFX_LEVEL * level, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /** A short filtered noise burst (thuds, whooshes). */
  private noiseBurst(now: number, dur: number, level: number, cutoff: number): void {
    if (!this.ctx || !this.masterGain) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(SFX_LEVEL * level, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + dur);
  }
}

/** midiToFreq with a safety floor (music.ts already guards, but be defensive). */
function midiToFreqSafe(midi: number): number {
  if (!Number.isFinite(midi)) return 440;
  return Math.max(20, Math.min(20000, midi));
}

export const Audio = new AudioManager();
