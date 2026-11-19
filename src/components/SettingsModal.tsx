import { useEffect, useRef, useState } from 'react';
import { motorLabel, usedMotorKeys, type ConfigIssue } from '../codegen/java';
import { FACES } from '../compile/anchors';
import { useT } from '../i18n';
import { uid } from '../model/defaults';
import { CUSTOM, MOTOR_PRESETS, WHEEL_PRESETS, matchMotor, matchWheel } from '../model/presets';
import type { HardwareConfig, LogoDirection, MechanismKind, MotorKey } from '../model/types';
import { usePlanner } from '../store/plannerStore';
import { makeBackup, readBackup } from '../model/backup';
import { toast, toastError } from '../store/toasts';
import { CalibrationImport } from './CalibrationImport';
import { downloadJson } from './files';
import { NumField, Seg, TextField } from './fields';
import { Rich } from './Rich';

function BackupButtons() {
  const t = useT();
  const picker = useRef<HTMLInputElement>(null);
  const restore = async (file: File) => {
    const r = readBackup(await file.text());
    if (!r.ok) return toastError(t(r.error));
    const st = usePlanner.getState();
    const prev = st.restoreProject(r.project);
    toast(t('toast.restored', { n: r.project.autos.length }), { label: t('toast.undo'), run: () => usePlanner.getState().restoreProject(prev) });
  };
  return (
    <>
      <button
        className="small"
        title={t('backup.downloadTitle')}
        onClick={() => {
          const s = usePlanner.getState();
          downloadJson(`overpath-backup-${new Date().toISOString().slice(0, 10)}.json`, makeBackup({ autos: s.autos, config: s.config, view: s.view }));
        }}
        data-testid="backup-download"
      >
        {t('backup.download')}
      </button>
      <button className="small" title={t('backup.restoreTitle')} onClick={() => picker.current?.click()} data-testid="backup-restore">
        {t('backup.restore')}
      </button>
      <input
        ref={picker}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="backup-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void restore(f);
        }}
      />
    </>
  );
}

export type SettingsTab = 'hardware' | 'mechanisms' | 'constants' | 'code' | 'field';

const TABS: SettingsTab[] = ['hardware', 'mechanisms', 'constants', 'code', 'field'];

const DIRS: LogoDirection[] = ['UP', 'DOWN', 'FORWARD', 'BACKWARD', 'LEFT', 'RIGHT'];

function useErr(issues: ConfigIssue[]) {
  const t = useT();
  return (path: string): string | undefined => {
    const issue = issues.find((i) => i.path === path);
    return issue ? t(issue.message) : undefined;
  };
}

function HardwareTab({ config, issues }: { config: HardwareConfig; issues: ConfigIssue[] }) {
  const t = useT();
  const err = useErr(issues);
  const { setConfig } = usePlanner.getState();
  const setMotor = (k: MotorKey, v: string) => setConfig({ motors: { ...config.motors, [k]: v } });
  return (
    <>
      <p className="hint">
        <Rich text={t('hw.intro')} />
      </p>
      <div className="field-row">
        <span>{t('hw.drivetrain')}</span>
        <Seg
          value={config.drivetrain}
          testId="drivetrain"
          options={[
            { value: 'mecanum', label: t('hw.mecanum') },
            { value: 'tank', label: t('hw.tank') },
          ]}
          onChange={(drivetrain) => setConfig({ drivetrain })}
        />
      </div>
      {config.drivetrain === 'tank' && (
        <div className="field-row">
          <span>{t('hw.motors')}</span>
          <Seg
            value={config.tankMotorCount}
            options={[
              { value: 2, label: t('hw.twoMotors') },
              { value: 4, label: t('hw.fourMotors') },
            ]}
            onChange={(tankMotorCount) => setConfig({ tankMotorCount })}
          />
        </div>
      )}
      <div className="grid2">
        {usedMotorKeys(config).map((k) => (
          <TextField
            key={k}
            mono
            label={t(motorLabel(config, k))}
            value={config.motors[k]}
            error={err(`motors.${k}`)}
            onChange={(v) => setMotor(k, v)}
            testId={`motor-${k}`}
          />
        ))}
        <TextField mono label={t('hw.imu')} value={config.imu} error={err('imu')} onChange={(imu) => setConfig({ imu })} testId="imu-var" />
        <TextField mono label={t('hw.runnerVar')} value={config.runnerVar} error={err('runnerVar')} onChange={(runnerVar) => setConfig({ runnerVar })} />
      </div>
      <p className="hint">
        <Rich text={t('hw.forwardNote')} />
      </p>
    </>
  );
}

