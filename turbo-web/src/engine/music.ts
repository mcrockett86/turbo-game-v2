/**
 * Music beds — deterministic procedural composition per zone.
 *
 * Each track is a small arrangement: a bass line, a chord/arpeggio layer,
 * and an optional melody, all built from Web Audio oscillators + a
 * noise source. Deterministic (seeded per zone) so every run of a given
 * zone sounds the same — which is what a "music bed" is for.
 *
 * This module is pure data + a builder function. It has no DOM, no
 * AudioContext, no globals — so it unit-tests cleanly under jsdom and can
 * be reasoned about statically.
 *
 * The actual scheduling/lifecycle (loops, ducking, stop) lives in audio.ts.
 */

export interface TrackSpec {
  /** BPM for the arrangement. */
  bpm: number;
  /** Root note name (e.g. 'C', 'A#') for the bass/melody root. */
  root: NoteName;
  /**
   * Chord progression as scale degrees (1 = tonic, 4 = subdominant, 5 =
   * dominant, b7 = minor seventh). Each degree lasts one bar.
   */
  progression: number[];
  /** Which layers to include. */
  layers: { bass: boolean; arp: boolean; melody: boolean; pad: boolean };
  /** Scale to arpeggiate/melodize over: 'major' | 'minor' | 'dorian'. */
  scale: 'major' | 'minor' | 'dorian';
  /** Overall level (0..1) relative to the music bus. */
  level: number;
  /** Optional: a 2-bar melody motif (degrees), or null for no melody. */
  melodyMotif: number[] | null;
}

export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

const NOTE_SEMITONES: Record<NoteName, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

// b7 is a named alias for the minor-seventh degree (degree 7 in a minor/dorian
// scale is already the minor seventh; we spell it for readability in data).
const b7 = 7;

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const DORIAN_SCALE = [0, 2, 3, 5, 7, 9, 10];

/** Convert a scale degree (1-based) to a semitone offset from the root. */
export function degreeToSemitones(root: NoteName, degree: number, scale: 'major' | 'minor' | 'dorian'): number {
  const scaleTable = scale === 'major' ? MAJOR_SCALE : scale === 'minor' ? MINOR_SCALE : DORIAN_SCALE;
  const base = NOTE_SEMITONES[root];
  // Degree 1..7; wrap around octaves.
  const idx = ((degree - 1) % 7 + 7) % 7;
  const octave = Math.floor((degree - 1) / 7);
  return base + scaleTable[idx] + octave * 12;
}

/** MIDI note -> frequency. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** A 3-note chord (root position) at the given degree, in the given scale. */
export function chordForDegree(root: NoteName, degree: number, scale: 'major' | 'minor' | 'dorian'): number[] {
  const base = degreeToSemitones(root, degree, scale);
  // Triad: root, third (2 scale steps up), fifth (4 scale steps up).
  const third = degreeToSemitones(root, degree + 2, scale);
  const fifth = degreeToSemitones(root, degree + 4, scale);
  // Anchor around MIDI 55 (G3) for the bass, 67 (A4) for the pad.
  const anchor = 55;
  return [
    anchor + ((base - anchor) % 12 + 12) % 12,
    anchor + ((third - anchor) % 12 + 12) % 12 + 12,
    anchor + ((fifth - anchor) % 12 + 12) % 12 + 12,
  ];
}

/**
 * The full set of music beds, keyed by the `zone.music` string in data.ts.
 * Tracks are grouped by mood so side-zones in the same family share a bed
 * (cheaper than 17 unique arrangements, and the player reads the zone by
 * palette/geometry anyway).
 */
