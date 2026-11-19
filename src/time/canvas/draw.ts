import { FIELD_IN, HALF_FIELD, fieldToScreen, footprint, headingToCanvasRad, type View } from '../geometry/transform';
import type { Pose, SimResult, Step } from '../model/types';
import { HIVE_KEEP_OUT } from '../rules/biobuzz';

export const C = {
  bg: '#0e0e0e',
  tileA: '#3a3a3a',
  tileB: '#333333',
  seam: '#1f1f1f',
  wall: '#a8a8a8',
  path: '#f2f2f2',
  pathWall: '#bdbdbd',
  bad: '#ff5a5f',
  dot: '#d9d9d9',
  selected: '#ffffff',
  halo: 'rgba(0,0,0,0.6)',
  start: '#ffffff',
  startFill: 'rgba(255,255,255,0.12)',
  end: 'rgba(255,255,255,0.6)',
  ghost: 'rgba(255,255,255,0.25)',
  ghostEdge: '#ffffff',
  err: 'rgba(255,255,255,0.07)',
  errEdge: 'rgba(255,255,255,0.55)',
  keepOut: 'rgba(255,255,255,0.07)',
  keepOutEdge: 'rgba(255,255,255,0.7)',
  centerLine: 'rgba(255,255,255,0.45)',
  text: '#0e0e0e',
};

export const DOT_PX = 9;
export const HANDLE_PX = 7;
export function handleOffsetIn(lengthIn: number): number {
  return lengthIn / 2 + 6;
}

export interface DrawInput {
  view: View;
  width: number;
  height: number;
  image: HTMLImageElement | null;
  imageOpacity: number;
  steps: Step[];
  sim: SimResult;
  selectedId: string | null;
  badSteps: Set<number>;
  robotLength: number;
  robotWidth: number;
  showZones: boolean;
  showError: boolean;
  ghost: Pose | null;
}

function poly(ctx: CanvasRenderingContext2D, v: View, pts: { x: number; y: number }[]) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = fieldToScreen(v, p.x, p.y);
    if (i === 0) ctx.moveTo(s.px, s.py);
    else ctx.lineTo(s.px, s.py);
  });
  ctx.closePath();
}

function robot(ctx: CanvasRenderingContext2D, v: View, p: Pose, L: number, W: number, stroke: string, fill: string | null, dash: number[] = []) {
  poly(ctx, v, footprint(p.x, p.y, p.heading, L, W));
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.setLineDash(dash);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  const a = fieldToScreen(v, p.x, p.y);
  const r = (p.heading * Math.PI) / 180;
  const b = fieldToScreen(v, p.x + Math.cos(r) * (L / 2), p.y + Math.sin(r) * (L / 2));
  ctx.beginPath();
  ctx.moveTo(a.px, a.py);
  ctx.lineTo(b.px, b.py);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawField(ctx: CanvasRenderingContext2D, d: DrawInput) {
  const v = d.view;
  const size = FIELD_IN * v.k;
  const c = fieldToScreen(v, 0, 0);
  ctx.save();
  ctx.translate(c.px, c.py);
  ctx.rotate(headingToCanvasRad(v, 0));
  if (d.image) {
    ctx.globalAlpha = d.imageOpacity;
    ctx.drawImage(d.image, -size / 2, -size / 2, size, size);
    ctx.globalAlpha = 1;
  } else {
    const tile = size / 6;
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        ctx.fillStyle = (i + j) % 2 ? C.tileA : C.tileB;
        ctx.fillRect(-size / 2 + i * tile, -size / 2 + j * tile, tile, tile);
      }
  }
  ctx.strokeStyle = C.wall;
  ctx.lineWidth = 3;
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.restore();
}

