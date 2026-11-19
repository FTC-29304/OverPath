import { describe, expect, it } from 'vitest';
import { compile } from '../compile/compile';
import { defaultConfig, makeWaypoint } from '../model/defaults';
import type { Waypoint } from '../model/types';
import { realityCheck, rng } from '../sim/montecarlo';
import { simulate } from '../sim/simulate';
import { ellipse, precisionIn, propagate } from '../sim/uncertainty';

const R = { lengthIn: 18, widthIn: 18 };
const config = defaultConfig();
function plan(...wps: Waypoint[]) {
  const compiled = compile({ id: 'a', name: 'a', waypoints: wps }, config, R);
  const tl = simulate(compiled.steps, config.drivetrain, config.constants);
  return { compiled, tl, unc: propagate(compiled.steps, tl, config.constants, wps.length) };
}
const std = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

describe('error propagation', () => {
  it('a straight 48 in drive: 2% along-track (≈0.96 in 1σ), almost nothing sideways', () => {
    const { unc } = plan(makeWaypoint(0, -48, 90), makeWaypoint(0, 0, 90));
    const p = unc.atArrival[1];
    expect(Math.sqrt(p.yy)).toBeCloseTo(0.96, 1);
    expect(Math.sqrt(p.xx)).toBeLessThan(0.1);
  });

  it('a turn before a long drive swings the end sideways', () => {
    const { unc } = plan(makeWaypoint(0, -60, 90), makeWaypoint(0, -59, 0), makeWaypoint(60, -59, 0));
    expect(Math.sqrt(unc.atArrival[2].yy)).toBeGreaterThan(0.9);
  });

  it('strafing is less precise than driving forward the same distance', () => {
    const fwd = plan(makeWaypoint(0, 0, 90), makeWaypoint(0, 40, 90));
    const side = plan(makeWaypoint(0, 0, 90), makeWaypoint(40, 0, 90));
    expect(precisionIn(side.unc.atArrival[1])).toBeGreaterThan(2 * precisionIn(fwd.unc.atArrival[1]));
  });

  it('a wall touch resets the error on the wall axis (and the heading)', () => {
    const wall: Waypoint = { ...makeWaypoint(-60, 0, 0), anchor: { wall: 'left', face: 'back', alignHeading: true, power: 0.3 } };
    const { unc } = plan(makeWaypoint(40, 0, 0), makeWaypoint(-40, 0, 0), wall);
    const before = unc.atArrival[1];
    const after = unc.atArrival[2];
    expect(Math.sqrt(before.xx)).toBeGreaterThan(1.5);
    expect(Math.sqrt(after.xx)).toBeLessThan(0.3);
    expect(after.th).toBeLessThan(0.3);
  });

  it('ellipse axes come from the covariance', () => {
    expect(ellipse({ xx: 4, xy: 0, yy: 1, th: 0 })).toMatchObject({ a: 4, b: 2 });
    expect(ellipse({ xx: 1, xy: 0, yy: 4, th: 0 }).angleDeg).toBeCloseTo(90, 5);
  });
});

describe('reality check (Monte Carlo)', () => {
  it('the RNG is seeded and roughly normal', () => {
    const a = rng(1);
    const b = rng(1);
    const xs = Array.from({ length: 4000 }, () => a.gauss());
    expect(b.gauss()).toBe(xs[0]);
    expect(std(xs)).toBeCloseTo(1, 1);
  });

  it('agrees with the error propagation on the spread', () => {
    const wps = [makeWaypoint(-36, -63, 90), makeWaypoint(-36, -20, 90), makeWaypoint(-36, -19, 0), makeWaypoint(10, -19, 0)];
    const { compiled, tl, unc } = plan(...wps);
    const mc = realityCheck(compiled.steps, compiled.arrivals, tl, config.constants, R, 'blue', 2000);
    const end = mc.points[3];
    const p = unc.atArrival[3];
    expect(std(end.map((q) => q.x))).toBeCloseTo(Math.sqrt(p.xx), 0);
    expect(std(end.map((q) => q.y)) / Math.sqrt(p.yy)).toBeGreaterThan(0.8);
    expect(std(end.map((q) => q.y)) / Math.sqrt(p.yy)).toBeLessThan(1.25);
  });

  it('counts HIVE contact and AUTO PARK', () => {
    const wps = [makeWaypoint(-40, 63, -90), makeWaypoint(-40, 34.5, -90), makeWaypoint(-63, 36, -90)];
    const { compiled, tl } = plan(...wps);
    const mc = realityCheck(compiled.steps, compiled.arrivals, tl, config.constants, R, 'blue');
    expect(mc.parkPct).toBeGreaterThan(95);
    expect(mc.hivePct).toBeLessThan(5);
    const close = plan(makeWaypoint(-36.5, 60, 0), makeWaypoint(-36.5, 36, -90), makeWaypoint(-36.5, -36, -90));
    const risky = realityCheck(close.compiled.steps, close.compiled.arrivals, close.tl, config.constants, R, 'blue');
    expect(risky.hivePct).toBeGreaterThan(5);
    const straight = plan(makeWaypoint(-36.5, 36, -90), makeWaypoint(-36.5, -36, -90));
    expect(realityCheck(straight.compiled.steps, straight.compiled.arrivals, straight.tl, config.constants, R, 'blue').hivePct).toBeLessThan(1);
  });

  it('is fast enough to rerun while dragging', () => {
    const wps = Array.from({ length: 10 }, (_, i) => makeWaypoint(-60 + (i % 2) * 20, -60 + i * 12, 90));
    const { compiled, tl } = plan(...wps);
    const t0 = performance.now();
    realityCheck(compiled.steps, compiled.arrivals, tl, config.constants, R, 'blue');
    expect(performance.now() - t0).toBeLessThan(40);
  });

  it('counts a turn that swings the robot into the HIVE (same as the rules check)', () => {
    const { compiled, tl } = plan(makeWaypoint(-36, -63, 90), makeWaypoint(-36, -30, 90), makeWaypoint(-50, -30, 0));
    expect(realityCheck(compiled.steps, compiled.arrivals, tl, config.constants, R, 'blue').hivePct).toBeGreaterThan(90);
  });
});
