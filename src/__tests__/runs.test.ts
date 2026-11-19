import { describe, expect, it } from 'vitest';
import { learnFromRuns, type RunRecord } from '../logs/learn';
import { parseRunLog, poseAtTime, replayMarks, type WallSample } from '../logs/runLog';
import { MAX_RUNS, usePlanner } from '../store/plannerStore';
import { defaultConfig } from '../model/defaults';
import { rng } from '../sim/montecarlo';
import RUN from './fixtures/run-BlueLeft.csv?raw';

describe('run log from the robot', () => {
  it('reads the log OverPath wrote (Harness6 run)', () => {
    const r = parseRunLog(RUN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const log = r.log;
    expect(log.name).toBe('BlueLeft');
    expect(log.drivetrain).toBe('mecanum');
    expect(log.start).toEqual({ x: -36, y: -60, heading: 90 });
    expect(log.constants).toEqual({ wheelDiameterIn: 3.78, strafeMultiplier: 1.1 });
    expect(log.samples.length).toBeGreaterThan(1000);
    expect(log.walls).toHaveLength(2);
    expect(log.walls[0]).toMatchObject({ wall: 'left', turns: 0 });
    expect(Math.abs(log.walls[0].strafe)).toBeGreaterThan(20);
    expect(log.walls[1].wall).toBe('rear');
    expect(log.events.find((e) => e.kind === 'step')?.details[0]).toBe('driveTo (-36.00, -24.00)');
    expect(log.duration).toBeGreaterThan(10);
    expect(log.counts).toEqual({ slips: 0, blocked: 0, timeouts: 0, stopped: false, imuLost: false });
  });

  it('rejects other files', () => {
    expect(parseRunLog('x,y\n1,2')).toEqual({ ok: false, error: 'runLog.notRun' });
    expect(parseRunLog('# overpath-run 2\n')).toEqual({ ok: false, error: 'runLog.newerVersion' });
    expect(parseRunLog('# overpath-run 1\n# name a\n')).toEqual({ ok: false, error: 'runLog.empty' });
  });
});

function runs(n: number, opts: { kf?: number; ks?: number; sigma?: number; seed?: number; d?: number; perRun?: number; kfOf?: (age: number) => number }): RunRecord[] {
  const r = rng(opts.seed ?? 1);
  const c = defaultConfig().constants;
  const out: RunRecord[] = [];
  for (let age = 0; age < n; age++) {
    const walls: WallSample[] = [];
    for (let j = 0; j < (opts.perRun ?? 2); j++) {
      const f = 10 + 50 * r.next();
      const s = 25 * r.next();
      const kf = opts.kfOf ? opts.kfOf(age) : (opts.kf ?? 0);
      const sigma = opts.sigma ?? 1;
      const noise = Math.hypot(c.alongPct * f, c.strafePct * s, c.squarePosSigmaIn) * sigma * r.gauss();
      walls.push({ wall: 'left', corrIn: -kf * f - (opts.ks ?? 0) * s + noise, corrDeg: NaN, forward: f, strafe: s, forwardAbs: f, strafeAbs: s, turns: 1, seconds: 5, headingTurns: 0, headingSeconds: 0 });
    }
    out.push({ id: `r${age}`, name: 'auto', date: 0, constants: { wheelDiameterIn: opts.d ?? c.wheelDiameterIn, strafeMultiplier: c.strafeMultiplier }, drivetrain: 'mecanum', walls });
  }
  return out;
}

describe('learn from runs', () => {
  const c = defaultConfig().constants;

  it('needs a few wall touches before suggesting anything', () => {
    const l = learnFromRuns(runs(2, { kf: 0.03 }), c, 'mecanum');
    expect(l.samples).toBe(4);
    expect(l.suggest).toEqual({});
  });

  it('pure noise: no new wheel size, and the error model is about right', () => {
    const l = learnFromRuns(runs(10, { seed: 3 }), c, 'mecanum');
    expect(l.suggest.wheelDiameterIn).toBeUndefined();
    expect(l.suggest.strafeMultiplier).toBeUndefined();
    expect(l.spreadScale!).toBeGreaterThan(0.75);
    expect(l.spreadScale!).toBeLessThan(1.3);
  });

  it('a 2 % bias in 2 % random spread after only 3 runs: not enough evidence yet, so no change (but it says ±)', () => {
    const l = learnFromRuns(runs(3, { kf: 0.02, seed: 5, sigma: 2 }), c, 'mecanum');
    expect(l.suggest.wheelDiameterIn).toBeUndefined();
    expect(l.bias!.forwardSE).toBeGreaterThan(0.01);
  });

  it('worn wheels (encoders over-read 2 %): suggests a smaller wheel diameter', () => {
    const l = learnFromRuns(runs(10, { kf: 0.02, seed: 5, sigma: 0.3 }), c, 'mecanum');
    expect(l.bias!.forward).toBeCloseTo(0.02, 2);
    expect(l.suggest.wheelDiameterIn).toBeCloseTo(c.wheelDiameterIn / 1.02, 2);
  });

  it('strafe under-reads 5 %: suggests a smaller strafe multiplier', () => {
    const l = learnFromRuns(runs(12, { ks: -0.05, seed: 7, sigma: 0.3 }), c, 'mecanum');
    expect(Math.abs(l.suggest.strafeMultiplier! - c.strafeMultiplier * 0.95)).toBeLessThan(0.012);
  });

  it('more spread than the model: scales the error model up', () => {
    const l = learnFromRuns(runs(12, { sigma: 2, seed: 9 }), c, 'mecanum');
    expect(l.spreadScale!).toBeGreaterThan(1.6);
    expect(l.suggest.alongPct!).toBeGreaterThan(c.alongPct * 1.5);
    expect(l.suggest.wheelDiameterIn).toBeUndefined();
  });

  it('after applying the new diameter, the old runs no longer ask for a change', () => {
    const history = runs(10, { kf: 0.02, seed: 5, sigma: 0.3 });
    const first = learnFromRuns(history, c, 'mecanum');
    const fixed = { ...c, wheelDiameterIn: first.suggest.wheelDiameterIn! };
    const again = learnFromRuns(history, fixed, 'mecanum');
    expect(Math.abs(again.bias!.forward)).toBeLessThan(0.004);
    expect(again.suggest.wheelDiameterIn).toBeUndefined();
  });

  it('warns when the wheels wear during the season (bias rising)', () => {
    const l = learnFromRuns(runs(10, { seed: 11, perRun: 3, sigma: 0.3, kfOf: (age) => (age < 5 ? 0.03 : 0) }), c, 'mecanum');
    expect(l.trend!).toBeGreaterThan(0.01);
  });

  it('stays quiet when the bias is steady', () => {
    const l = learnFromRuns(runs(10, { seed: 13, perRun: 3, kf: 0.01 }), c, 'mecanum');
    expect(l.trend).toBeNull();
    const calm = learnFromRuns(runs(10, { seed: 14, perRun: 3, kf: 0.01, sigma: 0.3 }), c, 'mecanum');
    expect(calm.trend).toBeNull();
    expect(l.trend).toBeNull();
  });

  it('old runs count less (half-life of 10 runs)', () => {
    const history = [...runs(10, { seed: 15, sigma: 0.3, perRun: 4 }), ...runs(10, { seed: 16, kf: 0.04, sigma: 0.3, perRun: 4 })];
    const l = learnFromRuns(history, c, 'mecanum');
    const recent = learnFromRuns(history.slice(0, 10), c, 'mecanum').bias!.forward;
    const old = learnFromRuns(history.slice(10), c, 'mecanum').bias!.forward;
    expect(l.bias!.forward).toBeLessThan((recent + old) / 2);
    expect(l.bias!.forward).toBeGreaterThan(recent);
  });
});

describe('runs in the planner', () => {
  const log = () => {
    const r = parseRunLog(RUN);
    if (!r.ok) throw new Error('fixture');
    return r.log;
  };

  it('marks wall touches where the robot was, and draws its path', () => {
    const l = log();
    const d = replayMarks(l);
    expect(d.path.length).toBe(l.samples.length);
    const walls = d.marks.filter((m) => m.kind === 'wall');
    expect(walls).toHaveLength(2);
    expect(walls[0].x).toBeLessThan(-60);
    expect(poseAtTime(l, 0)!.x).toBeCloseTo(-36, 0);
  });

  it('keeps runs per field profile, newest first, once each', () => {
    const st = usePlanner.getState();
    st.clearRuns();
    st.addRun(log());
    st.addRun(log());
    let c = usePlanner.getState().config;
    expect(c.runHistory[c.activeProfile]).toHaveLength(1);
    expect(usePlanner.getState().replay?.name).toBe('BlueLeft');
    st.switchProfile(c.activeProfile === 'home' ? 'competition' : 'home');
    c = usePlanner.getState().config;
    expect(c.runHistory[c.activeProfile] ?? []).toHaveLength(0);
    st.switchProfile(c.activeProfile === 'home' ? 'competition' : 'home');
    c = usePlanner.getState().config;
    expect(c.runHistory[c.activeProfile]).toHaveLength(1);
    st.clearRuns();
    c = usePlanner.getState().config;
    expect(c.runHistory[c.activeProfile]).toHaveLength(0);
    st.setReplay(null);
  });

  it(`keeps at most ${MAX_RUNS} runs`, () => {
    const st = usePlanner.getState();
    st.clearRuns();
    for (let i = 0; i < MAX_RUNS + 5; i++) st.addRun({ ...log(), name: `r${i}` });
    const c = usePlanner.getState().config;
    expect(c.runHistory[c.activeProfile]).toHaveLength(MAX_RUNS);
    expect(c.runHistory[c.activeProfile]![0].name).toBe(`r${MAX_RUNS + 4}`);
    st.clearRuns();
    st.setReplay(null);
  });
});

describe('finalization fixes', () => {
  const c = defaultConfig().constants;
  it('learning leaves out runs from the other drivetrain', () => {
    const mec = runs(6, { seed: 21, sigma: 0.3, kf: 0.02 });
    const tank = runs(4, { seed: 22, sigma: 0.3, kf: 0.2 }).map((r) => ({ ...r, drivetrain: 'tank' as const }));
    const l = learnFromRuns([...tank, ...mec], c, 'mecanum');
    expect(l.runs).toBe(6);
    expect(l.skipped).toBe(4);
    expect(l.bias!.forward).toBeLessThan(0.05);
  });

  it('reset settings keeps the real-run history', () => {
    const st = usePlanner.getState();
    st.clearRuns();
    st.addRun({ ...(parseRunLog(RUN) as { ok: true; log: import('../logs/runLog').RunLog }).log, name: 'keep-me' });
    st.setConstants({ wheelDiameterIn: 4.2 });
    st.resetConfig();
    const cfg = usePlanner.getState().config;
    expect(cfg.constants.wheelDiameterIn).toBe(defaultConfig().constants.wheelDiameterIn);
    expect(cfg.runHistory[cfg.activeProfile]?.[0].name).toBe('keep-me');
    st.clearRuns();
    st.setReplay(null);
  });
});
