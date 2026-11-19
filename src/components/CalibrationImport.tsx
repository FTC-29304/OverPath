import { useRef, useState } from 'react';
import { ROBOT_FILES_URL, calibrationDiff, parseCalibration, robotFetchBlocked, type CalibrationFile, type CalibrationKey } from '../codegen/calibrationFile';
import { useT, type MsgKey } from '../i18n';
import type { HardwareConfig } from '../model/types';
import { usePlanner } from '../store/plannerStore';
import { Rich } from './Rich';

const LABEL: Record<CalibrationKey, MsgKey> = {
  minPower: 'tune.minPower',
  turnMinPower: 'tune.turnMinPower',
  maxSpeedInPerSec: 'preview.speed',
  brakeLinear: 'grip.brakeLinear',
  brakeQuadratic: 'grip.brakeQuadratic',
  turnRadiusIn: 'grip.turnRadius',
  maxPowerRatePerS: 'grip.rise',
  maxPowerDropPerS: 'grip.drop',
  alongPct: 'errModel.alongPct',
  strafePct: 'errModel.strafePct',
  turnSigmaDeg: 'errModel.turnSigma',
};

const PCT = new Set<CalibrationKey>(['alongPct', 'strafePct']);

function show(k: CalibrationKey, v: number) {
  return PCT.has(k) ? `${(v * 100).toFixed(2)} %` : String(Math.round(v * 10000) / 10000);
}

export function CalibrationImport({ config }: { config: HardwareConfig }) {
  const t = useT();
  const [file, setFile] = useState<CalibrationFile | null>(null);
  const [error, setError] = useState<MsgKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const load = (text: string) => {
    const r = parseCalibration(text);
    setApplied(false);
    if (r.ok) {
      setFile(r.file);
      setError(null);
    } else {
      setFile(null);
      setError(r.error);
    }
  };

  const fetchFromRobot = async () => {
    setBusy(true);
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch(`${ROBOT_FILES_URL}/calibration.json`, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!res.ok) throw new Error(String(res.status));
      load(await res.text());
    } catch {
      setFile(null);
      setError(robotFetchBlocked() ? 'robot.httpsBlocked' : 'calibFile.noRobot');
    } finally {
      setBusy(false);
    }
  };

  const diff = file ? calibrationDiff(config.constants, file) : [];
  const otherProfile = file?.profile && file.profile !== config.activeProfile ? file.profile : null;

  const apply = () => {
    if (!file) return;
    const st = usePlanner.getState();
    if (otherProfile) st.switchProfile(otherProfile);
    st.setConstants(file.values);
    setApplied(true);
  };

  return (
    <>
      <h4 id="calibration-import">{t('calibFile.title')}</h4>
      <p className="hint">
        <Rich text={t('calibFile.hint', { url: ROBOT_FILES_URL })} />
      </p>
      <div className="file-actions">
        <input
          ref={picker}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="calib-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) f.text().then(load, () => setError('calibFile.notJson'));
          }}
        />
        <button className="small" onClick={() => picker.current?.click()} data-testid="calib-file-pick">
          {t('calibFile.pick')}
        </button>
        <button className="small" disabled={busy} onClick={fetchFromRobot} data-testid="calib-fetch">
          {busy ? t('calibFile.fetching') : t('calibFile.fetch')}
        </button>
      </div>
      {error && <p className="warnings warn-note" data-testid="calib-file-error">{t(error)}</p>}
      {file && (
        <div className="calib-import" data-testid="calib-file-preview">
          {file.drivetrain !== config.drivetrain && <p className="warnings warn-note">{t('calibFile.otherDrivetrain')}</p>}
          {diff.length === 0 ? (
            <p className="hint">{t('calibFile.same')}</p>
          ) : (
            <table className="diff">
              <tbody>
                {diff.map(([k, from, to]) => (
                  <tr key={k}>
                    <td>{t(LABEL[k])}</td>
                    <td className="mono">{show(k, from)}</td>
                    <td>→</td>
                    <td className="mono">
                      <strong>{show(k, to)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {file.rejected.length > 0 && (
            <p className="warnings warn-note">{t('calibFile.rejected', { names: file.rejected.map((k) => t(LABEL[k])).join(', ') })}</p>
          )}
          {file.report.length > 0 && (
            <ul className="calib-report">
              {file.report.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          {otherProfile && <p className="hint">{t('calibFile.switchProfile', { profile: t(otherProfile === 'home' ? 'profile.home' : 'profile.competition') })}</p>}
          {diff.length > 0 && !applied && (
            <button className="small primary" onClick={apply} data-testid="calib-apply">
              {t('calibFile.apply', { n: diff.length })}
            </button>
          )}
          {applied && <p className="hint">{t('calibFile.applied')}</p>}
        </div>
      )}
    </>
  );
}
