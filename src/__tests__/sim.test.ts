import { describe, expect, it } from 'vitest';
import { compile } from '../compile/compile';
import { defaultConfig, makeWaypoint } from '../model/defaults';
import { MAX_DRIVE_POWER, moveEnd, moveTiming, poseAt, profilePower, simulate, stopDistance, wheelTravel } from '../sim/simulate';

describe('profilePower', () => {
  it('ramps up from minPower, cruises, ramps down', () => {
    expect(profilePower(0, 48, 0.8, 0.15, 6)).toBeCloseTo(0.15);
    expect(profilePower(3, 48, 0.8, 0.15, 6)).toBeCloseTo(0.475);
    expect(profilePower(24, 48, 0.8, 0.15, 6)).toBeCloseTo(0.8);
    expect(profilePower(48, 48, 0.8, 0.15, 6)).toBeCloseTo(0.15);
  });
  it('never goes below the requested power when that is already tiny', () => {
    expect(profilePower(10, 48, 0.1, 0.15, 6)).toBe(0.1);
  });
});

describe('simulate', () => {
  it('measures mecanum strafe progress on the furthest wheel', () => {
    expect(wheelTravel(0, 10, 'mecanum', 1.1)).toBeCloseTo(11);
    expect(wheelTravel(10, 10, 'mecanum', 1)).toBeCloseTo(20);
    expect(wheelTravel(-10, 0, 'tank', 1.1)).toBeCloseTo(10);
  });

  it('times a drive + wait and interpolates the pose', () => {
    const c = defaultConfig();
    const b = makeWaypoint(0, 48, 90, 1);
    b.actions = [{ id: 'w', kind: 'wait', ms: 1000 }];
    const { steps } = compile({ id: 'a', name: 'a', waypoints: [makeWaypoint(0, 0, 90), b] }, c);
    const tl = simulate(steps, c.drivetrain, c.constants);
    const drive = tl.entries[0].duration;
    expect(drive).toBeGreaterThan(48 / (45 * MAX_DRIVE_POWER));
    expect(drive).toBeLessThan(48 / (45 * MAX_DRIVE_POWER) + 1.5);
    expect(tl.total).toBeCloseTo(drive + 1);
    const half = tl.entries[0].progressTimes![24];
    expect(poseAt(tl, half, steps[0].from).pose.y).toBeCloseTo(24, 0);
    expect(poseAt(tl, 999, steps[0].from).pose).toMatchObject({ x: 0, y: 48 });
  });
});

describe('move timing (OverPath 3 rules)', () => {
  const c = defaultConfig().constants;
  const wp = (x: number, y: number) => makeWaypoint(x, y, 90, 0.8);

  it('flows on through gentle bends, eases to a stop at corners, settles at the end', () => {
    const cfg = defaultConfig();
    const { steps } = compile({ id: 'a', name: 'a', waypoints: [wp(0, 0), wp(0, 24), wp(4, 48), wp(40, 48)] }, cfg);
    const moves = steps.map((s, i) => (s.kind === 'move' ? moveEnd(steps, i) : null)).filter(Boolean);
    expect(moves).toEqual(['flow', 'corner', 'settle']);
  });

  it('a traction limit makes the start slower, never faster', () => {
    const limited = moveTiming(48, 0.9, c, 0, 'settle').duration;
    const free = moveTiming(48, 0.9, { ...c, maxPowerRatePerS: 0, maxPowerDropPerS: 0 }, 0, 'settle').duration;
    expect(limited).toBeGreaterThan(free);
  });

  it('flowing on keeps the speed: no stop, and the next move starts fast', () => {
    const first = moveTiming(24, 0.8, c, 0, 'flow');
    expect(first.magOut).toBeGreaterThan(0.1);
    const fromStop = moveTiming(24, 0.8, c, 0, 'settle').duration;
    const carried = moveTiming(24, 0.8, c, first.magOut, 'settle').duration;
    expect(carried).toBeLessThan(fromStop);
  });

  it('progress times run 0 → duration and never go backwards', () => {
    for (const end of ['flow', 'corner', 'settle'] as const) {
      const m = moveTiming(30, 0.7, c, 0, end);
      expect(m.progressTimes).toHaveLength(49);
      expect(m.progressTimes[0]).toBe(0);
      for (let i = 1; i < m.progressTimes.length; i++) expect(m.progressTimes[i]).toBeGreaterThanOrEqual(m.progressTimes[i - 1]);
      expect(m.progressTimes[48]).toBeLessThanOrEqual(m.duration + 1e-9);
    }
  });

  it('stopDistance mirrors OverPath.stopDistanceIn', () => {
    expect(stopDistance(10, { ...c, brakeLinear: 0.08, brakeQuadratic: 0.001 })).toBeCloseTo(0.9);
    expect(stopDistance(-10, { ...c, brakeLinear: 0.08, brakeQuadratic: 0 })).toBeCloseTo(0.8);
  });
});
