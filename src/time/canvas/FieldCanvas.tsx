import { useEffect, useRef, useState } from 'react';
import {
  HALF_FIELD,
  fieldToScreen,
  footprint,
  makeView,
  screenToField,
  screenVectorToHeading,
  snap,
  type View,
} from '../geometry/transform';
import type { Pose, SimResult } from '../model/types';
import type { RuleReport } from '../rules/biobuzz';
import { fieldToRobot } from '../sim/simulate';
import { solveDrive } from '../sim/drive';
import { newId } from '../model/defaults';
import { usePlanner } from '../store/plannerStore';
import { fmtLen } from '../components/format';
import { useT } from '../i18n';
import type { Auto } from '../model/types';
import { DOT_PX, HANDLE_PX, draw, handleOffsetIn } from './draw';

interface Props {
  auto: Auto;
  sim: SimResult;
  rules: RuleReport;
  ghost: Pose | null;
}

type Drag =
  | { kind: 'drive'; id: string; index: number; moved: boolean; startX: number; startY: number }
  | { kind: 'start'; moved: boolean; startX: number; startY: number; dx: number; dy: number }
  | { kind: 'heading'; moved: boolean }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number; moved: boolean; add: boolean };

const CLICK_SLOP_PX = 4;
const DIR_SNAP_DEG = 5;

function inside(px: number, py: number, pts: { px: number; py: number }[]): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const cross = (b.px - a.px) * (py - a.py) - (b.py - a.py) * (px - a.px);
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
  }
  return true;
}

