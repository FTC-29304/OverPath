import { useEffect, useState } from 'react';
import { FieldCanvas } from './canvas/FieldCanvas';
import { CodeTab } from './components/CodeTab';
import { RulesBox } from './components/RulesBox';
import { SettingsModal, type SettingsTab } from './components/SettingsModal';
import { StepList } from './components/StepList';
import { Timeline } from './components/Timeline';
import { Toolbar } from './components/Toolbar';
import { useDerived } from './hooks/useDerived';
import { useT } from './i18n';
import { poseAt } from './sim/simulate';
import { takeHandoffLanguage } from '../shared/plannerMode';
import { usePlanner } from './store/plannerStore';

export default function App() {
  const t = useT();
  const { auto, sim, rules } = useDerived();
  const measured = usePlanner((s) => s.calibration.measured);
  const lang = usePlanner((s) => s.view.language);
  const [tab, setTab] = useState<'plan' | 'code'>('plan');
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [timeMs, setTimeMs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const language = takeHandoffLanguage();
    if (language) usePlanner.getState().setView({ language });
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('app.title');
  }, [lang, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      const s = usePlanner.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedStepId) {
        e.preventDefault();
        s.removeStep(s.selectedStepId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [previewOf, setPreviewOf] = useState(auto);
  if (previewOf !== auto) {
    setPreviewOf(auto);
    setPlaying(false);
    setTimeMs(null);
  }

  const ghost = timeMs != null ? poseAt(sim, timeMs).pose : null;

  return (
    <div className="app">
      <Toolbar tab={tab} setTab={setTab} openSettings={() => setSettings('robot')} />
      {!measured && (
        <div className="banner" data-testid="calib-banner">
          <span>{t('calib.banner')}</span>
          <button className="small" onClick={() => setSettings('calib')}>
            {t('calib.open')}
          </button>
        </div>
      )}
      {tab === 'plan' ? (
        <main className="plan">
          <div className="field-col">
            <FieldCanvas auto={auto} sim={sim} rules={rules} ghost={ghost} />
            <Timeline auto={auto} sim={sim} timeMs={timeMs} setTimeMs={setTimeMs} playing={playing} setPlaying={setPlaying} />
          </div>
          <aside className="side">
            <StepList auto={auto} sim={sim} rules={rules} />
            <RulesBox rules={rules} />
          </aside>
        </main>
      ) : (
        <main className="code-main">
          <CodeTab />
        </main>
      )}
      {settings && <SettingsModal initialTab={settings} onClose={() => setSettings(null)} />}
    </div>
  );
}