function MechanismsTab({ config, issues }: { config: HardwareConfig; issues: ConfigIssue[] }) {
  const t = useT();
  const err = useErr(issues);
  const { setConfig } = usePlanner.getState();
  const mechs = config.mechanisms;
  const update = (i: number, patch: Partial<HardwareConfig['mechanisms'][number]>) =>
    setConfig({ mechanisms: mechs.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  return (
    <>
      <h4>{t('mech.title')}</h4>
      <p className="hint">{t('mech.hint')}</p>
      <div className="mech-table">
        <div className="mech-head">
          <span>{t('mech.label')}</span>
          <span>{t('mech.type')}</span>
          <span>{t('mech.javaVar')}</span>
          <span>{t('mech.configName')}</span>
          <span />
        </div>
        {mechs.map((m, i) => (
          <div className="mech-row" key={m.id}>
            <input className="text" value={m.label} onChange={(e) => update(i, { label: e.target.value })} aria-label={t('mech.label')} />
            <select value={m.kind} onChange={(e) => update(i, { kind: e.target.value as MechanismKind })} aria-label={t('mech.type')}>
              <option value="servo">{t('mech.servo')}</option>
              <option value="motor">{t('mech.motor')}</option>
              <option value="crservo">{t('mech.crservo')}</option>
            </select>
            <div>
              <input
                className={`text mono${err(`mechanisms.${i}.javaExpr`) ? ' invalid' : ''}`}
                value={m.javaExpr}
                spellCheck={false}
                onChange={(e) => update(i, { javaExpr: e.target.value })}
                aria-label={t('mech.javaVar')}
              />
              {err(`mechanisms.${i}.javaExpr`) && <small className="error">{err(`mechanisms.${i}.javaExpr`)}</small>}
            </div>
            <input
              className="text mono"
              value={m.hardwareName}
              spellCheck={false}
              onChange={(e) => update(i, { hardwareName: e.target.value })}
              aria-label={t('mech.configName')}
            />
            <button className="icon danger" title={t('common.remove')} onClick={() => setConfig({ mechanisms: mechs.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        className="small"
        onClick={() =>
          setConfig({
            mechanisms: [
              ...mechs,
              { id: uid('mech'), label: t('mech.defaultLabel', { n: mechs.length + 1 }), kind: 'servo', javaExpr: 'myServo', hardwareName: 'myServo' },
            ],
          })
        }
      >
        {t('mech.add')}
      </button>

      <h4>{t('cmd.title')}</h4>
      <p className="hint">
        <Rich text={t('cmd.hint')} />
      </p>
      <div className="cmd-list">
        {config.commands.map((c, i) => (
          <div className="cmd-row" key={i}>
            <TextField mono value={c} error={err(`commands.${i}`)} onChange={(v) => setConfig({ commands: config.commands.map((x, j) => (j === i ? v : x)) })} />
            <button className="icon danger" title={t('common.remove')} onClick={() => setConfig({ commands: config.commands.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button className="small" onClick={() => setConfig({ commands: [...config.commands, `command${config.commands.length + 1}`] })}>
        {t('cmd.add')}
      </button>
    </>
  );
}

function ConstantsTab({ config }: { config: HardwareConfig }) {
  const t = useT();
  const { setConstants, setConfig } = usePlanner.getState();
  const c = config.constants;
  const motor = matchMotor(config.motorModel, c.ticksPerRev);
  const wheel = matchWheel(config.wheelModel, c.wheelDiameterIn);
  const tpi = (c.ticksPerRev * c.gearRatio) / (Math.PI * c.wheelDiameterIn);
  const [driveRuns, setDriveRuns] = useState('');
  const [strafeRuns, setStrafeRuns] = useState('');
  const [turnRuns, setTurnRuns] = useState('');
  const drive = runStats(driveRuns);
  const strafe = runStats(strafeRuns);
  const turn = runStats(turnRuns);
  const statsLine = (st: Stats | null) =>
    st ? t('calib.stats', { mean: st.mean.toFixed(2), sd: st.sd.toFixed(2), n: st.n }) : t('calib.need');
  return (
    <>
      <div className="field-row">
        <span>{t('profile.label')}</span>
        <Seg
          value={config.activeProfile}
          testId="profile"
          options={[
            { value: 'home', label: t('profile.home') },
            { value: 'competition', label: t('profile.competition') },
          ]}
          onChange={(p) => usePlanner.getState().switchProfile(p)}
        />
      </div>
      <p className="hint">{t('profile.hint')}</p>

      <h4>{t('const.geometry')}</h4>
      <div className="grid2">
        <label className="field-row stacked">
          <span>{t('const.motor')}</span>
          <select
            value={motor?.id ?? CUSTOM}
            data-testid="motor-model"
            onChange={(e) => {
              const p = MOTOR_PRESETS.find((m) => m.id === e.target.value);
              setConfig(p ? { motorModel: p.id, constants: { ...c, ticksPerRev: p.ticksPerRev } } : { motorModel: CUSTOM });
            }}
          >
            {MOTOR_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}: {t('const.ticks', { n: p.ticksPerRev })}
              </option>
            ))}
            <option value={CUSTOM}>{t('const.customMotor')}</option>
          </select>
        </label>
        <label className="field-row stacked">
          <span>{t('const.wheel')}</span>
          <select
            value={wheel?.id ?? CUSTOM}
            data-testid="wheel-model"
            onChange={(e) => {
              const p = WHEEL_PRESETS.find((w) => w.id === e.target.value);
              setConfig(p ? { wheelModel: p.id, constants: { ...c, wheelDiameterIn: p.diameterIn } } : { wheelModel: CUSTOM });
            }}
          >
            {(['mecanum', 'traction'] as const).map((kind) => (
              <optgroup key={kind} label={kind === 'mecanum' ? t('const.mecanumGroup') : t('const.tractionGroup')}>
                {WHEEL_PRESETS.filter((w) => w.kind === kind).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}: {p.diameterIn} in
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={CUSTOM}>{t('const.customWheel')}</option>
          </select>
        </label>
        <NumField label={t('const.ticksPerRev')} value={c.ticksPerRev} min={1} step={0.1} digits={3} onCommit={(ticksPerRev) => setConstants({ ticksPerRev })} />
        <NumField
          label={t('const.gearRatio')}
          value={c.gearRatio}
          min={0.01}
          step={0.1}
          digits={4}
          title={t('const.gearRatioTitle')}
          onCommit={(gearRatio) => setConstants({ gearRatio })}
        />
        <NumField label={t('const.wheelDiameter')} suffix="in" value={c.wheelDiameterIn} min={0.5} step={0.01} digits={3} onCommit={(wheelDiameterIn) => setConstants({ wheelDiameterIn })} />
        {config.drivetrain === 'mecanum' && (
          <NumField
            label={t('const.strafeMultiplier')}
            value={c.strafeMultiplier}
            min={0.5}
            max={2}
            step={0.01}
            digits={3}
            onCommit={(strafeMultiplier) => setConstants({ strafeMultiplier })}
          />
        )}
      </div>
      {config.drivetrain === 'mecanum' && wheel?.kind === 'traction' && <p className="warnings warn-note">{t('const.tractionWarn')}</p>}
      <p className="hint mono">
        ticks/inch = {c.ticksPerRev} × {c.gearRatio} ÷ (π × {c.wheelDiameterIn}) = {tpi.toFixed(2)}
      </p>

      <CalibrationImport config={config} />

      <h4 id="calibration-helper">{t('calib.title')}</h4>
      <p className="hint">
        <Rich text={t('calib.hint')} />
      </p>
      <div className="calib-grid">
        <TextField mono label={<Rich text={t('calib.drive')} />} value={driveRuns} placeholder="48.4 47.9 48.6" onChange={setDriveRuns} testId="runs-drive" />
        <div className="calib-result">
          <small className="muted">{statsLine(drive)}</small>
          {drive && (
            <button
              className="small"
              onClick={() => {
                setConstants({ wheelDiameterIn: round3(c.wheelDiameterIn * (drive.mean / 48)), alongPct: round4(drive.sd / drive.mean) });
                setDriveRuns('');
              }}
            >
              {t('calib.applyDrive', { d: (c.wheelDiameterIn * (drive.mean / 48)).toFixed(3), pct: ((100 * drive.sd) / drive.mean).toFixed(1) })}
            </button>
          )}
        </div>
        {config.drivetrain === 'mecanum' && (
          <>
            <TextField mono label={<Rich text={t('calib.strafe')} />} value={strafeRuns} placeholder="44.1 45.0 43.6" onChange={setStrafeRuns} testId="runs-strafe" />
            <div className="calib-result">
              <small className="muted">{statsLine(strafe)}</small>
              {strafe && (
                <button
                  className="small"
                  onClick={() => {
                    setConstants({ strafeMultiplier: round3(c.strafeMultiplier * (48 / strafe.mean)), strafePct: round4(strafe.sd / strafe.mean) });
                    setStrafeRuns('');
                  }}
                >
                  {t('calib.applyStrafe', { m: (c.strafeMultiplier * (48 / strafe.mean)).toFixed(3), pct: ((100 * strafe.sd) / strafe.mean).toFixed(1) })}
                </button>
              )}
            </div>
          </>
        )}
        <TextField mono label={<Rich text={t('calib.turn')} />} value={turnRuns} placeholder="89.4 90.8 90.2" onChange={setTurnRuns} testId="runs-turn" />
        <div className="calib-result">
          <small className="muted">{statsLine(turn)}</small>
          {turn && (
            <button
              className="small"
              onClick={() => {
                setConstants({ turnSigmaDeg: Math.max(0.1, Math.round(turn.sd * 100) / 100) });
                setTurnRuns('');
              }}
            >
              {t('calib.applyTurn', { deg: Math.max(0.1, turn.sd).toFixed(2) })}
            </button>
          )}
        </div>
      </div>

      <h4>{t('tune.title')}</h4>
      <div className="grid2">
        <NumField label={t('tune.headingKp')} value={c.headingKp} min={0} step={0.005} digits={4} title={t('tune.headingKpTitle')} onCommit={(headingKp) => setConstants({ headingKp })} />
        <NumField label={t('tune.turnKp')} value={c.turnKp} min={0} step={0.005} digits={4} title={t('tune.turnKpTitle')} onCommit={(turnKp) => setConstants({ turnKp })} />
        <NumField label={t('tune.turnTol')} suffix="°" value={c.turnTolDeg} min={0.1} step={0.5} onCommit={(turnTolDeg) => setConstants({ turnTolDeg })} />
        <NumField label={t('tune.turnPower')} value={c.turnPower} min={0.05} max={1} step={0.05} title={t('tune.turnPowerTitle')} onCommit={(turnPower) => setConstants({ turnPower })} />
        <NumField label={t('tune.minPower')} value={c.minPower} min={0} max={1} step={0.01} title={t('tune.minPowerTitle')} onCommit={(minPower) => setConstants({ minPower })} />
        <NumField label={t('tune.turnMinPower')} value={c.turnMinPower} min={0} max={1} step={0.01} title={t('tune.turnMinPowerTitle')} onCommit={(turnMinPower) => setConstants({ turnMinPower })} />
        <NumField label={t('tune.ramp')} suffix="in" value={c.rampIn} min={0} step={1} title={t('tune.rampTitle')} onCommit={(rampIn) => setConstants({ rampIn })} />
      </div>

      <h4>{t('grip.title')}</h4>
      <p className="hint">{t('grip.hint')}</p>
      <div className="grid2">
        <NumField label={t('grip.rise')} suffix="/s" value={c.maxPowerRatePerS} min={0} max={20} step={0.25} title={t('grip.riseTitle')} onCommit={(maxPowerRatePerS) => setConstants({ maxPowerRatePerS })} />
        <NumField label={t('grip.drop')} suffix="/s" value={c.maxPowerDropPerS} min={0} max={20} step={0.25} title={t('grip.dropTitle')} onCommit={(maxPowerDropPerS) => setConstants({ maxPowerDropPerS })} />
        <NumField label={t('grip.brakeLinear')} suffix="s" value={c.brakeLinear} min={0} max={0.5} step={0.005} digits={4} title={t('grip.brakeTitle')} onCommit={(brakeLinear) => setConstants({ brakeLinear })} />
        <NumField label={t('grip.brakeQuadratic')} suffix="s²/in" value={c.brakeQuadratic} min={0} max={0.05} step={0.0005} digits={5} title={t('grip.brakeTitle')} onCommit={(brakeQuadratic) => setConstants({ brakeQuadratic })} />
        <NumField label={t('grip.turnRadius')} suffix="in" value={c.turnRadiusIn} min={2} max={20} step={0.1} digits={3} title={t('grip.turnRadiusTitle')} onCommit={(turnRadiusIn) => setConstants({ turnRadiusIn })} />
      </div>

      <h4>{t('errModel.title')}</h4>
      <p className="hint">{t('errModel.hint')}</p>
      <div className="grid2">
        <NumField label={t('errModel.alongPct')} suffix="%" value={c.alongPct * 100} min={0} max={30} step={0.5} digits={2} onCommit={(v) => setConstants({ alongPct: v / 100 })} />
        <NumField label={t('errModel.strafePct')} suffix="%" value={c.strafePct * 100} min={0} max={30} step={0.5} digits={2} onCommit={(v) => setConstants({ strafePct: v / 100 })} />
        <NumField label={t('errModel.turnSigma')} suffix="°" value={c.turnSigmaDeg} min={0} max={10} step={0.25} onCommit={(turnSigmaDeg) => setConstants({ turnSigmaDeg })} />
        <NumField label={t('errModel.drift')} suffix="°/s" value={c.headingDriftDegPerS} min={0} max={2} step={0.01} digits={3} onCommit={(headingDriftDegPerS) => setConstants({ headingDriftDegPerS })} />
        <NumField label={t('errModel.squarePos')} suffix="in" value={c.squarePosSigmaIn} min={0} max={3} step={0.05} onCommit={(squarePosSigmaIn) => setConstants({ squarePosSigmaIn })} />
        <NumField label={t('errModel.squareHeading')} suffix="°" value={c.squareHeadingSigmaDeg} min={0} max={5} step={0.1} onCommit={(squareHeadingSigmaDeg) => setConstants({ squareHeadingSigmaDeg })} />
      </div>

      <h4>{t('preview.title')}</h4>
      <div className="grid2">
        <NumField label={t('preview.speed')} suffix="in/s" value={c.maxSpeedInPerSec} min={1} step={1} onCommit={(maxSpeedInPerSec) => setConstants({ maxSpeedInPerSec })} />
        <NumField label={t('preview.turnRate')} suffix="°/s" value={c.turnRateDegPerSec} min={1} step={10} onCommit={(turnRateDegPerSec) => setConstants({ turnRateDegPerSec })} />
      </div>
    </>
  );
}

interface Stats {
  mean: number;
  sd: number;
  n: number;
}

export function runStats(text: string): Stats | null {
  const xs = text
    .replace(/(\d),(\d)/g, '$1.$2')
    .split(/[\s;,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
  return { mean, sd, n: xs.length };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

function CodeTab({ config, issues }: { config: HardwareConfig; issues: ConfigIssue[] }) {
  const t = useT();
  const err = useErr(issues);
  const { setConfig } = usePlanner.getState();
  const declare = config.output === 'opmode' && config.emitHardwareMapInit;
  return (
    <>
      <div className="grid2">
        <TextField mono label={t('code.runnerPackage')} value={config.runnerPackage} error={err('runnerPackage')} onChange={(runnerPackage) => setConfig({ runnerPackage })} />
        <TextField mono label={t('code.opPackage')} value={config.packageName} error={err('packageName')} onChange={(packageName) => setConfig({ packageName })} />
        <TextField label={t('code.group')} value={config.opModeGroup} onChange={(opModeGroup) => setConfig({ opModeGroup })} />
      </div>
      <p className="hint">{t('code.nameHint')}</p>
      <div className="field-row">
        <span>{t('code.output')}</span>
        <Seg
          value={config.output}
          options={[
            { value: 'snippet', label: t('export.snippet') },
            { value: 'opmode', label: t('export.opmode') },
          ]}
          onChange={(output) => setConfig({ output })}
        />
      </div>
      <label className="field-row check">
        <input type="checkbox" checked={config.emitHardwareMapInit} onChange={(e) => setConfig({ emitHardwareMapInit: e.target.checked })} />
        <span>{t('code.declareLong')}</span>
      </label>

      <h4>{t('code.configNames')}</h4>
      <div className="mech-table">
        <div className="mech-head four">
          <span>{t('code.device')}</span>
          <span>{t('code.configName')}</span>
          <span>{t('code.reversed')}</span>
        </div>
        {usedMotorKeys(config).map((k) => (
          <div className="mech-row four" key={k}>
            <span className="mono">{config.motors[k]}</span>
            <input
              className={`text mono${declare && err(`hardwareNames.${k}`) ? ' invalid' : ''}`}
              value={config.hardwareNames[k]}
              onChange={(e) => setConfig({ hardwareNames: { ...config.hardwareNames, [k]: e.target.value } })}
              aria-label={`${t(motorLabel(config, k))}: ${t('code.configName')}`}
            />
            <input
              type="checkbox"
              checked={config.reversedMotors[k]}
              onChange={(e) => setConfig({ reversedMotors: { ...config.reversedMotors, [k]: e.target.checked } })}
              aria-label={`${t(motorLabel(config, k))}: ${t('code.reversed')}`}
            />
          </div>
        ))}
        <div className="mech-row four">
          <span className="mono">{config.imu}</span>
          <input
            className="text mono"
            value={config.hardwareNames.imu}
            onChange={(e) => setConfig({ hardwareNames: { ...config.hardwareNames, imu: e.target.value } })}
            aria-label={`${t('hw.imu')}: ${t('code.configName')}`}
          />
          <span />
        </div>
      </div>
      <h4>{t('code.hub')}</h4>
      <div className="grid2">
        <label className="field-row stacked">
          <span>{t('code.logo')}</span>
          <select value={config.hubLogo} onChange={(e) => setConfig({ hubLogo: e.target.value as LogoDirection })}>
            {DIRS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field-row stacked">
          <span>{t('code.usb')}</span>
          <select className={err('hubUsb') ? 'invalid' : ''} value={config.hubUsb} onChange={(e) => setConfig({ hubUsb: e.target.value as LogoDirection })}>
            {DIRS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          {err('hubUsb') && <small className="error">{err('hubUsb')}</small>}
        </label>
      </div>
    </>
  );
}

function FieldTab() {
  const t = useT();
  const view = usePlanner((s) => s.view);
  const { setView } = usePlanner.getState();
  return (
    <>
      <h4>{t('fieldTab.imageTitle')}</h4>
      <p className="hint">
        <Rich text={t('fieldTab.imageHint')} />
      </p>
      <div className="grid2">
        <TextField
          mono
          label={t('fieldTab.imageUrl')}
          value={view.fieldImageUrl.startsWith('blob:') ? t('fieldTab.uploaded') : view.fieldImageUrl}
          onChange={(fieldImageUrl) => setView({ fieldImageUrl })}
        />
        <label className="field-row stacked">
          <span>{t('fieldTab.upload')}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setView({ fieldImageUrl: URL.createObjectURL(f) });
            }}
          />
        </label>
        <label className="field-row stacked">
          <span>{t('fieldTab.opacity', { pct: Math.round(view.fieldOpacity * 100) })}</span>
          <input type="range" min={0} max={1} step={0.05} value={view.fieldOpacity} onChange={(e) => setView({ fieldOpacity: Number(e.target.value) })} />
        </label>
        <label className="field-row stacked">
          <span>{t('fieldTab.inset', { pct: Math.round(view.fieldImageInset * 100) })}</span>
          <input type="range" min={0} max={0.2} step={0.005} value={view.fieldImageInset} onChange={(e) => setView({ fieldImageInset: Number(e.target.value) })} />
        </label>
      </div>
      <label className="field-row check">
        <input type="checkbox" checked={view.showRuleZones} onChange={(e) => setView({ showRuleZones: e.target.checked })} />
        <span>{t('fieldTab.showZones')}</span>
      </label>
      <label className="field-row check">
        <input type="checkbox" checked={view.showUncertainty} onChange={(e) => setView({ showUncertainty: e.target.checked })} />
        <span>{t('fieldTab.showUncertainty')}</span>
      </label>

      <h4>{t('fieldTab.view')}</h4>
      <div className="grid2">
        <div className="field-row stacked">
          <span>{t('fieldTab.rotate')}</span>
          <Seg
            value={view.rotation}
            options={[0, 90, 180, 270].map((r) => ({ value: r as 0 | 90 | 180 | 270, label: `${r}°` }))}
            onChange={(rotation) => setView({ rotation })}
          />
        </div>
        <div className="field-row stacked">
          <span>{t('fieldTab.mirror')}</span>
          <Seg
            value={view.mirrorMode}
            options={[
              { value: 'flipX', label: t('fieldTab.flipX') },
              { value: 'flipY', label: t('fieldTab.flipY') },
              { value: 'rotate180', label: t('fieldTab.rotate180') },
            ]}
            onChange={(mirrorMode) => setView({ mirrorMode })}
          />
        </div>
        <NumField label={t('fieldTab.posSnap')} suffix="in" value={view.snapIn} min={0} step={1} title={t('fieldTab.offTitle')} onCommit={(snapIn) => setView({ snapIn })} />
        <NumField label={t('fieldTab.headingSnap')} suffix="°" value={view.headingSnapDeg} min={0} step={5} title={t('fieldTab.offTitle')} onCommit={(headingSnapDeg) => setView({ headingSnapDeg })} />
      </div>
      <p className="hint">{t('fieldTab.mirrorHint')}</p>

      <h4>{t('fieldTab.robot')}</h4>
      <div className="grid2">
        <NumField label={t('fieldTab.length')} suffix="in" value={view.robotLengthIn} min={4} max={18} step={0.5} onCommit={(robotLengthIn) => setView({ robotLengthIn })} />
        <NumField label={t('fieldTab.width')} suffix="in" value={view.robotWidthIn} min={4} max={18} step={0.5} onCommit={(robotWidthIn) => setView({ robotWidthIn })} />
      </div>
      <p className="hint">{t('fieldTab.robotHint')}</p>
      <div className="field-row stacked">
        <span>{t('fieldTab.flatFaces')}</span>
        <div className="add-row">
          {FACES.map((f) => (
            <label key={f} className="field-row check">
              <input
                type="checkbox"
                checked={view.flatFaces.includes(f)}
                onChange={(e) => setView({ flatFaces: e.target.checked ? [...view.flatFaces, f] : view.flatFaces.filter((x) => x !== f) })}
              />
              <span>{t(`face.${f}`)}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

export function SettingsModal({ issues, onClose, initialTab = 'hardware' }: { issues: ConfigIssue[]; onClose: () => void; initialTab?: SettingsTab }) {
  const t = useT();
  const config = usePlanner((s) => s.config);
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const badge = (tb: SettingsTab) => {
    const prefixes: Record<SettingsTab, string[]> = {
      hardware: ['motors.', 'imu', 'runnerVar'],
      mechanisms: ['mechanisms.', 'commands.'],
      constants: ['constants.'],
      code: ['runnerPackage', 'packageName', 'hardwareNames.', 'hubUsb'],
      field: [],
    };
    return issues.filter((i) => prefixes[tb].some((p) => i.path.startsWith(p))).length;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (initialTab === 'constants') document.getElementById('calibration-helper')?.scrollIntoView({ block: 'start' });
  }, [initialTab]);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t('settings.title')} data-testid="settings">
        <header>
          <h2>{t('settings.title')}</h2>
          <button className="icon" onClick={onClose} aria-label={t('settings.close')}>
            ✕
          </button>
        </header>
        <nav className="tabs">
          {TABS.map((id) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {t(`settings.tab.${id}`)}
              {badge(id) > 0 && <span className="err-badge">{badge(id)}</span>}
            </button>
          ))}
        </nav>
        <div className="modal-body">
          {tab === 'hardware' && <HardwareTab config={config} issues={issues} />}
          {tab === 'mechanisms' && <MechanismsTab config={config} issues={issues} />}
          {tab === 'constants' && <ConstantsTab config={config} />}
          {tab === 'code' && <CodeTab config={config} issues={issues} />}
          {tab === 'field' && <FieldTab />}
        </div>
        <footer>
          <div className="footer-left">
            <button
              className="small danger"
              title={t('settings.resetConfirm')}
              onClick={() => {
                const prev = config;
                usePlanner.getState().resetConfig();
                toast(t('toast.settingsReset'), { label: t('toast.undo'), run: () => usePlanner.getState().setConfig(prev) });
              }}
              data-testid="settings-reset"
            >
              {t('settings.reset')}
            </button>
            <BackupButtons />
          </div>
          <span className="credit muted">{t('app.credit')}</span>
          <button className="primary" onClick={onClose}>
            {t('settings.done')}
          </button>
        </footer>
      </div>
    </div>
  );
}
