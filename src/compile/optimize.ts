import { round, wrapDeg } from '../geometry/transform';
import { makeWaypoint, uid } from '../model/defaults';
import type { Auto, HardwareConfig, RobotFace, Waypoint } from '../model/types';
import { checkAuto } from '../rules/biobuzz';
import { AUTO_SECONDS, simulate } from '../sim/simulate';
import { precisionIn, propagate } from '../sim/uncertainty';
import { DEFAULT_SQUARE_POWER, WALLS, alongWall, anchorHeading, contactPose, facesFor, type RobotSize } from './anchors';
import { compile } from './compile';
import { isPrecision } from './precision';

export interface Proposal {
  id: string;
  kind: 'anchor' | 'corner' | 'faceTravel';
  targetId: string;
  targetLabel: number;
  before: number;
  after: number;
  addedS: number;
  apply(auto: Auto): Auto;
}

interface Eval {
  sigmaById: Map<string, number>;
  total: number;
  errors: number;
}

export const TARGET_IN = 1.0;
const MIN_GAIN = 0.2;

function evaluate(auto: Auto, config: HardwareConfig, robot: RobotSize): Eval {
  const compiled = compile(auto, config, robot);
  const tl = simulate(compiled.steps, config.drivetrain, config.constants);
  const unc = propagate(compiled.steps, tl, config.constants, auto.waypoints.length);
  const rules = checkAuto(compiled, robot.lengthIn, robot.widthIn);
  const sigmaById = new Map<string, number>();
  auto.waypoints.forEach((w, i) => sigmaById.set(w.id, precisionIn(unc.atArrival[i])));
  return { sigmaById, total: tl.total, errors: rules.issues.filter((x) => x.level === 'error').length };
}

function insertBefore(targetId: string, wp: Waypoint) {
  return (a: Auto): Auto => {
    const i = a.waypoints.findIndex((w) => w.id === targetId);
    if (i < 1) return a;
    return { ...a, waypoints: [...a.waypoints.slice(0, i), wp, ...a.waypoints.slice(i)] };
  };
}

function faceTravel(targetId: string, travelHeading: number, scoringHeading: number) {
  return (a: Auto): Auto => ({
    ...a,
    waypoints: a.waypoints.map((w) =>
      w.id !== targetId
        ? w
        : {
            ...w,
            heading: travelHeading,
            actions: [{ id: uid('act'), kind: 'turn' as const, heading: scoringHeading, power: 0.5 }, ...w.actions],
          },
    ),
  });
}

function anchorCandidates(auto: Auto, j: number, config: HardwareConfig, robot: RobotSize, flatFaces: RobotFace[], near = false): Waypoint[] {
  const target = auto.waypoints[j];
  const prev = auto.waypoints[j - 1];
  const out: Waypoint[] = [];
  for (const wall of WALLS) {
    const alongs = new Set<number>();
    for (const p of near ? [target] : [target, prev]) {
      const a = alongWall(wall, p.x, p.y);
      for (const d of [0, -12, 12]) alongs.add(round(a + d, 1));
    }
    const face = facesFor(config.drivetrain).reduce((a, b) =>
      Math.abs(wrapDeg(anchorHeading(wall, a) - prev.heading)) <= Math.abs(wrapDeg(anchorHeading(wall, b) - prev.heading)) ? a : b,
    );
    for (const along of alongs) {
      const c = contactPose(wall, face, along, robot);
      if (Math.hypot(c.x - target.x, c.y - target.y) > 48) continue;
      out.push({
        ...makeWaypoint(c.x, c.y, c.heading, target.power),
        anchor: { wall, face, alignHeading: flatFaces.includes(face), power: DEFAULT_SQUARE_POWER },
      });
    }
  }
  return out;
}

export function optimize(auto: Auto, config: HardwareConfig, robot: RobotSize, flatFaces: RobotFace[]): Proposal[] {
  const proposals: Proposal[] = [];
  let current = auto;
  let base = evaluate(current, config, robot);
  const labels = new Map(auto.waypoints.map((w, i) => [w.id, i]));

  const targets = auto.waypoints.filter((w, i) => isPrecision(w, i)).map((w) => w.id);
  for (const targetId of targets) {
    const before = base.sigmaById.get(targetId) ?? 0;
    if (before <= TARGET_IN) continue;
    const j = current.waypoints.findIndex((w) => w.id === targetId);
    if (j < 1) continue;

    let best: { p: Proposal; score: number; next: Auto; ev: Eval } | null = null;
    const consider = (kind: Proposal['kind'], apply: (a: Auto) => Auto) => {
      const next = apply(current);
      const ev = evaluate(next, config, robot);
      const after = ev.sigmaById.get(targetId) ?? before;
      const addedS = ev.total - base.total;
      if (after > before * (1 - MIN_GAIN) || ev.errors > base.errors || ev.total > AUTO_SECONDS) return;
      const score = (before - after) / Math.max(0.5, addedS);
      if (!best || score > best.score) {
        best = {
          p: { id: uid('opt'), kind, targetId, targetLabel: labels.get(targetId) ?? j, before, after, addedS, apply },
          score,
          next,
          ev,
        };
      }
    };

    for (const wp of anchorCandidates(current, j, config, robot, flatFaces)) consider('anchor', insertBefore(targetId, wp));
    if (!best) {
      const near = anchorCandidates(current, j, config, robot, flatFaces, true);
      const isX = (w: Waypoint) => w.anchor!.wall === 'left' || w.anchor!.wall === 'right';
      for (const a of near) {
        for (const b of near) {
          if (isX(a) === isX(b)) continue;
          const first = { ...a, id: uid('wp') };
          const second = { ...b, id: uid('wp') };
          consider('corner', (au) => insertBefore(targetId, second)(insertBefore(targetId, first)(au)));
        }
      }
    }

    const target = current.waypoints[j];
    if (config.drivetrain === 'mecanum' && !target.anchor) {
      const compiled = compile(current, config, robot);
      const from = compiled.arrivals[j - 1];
      const dx = target.x - from.x;
      const dy = target.y - from.y;
      const travel = round((Math.atan2(dy, dx) * 180) / Math.PI, 1);
      const sideways = Math.abs(dx * Math.sin((target.heading * Math.PI) / 180) - dy * Math.cos((target.heading * Math.PI) / 180));
      if (sideways > 12) consider('faceTravel', faceTravel(targetId, travel, target.heading));
    }

    if (best) {
      const b = best as { p: Proposal; next: Auto; ev: Eval };
      proposals.push(b.p);
      current = b.next;
      base = b.ev;
    }
  }
  return proposals;
}

export function applyProposals(auto: Auto, chosen: Proposal[]): Auto {
  return chosen.reduce((a, p) => p.apply(a), auto);
}
