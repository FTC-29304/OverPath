import { wrapDeg } from '../geometry/transform';
import { useT, type T } from '../i18n';
import type { MsgKey } from '../i18n/translate';
import type { Auto, RobotFace, SimResult, SimStep, Step, StepKind } from '../model/types';
import type { RuleReport } from '../rules/biobuzz';
import { AUTO_MS } from '../rules/biobuzz';
import { driveDisplacement } from '../sim/drive';
import { suggestWallMs, wallReachMs } from '../sim/simulate';
import { usePlanner } from '../store/plannerStore';
import { blankStep } from '../model/defaults';
import { CheckField, NumField } from './fields';
import { fmtLen, fmtSec, fromLen } from './format';

const KINDS: StepKind[] = ['drive', 'turn', 'wall', 'wait', 'servo', 'motor', 'command'];
const FACES: RobotFace[] = ['front', 'back', 'left', 'right'];
const DIRS: { deg: number; key: MsgKey }[] = [
  { deg: 0, key: 'dir.forward' },
  { deg: 180, key: 'dir.back' },
  { deg: 90, key: 'dir.left' },
  { deg: -90, key: 'dir.right' },
  { deg: 45, key: 'dir.fl' },
  { deg: -45, key: 'dir.fr' },
  { deg: 135, key: 'dir.bl' },
  { deg: -135, key: 'dir.br' },
];

export function guessStopCommand(name: string, commands: string[]): string {
  const m = /^(.*\s)(in|out|on)$/i.exec(name.trim());
  if (!m) return '';
  const off = `${m[1]}off`;
  return commands.find((c) => c.toLowerCase() === off.toLowerCase()) ?? '';
}

