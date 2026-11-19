export const FIELD_IN = 144;
export const HALF_FIELD = FIELD_IN / 2;

export interface ViewParams {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
  rotation: 0 | 90 | 180 | 270;
  margin?: number;
}

export interface View {
  k: number;
  ox: number;
  oy: number;
  rotation: 0 | 90 | 180 | 270;
}

export function makeView(p: ViewParams): View {
  const margin = p.margin ?? 16;
  const avail = Math.max(10, Math.min(p.width, p.height) - 2 * margin);
  const k = (avail / FIELD_IN) * p.zoom;
  const size = FIELD_IN * k;
  return {
    k,
    ox: (p.width - size) / 2 + p.panX,
    oy: (p.height - size) / 2 + p.panY,
    rotation: p.rotation,
  };
}

function rotate(x: number, y: number, deg: number): [number, number] {
  switch (((deg % 360) + 360) % 360) {
    case 0:
      return [x, y];
    case 90:
      return [-y, x];
    case 180:
      return [-x, -y];
    case 270:
      return [y, -x];
    default: {
      const r = (deg * Math.PI) / 180;
      return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
    }
  }
}

export function fieldToScreen(v: View, x: number, y: number): { px: number; py: number } {
  const [xr, yr] = rotate(x, y, v.rotation);
  return { px: v.ox + (xr + HALF_FIELD) * v.k, py: v.oy + (HALF_FIELD - yr) * v.k };
}

export function screenToField(v: View, px: number, py: number): { x: number; y: number } {
  const xr = (px - v.ox) / v.k - HALF_FIELD;
  const yr = HALF_FIELD - (py - v.oy) / v.k;
  const [x, y] = rotate(xr, yr, -v.rotation);
  return { x: x + 0, y: y + 0 };
}

export function headingToCanvasRad(v: View, headingDeg: number): number {
  return (-(headingDeg + v.rotation) * Math.PI) / 180;
}

export function screenVectorToHeading(v: View, dpx: number, dpy: number): number {
  const screenDeg = (Math.atan2(-dpy, dpx) * 180) / Math.PI;
  return wrapDeg(screenDeg - v.rotation);
}

export function wrapDeg(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d + 0;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f + 0;
}

export function snap(value: number, step: number): number {
  return step > 0 ? round(Math.round(value / step) * step, 4) : round(value, 2);
}

export interface DisplayPrefs {
  units: 'in' | 'cm';
  convention: 'ftc' | 'corner';
}

export function toDisplay(p: DisplayPrefs, inches: number, isPosition: boolean): number {
  const shifted = isPosition && p.convention === 'corner' ? inches + HALF_FIELD : inches;
  return p.units === 'cm' ? shifted * 2.54 : shifted;
}

export function fromDisplay(p: DisplayPrefs, value: number, isPosition: boolean): number {
  const inches = p.units === 'cm' ? value / 2.54 : value;
  return isPosition && p.convention === 'corner' ? inches - HALF_FIELD : inches;
}

export function footprint(x: number, y: number, headingDeg: number, lengthIn: number, widthIn: number) {
  const h = (headingDeg * Math.PI) / 180;
  const c = Math.cos(h);
  const s = Math.sin(h);
  const hl = lengthIn / 2;
  const hw = widthIn / 2;
  return [
    [hl, hw],
    [hl, -hw],
    [-hl, -hw],
    [-hl, hw],
  ].map(([fx, fy]) => ({ x: x + fx * c - fy * s, y: y + fx * s + fy * c }));
}

export function outOfField(x: number, y: number, headingDeg: number, lengthIn: number, widthIn: number): boolean {
  return footprint(x, y, headingDeg, lengthIn, widthIn).some(
    (p) => Math.abs(p.x) > HALF_FIELD + 0.01 || Math.abs(p.y) > HALF_FIELD + 0.01,
  );
}
