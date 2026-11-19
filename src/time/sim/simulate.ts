import { HALF_FIELD, footprint, wrapDeg } from '../geometry/transform';
import type { Auto, Calibration, HardwareConfig, Pose, RobotFace, SimResult, SimStep, ViewPrefs, WallSide } from '../model/types';
import { driveDisplacement, extraMs, speedAlong, turnMs } from './drive';

const RAD = Math.PI / 180;

export const FACE_DIR: Record<RobotFace, number> = { front: 0, left: 90, back: 180, right: -90 };

export function robotToField(heading: number, f: number, l: number): { dx: number; dy: number } {
  const c = Math.cos(heading * RAD);
  const s = Math.sin(heading * RAD);
  return { dx: f * c - l * s + 0, dy: f * s + l * c + 0 };
}

export function fieldToRobot(heading: number, dx: number, dy: number): { f: number; l: number } {
  const c = Math.cos(heading * RAD);
  const s = Math.sin(heading * RAD);
  return { f: dx * c + dy * s + 0, l: -dx * s + dy * c + 0 };
}

export function distanceToWall(pose: Pose, dirDeg: number, lengthIn: number, widthIn: number): { dist: number; wall: WallSide } {
  const ux = Math.cos(dirDeg * RAD);
  const uy = Math.sin(dirDeg * RAD);
  let best = Infinity;
  let wall: WallSide = 'right';
  for (const p of footprint(pose.x, pose.y, pose.heading, lengthIn, widthIn)) {
    if (ux > 1e-9 && (HALF_FIELD - p.x) / ux < best) [best, wall] = [(HALF_FIELD - p.x) / ux, 'right'];
    if (ux < -1e-9 && (-HALF_FIELD - p.x) / ux < best) [best, wall] = [(-HALF_FIELD - p.x) / ux, 'left'];
    if (uy > 1e-9 && (HALF_FIELD - p.y) / uy < best) [best, wall] = [(HALF_FIELD - p.y) / uy, 'audience'];
    if (uy < -1e-9 && (-HALF_FIELD - p.y) / uy < best) [best, wall] = [(-HALF_FIELD - p.y) / uy, 'rear'];
  }
  return { dist: Math.max(0, best), wall };
}

export function wallReachMs(cal: Calibration, view: ViewPrefs, pose: Pose, face: RobotFace, power: number): number | null {
  const dir = FACE_DIR[face];
  const { dist } = distanceToWall(pose, pose.heading + dir, view.robotLengthIn, view.robotWidthIn);
  const v = speedAlong(cal, dir, power);
  if (v <= 1e-9) return null;
  return Math.max(0, (dist / v) * 1000 - extraMs(cal, dir));
}

export function suggestWallMs(cal: Calibration, view: ViewPrefs, pose: Pose, face: RobotFace, power: number): number | null {
  const reach = wallReachMs(cal, view, pose, face, power);
  if (reach == null) return null;
  return Math.round((reach * 1.25 + cal.squareMs + 200) / 10) * 10;
}

const round = (n: number) => Math.round(n * 1000) / 1000 + 0;
const roundPose = (p: Pose): Pose => ({ x: round(p.x), y: round(p.y), heading: round(wrapDeg(p.heading)) });

