import { DEFAULT_SQUARE_POWER, WALLS, detectWall, facesFor } from '../compile/anchors';
import type { CompileResult } from '../compile/compile';
import { applyProposals, optimize, type Proposal } from '../compile/optimize';
import { isPrecision } from '../compile/precision';
import { useState } from 'react';
import { fromDisplay, toDisplay, wrapDeg } from '../geometry/transform';
import { RunsBox } from './RunsBox';
import { useT, type MsgKey } from '../i18n';
import { makeAction, uid } from '../model/defaults';
import type { Action, ActionKind, HardwareConfig, Marker, MarkerAction, Pose, RobotFace, WallSide, Waypoint } from '../model/types';
import type { RuleReport } from '../rules/biobuzz';
import type { RealityCheck as Reality } from '../sim/montecarlo';
import { precisionIn, type Uncertainty } from '../sim/uncertainty';
import { useActiveAuto, usePlanner } from '../store/plannerStore';
import { NumField } from './fields';
import { fmtPos } from './format';

const ACTION_LABEL: Record<ActionKind, MsgKey> = {
  wait: 'action.wait',
  servo: 'action.servo',
  motor: 'action.motor',
  command: 'action.command',
  turn: 'action.turn',
};

function MechSelect({
  config,
  value,
  onChange,
  kinds,
}: {
  config: HardwareConfig;
  value: string;
  onChange: (id: string) => void;
  kinds: HardwareConfig['mechanisms'][number]['kind'][];
}) {
  const t = useT();
  const options = config.mechanisms.filter((m) => kinds.includes(m.kind));
  const missing = !options.some((m) => m.id === value);
  return (
    <select className={missing ? 'invalid' : ''} value={missing ? '' : value} onChange={(e) => onChange(e.target.value)}>
      {missing && <option value="">{t('action.pick')}</option>}
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label} ({m.javaExpr})
        </option>
      ))}
    </select>
  );
}