export const TRACKS: Record<string, TrackSpec> = {
  // ---- Main story arc ----
  suburban: { bpm: 96, root: 'C', progression: [1, 5, 6, 4], layers: { bass: true, arp: true, melody: false, pad: true }, scale: 'major', level: 0.5, melodyMotif: null },
  dog_park: { bpm: 108, root: 'F', progression: [1, 4, 5, 1], layers: { bass: true, arp: true, melody: true, pad: true }, scale: 'major', level: 0.55, melodyMotif: [1, 2, 3, 5, 3, 2, 1, 2] },
  apartment: { bpm: 72, root: 'A', progression: [1, b7, 4, b7], layers: { bass: true, arp: false, melody: false, pad: true }, scale: 'minor', level: 0.45, melodyMotif: null },
  shelter: { bpm: 60, root: 'D', progression: [1, b7, 6, b7], layers: { bass: true, arp: false, melody: false, pad: true }, scale: 'minor', level: 0.4, melodyMotif: null },
  home: { bpm: 84, root: 'C', progression: [1, 5, 6, 4, 1, 5, 6, 5], layers: { bass: true, arp: true, melody: true, pad: true }, scale: 'major', level: 0.6, melodyMotif: [1, 2, 3, 5, 3, 2, 1, 5] },

  // ---- Water / openness family ----
  lake: { bpm: 80, root: 'E', progression: [1, b7, 4, b7], layers: { bass: true, arp: true, melody: false, pad: true }, scale: 'dorian', level: 0.45, melodyMotif: null },
  beach: { bpm: 92, root: 'G', progression: [1, 4, 5, 4], layers: { bass: true, arp: true, melody: true, pad: true }, scale: 'major', level: 0.5, melodyMotif: [1, 4, 5, 4, 1, 4, 5, 3] },
  waterfall: { bpm: 88, root: 'A', progression: [1, b7, 4, 1], layers: { bass: true, arp: true, melody: false, pad: true }, scale: 'dorian', level: 0.5, melodyMotif: null },

  // ---- Forest / nature family ----
  forest: { bpm: 76, root: 'G', progression: [1, b7, 4, b7], layers: { bass: true, arp: false, melody: true, pad: true }, scale: 'dorian', level: 0.45, melodyMotif: [1, 2, 3, 2, 1, b7, 6, b7] },
  garden: { bpm: 90, root: 'D', progression: [1, 4, 5, 1], layers: { bass: true, arp: true, melody: true, pad: true }, scale: 'major', level: 0.5, melodyMotif: [1, 2, 4, 5, 4, 2, 1, 2] },

  // ---- Urban / social family ----
  pet_store: { bpm: 112, root: 'C', progression: [1, 5, 6, 4], layers: { bass: true, arp: true, melody: true, pad: false }, scale: 'major', level: 0.5, melodyMotif: [1, 2, 3, 5, 3, 2, 1, 3] },
  dog_show: { bpm: 116, root: 'A', progression: [1, 4, 5, 1], layers: { bass: true, arp: true, melody: true, pad: false }, scale: 'major', level: 0.55, melodyMotif: [1, 2, 3, 4, 3, 2, 1, 4] },
  market: { bpm: 104, root: 'F', progression: [1, 5, 6, 4], layers: { bass: true, arp: true, melody: true, pad: false }, scale: 'major', level: 0.5, melodyMotif: [1, 3, 5, 3, 1, 3, 5, 6] },
  library: { bpm: 70, root: 'E', progression: [1, b7, 4, b7], layers: { bass: true, arp: false, melody: false, pad: true }, scale: 'minor', level: 0.4, melodyMotif: null },

  // ---- Rugged / mystery family ----
  mountain: { bpm: 74, root: 'D', progression: [1, b7, 4, b7], layers: { bass: true, arp: true, melody: false, pad: true }, scale: 'dorian', level: 0.45, melodyMotif: null },
  cave: { bpm: 58, root: 'C#', progression: [1, b7, 1, b7], layers: { bass: true, arp: false, melody: false, pad: true }, scale: 'minor', level: 0.4, melodyMotif: null },
  park_secret: { bpm: 82, root: 'B', progression: [1, b7, 4, 1], layers: { bass: true, arp: true, melody: true, pad: true }, scale: 'dorian', level: 0.5, melodyMotif: [1, b7, 6, b7, 1, 2, 3, 2] },

  // Fallback for any unknown track string.
  default: { bpm: 90, root: 'C', progression: [1, 5, 6, 4], layers: { bass: true, arp: true, melody: false, pad: true }, scale: 'major', level: 0.45, melodyMotif: null },
};
