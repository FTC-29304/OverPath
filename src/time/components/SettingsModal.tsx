import { useEffect, useRef, useState } from 'react';
import { useT, type T } from '../i18n';
import type { MsgKey } from '../i18n/translate';
import { generateCalibration } from '../codegen/java';
import { newId } from '../model/defaults';
import type { Calibration, HardwareConfig, LogoDirection, MechanismKind, MotorKey, RobotFace } from '../model/types';
import { fitRuns } from '../sim/drive';
import { backupData, usePlanner } from '../store/plannerStore';
import { CheckField, NumField, TextField } from './fields';
import { downloadText } from './files';

export type SettingsTab = 'robot' | 'calib' | 'hw' | 'mech' | 'backup';
const TABS: SettingsTab[] = ['robot', 'calib', 'hw', 'mech', 'backup'];
const FACES: RobotFace[] = ['front', 'back', 'left', 'right'];
const LOGO: LogoDirection[] = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'FORWARD', 'BACKWARD'];
const MOTORS: MotorKey[] = ['frontLeft', 'frontRight', 'backLeft', 'backRight'];

function RobotTab({ t }: { t: T }) {
  const view = usePlanner((s) => s.view);
  const setView = usePlanner((s) => s.setView);
  return (
    <div className="settings-grid">
      <NumField label={t('settings.length')} value={view.robotLengthIn} min={4} max={40} digits={2} onChange={(v) => setView({ robotLengthIn: v })} />
      <NumField label={t('settings.width')} value={view.robotWidthIn} min={4} max={40} digits={2} onChange={(v) => setView({ robotWidthIn: v })} />
      <NumField label={t('settings.defaultPower')} value={view.defaultPower} min={0.1} max={1} digits={2} onChange={(v) => setView({ defaultPower: v })} />
      <NumField label={t('settings.snap')} value={view.snapIn} min={0} max={12} digits={2} onChange={(v) => setView({ snapIn: v })} />
      <label className="field-label">
        <span>{t('settings.mirror')}</span>
        <select value={view.mirrorMode} onChange={(e) => setView({ mirrorMode: e.target.value as 'rotate180' | 'flipX' })}>
          <option value="rotate180">{t('settings.mirror.rotate180')}</option>
          <option value="flipX">{t('settings.mirror.flipX')}</option>
        </select>
      </label>
      <label className="field-label">
        <span>{t('settings.units')}</span>
        <select value={view.units} onChange={(e) => setView({ units: e.target.value as 'in' | 'cm' })}>
          <option value="in">in</option>
          <option value="cm">cm</option>
        </select>
      </label>
      <NumField label={t('settings.opacity')} value={view.fieldOpacity} min={0} max={1} digits={2} onChange={(v) => setView({ fieldOpacity: v })} />
      <fieldset className="span2">
        <legend>{t('settings.flat')}</legend>
        {FACES.map((f) => (
          <CheckField
            key={f}
            label={t(`face.${f}` as MsgKey)}
            checked={view.flatFaces.includes(f)}
            onChange={(on) => setView({ flatFaces: on ? FACES.filter((x) => x === f || view.flatFaces.includes(x)) : view.flatFaces.filter((x) => x !== f) })}
          />
        ))}
      </fieldset>
      <div className="span2">
        <CheckField label={t('settings.zones')} checked={view.showRuleZones} onChange={(v) => setView({ showRuleZones: v })} />
        <CheckField label={t('settings.error')} checked={view.showError} onChange={(v) => setView({ showError: v })} />
      </div>
    </div>
  );
}

