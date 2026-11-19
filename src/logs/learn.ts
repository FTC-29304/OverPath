import type { DriveConstants, Drivetrain } from '../model/types';
import type { WallSample } from './runLog';

export const HALF_LIFE = 10;
export const MIN_SAMPLES = 5;
const MIN_BIAS = 0.005;
export const TREND_WARN = 0.01;

export interface RunRecord {
  id: string;
  name: string;
  date: number;
  constants: { wheelDiameterIn: number; strafeMultiplier: number } | null;
  drivetrain: Drivetrain;
  walls: WallSample[];
}

export interface Learned {
  runs: number;
  skipped: number;
  samples: number;
  bias: { forward: number; forwardSE: number; strafe: number | null; strafeSE: number | null } | null;
  spreadScale: number | null;
  headingScale: number | null;
  suggest: Partial<Pick<DriveConstants, 'wheelDiameterIn' | 'strafeMultiplier' | 'alongPct' | 'strafePct' | 'turnSigmaDeg'>>;
  trend: number | null;
}

interface Point {
  w: number;
  run: number;
  corr: number;
  f: number;
  s: number;
  fAbs: number;
  sAbs: number;
  corrDeg: number;
  hTurns: number;
  hSecs: number;
}

function adjust(sample: WallSample, used: RunRecord['constants'], c: DriveConstants, w: number, run: number): Point {
  const rf = used ? c.wheelDiameterIn / used.wheelDiameterIn : 1;
  const rs = used ? used.strafeMultiplier / c.strafeMultiplier : 1;
  return {
    w,
    run,
    corr: sample.corrIn - sample.forward * (rf - 1) - sample.strafe * (rs - 1),
    f: sample.forward * rf,
    s: sample.strafe * rs,
    fAbs: sample.forwardAbs * rf,
    sAbs: sample.strafeAbs * rs,
    corrDeg: sample.corrDeg,
    hTurns: sample.headingTurns,
    hSecs: sample.headingSeconds,
  };
}

function wls(rows: number[][], y: number[], w: number[]): { beta: number[]; se: number[]; resid: number[] } | null {
  const p = rows[0]?.length ?? 0;
  const n = rows.length;
  if (n <= p) return null;
  const A = Array.from({ length: p }, () => Array.from({ length: p }, () => 0));
  const b = Array.from({ length: p }, () => 0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      b[j] += w[i] * rows[i][j] * y[i];
      for (let k = 0; k < p; k++) A[j][k] += w[i] * rows[i][j] * rows[i][k];
    }
  }
  const inv = invert(A);
  if (!inv) return null;
  const beta = inv.map((r) => r.reduce((s, v, k) => s + v * b[k], 0));
  const resid = rows.map((r, i) => y[i] - r.reduce((s, v, k) => s + v * beta[k], 0));
  const sw = w.reduce((s, v) => s + v, 0);
  const sw2 = w.reduce((s, v) => s + v * v, 0);
  const nEff = (sw * sw) / sw2;
  const s2 = resid.reduce((s, r, i) => s + w[i] * r * r, 0) / sw * (nEff / Math.max(1, nEff - p));
  const scale = sw / nEff;
  const se = inv.map((r, j) => Math.sqrt(Math.max(0, r[j] * s2 * scale)));
  return { beta, se, resid };
}

function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-9) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    for (let k = 0; k < 2 * n; k++) a[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map((r) => r.slice(n));
}