function CommandInput({ config, value, onChange }: { config: HardwareConfig; value: string; onChange: (s: string) => void }) {
  const t = useT();
  const listId = 'command-names';
  return (
    <>
      <input
        className="text mono"
        list={listId}
        value={value}
        spellCheck={false}
        aria-label={t('action.command')}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {config.commands.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </datalist>
    </>
  );
}

function Duration({
  ms,
  background,
  zeroHint,
  onChange,
}: {
  ms: number;
  background: boolean;
  zeroHint: MsgKey;
  onChange: (ms: number, background: boolean) => void;
}) {
  const t = useT();
  const hint = t(zeroHint);
  return (
    <>
      <span className="inline-field">
        {t('action.for')}
        <NumField value={ms} min={0} step={250} digits={0} title={t('action.durationTitle', { hint })} testId="action-ms" onCommit={(n) => onChange(n, background)} />
        <em className="unit">{ms > 0 ? t('action.msThenStop') : t('action.msZero', { hint })}</em>
      </span>
      {ms > 0 && (
        <label className="inline-field check" title={t('action.keepGoingTitle')}>
          <input type="checkbox" checked={background} onChange={(e) => onChange(ms, e.target.checked)} data-testid="action-background" />
          {t('action.keepGoing')}
        </label>
      )}
    </>
  );
}

function ActionRow({
  action,
  config,
  onChange,
  onRemove,
  onMove,
}: {
  action: Action;
  config: HardwareConfig;
  onChange: (a: Action) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const t = useT();
  return (
    <li className="action-row">
      <span className={`chip chip-${action.kind}`}>{t(ACTION_LABEL[action.kind])}</span>
      <div className="action-fields">
        {action.kind === 'wait' && (
          <>
            <NumField value={action.ms} min={0} step={50} digits={0} onCommit={(ms) => onChange({ ...action, ms })} />
            <em className="unit">ms</em>
          </>
        )}
        {action.kind === 'servo' && (
          <>
            <MechSelect config={config} kinds={['servo']} value={action.mechanismId} onChange={(id) => onChange({ ...action, mechanismId: id })} />
            <NumField value={action.position} min={0} max={1} step={0.05} digits={3} title={t('action.servoTitle')} onCommit={(position) => onChange({ ...action, position })} />
          </>
        )}
        {action.kind === 'motor' && (
          <>
            <MechSelect config={config} kinds={['motor', 'crservo']} value={action.mechanismId} onChange={(id) => onChange({ ...action, mechanismId: id })} />
            <span className="inline-field">
              {t('action.power')}
              <NumField value={action.power} min={-1} max={1} step={0.1} title={t('action.powerTitle')} onCommit={(power) => onChange({ ...action, power })} />
            </span>
            <Duration
              ms={action.ms}
              background={!!action.background}
              zeroHint="action.zeroMotor"
              onChange={(ms, background) => onChange({ ...action, ms, background })}
            />
          </>
        )}
        {action.kind === 'command' && (
          <>
            <CommandInput config={config} value={action.name} onChange={(name) => onChange({ ...action, name })} />
            <Duration
              ms={action.ms ?? 0}
              background={!!action.background}
              zeroHint="action.zeroCommand"
              onChange={(ms, background) => onChange({ ...action, ms, background })}
            />
          </>
        )}
        {action.kind === 'turn' && (
          <>
            <NumField value={action.heading} step={15} title={t('action.headingTitle')} onCommit={(h) => onChange({ ...action, heading: wrapDeg(h) })} />
            <em className="unit">°</em>
            <NumField value={action.power} min={0.05} max={1} step={0.05} title={t('action.turnPowerTitle')} onCommit={(power) => onChange({ ...action, power })} />
          </>
        )}
      </div>
      <div className="row-btns">
        <button className="icon" title={t('common.moveUp')} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button className="icon" title={t('common.moveDown')} onClick={() => onMove(1)}>
          ↓
        </button>
        <button className="icon danger" title={t('common.remove')} onClick={onRemove}>
          ✕
        </button>
      </div>
    </li>
  );
}

function defaultMarkerAction(kind: MarkerAction['kind'], config: HardwareConfig): MarkerAction {
  if (kind === 'command') return { kind, name: config.commands[0] ?? 'myCommand' };
  if (kind === 'servo') return { kind, mechanismId: config.mechanisms.find((m) => m.kind === 'servo')?.id ?? '', position: 0.5 };
  return { kind, mechanismId: config.mechanisms.find((m) => m.kind !== 'servo')?.id ?? '', power: 1 };
}

function MarkerRow({
  marker,
  config,
  onChange,
  onRemove,
}: {
  marker: Marker;
  config: HardwareConfig;
  onChange: (m: Marker) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const a = marker.action;
  return (
    <li className="action-row">
      <span className="chip chip-marker">{t('marker.at', { pct: Math.round(marker.t * 100) })}</span>
      <div className="action-fields">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={marker.t}
          aria-label={t('marker.where')}
          onChange={(e) => onChange({ ...marker, t: Number(e.target.value) })}
        />
        <select
          value={a.kind}
          onChange={(e) => onChange({ ...marker, action: defaultMarkerAction(e.target.value as MarkerAction['kind'], config) })}
        >
          <option value="command">{t('marker.command')}</option>
          <option value="servo">{t('marker.servo')}</option>
          <option value="motor">{t('marker.motor')}</option>
        </select>
        {a.kind === 'command' && <CommandInput config={config} value={a.name} onChange={(name) => onChange({ ...marker, action: { ...a, name } })} />}
        {a.kind === 'servo' && (
          <>
            <MechSelect config={config} kinds={['servo']} value={a.mechanismId} onChange={(id) => onChange({ ...marker, action: { ...a, mechanismId: id } })} />
            <NumField value={a.position} min={0} max={1} step={0.05} digits={3} onCommit={(position) => onChange({ ...marker, action: { ...a, position } })} />
          </>
        )}
        {a.kind === 'motor' && (
          <>
            <MechSelect config={config} kinds={['motor', 'crservo']} value={a.mechanismId} onChange={(id) => onChange({ ...marker, action: { ...a, mechanismId: id } })} />
            <NumField value={a.power} min={-1} max={1} step={0.1} onCommit={(power) => onChange({ ...marker, action: { ...a, power } })} />
          </>
        )}
      </div>
      <div className="row-btns">
        <button className="icon danger" title={t('common.remove')} onClick={onRemove}>
          ✕
        </button>
      </div>
    </li>
  );
}

const ADD_KEY: Record<WallSide, MsgKey> = {
  left: 'anchor.addLeft',
  right: 'anchor.addRight',
  audience: 'anchor.addAudience',
  rear: 'anchor.addRear',
};

function AnchorSection({ wp, index, arrival }: { wp: Waypoint; index: number; arrival?: Pose }) {
  const t = useT();
  const config = usePlanner((s) => s.config);
  const view = usePlanner((s) => s.view);
  const { setAnchor } = usePlanner.getState();
  const robot = { lengthIn: view.robotLengthIn, widthIn: view.robotWidthIn };
  const isStart = index === 0;
  const a = wp.anchor;
  return (
    <section className="anchor-box" data-testid="anchor-section">
      <h4>{t('anchor.title')}</h4>
      <p className="hint">{isStart ? t('anchor.startWhy') : t('anchor.why')}</p>
      {a ? (
        <>
          <div className="grid2">
            <label className="field-row stacked">
              <span>{t('anchor.wall')}</span>
              <select value={a.wall} onChange={(e) => setAnchor(wp.id, { ...a, wall: e.target.value as WallSide })}>
                {WALLS.map((w) => (
                  <option key={w} value={w}>
                    {t(`wall.${w}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-row stacked">
              <span>{t('anchor.face')}</span>
              <select
                value={a.face}
                onChange={(e) => {
                  const face = e.target.value as RobotFace;
                  setAnchor(wp.id, { ...a, face, alignHeading: view.flatFaces.includes(face) });
                }}
              >
                {facesFor(config.drivetrain).map((f) => (
                  <option key={f} value={f}>
                    {t(`face.${f}`)}
                  </option>
                ))}
              </select>
            </label>
            {!isStart && (
              <NumField label={t('anchor.power')} value={a.power} min={0.1} max={0.6} step={0.05} onCommit={(power) => setAnchor(wp.id, { ...a, power })} />
            )}
          </div>
          {!isStart && (
            <label className="field-row check">
              <input type="checkbox" checked={a.alignHeading} onChange={(e) => setAnchor(wp.id, { ...a, alignHeading: e.target.checked })} />
              <span>{t('anchor.align')}</span>
            </label>
          )}
          <button className="small" onClick={() => setAnchor(wp.id, null)}>
            {t('anchor.remove')}
          </button>
        </>
      ) : (
        (() => {
          const cand = detectWall(wp.x, wp.y, arrival?.heading ?? wp.heading, robot, config.drivetrain);
          return cand ? (
            <button
              className="primary small"
              data-testid="anchor-add"
              onClick={() =>
                setAnchor(wp.id, { wall: cand.wall, face: cand.face, alignHeading: view.flatFaces.includes(cand.face), power: DEFAULT_SQUARE_POWER })
              }
            >
              {t(ADD_KEY[cand.wall])}
            </button>
          ) : (
            <p className="hint">{t('anchor.hint')}</p>
          );
        })()
      )}
    </section>
  );
}

function WaypointEditor({ wp, index, arrival }: { wp: Waypoint; index: number; arrival?: Pose }) {
  const t = useT();
  const config = usePlanner((s) => s.config);
  const view = usePlanner((s) => s.view);
  const { updateWaypoint, setActions, setMarkers } = usePlanner.getState();
  const isStart = index === 0;
  const tank = config.drivetrain === 'tank';
  const unit = view.units;

  const addAction = (kind: ActionKind) => setActions(wp.id, [...wp.actions, makeAction(kind, config)]);
  const moveAction = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= wp.actions.length) return;
    const next = [...wp.actions];
    [next[i], next[j]] = [next[j], next[i]];
    setActions(wp.id, next);
  };

  return (
    <div className="editor" data-testid="waypoint-editor">
      <h3>{isStart ? t('wp.start') : t('wp.title', { n: index })}</h3>
      <div className="grid2">
        <NumField
          label="X"
          suffix={unit}
          value={toDisplay(view, wp.x, true)}
          step={view.units === 'cm' ? 1 : 0.5}
          testId="wp-x"
          onCommit={(n) => updateWaypoint(wp.id, { x: Math.max(-72, Math.min(72, fromDisplay(view, n, true))) })}
        />
        <NumField
          label="Y"
          suffix={unit}
          value={toDisplay(view, wp.y, true)}
          step={view.units === 'cm' ? 1 : 0.5}
          testId="wp-y"
          onCommit={(n) => updateWaypoint(wp.id, { y: Math.max(-72, Math.min(72, fromDisplay(view, n, true))) })}
        />
        {(!tank || isStart) && !wp.anchor && (
          <NumField
            label={isStart ? t('wp.heading') : t('wp.holdHeading')}
            suffix="°"
            value={wp.heading}
            step={15}
            testId="wp-heading"
            onCommit={(h) => updateWaypoint(wp.id, { heading: wrapDeg(h) })}
          />
        )}
        {!isStart && (
          <NumField label={t('wp.power')} value={wp.power} min={0.05} max={1} step={0.05} onCommit={(power) => updateWaypoint(wp.id, { power })} />
        )}
        {!isStart && (
          <NumField
            label={t('wp.timeout')}
            suffix="ms"
            value={wp.timeoutMs}
            min={0}
            step={500}
            digits={0}
            title={t('wp.timeoutTitle')}
            onCommit={(timeoutMs) => updateWaypoint(wp.id, { timeoutMs })}
          />
        )}
        {tank && !isStart && (
          <label className="field-row check">
            <input type="checkbox" checked={wp.reversed} onChange={(e) => updateWaypoint(wp.id, { reversed: e.target.checked })} />
            <span>{t('wp.reversed')}</span>
          </label>
        )}
      </div>
      {tank && !isStart && <p className="hint">{t('wp.tankHint')}</p>}
      {!isStart && (
        <label className="field-row check">
          <input
            type="checkbox"
            checked={isPrecision(wp, index)}
            onChange={(e) => updateWaypoint(wp.id, { precision: e.target.checked })}
            data-testid="wp-precision"
          />
          <span>
            {t('wp.precision')} {wp.precision === undefined && isPrecision(wp, index) && <em className="unit">{t('wp.precisionAuto')}</em>}
          </span>
        </label>
      )}

      <AnchorSection wp={wp} index={index} arrival={arrival} />

      <h4>{isStart ? t('wp.beforeDriving') : t('wp.afterArriving')}</h4>
      {wp.actions.length === 0 && <p className="hint">{isStart ? t('wp.noActionsStart') : t('wp.noActions')}</p>}
      <ul className="action-list">
        {wp.actions.map((a, i) => (
          <ActionRow
            key={a.id}
            action={a}
            config={config}
            onChange={(na) => setActions(wp.id, wp.actions.map((x) => (x.id === a.id ? na : x)))}
            onRemove={() => setActions(wp.id, wp.actions.filter((x) => x.id !== a.id))}
            onMove={(dir) => moveAction(i, dir)}
          />
        ))}
      </ul>
      <div className="add-row">
        {(Object.keys(ACTION_LABEL) as ActionKind[]).map((k) => (
          <button key={k} className="small" onClick={() => addAction(k)} data-testid={`add-${k}`}>
            {t('action.add', { label: t(ACTION_LABEL[k]) })}
          </button>
        ))}
      </div>

      {!isStart && (
        <>
          <h4>{t('marker.title')}</h4>
          {wp.markers.length === 0 && <p className="hint">{t('marker.hint')}</p>}
          <ul className="action-list">
            {wp.markers.map((m) => (
              <MarkerRow
                key={m.id}
                marker={m}
                config={config}
                onChange={(nm) => setMarkers(wp.id, wp.markers.map((x) => (x.id === m.id ? nm : x)))}
                onRemove={() => setMarkers(wp.id, wp.markers.filter((x) => x.id !== m.id))}
              />
            ))}
          </ul>
          <div className="add-row">
            <button
              className="small"
              onClick={() => setMarkers(wp.id, [...wp.markers, { id: uid('mk'), t: 0.5, action: defaultMarkerAction('command', config) }])}
            >
              {t('marker.add')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const ICON: Record<RuleReport['issues'][number]['level'], string> = { error: '✕', warn: '!', ok: '✓', info: '•' };

function RulesCheck({ report }: { report: RuleReport }) {
  const t = useT();
  if (!report.issues.length) return null;
  const title = report.alliance === 'red' ? 'rules.titleRed' : report.alliance === 'blue' ? 'rules.titleBlue' : 'rules.title';
  return (
    <section className="rules" data-testid="rules-check">
      <h4>{t(title)}</h4>
      <ul>
        {report.issues.map((i, n) => (
          <li key={n} className={`rule-${i.level}`}>
            <span className="rule-icon" aria-hidden>
              {ICON[i.level]}
            </span>
            <span>
              {i.rule && <b>{i.rule} </b>}
              {t(i.message)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const OPT_LABEL: Record<Proposal['kind'], MsgKey> = { anchor: 'opt.anchor', corner: 'opt.corner', faceTravel: 'opt.faceTravel' };

function OptimizeBox() {
  const t = useT();
  const auto = useActiveAuto();
  const config = usePlanner((s) => s.config);
  const view = usePlanner((s) => s.view);
  const [result, setResult] = useState<{ proposals: Proposal[]; picked: Set<string>; noTargets: boolean } | null>(null);
  const run = () => {
    const robot = { lengthIn: view.robotLengthIn, widthIn: view.robotWidthIn };
    const noTargets = !auto.waypoints.some((w, i) => isPrecision(w, i));
    const proposals = noTargets ? [] : optimize(auto, config, robot, view.flatFaces);
    setResult({ proposals, picked: new Set(proposals.map((p) => p.id)), noTargets });
  };
  const apply = () => {
    if (!result) return;
    const chosen = result.proposals.filter((p) => result.picked.has(p.id));
    usePlanner.getState().replaceWaypoints(applyProposals(auto, chosen).waypoints);
    setResult(null);
  };
  return (
    <section className="rules optimize" data-testid="optimize">
      <div className="opt-head">
        <button className="primary small" onClick={run} data-testid="optimize-run">
          {t('opt.button')}
        </button>
        {result && (
          <button className="small" onClick={() => setResult(null)}>
            {t('opt.close')}
          </button>
        )}
      </div>
      {!result && <p className="hint">{t('opt.hint')}</p>}
      {result?.noTargets && <p className="hint">{t('opt.noTargets')}</p>}
      {result && !result.noTargets && result.proposals.length === 0 && <p className="hint">{t('opt.none')}</p>}
      {result && result.proposals.length > 0 && (
        <>
          <ul>
            {result.proposals.map((p) => (
              <li key={p.id} className="rule-ok">
                <label className="field-row check" aria-label={t(OPT_LABEL[p.kind], { wp: p.targetLabel })}>
                  <input
                    type="checkbox"
                    checked={result.picked.has(p.id)}
                    onChange={(e) => {
                      const picked = new Set(result.picked);
                      if (e.target.checked) picked.add(p.id);
                      else picked.delete(p.id);
                      setResult({ ...result, picked });
                    }}
                  />
                  <span>
                    <b>{t(OPT_LABEL[p.kind], { wp: p.targetLabel })}</b>
                    <br />
                    <span className="muted">
                      {t('opt.gain', { before: p.before.toFixed(1), after: p.after.toFixed(1), s: p.addedS.toFixed(1) })}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button className="primary small" onClick={apply} disabled={result.picked.size === 0} data-testid="optimize-apply">
            {t('opt.apply')}
          </button>
        </>
      )}
    </section>
  );
}

function RealityBox({ reality }: { reality: Reality }) {
  const t = useT();
  const pct = (n: number) => Math.round(n);
  return (
    <section className="rules" data-testid="reality-check">
      <h4>{t('reality.title', { runs: reality.runs })}</h4>
      <ul>
        {reality.parkPct !== null && (
          <li className={reality.parkPct >= 90 ? 'rule-ok' : 'rule-warn'}>
            <span className="rule-icon" aria-hidden>
              {reality.parkPct >= 90 ? '✓' : '!'}
            </span>
            <span>{t('reality.park', { pct: pct(reality.parkPct) })}</span>
          </li>
        )}
        <li className={reality.hivePct < 1 ? 'rule-ok' : reality.hivePct < 10 ? 'rule-warn' : 'rule-error'}>
          <span className="rule-icon" aria-hidden>
            {reality.hivePct < 1 ? '✓' : reality.hivePct < 10 ? '!' : '✕'}
          </span>
          <span>{t('reality.hive', { pct: reality.hivePct < 1 && reality.hivePct > 0 ? '<1' : pct(reality.hivePct) })}</span>
        </li>
        <li className="rule-info">
          <span className="rule-icon" aria-hidden>
            •
          </span>
          <span>{t('reality.spread', { in: reality.endSpread95.toFixed(1) })}</span>
        </li>
      </ul>
      <p className="hint">{t('reality.note')}</p>
    </section>
  );
}

export function WaypointPanel({
  compiled,
  rules,
  uncertainty,
  reality,
}: {
  compiled: CompileResult;
  rules: RuleReport;
  uncertainty: Uncertainty;
  reality: Reality;
}) {
  const t = useT();
  const auto = useActiveAuto();
  const view = usePlanner((s) => s.view);
  const config = usePlanner((s) => s.config);
  const selectedId = usePlanner((s) => s.selectedId);
  const { select, deleteWaypoint, moveWaypoint, insertAfter } = usePlanner.getState();
  const selIndex = auto.waypoints.findIndex((w) => w.id === selectedId);

  return (
    <div className="panel-body">
      <p className="hint">{config.drivetrain === 'mecanum' ? t('panel.hintMecanum') : t('panel.hintTank')}</p>
      <ol className="wp-list" data-testid="waypoint-list">
        {auto.waypoints.map((w, i) => {
          const arrival = compiled.arrivals[i];
          return (
            <li key={w.id} className={w.id === selectedId ? 'selected' : ''}>
              <button className="wp-select" onClick={() => select(w.id)} aria-pressed={w.id === selectedId}>
                <span className={`badge${i === 0 ? ' start' : ''}`}>{i === 0 ? 'S' : i}</span>
                <span className="coords mono">
                  {isPrecision(w, i) && (
                    <span title={t('panel.precisionPoint')} aria-label={t('panel.precisionPoint')}>
                      🎯{' '}
                    </span>
                  )}
                  ({fmtPos(view, w.x)}, {fmtPos(view, w.y)}) {arrival ? `${Math.round(arrival.heading)}°` : ''}
                </span>
                <span className="meta">
                  {i > 0 && uncertainty.atArrival[i] && (
                    <b className="precision" title={t('panel.precisionTitle')}>
                      ±{precisionIn(uncertainty.atArrival[i]).toFixed(1)}{' '}
                    </b>
                  )}
                  {i > 0 && `p${w.power.toFixed(2)}`}
                  {w.actions.length > 0 && ` · ${t('panel.metaActions', { n: w.actions.length })}`}
                  {w.markers.length > 0 && ` · ${t('panel.metaMarkers', { n: w.markers.length })}`}
                  {w.anchor && ` · ${t('panel.metaAnchor')}`}
                </span>
              </button>
              <span className="row-btns">
                <button className="icon" title={t('common.moveUp')} onClick={() => moveWaypoint(w.id, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button className="icon" title={t('common.moveDown')} onClick={() => moveWaypoint(w.id, 1)} disabled={i === auto.waypoints.length - 1}>
                  ↓
                </button>
                <button className="icon" title={t('panel.insertTitle')} onClick={() => insertAfter(w.id)}>
                  +
                </button>
                <button className="icon danger" title={t('common.delete')} onClick={() => deleteWaypoint(w.id)}>
                  ✕
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <RulesCheck report={rules} />
      <RealityBox reality={reality} />
      <OptimizeBox />
      <RunsBox />
      {compiled.warnings.length > 0 && (
        <ul className="warnings">
          {compiled.warnings.map((w, i) => (
            <li key={i}>{t(w)}</li>
          ))}
        </ul>
      )}
      {selIndex >= 0 ? (
        <WaypointEditor key={auto.waypoints[selIndex].id} wp={auto.waypoints[selIndex]} index={selIndex} arrival={compiled.arrivals[selIndex]} />
      ) : (
        <p className="hint">{t('panel.selectHint')}</p>
      )}
    </div>
  );
}
