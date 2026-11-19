import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompileResult } from '../compile/compile';
import {
  HALF_FIELD,
  fieldToScreen,
  makeView,
  screenToField,
  screenVectorToHeading,
  snap,
  type View,
} from '../geometry/transform';
import type { Pose } from '../model/types';
import type { RealityCheck } from '../sim/montecarlo';
import type { Uncertainty } from '../sim/uncertainty';
import { useActiveAuto, usePlanner } from '../store/plannerStore';
import { fmtPos } from '../components/format';
import { Rich } from '../components/Rich';
import { useT } from '../i18n';
import { replayMarks } from '../logs/runLog';
import { HANDLE_RADIUS_PX, WP_RADIUS_PX, draw, handleOffsetIn } from './draw';

interface Props {
  compiled: CompileResult;
  ghost: Pose | null;
  activeStep: number;
  badSteps: Set<number>;
  uncertainty: Uncertainty | null;
  reality: RealityCheck | null;
}

type Drag =
  | { kind: 'move'; id: string; moved: boolean; startX: number; startY: number }
  | { kind: 'heading'; id: string; moved: boolean }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number; moved: boolean; add: boolean };

const CLICK_SLOP_PX = 4;

export function FieldCanvas({ compiled, ghost, activeStep, badSteps, uncertainty, reality }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageMissing, setImageMissing] = useState(false);
  const drag = useRef<Drag | null>(null);

  const t = useT();
  const auto = useActiveAuto();
  const view = usePlanner((s) => s.view);
  const shownImage = view.fieldImageUrl ? image : null;
  const shownMissing = view.fieldImageUrl ? imageMissing : false;
  const replay = usePlanner((s) => s.replay);
  const replayDraw = useMemo(() => (replay ? replayMarks(replay) : null), [replay]);
  const config = usePlanner((s) => s.config);
  const selectedId = usePlanner((s) => s.selectedId);
  const { select, addWaypoint, updateWaypoint, checkpoint } = usePlanner.getState();

  const v: View = makeView({ width: size.w, height: size.h, zoom, panX: pan.x, panY: pan.y, rotation: view.rotation });
  const wps = auto.waypoints;
  const showHandle = (i: number) => !wps[i]?.anchor && (i === 0 || config.drivetrain === 'mecanum');

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
    img.onload = () => alive && (setImage(img), setImageMissing(false));
    img.onerror = () => alive && (setImage(null), setImageMissing(true));
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
      imageInset: view.fieldImageInset,
      waypoints: wps,
      arrivals: compiled.arrivals,
      steps: compiled.steps,
      selectedId,
      showHeadingHandle: showHandle,
      robotLength: view.robotLengthIn,
      robotWidth: view.robotWidthIn,
      ghost,
      activeStep,
      cornerLabel: (x, y) => `(${fmtPos(view, x)}, ${fmtPos(view, y)})`,
      showRuleZones: view.showRuleZones,
      badSteps,
      uncertainty: uncertainty?.atArrival ?? null,
      cloud: reality?.points ?? null,
      replay: replayDraw,
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

  function hitTest(px: number, py: number): Exclude<Drag, { kind: 'pan' }> | null {
    const sel = wps.findIndex((w) => w.id === selectedId);
    if (sel >= 0 && showHandle(sel)) {
      const w = wps[sel];
      const h = (w.heading * Math.PI) / 180;
      const off = handleOffsetIn(view.robotLengthIn);
      const hp = fieldToScreen(v, w.x + Math.cos(h) * off, w.y + Math.sin(h) * off);
      if (Math.hypot(hp.px - px, hp.py - py) <= HANDLE_RADIUS_PX + 3) return { kind: 'heading', id: w.id, moved: false };
    }
    for (let i = wps.length - 1; i >= 0; i--) {
      const p = fieldToScreen(v, wps[i].x, wps[i].y);
      if (Math.hypot(p.px - px, p.py - py) <= WP_RADIUS_PX + 3)
        return { kind: 'move', id: wps[i].id, moved: false, startX: px, startY: py };
    }
    return null;
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { px, py } = local(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    const panOnly = e.button === 1 || e.button === 2 || e.altKey;
    const hit = panOnly ? null : hitTest(px, py);
    if (hit) {
      select(hit.id);
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
    if (d.kind === 'move' && !d.moved && Math.hypot(px - d.startX, py - d.startY) < CLICK_SLOP_PX) return;
    if (!d.moved) {
      checkpoint();
      d.moved = true;
    }
    const id = d.id;
    const wp = wps.find((w) => w.id === id);
    if (!wp) return;
    if (d.kind === 'move') {
      updateWaypoint(d.id, snapped(px, py, e.shiftKey), false);
    } else {
      const c = fieldToScreen(v, wp.x, wp.y);
      let h = screenVectorToHeading(v, px - c.px, py - c.py);
      if (!e.shiftKey && view.headingSnapDeg > 0) h = snap(h, view.headingSnapDeg);
      updateWaypoint(d.id, { heading: h === -180 ? 180 : h }, false);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'pan' && !d.moved && d.add) {
      const { px, py } = local(e);
      const f = screenToField(v, px, py);
      if (Math.abs(f.x) <= HALF_FIELD && Math.abs(f.y) <= HALF_FIELD) {
        const p = snapped(px, py, e.shiftKey);
        addWaypoint(p.x, p.y);
      } else {
        select(null);
      }
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

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
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
        <span className="mono" data-testid="cursor-readout">
          {hover ? t('field.cursor', { x: fmtPos(view, hover.x), y: fmtPos(view, hover.y), unit: view.units }) : t('field.hint')}
        </span>
        {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
          <button className="small" onClick={resetView}>
            {t('field.resetView')}
          </button>
        )}
        {shownMissing && (
          <span className="field-note">
            <Rich text={t('field.noImage', { url: view.fieldImageUrl })} />
          </span>
        )}
      </div>
    </div>
  );
}