function BackgroundFields({ step, st, totalMs, t }: { step: Extract<Step, { kind: 'motor' | 'command' }>; st: SimStep | undefined; totalMs: number; t: T }) {
  const hw = usePlanner((s) => s.hw);
  const update = (patch: Partial<Step>) => usePlanner.getState().updateStep(step.id, patch);
  const secs = fmtSec(step.ms);
  const pastEnd = step.background && st != null && step.ms > 0 && st.startMs + step.ms > totalMs;
  return (
    <>
      <CheckField
        label={t('f.background')}
        checked={step.background}
        onChange={(v) =>
          update(
            step.kind === 'command' && v && !step.stopCommand
              ? { background: v, stopCommand: guessStopCommand(step.name, hw.commands), ms: step.ms || 1000 }
              : step.kind === 'motor' && v && !step.ms
                ? { background: v, ms: 1000 }
                : { background: v },
          )
        }
      />
      {step.background && step.kind === 'command' && (
        <div className="row">
          <label className="field-label">
            <span>{t('f.then')}</span>
            <select value={step.stopCommand} data-testid="f-then" onChange={(e) => update({ stopCommand: e.target.value })}>
              <option value="">{t('f.thenNone')}</option>
              {[...new Set([...hw.commands, ...(step.stopCommand ? [step.stopCommand] : [])])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {step.background && (
        <p className="info">
          {step.kind === 'motor'
            ? step.ms > 0
              ? t('info.bgMotor', { s: secs })
              : t('info.bgMotorOn')
            : step.ms > 0 && step.stopCommand
              ? t('info.bgCommand', { s: secs, cmd: step.stopCommand })
              : t('info.bgCommandNoThen')}
        </p>
      )}
      {pastEnd && <p className="info warn">{t('info.bgPastEnd')}</p>}
    </>
  );
}

export function dirLabel(t: T, dirDeg: number): string {
  const d = DIRS.find((x) => x.deg === wrapDeg(dirDeg));
  return d ? t(d.key) : `${wrapDeg(dirDeg)}°`;
}

function StartPose({ auto }: { auto: Auto }) {
  const t = useT();
  const view = usePlanner((s) => s.view);
  const setStart = usePlanner((s) => s.setStart);
  return (
    <section className="panel-section">
      <h3>{t('start.title')}</h3>
      <div className="row">
        <NumField label={`${t('start.x')} (${view.units})`} value={Number(fmtLen(view, auto.start.x))} digits={1} onChange={(v) => setStart({ x: fromLen(view, v) })} testId="start-x" />
        <NumField label={`${t('start.y')} (${view.units})`} value={Number(fmtLen(view, auto.start.y))} digits={1} onChange={(v) => setStart({ y: fromLen(view, v) })} testId="start-y" />
        <NumField label={`${t('start.heading')} (°)`} value={auto.start.heading} digits={1} onChange={(v) => setStart({ heading: wrapDeg(v) })} testId="start-heading" />
      </div>
    </section>
  );
}

function StepFields({ step, st, totalMs, t }: { step: Step; st: SimStep | undefined; totalMs: number; t: T }) {
  const view = usePlanner((s) => s.view);
  const cal = usePlanner((s) => s.calibration);
  const hw = usePlanner((s) => s.hw);
  const update = (patch: Partial<Step>) => usePlanner.getState().updateStep(step.id, patch);
  const power = (min = 0) => (
    <NumField label={t('f.power')} value={'power' in step ? step.power : 0} min={min} max={1} digits={2} onChange={(v) => update({ power: v })} testId="f-power" />
  );
  const ms = () => <NumField label={t('f.ms')} value={'ms' in step ? step.ms : 0} min={0} max={30000} digits={0} onChange={(v) => update({ ms: Math.round(v) })} testId="f-ms" />;

  switch (step.kind) {
    case 'drive': {
      const preset = DIRS.some((d) => d.deg === wrapDeg(step.dirDeg));
      const d = driveDisplacement(cal, step.dirDeg, step.power, step.ms);
      return (
        <>
          <div className="row">
            <label className="field-label">
              <span>{t('f.direction')}</span>
              <select
                value={preset ? String(wrapDeg(step.dirDeg)) : 'custom'}
                data-testid="f-dir"
                onChange={(e) => e.target.value !== 'custom' && update({ dirDeg: Number(e.target.value) })}
              >
                {DIRS.map((x) => (
                  <option key={x.deg} value={String(x.deg)}>
                    {t(x.key)}
                  </option>
                ))}
                <option value="custom">{preset ? t('f.custom') : `${wrapDeg(step.dirDeg)}°`}</option>
              </select>
            </label>
            {!preset && <NumField label="°" value={step.dirDeg} digits={1} min={-180} max={180} onChange={(v) => update({ dirDeg: wrapDeg(v) })} testId="f-dirdeg" />}
            {power()}
            {ms()}
          </div>
          <p className="info">
            {t('info.drive', { d: fmtLen(view, Math.hypot(d.f, d.l)), unit: view.units })}
            {st && view.showError && <span className="muted"> · {t('info.err', { e: fmtLen(view, 2 * Math.hypot(st.sx, st.sy)), unit: view.units })}</span>}
          </p>
          {step.power > 0.8 && <p className="info warn">{t('info.highPower')}</p>}
        </>
      );
    }
    case 'turn': {
      const delta = st ? wrapDeg(step.heading - st.from.heading) : 0;
      return (
        <>
          <div className="row">
            <NumField label={`${t('f.heading')} (°)`} value={step.heading} digits={1} min={-360} max={360} onChange={(v) => update({ heading: wrapDeg(v) })} testId="f-heading" />
            {power()}
          </div>
          <p className="info">{t('info.turn', { delta: delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0) })}</p>
        </>
      );
    }
    case 'wall': {
      const flat = view.flatFaces.includes(step.face);
      const reach = st ? wallReachMs(cal, view, st.from, step.face, step.power) : null;
      const suggest = st ? suggestWallMs(cal, view, st.from, step.face, step.power) : null;
      return (
        <>
          <div className="row">
            <label className="field-label">
              <span>{t('f.face')}</span>
              <select value={step.face} data-testid="f-face" onChange={(e) => update({ face: e.target.value as RobotFace })}>
                {FACES.map((f) => (
                  <option key={f} value={f}>
                    {t(`face.${f}` as MsgKey)}
                  </option>
                ))}
              </select>
            </label>
            {power()}
            {ms()}
            <button className="small" disabled={suggest == null} title={t('f.autoTimeTitle')} data-testid="f-autotime" onClick={() => suggest != null && update({ ms: suggest })}>
              {t('f.autoTime')}
            </button>
          </div>
          <CheckField label={t('f.align')} checked={step.alignHeading} onChange={(v) => update({ alignHeading: v })} />
          {st?.wall && !st.shortOfWall && <p className="info">{t('info.wall', { wall: t(`wall.${st.wall}` as MsgKey) })}</p>}
          {st?.shortOfWall && reach != null && <p className="info bad">{t('info.short', { ms: Math.ceil((reach + 100) / 10) * 10 })}</p>}
          {step.alignHeading && !flat && <p className="info warn">{t('info.notFlat')}</p>}
        </>
      );
    }
    case 'wait':
      return <div className="row">{ms()}</div>;
    case 'servo':
    case 'motor': {
      const options = hw.mechanisms.filter((m) => (step.kind === 'servo' ? m.kind === 'servo' : m.kind !== 'servo'));
      return (
        <>
        <div className="row">
          <label className="field-label">
            <span>{t('f.mechanism')}</span>
            <select value={step.mechanismId} data-testid="f-mech" onChange={(e) => update({ mechanismId: e.target.value })}>
              <option value="">{t('f.none')}</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label || m.javaName}
                </option>
              ))}
            </select>
          </label>
          {step.kind === 'servo' ? (
            <NumField label={t('f.position')} value={step.position} min={0} max={1} digits={3} onChange={(v) => update({ position: v })} />
          ) : (
            <>
              <NumField label={t('f.power')} value={step.power} min={-1} max={1} digits={2} onChange={(v) => update({ power: v })} />
              {ms()}
            </>
          )}
        </div>
        {step.kind === 'motor' && <BackgroundFields step={step} st={st} totalMs={totalMs} t={t} />}
        </>
      );
    }
    case 'command':
      return (
        <>
        <div className="row">
          <label className="field-label">
            <span>{t('f.command')}</span>
            <select value={step.name} data-testid="f-command" onChange={(e) => update({ name: e.target.value })}>
              <option value="">{t('f.none')}</option>
              {[...new Set([...hw.commands, ...(step.name ? [step.name] : [])])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {ms()}
        </div>
        <BackgroundFields step={step} st={st} totalMs={totalMs} t={t} />
        </>
      );
  }
}

function summary(t: T, step: Step): string {
  switch (step.kind) {
    case 'drive':
      return dirLabel(t, step.dirDeg);
    case 'turn':
      return `${wrapDeg(step.heading)}°`;
    case 'wall':
      return t(`face.${step.face}` as MsgKey);
    case 'command':
      return step.background && step.stopCommand ? `${step.name} → ${step.stopCommand}` : step.name;
    default:
      return '';
  }
}

export function StepList({ auto, sim, rules }: { auto: Auto; sim: SimResult; rules: RuleReport }) {
  const t = useT();
  const selectedId = usePlanner((s) => s.selectedStepId);
  const view = usePlanner((s) => s.view);
  const cal = usePlanner((s) => s.calibration);
  const { select, insertStep, moveStep, removeStep, duplicateStep } = usePlanner.getState();
  const addStep = (kind: StepKind) => {
    const sel = auto.steps.findIndex((st) => st.id === selectedId);
    const at = sel >= 0 ? sel + 1 : auto.steps.length;
    const pose = at > 0 ? (sim.steps[at - 1]?.to ?? sim.end) : sim.start;
    const step = blankStep(kind, view.defaultPower, kind === 'turn' ? wrapDeg(pose.heading + 90) : 0);
    if (step.kind === 'wall') step.ms = suggestWallMs(cal, view, pose, step.face, step.power) ?? step.ms;
    insertStep(step, at);
  };
  const over = sim.totalMs > AUTO_MS;
  const pct = Math.min(100, (sim.totalMs / AUTO_MS) * 100);

  return (
    <div className="steps-panel">
      <StartPose auto={auto} />
      <section className="panel-section">
        <div className="steps-head">
          <h3>{t('steps.title')}</h3>
          <span className={`total ${over ? 'bad' : ''}`} data-testid="total-time">
            {t('steps.total', { s: fmtSec(sim.totalMs) })}
          </span>
        </div>
        <div className={`time-bar ${over ? 'over' : ''}`} title={over ? t('steps.over') : undefined}>
          <div style={{ width: `${pct}%` }} />
        </div>
        {!auto.steps.length && <p className="hint">{t('steps.empty')}</p>}
        <ol className="step-list" data-testid="step-list">
          {auto.steps.map((step, i) => {
            const st = sim.steps[i];
            const sel = step.id === selectedId;
            return (
              <li
                key={step.id}
                className={`step ${sel ? 'selected' : ''} ${rules.badSteps.has(i) ? 'is-bad' : ''} kind-${step.kind}`}
                data-testid="step"
              >
                <div className="step-head">
                  <button className="step-select" aria-expanded={sel} onClick={() => select(sel ? null : step.id)} data-testid="step-select">
                    <span className="step-num">{i + 1}</span>
                    <span className="step-kind">{t(`kind.${step.kind}` as MsgKey)}</span>
                    <span className="step-sum">{summary(t, step)}</span>
                    <span className="step-time mono">
                      {st?.bgMs ? <span title={t('steps.bg')}>∥ {t('info.time', { s: fmtSec(st.bgMs) })}</span> : st ? t('info.time', { s: fmtSec(st.ms) }) : ''}
                    </span>
                  </button>
                  <span className="step-btns">
                    <button className="icon" title={t('steps.up')} aria-label={t('steps.up')} disabled={i === 0} onClick={(e) => (e.stopPropagation(), moveStep(step.id, -1))}>
                      ↑
                    </button>
                    <button
                      className="icon"
                      title={t('steps.down')}
                      aria-label={t('steps.down')}
                      disabled={i === auto.steps.length - 1}
                      onClick={(e) => (e.stopPropagation(), moveStep(step.id, 1))}
                    >
                      ↓
                    </button>
                    <button className="icon" title={t('steps.duplicate')} aria-label={t('steps.duplicate')} onClick={(e) => (e.stopPropagation(), duplicateStep(step.id))}>
                      ⧉
                    </button>
                    <button className="icon danger" title={t('steps.remove')} aria-label={t('steps.remove')} data-testid="step-remove" onClick={(e) => (e.stopPropagation(), removeStep(step.id))}>
                      ✕
                    </button>
                  </span>
                </div>
                {sel && (
                  <div className="step-body">
                    <StepFields step={step} st={st} totalMs={sim.totalMs} t={t} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="add-bar">
          <span className="muted">{t('steps.add')}:</span>
          {KINDS.map((k) => (
            <button key={k} className="small pill" data-testid={`add-${k}`} onClick={() => addStep(k)}>
              {t(`kind.${k}` as MsgKey)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
