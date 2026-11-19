import { round, wrapDeg } from '../geometry/transform';
import { msg, type Msg } from '../i18n/translate';
import type { Action, Auto, CompiledMarker, HardwareConfig, Pose, Step } from '../model/types';
import { APPROACH_IN, BACK_OFF_IN, DEFAULT_ROBOT, offWall, snapToAnchor, type RobotSize } from './anchors';

export const MIN_MOVE_IN = 0.25;
export const MIN_TURN_DEG = 0.5;

export interface CompileResult {
  steps: Step[];
  arrivals: Pose[];
  warnings: Msg[];
}

export function fieldToRobot(dx: number, dy: number, headingDeg: number): { forward: number; strafeRight: number } {
  const h = (headingDeg * Math.PI) / 180;
  return {
    forward: round(dx * Math.cos(h) + dy * Math.sin(h), 2),
    strafeRight: round(dx * Math.sin(h) - dy * Math.cos(h), 2),
  };
}

export function robotToField(forward: number, strafeRight: number, headingDeg: number): { dx: number; dy: number } {
  const h = (headingDeg * Math.PI) / 180;
  return {
    dx: forward * Math.cos(h) + strafeRight * Math.sin(h),
    dy: forward * Math.sin(h) - strafeRight * Math.cos(h),
  };
}

export function compile(auto: Auto, config: HardwareConfig, robot: RobotSize = DEFAULT_ROBOT): CompileResult {
  const steps: Step[] = [];
  const arrivals: Pose[] = [];
  const warnings: Msg[] = [];
  const wps = auto.waypoints;
  if (wps.length === 0) return { steps, arrivals, warnings };

  const mechIds = new Set(config.mechanisms.map((m) => m.id));
  const tank = config.drivetrain === 'tank';
  const first = wps[0];
  const startPose = first.anchor ? snapToAnchor(first.x, first.y, first.anchor, robot) : { x: first.x, y: first.y, heading: first.heading };
  let pose: Pose = { ...startPose, heading: wrapDeg(startPose.heading) };

  const push = (wp: number, s: DistributiveOmit<Step, 'wp' | 'from' | 'to' | 'timeoutMs'>, to: Pose, timeoutMs = 0) => {
    steps.push({ ...s, wp, timeoutMs, from: pose, to } as Step);
    pose = to;
  };

  const turnTo = (wp: number, heading: number, power: number) => {
    const h = round(wrapDeg(heading), 2);
    if (Math.abs(wrapDeg(h - pose.heading)) < MIN_TURN_DEG) return;
    push(wp, { kind: 'turnTo', heading: h, power }, { ...pose, heading: h });
  };

  const moveTo = (wp: number, x: number, y: number, power: number, markers: CompiledMarker[], reversed: boolean, timeoutMs: number) => {
    const dx = x - pose.x;
    const dy = y - pose.y;
    if (Math.hypot(dx, dy) < MIN_MOVE_IN) return false;
    if (tank) {
      const travel = (Math.atan2(dy, dx) * 180) / Math.PI;
      turnTo(wp, reversed ? travel + 180 : travel, config.constants.turnPower);
    }
    const { forward, strafeRight } = fieldToRobot(dx, dy, pose.heading);
    push(
      wp,
      { kind: 'move', forward, strafeRight: tank ? 0 : strafeRight, power, markers, reversed: tank && reversed },
      { x, y, heading: pose.heading },
      timeoutMs,
    );
    return true;
  };

  const checkMech = (wp: number, id: string) => {
    if (!mechIds.has(id)) warnings.push(msg('warn.missingMech', { wp }));
  };

  const emitActions = (wp: number, actions: Action[]) => {
    for (const a of actions) {
      switch (a.kind) {
        case 'wait':
          push(wp, { kind: 'wait', ms: Math.max(0, Math.round(a.ms)) }, pose);
          break;
        case 'servo':
          checkMech(wp, a.mechanismId);
          push(wp, { kind: 'servo', mechanismId: a.mechanismId, position: a.position }, pose);
          break;
        case 'motor':
          checkMech(wp, a.mechanismId);
          push(wp, { kind: 'motor', mechanismId: a.mechanismId, power: a.power, ...timing(a.ms, a.background) }, pose);
          break;
        case 'command':
          if (!a.name.trim()) warnings.push(msg('warn.emptyCommand', { wp }));
          push(wp, { kind: 'command', name: a.name.trim(), ...timing(a.ms, a.background) }, pose);
          break;
        case 'turn':
          turnTo(wp, a.heading, a.power);
          break;
      }
    }
  };

  arrivals.push(pose);
  emitActions(0, first.actions);

  for (let i = 1; i < wps.length; i++) {
    const wp = wps[i];
    const markers: CompiledMarker[] = [...wp.markers]
      .sort((a, b) => a.t - b.t)
      .map((m) => ({ t: Math.min(1, Math.max(0, m.t)), action: m.action }));
    for (const m of markers) if (m.action.kind !== 'command') checkMech(i, m.action.mechanismId);

    let moved: boolean;
    if (wp.anchor) {
      const a = wp.anchor;
      const contact = snapToAnchor(wp.x, wp.y, a, robot);
      const approach = offWall(contact, a.wall, APPROACH_IN);
      if (tank) {
        moved = moveTo(i, approach.x, approach.y, wp.power, markers, wp.reversed, wp.timeoutMs);
        turnTo(i, contact.heading, config.constants.turnPower);
      } else {
        turnTo(i, contact.heading, config.constants.turnPower);
        moved = moveTo(i, approach.x, approach.y, wp.power, markers, false, wp.timeoutMs);
      }
      const after = offWall(contact, a.wall, BACK_OFF_IN);
      push(i, { kind: 'square', wall: a.wall, face: a.face, align: a.alignHeading, power: a.power, contact }, after);
    } else {
      if (!tank) turnTo(i, wp.heading, config.constants.turnPower);
      moved = moveTo(i, wp.x, wp.y, wp.power, markers, wp.reversed, wp.timeoutMs);
    }

    if (!moved && markers.length > 0) {
      warnings.push(msg('warn.zeroMarkers', { wp: i }));
      for (const m of markers) {
        const a = m.action;
        if (a.kind === 'servo') push(i, { kind: 'servo', mechanismId: a.mechanismId, position: a.position }, pose);
        else if (a.kind === 'motor') push(i, { kind: 'motor', mechanismId: a.mechanismId, power: a.power, ms: 0, background: false }, pose);
        else push(i, { kind: 'command', name: a.name, ms: 0, background: false }, pose);
      }
    }
    arrivals.push(pose);
    emitActions(i, wp.actions);
  }

  return { steps, arrivals, warnings };
}

function timing(ms: number | undefined, background: boolean | undefined): { ms: number; background: boolean } {
  const t = Math.max(0, Math.round(ms ?? 0));
  return { ms: t, background: t > 0 && !!background };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
