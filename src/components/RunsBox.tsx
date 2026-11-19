import { useMemo, useRef, useState } from 'react';
import { ROBOT_FILES_URL, robotFetchBlocked } from '../codegen/calibrationFile';
import { RUNNER_VERSION, compareVersions } from '../codegen/version';
import { useT, type MsgKey } from '../i18n';
import { MIN_SAMPLES, learnFromRuns, type Learned, type RunRecord } from '../logs/learn';
import { parseRunLog, type RunLog } from '../logs/runLog';
import type { DriveConstants } from '../model/types';
import { usePlanner } from '../store/plannerStore';

const SUGGEST_LABEL: Record<keyof Learned['suggest'], MsgKey> = {
  wheelDiameterIn: 'const.wheelDiameter',
  strafeMultiplier: 'const.strafeMultiplier',
  alongPct: 'errModel.alongPct',
  strafePct: 'errModel.strafePct',
  turnSigmaDeg: 'errModel.turnSigma',
};

const NO_RUNS: RunRecord[] = [];
const PCT = new Set<keyof Learned['suggest']>(['alongPct', 'strafePct']);
const fmt = (k: keyof Learned['suggest'], v: number) => (PCT.has(k) ? `${(v * 100).toFixed(2)} %` : String(v));
const WALL_KEY = { left: 'wall.left', right: 'wall.right', audience: 'wall.audience', rear: 'wall.rear' } as const;

function RunSummary({ log }: { log: RunLog }) {
  const t = useT();
  return (
    <div className="run-summary" data-testid="run-summary">
      <div className="opt-head">
        <b>{log.name}</b>
        <span className="muted">{t('runs.duration', { s: log.duration.toFixed(1) })}</span>
        <button className="small" onClick={() => usePlanner.getState().setReplay(null)} data-testid="run-hide">
          {t('runs.hide')}
        </button>
      </div>
      {log.version && compareVersions(log.version, RUNNER_VERSION) < 0 && (
        <p className="warnings warn-note">{t('runs.oldVersion', { have: log.version, need: RUNNER_VERSION })}</p>
      )}
      <ul>
        {log.walls.map((w, i) => (
          <li key={i} className="rule-info">
            <span className="rule-icon" aria-hidden>
              ▢
            </span>
            <span>
              {Number.isFinite(w.corrIn)
                ? t('runs.wall', { wall: t(WALL_KEY[w.wall]), in: (w.corrIn >= 0 ? '+' : '') + w.corrIn.toFixed(2), travel: Math.round(Math.hypot(w.forward, w.strafe)) })
                : t('runs.wallSpun', { wall: t(WALL_KEY[w.wall]) })}
            </span>
          </li>
        ))}
        {log.walls.length === 0 && <li className="rule-info">{t('runs.noWalls')}</li>}
        {log.counts.slips > 0 && <li className="rule-warn">{t('runs.slips', { n: log.counts.slips })}</li>}
        {log.counts.blocked > 0 && <li className="rule-warn">{t('runs.blocked', { n: log.counts.blocked })}</li>}
        {log.counts.timeouts > 0 && <li className="rule-warn">{t('runs.timeouts', { n: log.counts.timeouts })}</li>}
        {log.counts.imuLost && <li className="rule-error">{t('runs.imu')}</li>}
        {log.counts.stopped && <li className="rule-info">{t('runs.stopped')}</li>}
      </ul>
      <p className="hint">{t('runs.legend')}</p>
    </div>
  );
}