function fitBias(pts: Point[], useStrafe: boolean) {
  const r = wls(
    pts.map((p) => [-p.f, ...(useStrafe ? [-p.s] : [])]),
    pts.map((p) => p.corr),
    pts.map((p) => p.w),
  );
  return r && { beta: [0, ...r.beta], se: [0, ...r.se], resid: r.resid };
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function learnFromRuns(all: RunRecord[], c: DriveConstants, drivetrain: Drivetrain): Learned {
  const history = all.filter((r) => r.drivetrain === drivetrain);
  const pts: Point[] = [];
  history.forEach((run, age) => {
    const w = 0.5 ** (age / HALF_LIFE);
    for (const s of run.walls) if (Number.isFinite(s.corrIn)) pts.push(adjust(s, run.constants, c, w, age));
  });
  const out: Learned = {
    runs: history.length,
    skipped: all.length - history.length,
    samples: pts.length,
    bias: null,
    spreadScale: null,
    headingScale: null,
    suggest: {},
    trend: null,
  };
  if (pts.length < MIN_SAMPLES) return out;

  const strafeShare = pts.reduce((s, p) => s + p.w * p.s * p.s, 0) / Math.max(1e-9, pts.reduce((s, p) => s + p.w * (p.f * p.f + p.s * p.s), 0));
  const useStrafe = drivetrain === 'mecanum' && strafeShare > 0.05;
  const fit = fitBias(pts, useStrafe) ?? (useStrafe ? fitBias(pts, false) : null);
  if (!fit) return out;
  const strafeFit = fit.beta.length === 3;
  out.bias = {
    forward: fit.beta[1],
    forwardSE: fit.se[1],
    strafe: strafeFit ? fit.beta[2] : null,
    strafeSE: strafeFit ? fit.se[2] : null,
  };
  const kf = fit.beta[1];
  if (Math.abs(kf) >= MIN_BIAS && Math.abs(kf) > 2 * fit.se[1]) out.suggest.wheelDiameterIn = round(c.wheelDiameterIn / (1 + kf), 3);
  if (strafeFit) {
    const ks = fit.beta[2];
    if (Math.abs(ks) >= 2 * MIN_BIAS && Math.abs(ks) > 2 * fit.se[2]) out.suggest.strafeMultiplier = round(c.strafeMultiplier * (1 + ks), 3);
  }

  const sw = pts.reduce((s, p) => s + p.w, 0);
  let ratio = 0;
  pts.forEach((p, i) => {
    const v = (c.alongPct * p.fAbs) ** 2 + (c.strafePct * p.sAbs) ** 2 + c.squarePosSigmaIn ** 2;
    ratio += (p.w * fit.resid[i] ** 2) / Math.max(1e-6, v);
  });
  const scale = Math.sqrt(ratio / sw);
  out.spreadScale = scale;
  if (scale < 0.8 || scale > 1.25) {
    out.suggest.alongPct = round(Math.min(0.3, Math.max(0.002, c.alongPct * scale)), 4);
    if (drivetrain === 'mecanum') out.suggest.strafePct = round(Math.min(0.3, Math.max(0.002, c.strafePct * scale)), 4);
  }

  const hp = pts.filter((p) => Number.isFinite(p.corrDeg) && (p.hTurns > 0 || p.hSecs > 0));
  if (hp.length >= MIN_SAMPLES) {
    let hr = 0;
    let hw = 0;
    for (const p of hp) {
      const v = p.hTurns * c.turnSigmaDeg ** 2 + (c.headingDriftDegPerS * p.hSecs) ** 2 + c.squareHeadingSigmaDeg ** 2;
      hr += (p.w * p.corrDeg ** 2) / Math.max(1e-6, v);
      hw += p.w;
    }
    const hs = Math.sqrt(hr / hw);
    out.headingScale = hs;
    if (hs < 0.8 || hs > 1.25) out.suggest.turnSigmaDeg = round(Math.min(10, Math.max(0.1, c.turnSigmaDeg * hs)), 2);
  }

  const recent = pts.filter((p) => p.run < 5).map((p) => ({ ...p, w: 1 }));
  const older = pts.filter((p) => p.run >= 5 && p.run < 10).map((p) => ({ ...p, w: 1 }));
  if (recent.length >= 3 && older.length >= 3) {
    const a = fitBias(recent, false);
    const b = fitBias(older, false);
    const d = a && b ? a.beta[1] - b.beta[1] : 0;
    if (a && b && Math.abs(d) >= TREND_WARN && Math.abs(d) > 2 * Math.hypot(a.se[1], b.se[1])) out.trend = d;
  }
  return out;
}
