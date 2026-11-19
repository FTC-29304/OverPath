import { FIELD_IN, HALF_FIELD, fieldToScreen, footprint, headingToCanvasRad, outOfField, type View } from '../geometry/transform';
import type { Pose, Step, Waypoint } from '../model/types';
import { ellipse, type Cov } from '../sim/uncertainty';
import { HIVE_KEEP_OUT } from '../rules/biobuzz';

export const C = {
  bg: '#0e0e0e',
  tileA: '#3a3a3a',
  tileB: '#333333',
  seam: '#1f1f1f',
  wall: '#a8a8a8',
  grid: 'rgba(255,255,255,0.10)',
  path: '#f2f2f2',
  pathReverse: '#a6a6a6',
  pathBad: '#ff5a5f',
  wp: '#bdbdbd',
  wpStart: '#ffffff',
  selected: '#ffffff',
  footprint: 'rgba(255,255,255,0.55)',
  footprintStart: '#ffffff',
  startFill: 'rgba(255,255,255,0.10)',
  footprintBad: '#ff5a5f',
  marker: '#d6d6d6',
  ghost: 'rgba(255,255,255,0.22)',
  ghostEdge: '#ffffff',
  anchor: '#ffffff',
  cloud: 'rgba(255,255,255,0.35)',
  replay: 'rgba(255,255,255,0.95)',
  replayHalo: 'rgba(0,0,0,0.55)',
  ellipseFill: 'rgba(255,255,255,0.08)',
  ellipseEdge: 'rgba(255,255,255,0.8)',
  keepOut: 'rgba(255,255,255,0.07)',
  keepOutEdge: 'rgba(255,255,255,0.75)',
  centerLine: 'rgba(255,255,255,0.45)',
  axisX: '#ffffff',
  axisY: '#9e9e9e',
  text: '#0e0e0e',
  label: 'rgba(255,255,255,0.7)',
};

export const WP_RADIUS_PX = 9;
export const HANDLE_RADIUS_PX = 7;

export interface DrawInput {
  view: View;
  width: number;
  height: number;
  image: HTMLImageElement | null;
  imageOpacity: number;
  imageInset: number;
  waypoints: Waypoint[];
  arrivals: Pose[];
  steps: Step[];
  selectedId: string | null;
  showHeadingHandle: (index: number) => boolean;
  robotLength: number;
  robotWidth: number;
  ghost: Pose | null;
  activeStep: number;
  cornerLabel: (x: number, y: number) => string;
  showRuleZones: boolean;
  badSteps: Set<number>;
  uncertainty: Cov[] | null;
  cloud: { x: number; y: number }[][] | null;
  replay: ReplayDraw | null;
}

export interface ReplayDraw {
  path: { x: number; y: number }[];
  marks: { x: number; y: number; kind: 'wall' | 'slip' | 'blocked' | 'stopped' }[];
}

function drawReplay(ctx: CanvasRenderingContext2D, v: View, r: ReplayDraw) {
  if (r.path.length > 1) {
    ctx.beginPath();
    r.path.forEach((p, i) => {
      const s = fieldToScreen(v, p.x, p.y);
      if (i === 0) ctx.moveTo(s.px, s.py);
      else ctx.lineTo(s.px, s.py);
    });
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.replayHalo;
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.strokeStyle = C.replay;
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const m of r.marks) {
    const s = fieldToScreen(v, m.x, m.y);
    ctx.save();
    ctx.translate(s.px, s.py);
    ctx.strokeStyle = C.replay;
    ctx.fillStyle = C.replayHalo;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (m.kind === 'wall') {
      ctx.rect(-5, -5, 10, 10);
      ctx.fill();
      ctx.stroke();
    } else if (m.kind === 'slip') {
      ctx.moveTo(0, -6);
      ctx.lineTo(6, 5);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.moveTo(-5, -5);
      ctx.lineTo(5, 5);
      ctx.moveTo(5, -5);
      ctx.lineTo(-5, 5);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function handleOffsetIn(robotLength: number): number {
  return robotLength / 2 + 6;
}

function polygon(ctx: CanvasRenderingContext2D, v: View, pts: { x: number; y: number }[]) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = fieldToScreen(v, p.x, p.y);
    if (i === 0) ctx.moveTo(s.px, s.py);
    else ctx.lineTo(s.px, s.py);
  });
  ctx.closePath();
}