function LearnBox({ learned, constants }: { learned: Learned; constants: DriveConstants }) {
  const t = useT();
  const keys = Object.keys(learned.suggest) as (keyof Learned['suggest'])[];
  const b = learned.bias;
  return (
    <div className="learn" data-testid="learn">
      <h4>{t('runs.learnTitle', { runs: learned.runs, n: learned.samples })}</h4>
      {learned.skipped > 0 && <p className="hint">{t('runs.skippedDrivetrain', { n: learned.skipped })}</p>}
      {learned.samples < MIN_SAMPLES ? (
        <p className="hint">{t('runs.needMore', { n: MIN_SAMPLES - learned.samples })}</p>
      ) : (
        <ul>
          {b && (
            <li className="rule-info">
              {t(b.forward >= 0 ? 'runs.biasShort' : 'runs.biasLong', { pct: Math.abs(b.forward * 100).toFixed(1), se: (b.forwardSE * 100).toFixed(1) })}
            </li>
          )}
          {b && b.strafe !== null && b.strafeSE !== null && (
            <li className="rule-info">
              {t(b.strafe >= 0 ? 'runs.strafeShort' : 'runs.strafeLong', { pct: Math.abs(b.strafe * 100).toFixed(1), se: (b.strafeSE * 100).toFixed(1) })}
            </li>
          )}
          {learned.spreadScale !== null && <li className="rule-info">{t('runs.spread', { x: learned.spreadScale.toFixed(2) })}</li>}
        </ul>
      )}
      {learned.trend !== null && (
        <p className="warnings warn-note" data-testid="learn-trend">
          {t(learned.trend > 0 ? 'runs.trendShort' : 'runs.trendLong', { pct: Math.abs(learned.trend * 100).toFixed(1) })}
        </p>
      )}
      {keys.length > 0 && (
        <>
          <table className="diff">
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td>{t(SUGGEST_LABEL[k])}</td>
                  <td className="mono">{fmt(k, constants[k])}</td>
                  <td>→</td>
                  <td className="mono">
                    <strong>{fmt(k, learned.suggest[k]!)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="primary small" onClick={() => usePlanner.getState().setConstants(learned.suggest)} data-testid="learn-apply">
            {t('runs.apply', { n: keys.length })}
          </button>
          <p className="hint">{t('runs.applyHint')}</p>
        </>
      )}
      {learned.samples >= MIN_SAMPLES && keys.length === 0 && <p className="hint">{t('runs.allGood')}</p>}
    </div>
  );
}

export function RunsBox() {
  const t = useT();
  const config = usePlanner((s) => s.config);
  const replay = usePlanner((s) => s.replay);
  const picker = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<MsgKey | null>(null);
  const [busy, setBusy] = useState(false);
  const history = config.runHistory[config.activeProfile] ?? NO_RUNS;
  const learned = useMemo(() => learnFromRuns(history, config.constants, config.drivetrain), [history, config.constants, config.drivetrain]);

  const add = (texts: string[]) => {
    let bad: MsgKey | null = null;
    const logs: RunLog[] = [];
    for (const text of texts) {
      const r = parseRunLog(text);
      if (r.ok) logs.push(r.log);
      else bad = r.error;
    }
    for (const log of logs) usePlanner.getState().addRun(log);
    setError(logs.length === 0 ? bad : null);
  };

  const fromRobot = async () => {
    setBusy(true);
    setError(null);
    try {
      const get = async (path: string) => {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 4000);
        try {
          const res = await fetch(`${ROBOT_FILES_URL}/${path}`, { signal: ctl.signal, cache: 'no-store' });
          if (!res.ok) throw new Error(String(res.status));
          return res;
        } finally {
          clearTimeout(timer);
        }
      };
      const list = (await (await get('list.json')).json()) as { name: string; modified: number }[];
      const runs = list.filter((f) => /^run-.*\.csv$/.test(f.name)).sort((a, b) => a.modified - b.modified).slice(-10);
      if (runs.length === 0) {
        setError('runs.noneOnRobot');
        return;
      }
      add(await Promise.all(runs.map(async (f) => (await get(encodeURIComponent(f.name))).text())));
    } catch {
      setError(robotFetchBlocked() ? 'robot.httpsBlocked' : 'runs.noRobot');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rules runs" data-testid="runs">
      <h4>{t('runs.title')}</h4>
      <p className="hint">{t('runs.hint')}</p>
      <div className="file-actions">
        <input
          ref={picker}
          type="file"
          accept=".csv,text/csv"
          multiple
          hidden
          data-testid="runs-input"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])].sort((a, b) => a.lastModified - b.lastModified);
            e.target.value = '';
            Promise.all(files.map((f) => f.text())).then(add, () => setError('runLog.notRun'));
          }}
        />
        <button className="small" onClick={() => picker.current?.click()} data-testid="runs-pick">
          {t('runs.pick')}
        </button>
        <button className="small" onClick={fromRobot} disabled={busy} data-testid="runs-fetch">
          {busy ? t('calibFile.fetching') : t('runs.fetch')}
        </button>
        {history.length > 0 && (
          <button className="small danger" onClick={() => usePlanner.getState().clearRuns()} data-testid="runs-clear">
            {t('runs.clear')}
          </button>
        )}
      </div>
      {error && <p className="warnings warn-note">{t(error)}</p>}
      {replay && <RunSummary log={replay} />}
      {history.length > 0 && <LearnBox learned={learned} constants={config.constants} />}
    </section>
  );
}
