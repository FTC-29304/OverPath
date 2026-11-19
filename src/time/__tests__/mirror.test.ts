import { describe, expect, it } from 'vitest';
import { wrapDeg } from '../geometry/transform';
import { defaultCalibration, defaultHardware, defaultView } from '../model/defaults';
import { mirrorAuto, mirrorName } from '../model/mirror';
import type { Auto } from '../model/types';
import { simulate } from '../sim/simulate';

const cal = defaultCalibration();
const hw = defaultHardware();
const view = defaultView();
const red: Auto = {
  id: 'a',
  name: 'RedLeft',
  start: { x: 63, y: -12, heading: 180 },
  steps: [
    { id: '1', kind: 'drive', dirDeg: 0, power: 0.5, ms: 500 },
    { id: '2', kind: 'drive', dirDeg: 90, power: 0.5, ms: 400 },
    { id: '3', kind: 'drive', dirDeg: -30, power: 0.4, ms: 300 },
    { id: '4', kind: 'turn', heading: 90, power: 0.5 },
    { id: '5', kind: 'wall', face: 'left', power: 0.3, ms: 2500, alignHeading: true },
    { id: '6', kind: 'wait', ms: 200 },
  ],
};

describe('mirror', () => {
  it('rotate180 (BIOBUZZ): every pose turns 180° about the center and robot-relative steps stay', () => {
    const blue = mirrorAuto(red, 'rotate180');
    expect(blue.name).toBe('BlueLeft');
    expect(blue.steps[1]).toMatchObject({ dirDeg: 90 });
    expect(blue.steps[4]).toMatchObject({ face: 'left' });
    const a = simulate(red, cal, hw, view);
    const b = simulate(blue, cal, hw, view);
    a.steps.forEach((s, i) => {
      expect(b.steps[i].to.x).toBeCloseTo(-s.to.x, 3);
      expect(b.steps[i].to.y).toBeCloseTo(-s.to.y, 3);
      expect(wrapDeg(b.steps[i].to.heading - s.to.heading - 180)).toBeCloseTo(0, 3);
    });
    expect(b.totalMs).toBe(a.totalMs);
  });

  it('flipX: mirrored across the center line, strafes and left/right sides swap', () => {
    const blue = mirrorAuto(red, 'flipX');
    expect(blue.steps[1]).toMatchObject({ dirDeg: -90 });
    expect(blue.steps[4]).toMatchObject({ face: 'right' });
    const a = simulate(red, cal, hw, view);
    const b = simulate(blue, cal, hw, view);
    a.steps.forEach((s, i) => {
      expect(b.steps[i].to.x).toBeCloseTo(-s.to.x, 3);
      expect(b.steps[i].to.y).toBeCloseTo(s.to.y, 3);
      expect(wrapDeg(b.steps[i].to.heading - (180 - s.to.heading))).toBeCloseTo(0, 3);
    });
  });

  it('gives new ids and names', () => {
    const m = mirrorAuto(red, 'rotate180');
    expect(m.id).not.toBe(red.id);
    expect(new Set([...m.steps, ...red.steps].map((s) => s.id)).size).toBe(12);
    expect(mirrorName('BLUE_A')).toBe('RED_A');
    expect(mirrorName('Auto')).toBe('AutoMirror');
  });
});
