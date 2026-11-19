import { describe, expect, it } from 'vitest';
import { compile } from '../compile/compile';
import { applyProposals, optimize } from '../compile/optimize';
import { isPrecision } from '../compile/precision';
import { defaultConfig, makeWaypoint } from '../model/defaults';
import type { Auto, Waypoint } from '../model/types';
import { checkAuto } from '../rules/biobuzz';
import { simulate } from '../sim/simulate';
import { precisionIn, propagate } from '../sim/uncertainty';

const R = { lengthIn: 18, widthIn: 18 };
const config = defaultConfig();
const score = (wp: Waypoint): Waypoint => ({ ...wp, actions: [{ id: 'c', kind: 'command', name: 'score' }] });
const auto = (...wps: Waypoint[]): Auto => ({ id: 'a', name: 'a', waypoints: wps });
function sigmaAt(a: Auto, id: string) {
  const c = compile(a, config, R);
  const tl = simulate(c.steps, config.drivetrain, config.constants);
  const u = propagate(c.steps, tl, config.constants, a.waypoints.length);
  return { sigma: precisionIn(u.atArrival[a.waypoints.findIndex((w) => w.id === id)]), total: tl.total, errors: checkAuto(c, 18, 18).issues.filter((i) => i.level === 'error').length };
}

describe('precision points', () => {
  it('are automatic for waypoints that score, and can be overridden', () => {
    expect(isPrecision(score(makeWaypoint(0, 0, 0)), 1)).toBe(true);
    expect(isPrecision(makeWaypoint(0, 0, 0), 1)).toBe(false);
    expect(isPrecision({ ...makeWaypoint(0, 0, 0), precision: true }, 1)).toBe(true);
    expect(isPrecision({ ...score(makeWaypoint(0, 0, 0)), precision: false }, 1)).toBe(false);
    expect(isPrecision(score(makeWaypoint(0, 0, 0)), 0)).toBe(false);
  });
});

describe('optimize for accuracy', () => {
  it('adds wall touches before a scoring point after a long drive with turns', () => {
    const shot = score(makeWaypoint(-50, 40, 90));
    const a = auto(makeWaypoint(-36, -63, 90), makeWaypoint(-36, -30, 90), makeWaypoint(-50, -30, 0), makeWaypoint(-50, 0, 90), shot);
    const before = sigmaAt(a, shot.id);
    const props = optimize(a, config, R, ['front', 'back']);
    expect(props.length).toBeGreaterThan(0);
    const p = props[0];
    expect(['anchor', 'corner']).toContain(p.kind);
    expect(p.before).toBeCloseTo(before.sigma, 5);
    expect(p.after).toBeLessThan(p.before * 0.8);
    const next = applyProposals(a, props);
    const after = sigmaAt(next, shot.id);
    expect(after.sigma).toBeCloseTo(props[props.length - 1].after, 5);
    expect(after.errors).toBeLessThanOrEqual(before.errors);
    expect(after.total).toBeLessThanOrEqual(30);
    expect(next.waypoints.some((w) => w.anchor)).toBe(true);
  });

  it('turns a long strafe into a face-first drive on mecanum, keeping the scoring heading', () => {
    const shot = score(makeWaypoint(10, -20, 90));
    const a = auto(makeWaypoint(-30, -20, 90), shot);
    const props = optimize(a, config, R, ['front', 'back']);
    expect(props.length).toBe(1);
    expect(props[0].after).toBeLessThan(props[0].before * 0.8);
    expect(props[0].kind).toBe('faceTravel');
    const w = applyProposals(a, props).waypoints[1];
    expect(w.heading).toBeCloseTo(0, 1);
    expect(w.actions[0]).toMatchObject({ kind: 'turn', heading: 90 });
  });

  it('leaves an already precise auto alone', () => {
    const a = auto(makeWaypoint(-36, -63, 90), score(makeWaypoint(-36, -50, 90)));
    expect(optimize(a, config, R, ['front', 'back'])).toEqual([]);
  });

  it('applying a subset only touches those waypoints (ids, not indexes)', () => {
    const shot1 = score(makeWaypoint(-50, 40, 90));
    const a = auto(makeWaypoint(-36, -63, 90), makeWaypoint(-36, -30, 90), makeWaypoint(-50, -30, 0), makeWaypoint(-50, 0, 90), shot1);
    const props = optimize(a, config, R, ['front', 'back']);
    expect(applyProposals(a, []).waypoints).toHaveLength(a.waypoints.length);
    expect(applyProposals(a, props.slice(0, 1)).waypoints.findIndex((w) => w.id === shot1.id)).toBeGreaterThan(0);
  });
});