const RAW: { key: Exclude<keyof Calibration, 'measured'>; digits: number; min: number; max: number }[] = [
  { key: 'calPower', digits: 2, min: 0.1, max: 1 },
  { key: 'forwardInPerSec', digits: 2, min: 1, max: 300 },
  { key: 'forwardExtraMs', digits: 0, min: -1000, max: 1000 },
  { key: 'strafeInPerSec', digits: 2, min: 1, max: 300 },
  { key: 'strafeExtraMs', digits: 0, min: -1000, max: 1000 },
  { key: 'minPower', digits: 3, min: 0, max: 0.3 },
  { key: 'turnDegPerSec', digits: 1, min: 1, max: 2000 },
  { key: 'refVoltage', digits: 2, min: 9, max: 15 },
  { key: 'rampMs', digits: 0, min: 0, max: 1000 },
  { key: 'squareMs', digits: 0, min: 0, max: 3000 },
  { key: 'backOffMs', digits: 0, min: 0, max: 2000 },
  { key: 'backOffPower', digits: 2, min: 0, max: 1 },
  { key: 'drivePct', digits: 3, min: 0, max: 1 },
  { key: 'strafePct', digits: 3, min: 0, max: 1 },
  { key: 'turnSigmaDeg', digits: 2, min: 0, max: 45 },
  { key: 'wallSigmaIn', digits: 2, min: 0, max: 12 },
];