export function simulate(auto: Auto, cal: Calibration, hw: HardwareConfig, view: ViewPrefs): SimResult {
  let pose: Pose = { ...auto.start, heading: wrapDeg(auto.start.heading) };
  let t = 0;
  let sx = 0.5;
  let sy = 0.5;
  let sh = 1;
  const steps: SimStep[] = [];

  auto.steps.forEach((step, index) => {
    const from = pose;
    let ms = 0;
    let to = pose;
    let contact: Pose | undefined;
    let wall: WallSide | undefined;
    let shortOfWall: boolean | undefined;

    switch (step.kind) {
      case 'drive': {
        ms = Math.max(0, step.ms);
        const d = driveDisplacement(cal, step.dirDeg, step.power, ms);
        const { dx, dy } = robotToField(pose.heading, d.f, d.l);
        to = { x: pose.x + dx, y: pose.y + dy, heading: pose.heading };
        const ef = cal.drivePct * Math.abs(d.f);
        const el = cal.strafePct * Math.abs(d.l);
        const len = Math.hypot(dx, dy);
        const ec = len * Math.sin(sh * RAD);
        const c = Math.cos(pose.heading * RAD);
        const s = Math.sin(pose.heading * RAD);
        const nx = len > 0 ? -dy / len : 0;
        const ny = len > 0 ? dx / len : 0;
        sx = Math.sqrt(sx * sx + (ef * c) ** 2 + (el * s) ** 2 + (ec * nx) ** 2);
        sy = Math.sqrt(sy * sy + (ef * s) ** 2 + (el * c) ** 2 + (ec * ny) ** 2);
        break;
      }
      case 'turn': {
        const target = wrapDeg(step.heading);
        ms = turnMs(cal, wrapDeg(target - pose.heading), step.power, hw.turnTolDeg, hw.turnTimeoutMs);
        to = { ...pose, heading: target };
        sh = Math.max(sh, cal.turnSigmaDeg);
        break;
      }
      case 'wall': {
        ms = Math.max(0, step.ms);
        const dir = FACE_DIR[step.face];
        const fieldDir = pose.heading + dir;
        const hit = distanceToWall(pose, fieldDir, view.robotLengthIn, view.robotWidthIn);
        wall = hit.wall;
        const reach = wallReachMs(cal, view, pose, step.face, step.power);
        const flat = view.flatFaces.includes(step.face);
        if (reach == null || ms < reach + 100) {
          shortOfWall = true;
          const d = driveDisplacement(cal, dir, step.power, ms);
          const { dx, dy } = robotToField(pose.heading, d.f, d.l);
          to = { x: pose.x + dx, y: pose.y + dy, heading: pose.heading };
          contact = to;
          const len = Math.hypot(dx, dy);
          sx = Math.hypot(sx, cal.drivePct * len);
          sy = Math.hypot(sy, cal.drivePct * len);
          break;
        }
        const heading = flat ? Math.round(pose.heading / 90) * 90 : pose.heading;
        const squared = { ...pose, heading };
        const hit2 = distanceToWall(squared, heading + dir, view.robotLengthIn, view.robotWidthIn);
        const u = { x: Math.cos((heading + dir) * RAD), y: Math.sin((heading + dir) * RAD) };
        contact = { x: pose.x + u.x * hit2.dist, y: pose.y + u.y * hit2.dist, heading };
        wall = hit2.wall;
        const back = driveDisplacement(cal, dir + 180, cal.backOffPower, cal.backOffMs);
        const backDist = Math.hypot(back.f, back.l);
        to = { x: contact.x - u.x * backDist, y: contact.y - u.y * backDist, heading };
        ms += cal.backOffMs;
        const travel = hit2.dist;
        if (wall === 'left' || wall === 'right') {
          sx = Math.hypot(cal.wallSigmaIn, cal.drivePct * backDist);
          sy = Math.hypot(sy, 0.02 * travel);
        } else {
          sy = Math.hypot(cal.wallSigmaIn, cal.drivePct * backDist);
          sx = Math.hypot(sx, 0.02 * travel);
        }
        if (flat) sh = 0.5;
        break;
      }
      case 'wait':
      case 'motor':
      case 'command':
        ms = Math.max(0, step.ms);
        break;
      case 'servo':
        ms = 0;
        break;
    }

    pose = roundPose(to);
    steps.push({
      index,
      from,
      to: pose,
      contact: contact ? roundPose(contact) : undefined,
      wall,
      shortOfWall,
      ms: Math.round(ms),
      startMs: Math.round(t),
      sx: round(sx),
      sy: round(sy),
      sh: round(sh),
    });
    t += ms;
  });

  return { start: roundPose(auto.start), steps, end: pose, totalMs: Math.round(t) };
}

export function poseAt(sim: SimResult, ms: number): { pose: Pose; step: number } {
  for (const s of sim.steps) {
    if (ms < s.startMs + s.ms) {
      const f = s.ms > 0 ? Math.max(0, (ms - s.startMs) / s.ms) : 1;
      if (s.contact && !s.shortOfWall) {
        const split = 0.85;
        return f < split ? { pose: lerp(s.from, s.contact, f / split), step: s.index } : { pose: lerp(s.contact, s.to, (f - split) / (1 - split)), step: s.index };
      }
      return { pose: lerp(s.from, s.to, f), step: s.index };
    }
  }
  return { pose: sim.end, step: -1 };
}

function lerp(a: Pose, b: Pose, f: number): Pose {
  const dh = wrapDeg(b.heading - a.heading);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, heading: wrapDeg(a.heading + dh * f) };
}
