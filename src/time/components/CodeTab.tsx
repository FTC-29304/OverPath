import { useMemo, useState } from 'react';
import { generateAuto, generateCalibration, runnerFile } from '../codegen/java';
import { parseAuto } from '../codegen/parse';
import { useT } from '../i18n';
import { useActiveAuto, usePlanner } from '../store/plannerStore';
import { downloadText } from './files';

function CodeEditor({ initial, onDone }: { initial: string; onDone: (applied: number | null) => void }) {
  const t = useT();
  const hw = usePlanner((s) => s.hw);
  const [text, setText] = useState(initial);
  const result = useMemo(() => parseAuto(text, hw), [text, hw]);
  const parsed = result.ok ? result.auto : null;
  const apply = (asNew: boolean) => {
    if (!parsed) return;
    usePlanner.getState().applyParsed(parsed, asNew);
    onDone(parsed.steps.length);
  };
  const added = parsed ? [...parsed.newMechanisms.map((m) => m.javaName), ...parsed.newCommands.map((c) => `"${c}"`)] : [];

  return (
    <>
      <div className="code-actions">
        <label className="small button-like">
          {t('code.openFile')}
          <input
            type="file"
            accept=".java,.txt,text/plain"
            hidden
            data-testid="code-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              f?.text().then(setText);
            }}
          />
        </label>
        <button className="small primary" disabled={!parsed} onClick={() => apply(false)} data-testid="code-apply">
          {t('code.applyHere')}
        </button>
        <button className="small" disabled={!parsed} onClick={() => apply(true)} data-testid="code-apply-new">
          {t('code.applyNew')}
        </button>
        <button className="small" onClick={() => onDone(null)}>
          {t('code.cancel')}
        </button>
      </div>
      <p className="hint">{t('code.editHint')}</p>
      <div className="parse-summary" data-testid="parse-summary">
        {!result.ok && <p className="info warn">{t(result.error)}</p>}
        {parsed && (
          <>
            <p className="info">
              {t('parse.found', { n: parsed.steps.length })}
              {parsed.name && <span className="muted"> · {parsed.name}</span>}
            </p>
            {added.length > 0 && <p className="info">{t('parse.newHw', { items: added.join(', ') })}</p>}
            {parsed.skipped.length > 0 && (
              <div className="info warn">
                {t('parse.skipped')}
                <ul className="skipped">
                  {parsed.skipped.map((s, i) => (
                    <li key={i}>
                      <span className="muted">{t('parse.line', { n: s.line })}</span> <code>{s.text}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="info muted">{t('parse.startNote')}</p>
          </>
        )}
      </div>
      <textarea
        className="code mono code-edit"
        value={text}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={t('code.title')}
        data-testid="code-edit"
        onChange={(e) => setText(e.target.value)}
      />
    </>
  );
}

export function CodeTab() {
  const t = useT();
  const auto = useActiveAuto();
  const hw = usePlanner((s) => s.hw);
  const cal = usePlanner((s) => s.calibration);
  const gen = useMemo(() => generateAuto(auto, hw, cal), [auto, hw, cal]);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);
  const path = (pkg: string) => pkg.replace(/^org\.firstinspires\.ftc\.teamcode\.?/, '').replace(/\./g, '/') || '.';
  const background = auto.steps.some((s) => (s.kind === 'motor' || s.kind === 'command') && s.background && s.ms > 0);

  if (editing) {
    return (
      <div className="code-tab">
        <CodeEditor
          initial={gen.code}
          onDone={(n) => {
            setEditing(false);
            setApplied(n);
          }}
        />
      </div>
    );
  }

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
        <button
          className="small"
          onClick={() => {
            setApplied(null);
            setEditing(true);
          }}
          data-testid="code-edit-open"
        >
          {t('code.edit')}
        </button>
      </div>
      {applied != null && <p className="info">{t('parse.applied', { n: applied })}</p>}
      {!cal.measured && <p className="info warn">{t('code.notCalibrated')}</p>}
      {background && <p className="info">{t('code.needsNew')}</p>}
      <p className="hint">{t('code.howto', { runnerPath: path(hw.runnerPackage), autoPath: path(hw.packageName) })}</p>
      <pre className="code mono" data-testid="code">
        {gen.code}
      </pre>
    </div>
  );
}