export function FieldCanvas({ auto, sim, rules, ghost }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const drag = useRef<Drag | null>(null);

  const t = useT();
  const view = usePlanner((s) => s.view);
  const cal = usePlanner((s) => s.calibration);
  const selectedId = usePlanner((s) => s.selectedStepId);
  const { select, insertStep, updateStep, setStart, checkpoint } = usePlanner.getState();
  const shownImage = view.fieldImageUrl ? image : null;

  const v: View = makeView({ width: size.w, height: size.h, zoom, panX: pan.x, panY: pan.y, rotation: view.rotation });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: Math.max(100, r.width), h: Math.max(100, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!view.fieldImageUrl) return;
    const img = new Image();
    let alive = true;
    img.onload = () => alive && setImage(img);
    img.onerror = () => alive && setImage(null);
    img.src = view.fieldImageUrl;
    return () => {
      alive = false;
    };
  }, [view.fieldImageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(size.w * dpr);
    const bh = Math.round(size.h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, {
      view: v,
      width: size.w,
      height: size.h,
      image: shownImage,
      imageOpacity: view.fieldOpacity,
      steps: auto.steps,
      sim,
      selectedId,
      badSteps: rules.badSteps,
      robotLength: view.robotLengthIn,
      robotWidth: view.robotWidthIn,
      showZones: view.showRuleZones,
      showError: view.showError,
      ghost,
    });
  });

  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };
  const clampField = (n: number) => Math.max(-HALF_FIELD, Math.min(HALF_FIELD, n));
  const snapped = (px: number, py: number, free: boolean) => {
    const f = screenToField(v, px, py);
    const step = free ? 0 : view.snapIn;
    return { x: clampField(snap(f.x, step)), y: clampField(snap(f.y, step)) };
  };

  const driveTo = (from: Pose, p: { x: number; y: number }, power: number, free: boolean) => {
    const r = fieldToRobot(from.heading, p.x - from.x, p.y - from.y);
    return solveDrive(cal, r.f, r.l, power, free ? 0 : DIR_SNAP_DEG);
  };

  function hitTest(px: number, py: number): Exclude<Drag, { kind: 'pan' }> | null {
    const s = sim.start;
    const hr = (s.heading * Math.PI) / 180;
    const off = handleOffsetIn(view.robotLengthIn);
    const hp = fieldToScreen(v, s.x + Math.cos(hr) * off, s.y + Math.sin(hr) * off);
    if (Math.hypot(hp.px - px, hp.py - py) <= HANDLE_PX + 3) return { kind: 'heading', moved: false };
    for (let i = sim.steps.length - 1; i >= 0; i--) {
      const st = sim.steps[i];
      const step = auto.steps[st.index];
      if (step?.kind !== 'drive') continue;
      const p = fieldToScreen(v, st.to.x, st.to.y);
      if (Math.hypot(p.px - px, p.py - py) <= DOT_PX + 3)
        return { kind: 'drive', id: step.id, index: st.index, moved: false, startX: px, startY: py };
    }
    const corners = footprint(s.x, s.y, s.heading, view.robotLengthIn, view.robotWidthIn).map((c) => fieldToScreen(v, c.x, c.y));
    if (inside(px, py, corners)) {
      const f = screenToField(v, px, py);
      return { kind: 'start', moved: false, startX: px, startY: py, dx: s.x - f.x, dy: s.y - f.y };
    }
    return null;
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { px, py } = local(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    const panOnly = e.button === 1 || e.button === 2 || e.altKey;
    const hit = panOnly ? null : hitTest(px, py);
    if (hit) {
      if (hit.kind === 'drive') select(hit.id);
      drag.current = hit;
      return;
    }
    drag.current = { kind: 'pan', startX: px, startY: py, panX: pan.x, panY: pan.y, moved: false, add: !panOnly && e.button === 0 };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { px, py } = local(e);
    const f = screenToField(v, px, py);
    setHover(Math.abs(f.x) <= HALF_FIELD && Math.abs(f.y) <= HALF_FIELD ? f : null);
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      if (!d.moved && Math.hypot(px - d.startX, py - d.startY) < CLICK_SLOP_PX) return;
      d.moved = true;
      setPan({ x: d.panX + px - d.startX, y: d.panY + py - d.startY });
      return;
    }
    if ((d.kind === 'drive' || d.kind === 'start') && !d.moved && Math.hypot(px - d.startX, py - d.startY) < CLICK_SLOP_PX) return;
    if (!d.moved) {
      checkpoint();
      d.moved = true;
    }
    if (d.kind === 'drive') {
      const st = sim.steps[d.index];
      const step = auto.steps[d.index];
      if (!st || step?.kind !== 'drive') return;
      const sol = driveTo(st.from, snapped(px, py, e.shiftKey), step.power, e.shiftKey);
      if (sol) updateStep(d.id, sol, false);
    } else if (d.kind === 'start') {
      const free = e.shiftKey ? 0 : view.snapIn;
      setStart({ x: clampField(snap(f.x + d.dx, free)), y: clampField(snap(f.y + d.dy, free)) }, false);
    } else {
      const c = fieldToScreen(v, sim.start.x, sim.start.y);
      let h = screenVectorToHeading(v, px - c.px, py - c.py);
      if (!e.shiftKey) h = snap(h, 15);
      setStart({ heading: h === -180 ? 180 : h }, false);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'pan' && !d.moved && d.add) {
      const { px, py } = local(e);
      const f = screenToField(v, px, py);
      if (Math.abs(f.x) > HALF_FIELD || Math.abs(f.y) > HALF_FIELD) return select(null);
      const sol = driveTo(sim.end, snapped(px, py, e.shiftKey), view.defaultPower, e.shiftKey);
      if (sol) insertStep({ id: newId('st'), kind: 'drive', power: view.defaultPower, ...sol });
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const { px, py } = local(e);
    const f = screenToField(v, px, py);
    const nextZoom = Math.min(6, Math.max(0.5, zoom * Math.exp(-e.deltaY * 0.0015)));
    const nv = makeView({ width: size.w, height: size.h, zoom: nextZoom, panX: pan.x, panY: pan.y, rotation: view.rotation });
    const s = fieldToScreen(nv, f.x, f.y);
    setZoom(nextZoom);
    setPan({ x: pan.x + px - s.px, y: pan.y + py - s.py });
  };

  return (
    <div className="field-wrap">
      <div className="field" ref={containerRef}>
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current = null)}
          onLostPointerCapture={() => (drag.current = null)}
          onPointerLeave={() => setHover(null)}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={t('field.aria')}
          data-testid="field-canvas"
        />
      </div>
      <div className="field-status">
        <span className="mono">
          {hover ? t('field.cursor', { x: fmtLen(view, hover.x), y: fmtLen(view, hover.y), unit: view.units }) : t('field.hint')}
        </span>
        {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
          <button
            className="small"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            {t('field.resetView')}
          </button>
        )}
      </div>
    </div>
  );
}
