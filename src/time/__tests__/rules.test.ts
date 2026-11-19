import { describe, expect, it } from 'vitest';
import { defaultAuto, defaultCalibration, defaultHardware, defaultView } from '../model/defaults';
import type { Auto, Step } from '../model/types';
import { checkAuto } from '../rules/biobuzz';
import { simulate } from '../sim/simulate';

const cal = defaultCalibration();
const hw = defaultHardware();
const view = defaultView();
const check = (a: Auto, v = view) => checkAuto(a, simulate(a, cal, hw, v), v);
const keys = (a: Auto, v = view) => check(a, v).issues.map((i) => `${i.level}:${i.message.key}`);
const withSteps = (steps: Step[]): Auto => ({ ...defaultAuto(), steps });

describe('rules', () => {
  it('the default auto is legal on the red side', () => {
    const r = check(defaultAuto());
    expect(r.alliance).toBe('red');
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(keys(defaultAuto())).toContain('ok:rules.timeOk');
    expect(keys(defaultAuto())).toContain('ok:rules.leaveOk');
  });

  it('30 s is a hard limit, and under 2 s spare is a warning', () => {
    expect(keys(withSteps([{ id: 'w', kind: 'wait', ms: 31000 }]))).toContain('error:rules.time');
    expect(keys(withSteps([{ id: 'w', kind: 'wait', ms: 28500 }]))).toContain('warn:rules.timeTight');
  });

  it('flags driving into the HIVE', () => {
    const r = check(withSteps([{ id: 'd', kind: 'drive', dirDeg: 0, power: 0.5, ms: 1200 }]));
    expect(r.issues.some((i) => i.rule === 'G417')).toBe(true);
    expect(r.badSteps.has(0)).toBe(true);
    expect(r.issues.some((i) => i.message.key === 'rules.tight')).toBe(false);
  });

  it('flags a short wall push and a push on a side that is not flat', () => {
    expect(keys(withSteps([{ id: 'w', kind: 'wall', face: 'front', power: 0.3, ms: 100, alignHeading: true }]))).toContain('warn:rules.short');
    const notFlat = { ...view, flatFaces: [] };
    expect(keys(withSteps([{ id: 'w', kind: 'wall', face: 'back', power: 0.3, ms: 1500, alignHeading: true }]), notFlat)).toContain('warn:rules.notFlat');
  });

  it('flags a plain drive into the perimeter', () => {
    expect(keys(withSteps([{ id: 'd', kind: 'drive', dirDeg: 180, power: 0.5, ms: 800 }]))).toContain('error:rules.outOfField');
  });

  it('flags a start that is not on the wall, or across the center line', () => {
    const a = { ...defaultAuto(), start: { x: 40, y: 0, heading: 180 } };
    expect(keys(a)).toContain('error:rules.G304C');
    const b = { ...defaultAuto(), start: { x: 2, y: -63, heading: 90 } };
    expect(keys(b)).toContain('error:rules.G304A_straddle');
  });

  it('suggests a wall push when the error before an action is large', () => {
    const a = withSteps([
      { id: 'd1', kind: 'drive', dirDeg: 90, power: 0.5, ms: 1500 },
      { id: 'd2', kind: 'drive', dirDeg: -90, power: 0.5, ms: 1500 },
      { id: 's', kind: 'servo', mechanismId: '', position: 1 },
    ]);
    expect(keys(a)).toContain('info:rules.drift');
  });
});