function CalibTab({ t }: { t: T }) {
  const cal = usePlanner((s) => s.calibration);
  const hw = usePlanner((s) => s.hw);
  const setCalibration = usePlanner((s) => s.setCalibration);
  const [m, setM] = useState({ volts: cal.refVoltage, f1: 0, f2: 0, s1: 0, s2: 0, turn: cal.turnDegPerSec });
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof m) => (v: number) => setM((x) => ({ ...x, [k]: v }));

  const apply = () => {
    const f = fitRuns(1000, m.f1, 2000, m.f2);
    const s = fitRuns(1000, m.s1, 2000, m.s2);
    if (!f || !s) return setNote({ ok: false, text: t('cal.bad') });
    setCalibration({
      measured: true,
      refVoltage: m.volts,
      forwardInPerSec: f.inPerSec,
      forwardExtraMs: f.extraMs,
      strafeInPerSec: s.inPerSec,
      strafeExtraMs: s.extraMs,
      turnDegPerSec: m.turn,
    });
    setNote({
      ok: true,
      text: `${t('cal.applied')} ${t('cal.result', { vf: f.inPerSec, ef: f.extraMs, vs: s.inPerSec, es: s.extraMs })}`,
    });
  };

  return (
    <div>
      <p>{t('cal.intro')}</p>
      <button
        className="small"
        onClick={() => {
          const g = generateCalibration(hw, cal);
          downloadText(g.fileName, g.code);
        }}
        data-testid="download-calibration"
      >
        {t('cal.download')}
      </button>
      <ol className="cal-steps">
        <li>{t('cal.step1')}</li>
        <li>{t('cal.step2')}</li>
        <li>{t('cal.step3')}</li>
        <li>{t('cal.step4')}</li>
      </ol>
      <div className="settings-grid">
        <NumField label={t('cal.voltage')} value={m.volts} min={9} max={15} digits={2} onChange={set('volts')} testId="cal-volts" />
        <p className="muted">
          {t('cal.power')}: {cal.calPower}
        </p>
        <NumField label={t('cal.f1')} value={m.f1} min={0} max={200} digits={2} onChange={set('f1')} testId="cal-f1" />
        <NumField label={t('cal.f2')} value={m.f2} min={0} max={300} digits={2} onChange={set('f2')} testId="cal-f2" />
        <NumField label={t('cal.s1')} value={m.s1} min={0} max={200} digits={2} onChange={set('s1')} testId="cal-s1" />
        <NumField label={t('cal.s2')} value={m.s2} min={0} max={300} digits={2} onChange={set('s2')} testId="cal-s2" />
        <NumField label={t('cal.turn')} value={m.turn} min={1} max={2000} digits={1} onChange={set('turn')} testId="cal-turn" />
      </div>
      <button className="primary" onClick={apply} data-testid="cal-apply">
        {t('cal.apply')}
      </button>
      {note && <p className={`info ${note.ok ? '' : 'bad'}`}>{note.text}</p>}
      <p className="hint">{t('cal.syncNote')}</p>
      <details>
        <summary>{t('cal.raw')}</summary>
        <CheckField label={t('cal.measured')} checked={cal.measured} onChange={(v) => setCalibration({ measured: v })} />
        <div className="settings-grid">
          {RAW.map((r) => (
            <NumField
              key={r.key}
              label={r.key === 'calPower' ? t('cal.power') : t(`cal.${r.key}` as MsgKey)}
              value={cal[r.key]}
              min={r.min}
              max={r.max}
              digits={r.digits}
              onChange={(v) => setCalibration({ [r.key]: v })}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

function HwTab({ t }: { t: T }) {
  const hw = usePlanner((s) => s.hw);
  const setHw = usePlanner((s) => s.setHw);
  const num = (key: 'headingKp' | 'headingKi' | 'turnKp' | 'turnMinPower' | 'turnTolDeg' | 'turnTimeoutMs', digits: number, max: number) => (
    <NumField label={t(`hw.${key}` as MsgKey)} value={hw[key]} min={0} max={max} digits={digits} onChange={(v) => setHw({ [key]: v } as Partial<HardwareConfig>)} />
  );
  return (
    <div>
      <h4>{t('hw.motors')}</h4>
      <div className="settings-grid">
        {MOTORS.map((k) => (
          <div key={k} className="motor-row">
            <TextField label={t(`hw.${k}` as MsgKey)} value={hw.motors[k]} onChange={(v) => setHw({ motors: { ...hw.motors, [k]: v } })} />
            <CheckField label={t('hw.reversed')} checked={hw.reversed[k]} onChange={(v) => setHw({ reversed: { ...hw.reversed, [k]: v } })} />
          </div>
        ))}
        <TextField label={t('hw.imu')} value={hw.imu} onChange={(v) => setHw({ imu: v })} />
        <span />
        <label className="field-label">
          <span>{t('hw.logo')}</span>
          <select value={hw.hubLogo} onChange={(e) => setHw({ hubLogo: e.target.value as LogoDirection })}>
            {LOGO.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          <span>{t('hw.usb')}</span>
          <select value={hw.hubUsb} onChange={(e) => setHw({ hubUsb: e.target.value as LogoDirection })}>
            {LOGO.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <TextField label={t('hw.package')} value={hw.packageName} onChange={(v) => setHw({ packageName: v })} />
        <TextField label={t('hw.runnerPackage')} value={hw.runnerPackage} onChange={(v) => setHw({ runnerPackage: v })} />
        <TextField label={t('hw.group')} value={hw.opModeGroup} onChange={(v) => setHw({ opModeGroup: v })} />
        <span />
        {num('headingKp', 4, 1)}
        {num('headingKi', 4, 1)}
        {num('turnKp', 4, 1)}
        {num('turnMinPower', 3, 1)}
        {num('turnTolDeg', 2, 20)}
        {num('turnTimeoutMs', 0, 10000)}
      </div>
    </div>
  );
}

const JAVA_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function MechTab({ t }: { t: T }) {
  const hw = usePlanner((s) => s.hw);
  const setHw = usePlanner((s) => s.setHw);
  const setMech = (id: string, patch: Partial<HardwareConfig['mechanisms'][number]>) =>
    setHw({ mechanisms: hw.mechanisms.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  return (
    <div>
      <p className="hint">{t('mech.intro')}</p>
      {hw.mechanisms.map((m) => (
        <div key={m.id} className="mech-row">
          <TextField label={t('mech.label')} value={m.label} onChange={(v) => setMech(m.id, { label: v })} />
          <label className="field-label">
            <span>{t('mech.kind')}</span>
            <select value={m.kind} onChange={(e) => setMech(m.id, { kind: e.target.value as MechanismKind })}>
              <option value="servo">{t('mech.servo')}</option>
              <option value="motor">{t('mech.motor')}</option>
              <option value="crservo">{t('mech.crservo')}</option>
            </select>
          </label>
          <TextField
            label={t('mech.javaName')}
            value={m.javaName}
            onChange={(v) => {
              const clean = v.replace(/[^A-Za-z0-9_$]/g, '');
              setMech(m.id, { javaName: JAVA_IDENT.test(clean) ? clean : `m${clean}` });
            }}
          />
          <TextField label={t('mech.hardwareName')} value={m.hardwareName} onChange={(v) => setMech(m.id, { hardwareName: v })} />
          <button className="small danger" onClick={() => setHw({ mechanisms: hw.mechanisms.filter((x) => x.id !== m.id) })}>
            {t('mech.remove')}
          </button>
        </div>
      ))}
      <button
        className="small"
        data-testid="add-mechanism"
        onClick={() => {
          const n = hw.mechanisms.length + 1;
          setHw({ mechanisms: [...hw.mechanisms, { id: newId('mech'), label: `Servo ${n}`, kind: 'servo', javaName: `servo${n}`, hardwareName: `servo${n}` }] });
        }}
      >
        {t('mech.add')}
      </button>
      <h4>{t('mech.commands')}</h4>
      {hw.commands.map((c, i) => (
        <div key={i} className="mech-row">
          <TextField label={`#${i + 1}`} value={c} onChange={(v) => setHw({ commands: hw.commands.map((x, j) => (j === i ? v : x)) })} />
          <button className="small danger" onClick={() => setHw({ commands: hw.commands.filter((_, j) => j !== i) })}>
            {t('mech.remove')}
          </button>
        </div>
      ))}
      <button className="small" onClick={() => setHw({ commands: [...hw.commands, `command${hw.commands.length + 1}`] })}>
        {t('mech.addCommand')}
      </button>
      <h4>{t('mech.setup')}</h4>
      <p className="hint">{t('mech.setupHint')}</p>
      <TextField label="Java" value={hw.commandSetup} onChange={(v) => setHw({ commandSetup: v })} />
    </div>
  );
}

function BackupTab({ t }: { t: T }) {
  const restore = usePlanner((s) => s.restore);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="backup">
      <button
        className="small"
        onClick={() => downloadText(`overtime-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backupData(), null, 2), 'application/json')}
      >
        {t('backup.export')}
      </button>
      <button className="small" onClick={() => fileRef.current?.click()}>
        {t('backup.import')}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const ok = restore(JSON.parse(await file.text()));
            setNote({ ok, text: t(ok ? 'backup.importOk' : 'backup.importBad') });
          } catch {
            setNote({ ok: false, text: t('backup.importBad') });
          }
        }}
      />
      {note && <p className={`info ${note.ok ? '' : 'bad'}`}>{note.text}</p>}
    </div>
  );
}

export function SettingsModal({ initialTab, onClose }: { initialTab: SettingsTab; onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t('settings.title')} data-testid="settings">
        <div className="modal-head">
          <h2>{t('settings.title')}</h2>
          <button className="small" onClick={onClose}>
            {t('settings.close')}
          </button>
        </div>
        <div className="tabs sub" role="tablist">
          {TABS.map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)} data-testid={`settings-tab-${k}`}>
              {t(`settings.tab.${k}` as MsgKey)}
            </button>
          ))}
        </div>
        <div className="modal-body">
          {tab === 'robot' && <RobotTab t={t} />}
          {tab === 'calib' && <CalibTab t={t} />}
          {tab === 'hw' && <HwTab t={t} />}
          {tab === 'mech' && <MechTab t={t} />}
          {tab === 'backup' && <BackupTab t={t} />}
        </div>
        <div className="credit muted">{t('app.credit')}</div>
      </div>
    </div>
  );
}
