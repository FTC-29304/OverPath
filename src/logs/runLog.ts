import type { Drivetrain, WallSide } from '../model/types';

export interface RunSample {
  t: number;
  step: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  volts: number;
  slipping: boolean;
}

export interface RunEvent {
  t: number;
  step: number;
  kind: string;
  details: string[];
}

export interface WallSample {
  wall: WallSide;
  corrIn: number;
  corrDeg: number;
  forward: number;
  strafe: number;
  forwardAbs: number;
  strafeAbs: number;
  turns: number;
  seconds: number;
  headingTurns: number;
  headingSeconds: number;
}

export interface RunLog {
  name: string;
  version: string | null;
  drivetrain: Drivetrain;
  robot: { lengthIn: number; widthIn: number } | null;
  start: { x: number; y: number; heading: number } | null;
  constants: { wheelDiameterIn: number; strafeMultiplier: number } | null;
  samples: RunSample[];
  events: RunEvent[];
  walls: WallSample[];
  duration: number;
  counts: { slips: number; blocked: number; timeouts: number; stopped: boolean; imuLost: boolean };
}

export type RunParse = { ok: true; log: RunLog } | { ok: false; error: 'runLog.notRun' | 'runLog.newerVersion' | 'runLog.empty' };

const WALLS: Record<string, WallSide> = { LEFT: 'left', RIGHT: 'right', AUDIENCE: 'audience', REAR: 'rear' };

const num = (s: string | undefined) => (s === undefined || s === '' ? NaN : Number(s));

export function parseRunLog(text: string): RunParse {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const first = lines.find((l) => l.trim() !== '');
  const m = first?.match(/^# overpath-run (\d+)/);
  if (!m) return { ok: false, error: 'runLog.notRun' };
  if (Number(m[1]) > 1) return { ok: false, error: 'runLog.newerVersion' };

  const log: RunLog = {
    name: 'run',
    version: null,
    drivetrain: 'mecanum',
    robot: null,
    start: null,
    constants: null,
    samples: [],
    events: [],
    walls: [],
    duration: 0,
    counts: { slips: 0, blocked: 0, timeouts: 0, stopped: false, imuLost: false },
  };
  for (const line of lines) {
    if (line.startsWith('# ')) {
      const [key, ...rest] = line.slice(2).split(' ');
      if (key === 'name') log.name = rest.join(' ');
      else if (key === 'version') log.version = rest[0] ?? null;
      else if (key === 'drivetrain') log.drivetrain = rest[0] === 'TANK' ? 'tank' : 'mecanum';
      else if (key === 'robot' && rest.length >= 2) log.robot = { lengthIn: num(rest[0]), widthIn: num(rest[1]) };
      else if (key === 'start' && rest.length >= 3) log.start = { x: num(rest[0]), y: num(rest[1]), heading: num(rest[2]) };
      else if (key === 'constants') {
        const kv = Object.fromEntries(rest.map((p) => p.split('=') as [string, string]));
        const d = num(kv.wheelDiameterIn);
        const sm = num(kv.strafeMultiplier);
        if (Number.isFinite(d) && Number.isFinite(sm)) log.constants = { wheelDiameterIn: d, strafeMultiplier: sm };
      }
    } else if (line.startsWith('S,')) {
      const f = line.split(',');
      const s: RunSample = {
        t: num(f[1]),
        step: num(f[2]),
        x: num(f[3]),
        y: num(f[4]),
        heading: num(f[5]),
        speed: num(f[6]),
        volts: num(f[7]),
        slipping: f[8] === '1',
      };
      if (Number.isFinite(s.t) && Number.isFinite(s.x) && Number.isFinite(s.y)) log.samples.push(s);
    } else if (line.startsWith('E,')) {
      const f = line.split(',');
      const kind = f[3] ?? '';
      const details = kind === 'step' || kind === 'blocked' || kind === 'timeout' ? [f.slice(4).join(',')] : f.slice(4);
      const e: RunEvent = { t: num(f[1]), step: num(f[2]), kind, details };
      if (!Number.isFinite(e.t)) continue;
      log.events.push(e);
      if (kind === 'slip') log.counts.slips++;
      else if (kind === 'blocked') log.counts.blocked++;
      else if (kind === 'timeout') log.counts.timeouts++;
      else if (kind === 'stopped') log.counts.stopped = true;
      else if (kind === 'imu') log.counts.imuLost = true;
      else if (kind === 'wall') {
        const d = details;
        const w: WallSample = {
          wall: WALLS[d[0]] ?? 'left',
          corrIn: num(d[2]),
          corrDeg: num(d[3]),
          forward: num(d[4]),
          strafe: num(d[5]),
          forwardAbs: num(d[6]),
          strafeAbs: num(d[7]),
          turns: num(d[8]),
          seconds: num(d[9]),
          headingTurns: num(d[10]),
          headingSeconds: num(d[11]),
        };
        if (WALLS[d[0]] && [w.forward, w.strafe, w.forwardAbs, w.strafeAbs].every(Number.isFinite)) log.walls.push(w);
      }
    }
  }
  if (log.samples.length === 0 && log.events.length === 0) return { ok: false, error: 'runLog.empty' };
  log.duration = Math.max(log.samples.at(-1)?.t ?? 0, log.events.at(-1)?.t ?? 0);
  return { ok: true, log };
}

export function poseAtTime(log: RunLog, t: number): RunSample | null {
  const s = log.samples;
  if (s.length === 0) return null;
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && Math.abs(s[lo - 1].t - t) < Math.abs(s[lo].t - t) ? s[lo - 1] : s[lo];
}

export function replayMarks(log: RunLog) {
  const kinds = { wall: 'wall', slip: 'slip', blocked: 'blocked', stopped: 'stopped' } as const;
  const marks: { x: number; y: number; kind: (typeof kinds)[keyof typeof kinds] }[] = [];
  for (const e of log.events) {
    const kind = kinds[e.kind as keyof typeof kinds];
    const p = kind && poseAtTime(log, e.t);
    if (kind && p) marks.push({ x: p.x, y: p.y, kind });
  }
  return { path: log.samples.map((p) => ({ x: p.x, y: p.y })), marks };
}
