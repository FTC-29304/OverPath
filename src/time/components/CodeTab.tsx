import { useMemo, useState } from 'react';
import { generateAuto, generateCalibration, runnerFile } from '../codegen/java';
import { useT } from '../i18n';
import { useActiveAuto, usePlanner } from '../store/plannerStore';
import { downloadText } from './files';

export function CodeTab() {
  const t = useT();
  const auto = useActiveAuto();
  const hw = usePlanner((s) => s.hw);
  const cal = usePlanner((s) => s.calibration);
  const gen = useMemo(() => generateAuto(auto, hw, cal), [auto, hw, cal]);
  const [copied, setCopied] = useState(false);
  const path = (pkg: string) => pkg.replace(/^org\.firstinspires\.ftc\.teamcode\.?/, '').replace(/\./g, '/') || '.';

  return (
    <div className="code-tab">
      <div className="code-actions">
        <h3>
          {t('code.title')} <span className="mono muted">{gen.fileName}</span>
        </h3>
        <button
          className="small"
          onClick={() =>
            navigator.clipboard?.writeText(gen.code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? t('code.copied') : t('code.copy')}
        </button>
        <button className="small primary" onClick={() => downloadText(gen.fileName, gen.code)} data-testid="download-auto">
          {t('code.download', { file: gen.fileName })}
        </button>
        <button
          className="small"
          onClick={() => {
            const r = runnerFile(hw);
            downloadText(r.fileName, r.code);
          }}
          data-testid="download-runner"
        >
          {t('code.runner')}
        </button>
        <button
          className="small"
          onClick={() => {
            const c = generateCalibration(hw, cal);
            downloadText(c.fileName, c.code);
          }}
        >
          {t('code.calibration')}
        </button>
      </div>
      {!cal.measured && <p className="info warn">{t('code.notCalibrated')}</p>}
      <p className="hint">{t('code.howto', { runnerPath: path(hw.runnerPackage), autoPath: path(hw.packageName) })}</p>
      <pre className="code mono" data-testid="code">
        {gen.code}
      </pre>
    </div>
  );
}
