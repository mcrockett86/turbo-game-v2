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
  }
  
  private activeMusicNodes: OscillatorNode[] = [];
  
  stopMusic(): void {
    this.activeMusicNodes.forEach(node => node.stop());
    this.activeMusicNodes = [];
  }
  
  playMusic(track: string): void {
    if (!this.ctx || !this.masterGain) return;
    
    // Stop any currently playing music
    this.stopMusic();
    
    const now = this.ctx.currentTime;
    
    switch(track) {
      case 'suburban':
        // Gentle, slightly melancholic suburban exploration
        this.playAmbientLoop([
          { freq: 261.63, gain: 0.05 },   // C4
          { freq: 329.63, gain: 0.03 },    // E4
          { freq: 392.00, gain: 0.04 },    // G4
        ], 4);
        break;
        
      case 'dog_park':
        // Upbeat, happy park music
        this.playAmbientLoop([
          { freq: 349.23, gain: 0.06 },    // F4
          { freq: 440.00, gain: 0.05 },    // A4
          { freq: 523.25, gain: 0.07 },    // C5
        ], 2);
        break;
        
      case 'apartment':
        // Quieter, mysterious apartment
        this.playAmbientLoop([
          { freq: 220.00, gain: 0.04 },    // A3
          { freq: 277.18, gain: 0.03 },    // C#4
          { freq: 329.63, gain: 0.05 },    // E4
        ], 6);
        break;
        
      case 'shelter':
        // Somber but hopeful shelter music
        this.playAmbientLoop([
          { freq: 196.00, gain: 0.04 },    // G3
          { freq: 246.94, gain: 0.03 },    // B3
          { freq: 293.66, gain: 0.05 },    // D4
        ], 5);
        break;
        
      case 'home':
        // Warm, triumphant home music
        this.playAmbientLoop([
          { freq: 261.63, gain: 0.07 },    // C4
          { freq: 329.63, gain: 0.06 },    // E4
          { freq: 392.00, gain: 0.08 },    // G4
          { freq: 523.25, gain: 0.06 },    // C5
        ], 3);
        break;
        
      default:
        // Generic ambient loop for unknown tracks
        this.playAmbientLoop([
          { freq: 261.63, gain: 0.05 },
          { freq: 329.63, gain: 0.04 },
          { freq: 392.00, gain: 0.05 },
        ], 4);
    }
  }
  
  private playAmbientLoop(notes: Array<{freq: number; gain: number}>, loopDuration: number): void {
    if (!this.ctx || !this.masterGain) return;
    
    const now = this.ctx.currentTime;
    
    notes.forEach((note, index) => {
      // Create oscillator for each note
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now);
      
      // Envelope: gentle fade in and out
      const stepDuration = loopDuration / notes.length;
      gainNode.gain.setValueAtTime(0, now + index * stepDuration);
      gainNode.gain.linearRampToValueAtTime(note.gain, now + index * stepDuration + 0.5);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + (index + 1) * stepDuration - 0.1);
      
      osc.connect(gainNode);
      gainNode.connect(this.masterGain!);
      
      // Loop the oscillators
      const loopStart = Math.floor(now / loopDuration) * loopDuration;
      
      // Schedule multiple loops
      for (let i = 0; i < 20; i++) { // Play ~80 seconds of music
        osc.start(loopStart + i * loopDuration);
        osc.stop(loopStart + (i + 1) * loopDuration);
      }
      
      this.activeMusicNodes.push(osc);
    });
  }
}

export const Audio = new AudioManager();
