import { useEffect } from 'react';
import { useT, type MsgKey } from '../i18n';
import { usePlanner } from '../store/plannerStore';
import { downloadCalibration, downloadRunner } from './javaDownloads';
import { Rich } from './Rich';
import type { SettingsTab } from './SettingsModal';

interface Props {
  errorCount: number;
  onClose: () => void;
  onOpenSettings: (tab: SettingsTab) => void;
  onOpenCode: () => void;
}

interface Step {
  id: string;
  title: MsgKey;
  body: MsgKey;
  after?: MsgKey;
}

const STEPS: Step[] = [
  { id: 's1', title: 'guide.s1.title', body: 'guide.s1.body', after: 'guide.s1.after' },
  { id: 's2', title: 'guide.s2.title', body: 'guide.s2.body' },
  { id: 's3', title: 'guide.s3.title', body: 'guide.s3.body', after: 'guide.s3.after' },
  { id: 's4', title: 'guide.s4.title', body: 'guide.s4.body' },
  { id: 's5', title: 'guide.s5.title', body: 'guide.s5.body' },
  { id: 's7', title: 'guide.s7.title', body: 'guide.s7.body' },
  { id: 's6', title: 'guide.s6.title', body: 'guide.s6.body', after: 'guide.s6.after' },
];

export function GuideModal({ errorCount, onClose, onOpenSettings, onOpenCode }: Props) {
  const t = useT();
  const config = usePlanner((s) => s.config);
  const view = usePlanner((s) => s.view);
  const done = view.guideDone;
  const { setView } = usePlanner.getState();
  const folder = `TeamCode/src/main/java/${config.runnerPackage.replace(/\./g, '/')}/`;

  const toggle = (id: string) =>
    setView({ guideDone: done.includes(id) ? done.filter((d) => d !== id) : [...done, id] });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const extra = (id: string) => {
    switch (id) {
      case 's1':
        return (
          <>
            <code className="guide-path">{folder}</code>
            <div className="guide-actions">
              <button className="primary small" onClick={() => void downloadRunner(config.runnerPackage)} data-testid="guide-download-runner">
                {t('guide.btnRunner')}
              </button>
            </div>
          </>
        );
      case 's2':
        return (
          <div className="guide-actions">
            <span className={errorCount ? 'bad' : 'ok-text'}>{errorCount ? t('guide.s2.errors', { n: errorCount }) : t('guide.s2.ok')}</span>
            <button className="small" onClick={() => onOpenSettings('hardware')}>
              {t('guide.btnSettings')}
            </button>
            <button className="small" onClick={() => onOpenSettings('code')}>
              {t('guide.btnCodeSettings')}
            </button>
          </div>
        );
      case 's3':
        return (
          <div className="guide-actions">
            <button className="primary small" onClick={() => void downloadCalibration(config, view)} data-testid="guide-download-calibration">
              {t('guide.btnCalibration')}
            </button>
          </div>
        );
      case 's4':
        return (
          <div className="guide-actions">
            <button className="small" onClick={() => onOpenSettings('constants')}>
              {t('guide.btnCalibHelper')}
            </button>
          </div>
        );
      case 's6':
        return (
          <div className="guide-actions">
            <button className="small" onClick={onOpenCode}>
              {t('guide.btnCode')}
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal guide" role="dialog" aria-modal="true" aria-label={t('guide.title')} data-testid="guide">
        <header>
          <h2>{t('guide.title')}</h2>
          <button className="icon" onClick={onClose} aria-label={t('guide.close')}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <p className="hint">{t('guide.intro')}</p>
          <p className="guide-progress">{t('guide.progress', { done: STEPS.filter((s) => done.includes(s.id)).length, total: STEPS.length })}</p>
          <ol className="guide-steps">
            {STEPS.map((s, i) => {
              const isDone = done.includes(s.id);
              return (
                <li key={s.id} className={isDone ? 'done' : ''}>
                  <div className="guide-head">
                    <span className="guide-num">{isDone ? '✓' : i + 1}</span>
                    <h3>{t(s.title)}</h3>
                    <label className="guide-check">
                      <input type="checkbox" checked={isDone} onChange={() => toggle(s.id)} data-testid={`guide-done-${s.id}`} />
                      {t('guide.markDone')}
                    </label>
                  </div>
                  <p>
                    <Rich text={t(s.body)} />
                  </p>
                  {extra(s.id)}
                  {s.after && (
                    <p className="hint">
                      <Rich text={t(s.after)} />
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <footer>
          <span />
          <button className="primary" onClick={onClose}>
            {t('guide.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}
