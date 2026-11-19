import { describe, expect, it } from 'vitest';
import { compile } from '../compile/compile';
import { defaultConfig, makeWaypoint } from '../model/defaults';
import type { Waypoint } from '../model/types';
import { HIVE_KEEP_OUT, checkAuto, polyHitsRect } from '../rules/biobuzz';

const config = defaultConfig();
const check = (...wps: Waypoint[]) => checkAuto(compile({ id: 'a', name: 'a', waypoints: wps }, config), 18, 18);
const rules = (r: ReturnType<typeof check>, level: string) => r.issues.filter((i) => i.level === level).map((i) => i.rule ?? i.message.key);

describe('BIOBUZZ start pose (G304)', () => {
  it('accepts a blue robot against the audience-side wall on its own half', () => {
    const r = check(makeWaypoint(-36, -63, 90), makeWaypoint(-36, -48, 90));
    expect(r.alliance).toBe('blue');
    expect(rules(r, 'error')).toEqual([]);
  });

  it('requires touching the perimeter wall', () => {
    expect(rules(check(makeWaypoint(-36, -50, 90)), 'error')).toContain('G304.C');
  });

  it('requires starting fully on one side', () => {
    const r = check(makeWaypoint(0, -63, 90));
    expect(r.alliance).toBeNull();
    expect(rules(r, 'error')).toContain('G304.A');
  });

  it('forbids starting in a LOADING ZONE or touching a FLOWER', () => {
    expect(rules(check(makeWaypoint(-63, 36, 0)), 'error')).toContain('G304.E');
    expect(rules(check(makeWaypoint(-63, -24, 0)), 'error')).toContain('G304.D');
  });
});

describe('BIOBUZZ path checks', () => {
  it('flags driving into the HIVE and marks the step', () => {
    const r = check(makeWaypoint(-36, -63, 90), makeWaypoint(-36, -36, 90), makeWaypoint(0, -36, 90), makeWaypoint(0, 0, 90));
    expect(rules(r, 'error')).toContain('G417');
    expect(r.badSteps.size).toBeGreaterThan(0);
  });

  it('warns when the path crosses into the opponent half', () => {
    const r = check(makeWaypoint(-36, -63, 90), makeWaypoint(36, -63, 90));
    expect(rules(r, 'warn')).toContain('G402');
  });

  it('scores LEAVE and AUTO PARK in the own LOADING ZONE', () => {
    const r = check(makeWaypoint(-36, 63, -90), makeWaypoint(-36, 36, -90), makeWaypoint(-63, 36, -90));
    expect(r.issues.filter((i) => i.level === 'ok').map((i) => i.message.key)).toEqual(['rules.leaveOk', 'rules.parkOkBlue']);
  });

  it('keep-out geometry: a robot beside the HIVE is clear, one overlapping it is not', () => {
    const square = (x: number, y: number) => [
      { x: x - 9, y: y - 9 },
      { x: x + 9, y: y - 9 },
      { x: x + 9, y: y + 9 },
      { x: x - 9, y: y + 9 },
    ];
    expect(polyHitsRect(square(-36, 0), HIVE_KEEP_OUT)).toBe(false);
    expect(polyHitsRect(square(-34, 0), HIVE_KEEP_OUT)).toBe(true);
  });
});
