import { describe, expect, it } from 'vitest';
import { anchorHeading, contactPose, detectWall, offWall, snapToAnchor } from '../compile/anchors';
import { compile } from '../compile/compile';
import { generateJava } from '../codegen/java';
import { defaultConfig, makeWaypoint } from '../model/defaults';
import type { Anchor, Waypoint } from '../model/types';
import { checkAuto } from '../rules/biobuzz';
import { simulate } from '../sim/simulate';
import { mirrorWaypoint } from '../store/plannerStore';

const R = { lengthIn: 18, widthIn: 14 };
const anchor = (over: Partial<Anchor> = {}): Anchor => ({ wall: 'left', face: 'back', alignHeading: true, power: 0.3, ...over });
const wpA = (x: number, y: number, a: Anchor): Waypoint => ({ ...makeWaypoint(x, y, 0), anchor: a });

describe('anchor geometry', () => {
  it('faces the wall with the touching side', () => {
    expect(anchorHeading('left', 'front')).toBe(180);
    expect(anchorHeading('left', 'back')).toBe(0);
    expect(anchorHeading('audience', 'front')).toBe(90);
    expect(anchorHeading('rear', 'right')).toBe(0);
  });

  it('puts the center half a robot from the wall (length for front/back, width for sides)', () => {
    expect(contactPose('left', 'back', 10, R)).toEqual({ x: -63, y: 10, heading: 0 });
    expect(contactPose('rear', 'right', 5, R)).toEqual({ x: 5, y: -65, heading: 0 });
    expect(contactPose('left', 'back', 80, R).y).toBe(72 - 7);
  });

  it('detects a nearby wall and the side that faces it', () => {
    expect(detectWall(-61.5, 0, 180, R, 'mecanum')).toMatchObject({ wall: 'left', face: 'front' });
    expect(detectWall(0, 63, 0, R, 'mecanum')).toMatchObject({ wall: 'audience', face: 'left' });
    expect(detectWall(0, 63, 0, R, 'tank')).toMatchObject({ wall: 'audience' });
    expect(['front', 'back']).toContain(detectWall(0, 63, 0, R, 'tank')!.face);
    expect(detectWall(0, 0, 0, R, 'mecanum')).toBeNull();
  });
});

describe('compiling wall touches', () => {
  it('mecanum: turn to face the wall, drive to just off it, then square', () => {
    const r = compile({ id: 'a', name: 'a', waypoints: [makeWaypoint(-40, 0, 90), wpA(-60, 20, anchor())] }, defaultConfig(), R);
    expect(r.steps.map((s) => s.kind)).toEqual(['turnTo', 'move', 'square']);
    const sq = r.steps[2];
    if (sq.kind !== 'square') throw new Error();
    expect(sq.contact).toEqual({ x: -63, y: 20, heading: 0 });
    expect(r.steps[1].to).toMatchObject(offWall(sq.contact, 'left', 3));
    expect(r.arrivals[1]).toMatchObject({ x: -62, y: 20, heading: 0 });
  });

  it('a start waypoint with a wall touch is placed flush, no square step', () => {
    const start = wpA(-50, -60, anchor({ wall: 'rear', face: 'back' }));
    const r = compile({ id: 'a', name: 'a', waypoints: [start] }, defaultConfig(), R);
    expect(r.steps).toHaveLength(0);
    expect(r.arrivals[0]).toEqual(snapToAnchor(-50, -60, start.anchor!, R));
    expect(r.arrivals[0]).toMatchObject({ y: -63, heading: 90 });
  });

  it('generates squareToWall and the robot size', () => {
    const auto = { id: 'a', name: 'a', waypoints: [makeWaypoint(-40, 0, 90), wpA(-60, 20, anchor({ alignHeading: false }))] };
    const code = generateJava(auto, defaultConfig(), R).code;
    expect(code).toContain('.squareToWall(OverPath.Wall.LEFT, OverPath.Face.BACK, 0.3, false)');
    expect(code).toContain('runner.robotLengthIn = 18.0;');
    expect(code).toContain('runner.robotWidthIn = 14.0;');
  });

  it('times the wall touch in the preview', () => {
    const c = defaultConfig();
    const r = compile({ id: 'a', name: 'a', waypoints: [makeWaypoint(-40, 0, 0), wpA(-60, 0, anchor())] }, c, R);
    const tl = simulate(r.steps, c.drivetrain, c.constants);
    const sq = tl.entries.find((e) => e.step.kind === 'square')!;
    expect(sq.duration).toBeGreaterThan(0.65);
    expect(sq.duration).toBeLessThan(1.2);
  });
});

describe('wall touch rules and mirroring', () => {
  it('flags a wall touch on a FLOWER and in a GARDEN', () => {
    const flower = compile({ id: 'a', name: 'a', waypoints: [makeWaypoint(-40, -40, 90), wpA(-60, -24, anchor({ face: 'front' }))] }, defaultConfig(), R);
    expect(checkAuto(flower, 18, 14).issues.map((i) => i.message.key)).toContain('rules.anchorFlower');
    const garden = compile({ id: 'a', name: 'a', waypoints: [makeWaypoint(-50, -40, 90), wpA(-58, -60, anchor({ wall: 'rear', face: 'back' }))] }, defaultConfig(), R);
    expect(checkAuto(garden, 18, 14).issues.map((i) => i.message.key)).toContain('rules.anchorGarden');
  });

  it('mirrors walls and sides for the other alliance', () => {
    const w = wpA(-63, 20, anchor({ wall: 'left', face: 'left' }));
    expect(mirrorWaypoint(w, 'rotate180').anchor).toMatchObject({ wall: 'right', face: 'left' });
    expect(mirrorWaypoint(w, 'flipX').anchor).toMatchObject({ wall: 'right', face: 'right' });
    expect(mirrorWaypoint(wpA(0, 63, anchor({ wall: 'audience', face: 'front' })), 'flipY').anchor).toMatchObject({ wall: 'rear', face: 'front' });
  });
});
