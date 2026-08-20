/**
 * Audio Manager — Web Audio API (no external dependencies)
 */

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  
  init(): void {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
  }
  
  playSfx(name: string): void {
    if (!this.ctx || !this.masterGain) return;

    try {
      // Generate procedural SFX based on name
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.masterGain);

      switch(name) {
        case 'bark':
          osc.frequency.setValueAtTime(300, this.ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.2);
          gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
          osc.start(this.ctx.currentTime);
          osc.stop(this.ctx.currentTime + 0.3);
          break;

        case 'select':
          osc.frequency.setValueAtTime(600, this.ctx.currentTime);
          gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
          osc.start(this.ctx.currentTime);
          osc.stop(this.ctx.currentTime + 0.1);
          break;

        case 'pickup':
          osc.frequency.setValueAtTime(800, this.ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
          osc.start(this.ctx.currentTime);
          osc.stop(this.ctx.currentTime + 0.2);
          break;

        default:
          // Generic click
          osc.frequency.setValueAtTime(400, this.ctx.currentTime);
          gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
          osc.start(this.ctx.currentTime);
          osc.stop(this.ctx.currentTime + 0.1);
      }
    } catch (e) {
      // Audio must never break game flow
      console.warn('[Audio] SFX failed:', (e as Error).message);
    }
  }
  
  private activeMusicNodes: OscillatorNode[] = [];
  
  stopMusic(): void {
    this.activeMusicNodes.forEach(node => {
      try { node.stop(); } catch { /* already stopped */ }
    });
    this.activeMusicNodes = [];
  }

  playMusic(track: string): void {
    if (!this.ctx || !this.masterGain) return;

    try {
      // Stop any currently playing music
      this.stopMusic();

      const now = this.ctx.currentTime;

      switch(track) {
        case 'suburban':
          this.playAmbientLoop([
            { freq: 261.63, gain: 0.05 },   // C4
            { freq: 329.63, gain: 0.03 },    // E4
            { freq: 392.00, gain: 0.04 },    // G4
          ], 4);
          break;

        case 'dog_park':
          this.playAmbientLoop([
            { freq: 349.23, gain: 0.06 },    // F4
            { freq: 440.00, gain: 0.05 },    // A4
            { freq: 523.25, gain: 0.07 },    // C5
          ], 2);
          break;

        case 'apartment':
          this.playAmbientLoop([
            { freq: 220.00, gain: 0.04 },    // A3
            { freq: 277.18, gain: 0.03 },    // C#4
            { freq: 329.63, gain: 0.05 },    // E4
          ], 6);
          break;

        case 'shelter':
          this.playAmbientLoop([
            { freq: 196.00, gain: 0.04 },    // G3
            { freq: 246.94, gain: 0.03 },    // B3
            { freq: 293.66, gain: 0.05 },    // D4
          ], 5);
          break;

        case 'home':
          this.playAmbientLoop([
            { freq: 261.63, gain: 0.07 },    // C4
            { freq: 329.63, gain: 0.06 },    // E4
            { freq: 392.00, gain: 0.08 },    // G4
            { freq: 523.25, gain: 0.06 },    // C5
          ], 3);
          break;

        default:
          this.playAmbientLoop([
            { freq: 261.63, gain: 0.05 },
            { freq: 329.63, gain: 0.04 },
            { freq: 392.00, gain: 0.05 },
          ], 4);
      }
    } catch (e) {
      // Audio must never break game flow
      console.warn('[Audio] Music failed:', (e as Error).message);
    }
  }
  
  private playAmbientLoop(notes: Array<{freq: number; gain: number}>, loopDuration: number): void {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    notes.forEach((note, index) => {
      // Create ONE oscillator per note and loop it (oscillator nodes support
      // a single start() call with a loop flag — calling start() multiple
      // times on the same node throws InvalidStateError).
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now);

      // Sustained level with a soft fade-in (one start/stop per node)
      const stepDuration = loopDuration / notes.length;
      gainNode.gain.setValueAtTime(0, now + index * stepDuration);
      gainNode.gain.linearRampToValueAtTime(note.gain, now + index * stepDuration + 0.5);

      osc.connect(gainNode);
      gainNode.connect(this.masterGain!);

      // Single start/stop pair — one 30s sustain per note. stopMusic() can
      // cut it short. (Calling start() multiple times on one node throws.)
      osc.start(now);
      osc.stop(now + 30);

      this.activeMusicNodes.push(osc);
    });
  }
}

export const Audio = new AudioManager();
