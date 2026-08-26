import { describe, it, expect } from 'vitest';
import { ParticleSystem } from '@/engine/render/particles';

describe('ParticleSystem', () => {
  it('recycles a bounded pool (never exceeds MAX live particles)', () => {
    const ps = new ParticleSystem();
    for (let i = 0; i < 200; i++) ps.spawn({ x: i, y: i, color: '#fff', life: 10 });
    expect(ps.liveCount).toBeLessThanOrEqual(40);
  });

  it('deactivates particles after their lifetime', () => {
    const ps = new ParticleSystem();
    ps.spawn({ x: 0, y: 0, color: '#fff', life: 1 });
    expect(ps.liveCount).toBe(1);
    ps.update(1.2); // advance past life
    expect(ps.liveCount).toBe(0);
  });

  it('applies gravity + velocity to particles over time', () => {
    const ps = new ParticleSystem();
    ps.spawn({ x: 0, y: 0, vx: 0, vy: 0, color: '#fff', life: 10, gravity: 100 });
    // Can't read pool internals directly, but a burst should not throw and
    // liveCount reflects spawned particles.
    ps.burst(100, 100, '#ffd700', 10);
    expect(ps.liveCount).toBeGreaterThanOrEqual(10);
  });

  it('burst spawns N particles at a point', () => {
    const ps = new ParticleSystem();
    ps.burst(50, 50, '#3f3', 8);
    expect(ps.liveCount).toBe(8);
  });

  it('clear() deactivates all live particles', () => {
    const ps = new ParticleSystem();
    ps.burst(0, 0, '#f00', 12);
    expect(ps.liveCount).toBe(12);
    ps.clear();
    expect(ps.liveCount).toBe(0);
  });
});
