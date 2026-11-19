import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { compile } from '../compile/compile';
import { generateJava } from '../codegen/java';
import { defaultConfig, defaultView } from '../model/defaults';
import { sanitizeAuto, sanitizeAutos, sanitizeConfig, sanitizeView } from '../model/sanitize';
import { mergeSaved, usePlanner } from '../store/plannerStore';

const robot = { lengthIn: 18, widthIn: 18 };

describe('sanitizing untrusted autos', () => {
  it('repairs bad fields and drops what can’t be used, without throwing', () => {
    const a = sanitizeAuto({
      name: 42,
      waypoints: [
        { x: 0, y: 0 },
        { x: 'nope', y: 3 },
        null,
        {
          x: 500,
          y: -10,
          heading: Infinity,
          power: 7,
          actions: [{ kind: 'wait', ms: -5 }, { kind: 'explode' }, { kind: 'command' }, { kind: 'turn', heading: 90 }, 'x'],
          markers: [{ t: 3, action: { kind: 'servo', position: 9 } }, { t: 0.5 }],
          anchor: { wall: 'ceiling', face: 'front' },
        },
      ],
    });
    expect(a).not.toBeNull();
    expect(a!.name).toBe('Auto');
    expect(a!.waypoints).toHaveLength(2);
    const w = a!.waypoints[1];
    expect(w).toMatchObject({ x: 72, y: -10, heading: 90, power: 1, reversed: false, timeoutMs: 0 });
    expect(w.actions.map((x) => x.kind)).toEqual(['wait', 'turn']);
    expect(w.actions[0]).toMatchObject({ ms: 0 });
    expect(w.markers).toHaveLength(1);
    expect(w.markers[0]).toMatchObject({ t: 1, action: { kind: 'servo', position: 1, mechanismId: '' } });
    expect(w.anchor).toBeUndefined();
    const config = defaultConfig();
    expect(() => compile(a!, config, robot)).not.toThrow();
    expect(() => generateJava(a!, config, robot)).not.toThrow();
  });

  it('refuses an auto with no usable waypoint', () => {
    expect(sanitizeAuto({ name: 'x', waypoints: [] })).toBeNull();
    expect(sanitizeAuto({ waypoints: [{ x: NaN, y: 1 }] })).toBeNull();
    expect(sanitizeAuto('hello')).toBeNull();
  });

  it('makes ids unique across autos', () => {
    const autos = sanitizeAutos([
      { id: 'a', waypoints: [{ id: 'w', x: 0, y: 0 }, { id: 'w', x: 1, y: 1 }] },
      { id: 'a', waypoints: [{ id: 'w', x: 2, y: 2 }] },
    ]);
    const ids = autos.flatMap((a) => [a.id, ...a.waypoints.map((w) => w.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(autos[0].id).toBe('a');
  });

  it('keeps valid anchors, actions and the precision flag', () => {
    const a = sanitizeAuto({
      waypoints: [
        { x: 0, y: 0 },
        {
          x: -63,
          y: 0,
          precision: true,
          anchor: { wall: 'left', face: 'back', alignHeading: false, power: 0.25 },
          actions: [{ kind: 'motor', mechanismId: 'm', power: 0.5, ms: 1000, background: true }, { kind: 'command', name: 'shoot', ms: 1500 }],
        },
      ],
    })!;
    expect(a.waypoints[1].anchor).toEqual({ wall: 'left', face: 'back', alignHeading: false, power: 0.25 });
    expect(a.waypoints[1].precision).toBe(true);
    expect(a.waypoints[1].actions).toMatchObject([{ kind: 'motor', background: true, ms: 1000 }, { kind: 'command', name: 'shoot', ms: 1500 }]);
  });
});

describe('sanitizing settings', () => {
  it('fills missing fields from the defaults and drops wrong types', () => {
    const c = sanitizeConfig({ drivetrain: 'hovercraft', constants: { minPower: 'x', wheelDiameterIn: 4 }, commands: ['a', 'a', 3], motors: { leftFront: 5 } });
    const d = defaultConfig();
    expect(c.drivetrain).toBe(d.drivetrain);
    expect(c.constants.minPower).toBe(d.constants.minPower);
    expect(c.constants.wheelDiameterIn).toBe(4);
    expect(c.commands).toEqual(['a']);
    expect(c.motors.leftFront).toBe(d.motors.leftFront);
    expect(sanitizeConfig(null)).toEqual(d);
  });

  it('view: keeps good values, defaults the rest; uploaded images don’t survive', () => {
    const v = sanitizeView({ units: 'cm', rotation: 45, language: 'tr', fieldImageUrl: 'blob:abc', robotLengthIn: 99 });
    const d = defaultView();
    expect(v.units).toBe('cm');
    expect(v.rotation).toBe(d.rotation);
    expect(v.language).toBe('tr');
    expect(v.fieldImageUrl).toBe(d.fieldImageUrl);
    expect(v.robotLengthIn).toBe(18);
    expect(v.flatFaces).toEqual(d.flatFaces);
  });

  it('a damaged save loads with defaults instead of crashing', () => {
    const merge = mergeSaved;
    const current = usePlanner.getState();
    const damaged = merge({ autos: 'oops', config: { constants: null }, view: 7, activeId: 3 }, current);
    expect(damaged.autos.length).toBeGreaterThan(0);
    expect(damaged.activeId).toBe(damaged.autos[0].id);
    expect(damaged.config.constants).toEqual(defaultConfig().constants);
    expect(merge(null, current).autos).toBe(current.autos);
  });
});

describe('crash screen', () => {
  it('offers reload, download and a two-step reset', () => {
    const b = new ErrorBoundary({ children: null });
    b.state = { error: new Error('boom'), armed: false };
    const html = renderToStaticMarkup(b.render() as never);
    expect(html).toContain('data-testid="crash"');
    expect(html).toContain('data-testid="crash-download"');
    expect(html).toContain('boom');
    b.state = { error: null, armed: false };
    expect(renderToStaticMarkup(createElement(ErrorBoundary, null, 'fine'))).toBe('fine');
  });
});
