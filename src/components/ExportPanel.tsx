import { useMemo, useState, type ReactNode } from 'react';
import type { GenerateResult } from '../codegen/java';
import { RUNNER_VERSION, compareVersions } from '../codegen/version';
import { useT } from '../i18n';
import { AUTO_SECONDS } from '../sim/simulate';
import { usePlanner } from '../store/plannerStore';
import { Seg } from './fields';
import { Rich } from './Rich';
import { downloadText } from './files';
import { downloadCalibration, downloadRunner } from './javaDownloads';

function download(name: string, text: string) {
  downloadText(name, text, 'text/x-java');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

const KEYWORDS = new Set(
  'package import public class extends new null void return true false private static final double int long boolean if while for else this'.split(' '),
);
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*")|(@[A-Za-z]+)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of code.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(code.slice(last, i));
    const [text, comment, str, ann, num, word] = m;
    const cls = comment ? 'tk-c' : str ? 'tk-s' : ann ? 'tk-a' : num ? 'tk-n' : word && KEYWORDS.has(word) ? 'tk-k' : word && /^[A-Z]/.test(word) ? 'tk-t' : null;
    out.push(cls ? <span key={key++} className={cls}>{text}</span> : text);
    last = i + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function ExportPanel({ result, onOpenSettings }: { result: GenerateResult; onOpenSettings: () => void }) {
  const t = useT();
  const config = usePlanner((s) => s.config);
  const view = usePlanner((s) => s.view);
  const { setConfig } = usePlanner.getState();
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const blocked = result.errors.length > 0;
  const over = result.estSeconds > AUTO_SECONDS;
  const highlighted = useMemo(() => highlight(result.code), [result.code]);

  const onCopy = async () => {
    const ok = await copyText(result.code);
    setCopied(ok ? 'ok' : 'fail');
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="panel-body export">
      <div className="export-controls">
        <Seg
          value={config.output}
          testId="output-mode"
          options={[
            { value: 'snippet', label: t('export.snippet') },
            { value: 'opmode', label: t('export.opmode') },
          ]}
          onChange={(output) => setConfig({ output })}
        />
        {config.output === 'opmode' && (
          <label className="field-row check">
            <input type="checkbox" checked={config.emitHardwareMapInit} onChange={(e) => setConfig({ emitHardwareMapInit: e.target.checked })} />
            <span>{t('export.declareHw')}</span>
          </label>
        )}
      </div>

      <div className="stats">
        <span>{t('export.steps', { n: result.stepCount })}</span>
        <span className={over ? 'bad' : ''}>
          {t('export.est', { s: result.estSeconds.toFixed(1), max: AUTO_SECONDS })}
        </span>
        <span className="muted">{config.drivetrain === 'tank' ? t('toolbar.tank') : t('toolbar.mecanum')}</span>
      </div>

      {config.output === 'snippet' && (
        <p className="hint">
          <Rich text={t('export.snippetHint')} />
        </p>
      )}

      {blocked && (
        <div className="errors" role="alert" data-testid="export-errors">
          <strong>{t('export.fix')}</strong>
          <ul>
            {result.errors.map((e, i) => (
              <li key={i}>{t(e.message)}</li>
            ))}
          </ul>
          <button className="small" onClick={onOpenSettings}>
            {t('export.openSettings')}
          </button>
        </div>
      )}
      {result.warnings.length > 0 && (
        <ul className="warnings">
          {result.warnings.map((w, i) => (
            <li key={i}>{t(w)}</li>
          ))}
        </ul>
      )}

      {compareVersions(view.runnerDownloaded, RUNNER_VERSION) < 0 && (
        <p className="warnings warn-note" data-testid="runner-version-note">
          {view.runnerDownloaded
            ? t('export.runnerOutdated', { have: view.runnerDownloaded, need: RUNNER_VERSION })
            : t('export.runnerNeeded', { need: RUNNER_VERSION })}
        </p>
      )}

      <div className="export-buttons">
        <button className="primary" onClick={onCopy} disabled={blocked} data-testid="copy-code">
          {copied === 'ok' ? t('export.copied') : copied === 'fail' ? t('export.copyFailed') : t('export.copy')}
        </button>
        <button
          onClick={() => download(config.output === 'opmode' ? `${result.className}.java` : `${result.className}_snippet.java`, result.code)}
          disabled={blocked}
        >
          {t('export.download')}
        </button>
        <button onClick={() => void downloadRunner(config.runnerPackage)} title={`package ${config.runnerPackage}`} data-testid="download-runner">
          {t('export.runner')}
        </button>
        <button onClick={() => void downloadCalibration(config, view)} title={t('export.calibrationTitle')} data-testid="download-calibration">
          {t('export.calibration')}
        </button>
      </div>

      <pre className="code" data-testid="code-output">
        <code>{highlighted}</code>
      </pre>
    </div>
  );
}
