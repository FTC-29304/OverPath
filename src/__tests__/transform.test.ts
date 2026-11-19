import { describe, expect, it } from 'vitest';
import {
  fieldToScreen,
  fromDisplay,
  makeView,
  outOfField,
  screenToField,
  screenVectorToHeading,
  snap,
  toDisplay,
  wrapDeg,
} from '../geometry/transform';

const rotations = [0, 90, 180, 270] as const;

describe('view transform', () => {
  it('maps field center to canvas center and corners to the field square', () => {
    const v = makeView({ width: 800, height: 600, zoom: 1, panX: 0, panY: 0, rotation: 0, margin: 12 });
    expect(v.k).toBeCloseTo((600 - 24) / 144);
    const c = fieldToScreen(v, 0, 0);
    expect(c.px).toBeCloseTo(400);
    expect(c.py).toBeCloseTo(300);
    const tl = fieldToScreen(v, -72, 72);
    expect(tl.px).toBeCloseTo(v.ox);
    expect(tl.py).toBeCloseTo(v.oy);
    const br = fieldToScreen(v, 72, -72);
    expect(br.px).toBeCloseTo(v.ox + 144 * v.k);
    expect(br.py).toBeCloseTo(v.oy + 144 * v.k);
  });

  it.each(rotations)('round-trips screen -> field -> screen at rotation %i', (rotation) => {
    const v = makeView({ width: 913, height: 701, zoom: 1.7, panX: -33, panY: 21, rotation });
    for (let i = 0; i < 200; i++) {
      const px = Math.random() * 913;
      const py = Math.random() * 701;
      const f = screenToField(v, px, py);
      const s = fieldToScreen(v, f.x, f.y);
      expect(Math.abs(s.px - px)).toBeLessThan(1e-9);
      expect(Math.abs(s.py - py)).toBeLessThan(1e-9);
    }
  });

  it('rotation 90 puts field +X pointing up on screen', () => {
    const v = makeView({ width: 500, height: 500, zoom: 1, panX: 0, panY: 0, rotation: 90 });
    const a = fieldToScreen(v, 0, 0);
    const b = fieldToScreen(v, 10, 0);
    expect(b.px).toBeCloseTo(a.px);
    expect(b.py).toBeLessThan(a.py);
  });

  it('turns screen drag vectors into field headings', () => {
    const v0 = makeView({ width: 500, height: 500, zoom: 1, panX: 0, panY: 0, rotation: 0 });
    expect(screenVectorToHeading(v0, 10, 0)).toBeCloseTo(0);
    expect(screenVectorToHeading(v0, 0, -10)).toBeCloseTo(90);
    expect(screenVectorToHeading(v0, -10, 0)).toBeCloseTo(180);
    const v90 = makeView({ width: 500, height: 500, zoom: 1, panX: 0, panY: 0, rotation: 90 });
    expect(screenVectorToHeading(v90, 0, -10)).toBeCloseTo(0);
  });
});

describe('helpers', () => {
  it('wraps angles to (-180, 180]', () => {
    expect(wrapDeg(180)).toBe(180);
    expect(wrapDeg(-180)).toBe(180);
    expect(wrapDeg(190)).toBe(-170);
    expect(wrapDeg(-540)).toBe(180);
    expect(wrapDeg(720)).toBe(0);
  });

  it('snaps to a grid', () => {
    expect(snap(10.4, 3)).toBe(9);
    expect(snap(-10.6, 3)).toBe(-12);
    expect(snap(10.456, 0)).toBe(10.46);
  });

  it('converts display units and the corner (Pedro-style) convention', () => {
    const p = { units: 'cm' as const, convention: 'corner' as const };
    expect(toDisplay(p, -72, true)).toBeCloseTo(0);
    expect(toDisplay(p, 0, true)).toBeCloseTo(72 * 2.54);
    expect(fromDisplay(p, toDisplay(p, 13.5, true), true)).toBeCloseTo(13.5);
    expect(toDisplay(p, 10, false)).toBeCloseTo(25.4);
  });

  it('flags robots that stick out of the field', () => {
    expect(outOfField(0, 0, 0, 18, 18)).toBe(false);
    expect(outOfField(-63, -63, 0, 18, 18)).toBe(false);
    expect(outOfField(-63, -63, 45, 18, 18)).toBe(true);
    expect(outOfField(-64, 0, 0, 18, 18)).toBe(true);
  });
});
