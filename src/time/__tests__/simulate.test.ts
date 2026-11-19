import { describe, expect, it } from 'vitest';
import { defaultCalibration, defaultHardware, defaultView } from '../model/defaults';
import type { Auto, Step } from '../model/types';
import { driveDisplacement, solveDrive } from '../sim/drive';
import { distanceToWall, fieldToRobot, poseAt, simulate, suggestWallMs } from '../sim/simulate';

const cal = defaultCalibration();
const hw = defaultHardware();
const view = defaultView();
const auto = (steps: Step[], start = { x: 63, y: 0, heading: 180 }): Auto => ({ id: 'a', name: 'T', start, steps });

describe('simulate', () => {
  it('drives in the robot frame: forward at heading 180 goes −x, strafe left goes −y', () => {
    const sim = simulate(
      auto([
        { id: '1', kind: 'drive', dirDeg: 0, power: 0.5, ms: 500 },
        { id: '2', kind: 'drive', dirDeg: 90, power: 0.5, ms: 500 },
      ]),
      cal,
      hw,
      view,
    );
    const f = driveDisplacement(cal, 0, 0.5, 500).f;
    const l = driveDisplacement(cal, 90, 0.5, 500).l;
    expect(sim.steps[0].to.x).toBeCloseTo(63 - f, 2);
    expect(sim.steps[0].to.y).toBeCloseTo(0, 2);
    expect(sim.steps[1].to.y).toBeCloseTo(-l, 2);
    expect(sim.end.heading).toBe(180);
    expect(sim.totalMs).toBe(1000);
  });

  it('turns change the heading and take time', () => {
    const sim = simulate(auto([{ id: '1', kind: 'turn', heading: 90, power: 0.5 }]), cal, hw, view);
    expect(sim.end.heading).toBe(90);
    expect(sim.steps[0].ms).toBeGreaterThan(400);
  });

  it('a wall push snaps to the wall, squares a flat side and backs off', () => {
    const sim = simulate(auto([{ id: 'w', kind: 'wall', face: 'back', power: 0.3, ms: 3000, alignHeading: true }], { x: 30, y: 5, heading: 177 }), cal, hw, view);
    const st = sim.steps[0];
    expect(st.shortOfWall).toBeFalsy();
    expect(st.wall).toBe('right');
    expect(st.contact!.heading).toBe(180);
    expect(st.contact!.x).toBeCloseTo(72 - 9, 2);
    const back = driveDisplacement(cal, 0, cal.backOffPower, cal.backOffMs).f;
    expect(st.to.x).toBeCloseTo(63 - back, 2);
    expect(st.sx).toBeLessThan(0.5);
    expect(st.sh).toBe(0.5);
    expect(st.ms).toBe(3000 + cal.backOffMs);
  });

  it('a side that is not flat fixes the position but not the heading', () => {
    const sim = simulate(
      auto([{ id: 'w', kind: 'wall', face: 'left', power: 0.3, ms: 3000, alignHeading: true }], { x: 0, y: 40, heading: 3 }),
      cal,
      hw,
      view,
    );
    expect(sim.steps[0].wall).toBe('audience');
    expect(sim.steps[0].contact!.heading).toBe(3);
  });

  it('a push that is too short stops before the wall', () => {
    const sim = simulate(auto([{ id: 'w', kind: 'wall', face: 'back', power: 0.3, ms: 200, alignHeading: true }], { x: 0, y: 0, heading: 180 }), cal, hw, view);
    expect(sim.steps[0].shortOfWall).toBe(true);
    expect(sim.steps[0].to.x).toBeLessThan(40);
  });

  it('suggestWallMs always reaches the wall', () => {
    for (const x of [-40, 0, 20, 50]) {
      const start = { x, y: 10, heading: 180 };
      const ms = suggestWallMs(cal, view, start, 'back', 0.3)!;
      const sim = simulate(auto([{ id: 'w', kind: 'wall', face: 'back', power: 0.3, ms, alignHeading: true }], start), cal, hw, view);
      expect(sim.steps[0].shortOfWall).toBeFalsy();
    }
  });

  it('error grows with driving and a wall push resets that axis', () => {
    const sim = simulate(
      auto([
        { id: '1', kind: 'drive', dirDeg: 0, power: 0.5, ms: 1500 },
        { id: 'w', kind: 'wall', face: 'back', power: 0.3, ms: 4000, alignHeading: true },
      ]),
      cal,
      hw,
      view,
    );
    expect(sim.steps[0].sx).toBeGreaterThan(2);
    expect(sim.steps[1].sx).toBeLessThan(0.5);
  });

  it('distanceToWall measures from the footprint', () => {
    expect(distanceToWall({ x: 0, y: 0, heading: 0 }, 0, 18, 18).dist).toBeCloseTo(63);
    expect(distanceToWall({ x: 0, y: 0, heading: 0 }, 90, 18, 18)).toEqual({ dist: 63, wall: 'audience' });
  });

  it('dragging a drive end (draw → list → draw) lands where it was dropped', () => {
    const a = auto([
      { id: '1', kind: 'drive', dirDeg: 0, power: 0.5, ms: 600 },
      { id: '2', kind: 'turn', heading: 135, power: 0.5 },
      { id: '3', kind: 'drive', dirDeg: 0, power: 0.4, ms: 500 },
    ]);
    const before = simulate(a, cal, hw, view);
    const target = { x: 10, y: -30 };
    const from = before.steps[2].from;
    const r = fieldToRobot(from.heading, target.x - from.x, target.y - from.y);
    const sol = solveDrive(cal, r.f, r.l, 0.4)!;
    const after = simulate({ ...a, steps: a.steps.map((s) => (s.id === '3' ? { ...s, ...sol } : s)) }, cal, hw, view);
    expect(Math.hypot(after.end.x - target.x, after.end.y - target.y)).toBeLessThan(0.1);
  });

  it('poseAt follows the timeline', () => {
    const sim = simulate(auto([{ id: '1', kind: 'drive', dirDeg: 0, power: 0.5, ms: 1000 }]), cal, hw, view);
    expect(poseAt(sim, 0).pose.x).toBeCloseTo(63);
    expect(poseAt(sim, 500).pose.x).toBeCloseTo((63 + sim.end.x) / 2);
    expect(poseAt(sim, 5000)).toEqual({ pose: sim.end, step: -1 });
  });
});