function drawField(ctx: CanvasRenderingContext2D, d: DrawInput) {
  const { view: v } = d;
  const size = FIELD_IN * v.k;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      ctx.fillStyle = (i + j) % 2 ? C.tileA : C.tileB;
      ctx.fillRect(v.ox + i * 24 * v.k, v.oy + j * 24 * v.k, 24 * v.k + 0.5, 24 * v.k + 0.5);
    }
  }
  if (d.image) {
    ctx.save();
    ctx.globalAlpha = d.imageOpacity;
    ctx.beginPath();
    ctx.rect(v.ox, v.oy, size, size);
    ctx.clip();
    const c = fieldToScreen(v, 0, 0);
    ctx.translate(c.px, c.py);
    ctx.rotate((-v.rotation * Math.PI) / 180);
    const full = size / (1 - 2 * d.imageInset);
    ctx.drawImage(d.image, -full / 2, -full / 2, full, full);
    ctx.restore();
  }
  ctx.strokeStyle = d.image ? C.grid : C.seam;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    ctx.moveTo(v.ox + i * 24 * v.k, v.oy);
    ctx.lineTo(v.ox + i * 24 * v.k, v.oy + size);
    ctx.moveTo(v.ox, v.oy + i * 24 * v.k);
    ctx.lineTo(v.ox + size, v.oy + i * 24 * v.k);
  }
  ctx.stroke();
  ctx.strokeStyle = C.wall;
  ctx.lineWidth = 3;
  ctx.strokeRect(v.ox, v.oy, size, size);

  if (d.showRuleZones) {
    const r = HIVE_KEEP_OUT;
    polygon(ctx, v, [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y0 },
      { x: r.x1, y: r.y1 },
      { x: r.x0, y: r.y1 },
    ]);
    ctx.fillStyle = C.keepOut;
    ctx.fill();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = C.keepOutEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const a = fieldToScreen(v, 0, HALF_FIELD);
    const b = fieldToScreen(v, 0, r.y1);
    const c2 = fieldToScreen(v, 0, r.y0);
    const e = fieldToScreen(v, 0, -HALF_FIELD);
    ctx.strokeStyle = C.centerLine;
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.moveTo(c2.px, c2.py);
    ctx.lineTo(e.px, e.py);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const o = fieldToScreen(v, 0, 0);
  const ax = fieldToScreen(v, 10, 0);
  const ay = fieldToScreen(v, 0, 10);
  ctx.lineWidth = 2;
  ctx.font = '600 11px system-ui, sans-serif';
  for (const [p, label, color] of [
    [ax, '+X', C.axisX],
    [ay, '+Y', C.axisY],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(o.px, o.py);
    ctx.lineTo(p.px, p.py);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, p.px + 3, p.py - 3);
  }
}

function drawRobot(ctx: CanvasRenderingContext2D, d: DrawInput, pose: Pose, fill: string | null, stroke: string, width = 1.5) {
  const v = d.view;
  polygon(ctx, v, footprint(pose.x, pose.y, pose.heading, d.robotLength, d.robotWidth));
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
  const c = fieldToScreen(v, pose.x, pose.y);
  const h = (pose.heading * Math.PI) / 180;
  const n = fieldToScreen(v, pose.x + (Math.cos(h) * d.robotLength) / 2, pose.y + (Math.sin(h) * d.robotLength) / 2);
  ctx.beginPath();
  ctx.moveTo(c.px, c.py);
  ctx.lineTo(n.px, n.py);
  ctx.stroke();
}

