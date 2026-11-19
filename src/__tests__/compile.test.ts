import { describe, expect, it } from 'vitest';
import { compile, fieldToRobot, robotToField } from '../compile/compile';
import { defaultConfig, makeWaypoint } from '../model/defaults';
import type { Auto, HardwareConfig, Step } from '../model/types';

function auto(...wps: ReturnType<typeof makeWaypoint>[]): Auto {
  return { id: 'a', name: 'Test', waypoints: wps };
}
function cfg(drivetrain: 'mecanum' | 'tank'): HardwareConfig {
  return { ...defaultConfig(), drivetrain };
}
const kinds = (steps: Step[]) => steps.map((s) => s.kind);

describe('fieldToRobot', () => {
  it('facing +Y (90 deg), +X on the field is to the robot right', () => {
    expect(fieldToRobot(24, 0, 90)).toEqual({ forward: 0, strafeRight: 24 });
    expect(fieldToRobot(0, 24, 90)).toEqual({ forward: 24, strafeRight: 0 });
    expect(fieldToRobot(0, 24, 0)).toEqual({ forward: 0, strafeRight: -24 });
  });

  it('robotToField inverts it', () => {
    for (const h of [0, 33, 90, -135, 180]) {
      const r = fieldToRobot(17.25, -8.5, h);
      const f = robotToField(r.forward, r.strafeRight, h);
      expect(f.dx).toBeCloseTo(17.25, 1);
      expect(f.dy).toBeCloseTo(-8.5, 1);
    }
  });
});

describe('compile: mecanum', () => {
  it('drives forward when the next point is straight ahead', () => {
    const r = compile(auto(makeWaypoint(0, 0, 90), makeWaypoint(0, 24, 90)), cfg('mecanum'));
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]).toMatchObject({ kind: 'move', forward: 24, strafeRight: 0 });
  });

  it('strafes sideways while keeping heading', () => {
    const r = compile(auto(makeWaypoint(0, 0, 90), makeWaypoint(-12, 0, 90)), cfg('mecanum'));
    expect(r.steps[0]).toMatchObject({ kind: 'move', forward: 0, strafeRight: -12 });
    expect(r.arrivals[1]).toEqual({ x: -12, y: 0, heading: 90 });
  });

  it('turns to the new heading first, then drives the vector in the new robot frame', () => {
    const r = compile(auto(makeWaypoint(0, 0, 90), makeWaypoint(24, 24, 0)), cfg('mecanum'));
    expect(kinds(r.steps)).toEqual(['turnTo', 'move']);
    expect(r.steps[0]).toMatchObject({ heading: 0, power: 0.5 });
    expect(r.steps[1]).toMatchObject({ forward: 24, strafeRight: -24 });
  });

  it('skips zero-length moves and tiny turns', () => {
    const r = compile(auto(makeWaypoint(0, 0, 90), makeWaypoint(0.1, 0, 90.2)), cfg('mecanum'));
    expect(r.steps).toHaveLength(0);
  });
});

describe('compile: tank', () => {
  it('turns to face the next point, then drives', () => {
    const r = compile(auto(makeWaypoint(0, 0, 0), makeWaypoint(0, 24, 0)), cfg('tank'));
    expect(kinds(r.steps)).toEqual(['turnTo', 'move']);
    expect(r.steps[0]).toMatchObject({ heading: 90 });
    expect(r.steps[1]).toMatchObject({ forward: 24, strafeRight: 0 });
  });

  it('drives backwards into a reversed waypoint without turning around', () => {
    const wp = makeWaypoint(-24, 0, 0);
    wp.reversed = true;
    const r = compile(auto(makeWaypoint(0, 0, 0), wp), cfg('tank'));
    expect(kinds(r.steps)).toEqual(['move']);
    expect(r.steps[0]).toMatchObject({ forward: -24 });
  });

  it('never strafes', () => {
    const r = compile(auto(makeWaypoint(0, 0, 90), makeWaypoint(30, 40, 0)), cfg('tank'));
    const move = r.steps.find((s) => s.kind === 'move');
    expect(move).toMatchObject({ forward: 50, strafeRight: 0 });
  });
});

describe('compile: actions and markers', () => {
  it('runs start actions first, then per-waypoint actions in order, and turn actions update heading', () => {
    const c = cfg('mecanum');
    const a = makeWaypoint(0, 0, 90);
    a.actions = [{ id: '1', kind: 'servo', mechanismId: 'mech_claw', position: 0.2 }];
    const b = makeWaypoint(0, 24, 90);
    b.actions = [
      { id: '2', kind: 'wait', ms: 250 },
      { id: '3', kind: 'turn', heading: 180, power: 0.4 },
      { id: '4', kind: 'command', name: 'score' },
    ];
    const r = compile(auto(a, b), c);
    expect(kinds(r.steps)).toEqual(['servo', 'move', 'wait', 'turnTo', 'command']);
    expect(r.steps[3].to.heading).toBe(180);
    expect(r.warnings).toEqual([]);
  });

  it('sorts and clamps markers onto the move step', () => {
    const b = makeWaypoint(0, 24, 90);
    b.markers = [
      { id: 'm2', t: 1.4, action: { kind: 'command', name: 'late' } },
      { id: 'm1', t: 0.25, action: { kind: 'command', name: 'early' } },
    ];
    const r = compile(auto(makeWaypoint(0, 0, 90), b), cfg('mecanum'));
    const move = r.steps[0];
    if (move.kind !== 'move') throw new Error(`expected a move, got ${move.kind}`);
    expect(move.markers.map((m) => m.t)).toEqual([0.25, 1]);
  });

  it('warns about actions whose mechanism was deleted', () => {
    const a = makeWaypoint(0, 0, 90);
    a.actions = [{ id: '1', kind: 'servo', mechanismId: 'gone', position: 0.2 }];
    expect(compile(auto(a), cfg('mecanum')).warnings).toHaveLength(1);
  });
});