export function draw(ctx: CanvasRenderingContext2D, d: DrawInput) {
  const v = d.view;
  const { sim } = d;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, d.width, d.height);
  drawField(ctx, d);

  if (d.showZones) {
    const h = HIVE_KEEP_OUT;
    poly(ctx, v, [
      { x: h.x0, y: h.y0 },
      { x: h.x1, y: h.y0 },
      { x: h.x1, y: h.y1 },
      { x: h.x0, y: h.y1 },
    ]);
    ctx.fillStyle = C.keepOut;
    ctx.fill();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = C.keepOutEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const a = fieldToScreen(v, 0, -HALF_FIELD);
    const b = fieldToScreen(v, 0, HALF_FIELD);
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.strokeStyle = C.centerLine;
    ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (d.showError) {
    for (const st of sim.steps) {
      const step = d.steps[st.index];
      if (!step || (step.kind !== 'drive' && step.kind !== 'wall')) continue;
      const c = fieldToScreen(v, st.to.x, st.to.y);
      const swap = v.rotation === 90 || v.rotation === 270;
      const rx = Math.max(1, 2 * (swap ? st.sy : st.sx) * v.k);
      const ry = Math.max(1, 2 * (swap ? st.sx : st.sy) * v.k);
      ctx.beginPath();
      ctx.ellipse(c.px, c.py, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = C.err;
      ctx.fill();
      ctx.strokeStyle = C.errEdge;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const st of sim.steps) {
    const step = d.steps[st.index];
    if (!step) continue;
    const pts = st.contact ? [st.from, st.contact, st.to] : [st.from, st.to];
    if (Math.hypot(st.to.x - st.from.x, st.to.y - st.from.y) < 0.01 && !st.contact) continue;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = fieldToScreen(v, p.x, p.y);
      if (i === 0) ctx.moveTo(s.px, s.py);
      else ctx.lineTo(s.px, s.py);
    });
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.halo;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = d.badSteps.has(st.index) ? C.bad : step.kind === 'wall' ? C.pathWall : C.path;
    ctx.lineWidth = step.id === d.selectedId ? 3.5 : 2.5;
    if (step.kind === 'wall') ctx.setLineDash([7, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (st.contact && !st.shortOfWall) {
      const s = fieldToScreen(v, st.contact.x, st.contact.y);
      ctx.fillStyle = C.halo;
      ctx.fillRect(s.px - 6, s.py - 6, 12, 12);
      ctx.strokeStyle = C.path;
      ctx.lineWidth = 2;
      ctx.strokeRect(s.px - 5, s.py - 5, 10, 10);
    }
  }

  if (sim.steps.length) robot(ctx, v, sim.end, d.robotLength, d.robotWidth, C.end, null, [5, 4]);
  robot(ctx, v, sim.start, d.robotLength, d.robotWidth, C.start, C.startFill);
  const hr = (sim.start.heading * Math.PI) / 180;
  const off = handleOffsetIn(d.robotLength);
  const hs = fieldToScreen(v, sim.start.x + Math.cos(hr) * off, sim.start.y + Math.sin(hr) * off);
  ctx.beginPath();
  ctx.arc(hs.px, hs.py, HANDLE_PX, 0, Math.PI * 2);
  ctx.fillStyle = C.halo;
  ctx.fill();
  ctx.strokeStyle = C.start;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const st of sim.steps) {
    const step = d.steps[st.index];
    if (!step || (step.kind !== 'drive' && step.kind !== 'wall')) continue;
    const s = fieldToScreen(v, st.to.x, st.to.y);
    const sel = step.id === d.selectedId;
    const bad = d.badSteps.has(st.index);
    ctx.beginPath();
    if (step.kind === 'drive') ctx.arc(s.px, s.py, sel ? DOT_PX + 2 : DOT_PX, 0, Math.PI * 2);
    else {
      const r = sel ? DOT_PX + 1 : DOT_PX - 1;
      ctx.moveTo(s.px, s.py - r);
      ctx.lineTo(s.px + r, s.py);
      ctx.lineTo(s.px, s.py + r);
      ctx.lineTo(s.px - r, s.py);
      ctx.closePath();
    }
    ctx.fillStyle = bad ? C.bad : sel ? C.selected : C.dot;
    ctx.fill();
    ctx.strokeStyle = C.halo;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.fillText(String(st.index + 1), s.px, s.py + 0.5);
  }

  if (d.ghost) robot(ctx, v, d.ghost, d.robotLength, d.robotWidth, C.ghostEdge, C.ghost);
}