export function draw(ctx: CanvasRenderingContext2D, d: DrawInput) {
  const v = d.view;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, d.width, d.height);
  drawField(ctx, d);

  if (d.cloud) {
    ctx.fillStyle = C.cloud;
    for (const pts of d.cloud) {
      for (const p of pts) {
        if (!p) continue;
        const s = fieldToScreen(v, p.x, p.y);
        ctx.fillRect(s.px - 0.75, s.py - 0.75, 1.5, 1.5);
      }
    }
  }
  if (d.uncertainty) {
    d.uncertainty.forEach((cov, i) => {
      const pose = d.arrivals[i];
      if (!pose || i === 0) return;
      const e = ellipse(cov);
      if (e.a < 0.05) return;
      const c = fieldToScreen(v, pose.x, pose.y);
      ctx.save();
      ctx.translate(c.px, c.py);
      ctx.rotate((-(e.angleDeg + v.rotation) * Math.PI) / 180);
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(1, e.a * v.k), Math.max(1, e.b * v.k), 0, 0, Math.PI * 2);
      ctx.fillStyle = C.ellipseFill;
      ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = C.ellipseEdge;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });
  }

  if (d.replay) drawReplay(ctx, v, d.replay);

  d.arrivals.forEach((pose, i) => {
    const bad = outOfField(pose.x, pose.y, pose.heading, d.robotLength, d.robotWidth);
    ctx.setLineDash(i === 0 ? [] : [4, 3]);
    drawRobot(ctx, d, pose, i === 0 ? C.startFill : null, bad ? C.footprintBad : i === 0 ? C.footprintStart : C.footprint, bad ? 2 : 1.25);
  });
  ctx.setLineDash([]);

  for (const s of d.steps) {
    if (s.kind !== 'square') continue;
    const c = footprint(s.contact.x, s.contact.y, s.contact.heading, d.robotLength, d.robotWidth);
    polygon(ctx, v, c);
    ctx.strokeStyle = C.anchor;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    const pair = s.face === 'front' ? [0, 1] : s.face === 'back' ? [2, 3] : s.face === 'left' ? [3, 0] : [1, 2];
    const a = fieldToScreen(v, c[pair[0]].x, c[pair[0]].y);
    const b = fieldToScreen(v, c[pair[1]].x, c[pair[1]].y);
    ctx.strokeStyle = C.anchor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
    const p0 = fieldToScreen(v, s.from.x, s.from.y);
    const p1 = fieldToScreen(v, s.contact.x, s.contact.y);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0.px, p0.py);
    ctx.lineTo(p1.px, p1.py);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const [i, s] of d.steps.entries()) {
    if (s.kind !== 'move') continue;
    const a = fieldToScreen(v, s.from.x, s.from.y);
    const b = fieldToScreen(v, s.to.x, s.to.y);
    const reverse = s.forward < 0 && s.strafeRight === 0;
    ctx.strokeStyle = d.badSteps.has(i) ? C.pathBad : reverse ? C.pathReverse : C.path;
    ctx.lineWidth = i === d.activeStep ? 5 : 3;
    ctx.setLineDash(reverse ? [8, 5] : []);
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
    ctx.setLineDash([]);
    const mx = (a.px + b.px) / 2;
    const my = (a.py + b.py) / 2;
    const ang = Math.atan2(b.py - a.py, b.px - a.px);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(mx + Math.cos(ang) * 7, my + Math.sin(ang) * 7);
    ctx.lineTo(mx + Math.cos(ang + 2.5) * 7, my + Math.sin(ang + 2.5) * 7);
    ctx.lineTo(mx + Math.cos(ang - 2.5) * 7, my + Math.sin(ang - 2.5) * 7);
    ctx.fill();
    for (const m of s.markers) {
      const p = fieldToScreen(v, s.from.x + (s.to.x - s.from.x) * m.t, s.from.y + (s.to.y - s.from.y) * m.t);
      ctx.fillStyle = C.marker;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py - 6);
      ctx.lineTo(p.px + 6, p.py);
      ctx.lineTo(p.px, p.py + 6);
      ctx.lineTo(p.px - 6, p.py);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  d.waypoints.forEach((wp, i) => {
    const p = fieldToScreen(v, wp.x, wp.y);
    const selected = wp.id === d.selectedId;
    if (selected && d.showHeadingHandle(i)) {
      const h = (wp.heading * Math.PI) / 180;
      const off = handleOffsetIn(d.robotLength);
      const hp = fieldToScreen(v, wp.x + Math.cos(h) * off, wp.y + Math.sin(h) * off);
      ctx.strokeStyle = C.selected;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(hp.px, hp.py);
      ctx.stroke();
      ctx.fillStyle = C.selected;
      ctx.beginPath();
      ctx.arc(hp.px, hp.py, HANDLE_RADIUS_PX, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    if (wp.anchor) ctx.rect(p.px - WP_RADIUS_PX, p.py - WP_RADIUS_PX, WP_RADIUS_PX * 2, WP_RADIUS_PX * 2);
    else ctx.arc(p.px, p.py, WP_RADIUS_PX, 0, Math.PI * 2);
    ctx.fillStyle = selected ? C.selected : i === 0 ? C.wpStart : C.wp;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.bg;
    ctx.stroke();
    if (selected) {
      ctx.beginPath();
      ctx.arc(p.px, p.py, WP_RADIUS_PX + 4, 0, Math.PI * 2);
      ctx.strokeStyle = C.selected;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = C.text;
    ctx.fillText(i === 0 ? 'S' : String(i), p.px, p.py + 0.5);
  });

  if (d.ghost) {
    drawRobot(ctx, d, d.ghost, C.ghost, C.ghostEdge, 2);
    const c = fieldToScreen(v, d.ghost.x, d.ghost.y);
    ctx.save();
    ctx.translate(c.px, c.py);
    ctx.rotate(headingToCanvasRad(v, d.ghost.heading));
    ctx.fillStyle = C.ghostEdge;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-5, 6);
    ctx.lineTo(-5, -6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = C.label;
  ctx.font = '500 10px system-ui, sans-serif';
  const corners = [
    [-HALF_FIELD, -HALF_FIELD],
    [HALF_FIELD, -HALF_FIELD],
    [HALF_FIELD, HALF_FIELD],
    [-HALF_FIELD, HALF_FIELD],
  ];
  for (const [x, y] of corners) {
    const s = fieldToScreen(v, x, y);
    const inset = 6;
    const left = s.px <= v.ox + 1;
    const top = s.py <= v.oy + 1;
    ctx.textAlign = left ? 'left' : 'right';
    ctx.textBaseline = top ? 'top' : 'bottom';
    ctx.fillText(d.cornerLabel(x, y), s.px + (left ? inset : -inset), s.py + (top ? inset : -inset));
  }
}
