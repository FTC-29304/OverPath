import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FieldCanvas } from './canvas/FieldCanvas';
import { generateJava, validateConfig } from './codegen/java';
import { compile } from './compile/compile';

import { GuideModal } from './components/GuideModal';
import type { SettingsTab } from './components/SettingsModal';
import { Timeline } from './components/Timeline';
import { Toasts } from './components/Toasts';
import { lazyPart } from './lazyLoad';
import { Toolbar } from './components/Toolbar';
import { WaypointPanel } from './components/WaypointPanel';
import { useT } from './i18n';
import { checkAuto } from './rules/biobuzz';
import { realityCheck } from './sim/montecarlo';
import { poseAt, simulate } from './sim/simulate';
import { propagate } from './sim/uncertainty';
import { useActiveAuto, usePlanner } from './store/plannerStore';
import { takeHandoffLanguage } from './shared/plannerMode';
import { watchOtherTabs } from './store/tabSync';
import { toast } from './store/toasts';

type SideTab = 'path' | 'code';

const ExportPanel = lazyPart(() => import('./components/ExportPanel').then((m) => m.ExportPanel));
const SettingsModal = lazyPart(() => import('./components/SettingsModal').then((m) => m.SettingsModal));

export default function App() {
  const t = useT();
  const auto = useActiveAuto();
  const config = usePlanner((s) => s.config);
  const view = usePlanner((s) => s.view);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [guideOpen, setGuideOpen] = useState(() => !usePlanner.getState().view.guideSeen);
  const [tab, setTab] = useState<SideTab>('path');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const robot = useMemo(() => ({ lengthIn: view.robotLengthIn, widthIn: view.robotWidthIn }), [view.robotLengthIn, view.robotWidthIn]);
  const compiled = useMemo(() => compile(auto, config, robot), [auto, config, robot]);
  const timeline = useMemo(() => simulate(compiled.steps, config.drivetrain, config.constants), [compiled, config]);
  const rules = useMemo(() => checkAuto(compiled, view.robotLengthIn, view.robotWidthIn), [compiled, view.robotLengthIn, view.robotWidthIn]);
  const issues = useMemo(() => validateConfig(config, compiled), [config, compiled]);
  const result = useMemo(() => (tab === 'code' ? generateJava(auto, config, robot) : null), [tab, auto, config, robot]);
  const uncertainty = useMemo(
    () => propagate(compiled.steps, timeline, config.constants, compiled.arrivals.length),
    [compiled, timeline, config.constants],
  );
  const deferredCompiled = useDeferredValue(compiled);
  const deferredTimeline = useDeferredValue(timeline);
  const reality = useMemo(
    () => realityCheck(deferredCompiled.steps, deferredCompiled.arrivals, deferredTimeline, config.constants, robot, rules.alliance),
    [deferredCompiled, deferredTimeline, config.constants, robot, rules.alliance],
  );

  useEffect(() => {
    const language = takeHandoffLanguage();
    if (language) usePlanner.getState().setView({ language });
  }, []);

  useEffect(() => watchOtherTabs(() => usePlanner.persist?.rehydrate(), () => toast(t('toast.otherTab'))), [t]);

  useEffect(() => {
    document.documentElement.lang = view.language;
    document.title = t('app.title');
  }, [view.language, t]);

  const clampedTime = Math.min(time, timeline.total);
  const start = compiled.arrivals[0] ?? null;
  const showGhost = playing || (clampedTime > 0 && clampedTime < timeline.total);
  const sim = start ? poseAt(timeline, clampedTime, start, config.constants) : null;

  const timeRef = useRef(0);
  useEffect(() => {
    timeRef.current = clampedTime;
  }, [clampedTime]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(timeRef.current + (now - last) / 1000, timeline.total);
      last = now;
      timeRef.current = next;
      setTime(next);
      if (next >= timeline.total) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, timeline.total]);

  const modalOpen = settingsTab !== null || guideOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]') || modalOpen) return;
      const onControl = !!target.closest('button, a, [role=radio], summary');
      if (onControl && (e.key === ' ' || e.key === 'Delete' || e.key === 'Backspace')) return;
      const st = usePlanner.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId) {
        e.preventDefault();
        st.deleteWaypoint(st.selectedId);
      } else if (e.key === 'Escape') {
        st.select(null);
      } else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const closeGuide = () => {
    setGuideOpen(false);
    usePlanner.getState().setView({ guideSeen: true });
  };

  return (
    <div className="app">
      <Toolbar onSettings={() => setSettingsTab('hardware')} onGuide={() => setGuideOpen(true)} errorCount={issues.length} />
      <main className="workspace">
        <section className="field-pane">
          <FieldCanvas
            compiled={compiled}
            ghost={showGhost && sim ? sim.pose : null}
            activeStep={showGhost && sim ? sim.index : -1}
            badSteps={rules.badSteps}
            uncertainty={view.showUncertainty ? uncertainty : null}
            reality={view.showUncertainty ? reality : null}
          />
          <Timeline
            timeline={timeline}
            time={clampedTime}
            playing={playing}
            activeStep={sim?.index ?? -1}
            onTime={setTime}
            onPlay={setPlaying}
          />
        </section>
        <aside className="side-pane">
          <nav className="tabs side-tabs">
            <button className={tab === 'path' ? 'on' : ''} onClick={() => setTab('path')} data-testid="tab-path">
              {t('tab.path')}
            </button>
            <button className={tab === 'code' ? 'on' : ''} onClick={() => setTab('code')} data-testid="tab-code">
              {t('tab.code')}
              {issues.length > 0 && <span className="err-badge">{issues.length}</span>}
            </button>
          </nav>
          {tab === 'path' ? (
            <WaypointPanel compiled={compiled} rules={rules} uncertainty={uncertainty} reality={reality} />
          ) : (
            <Suspense fallback={<p className="hint panel-body">{t('common.loading')}</p>}>
              {result && <ExportPanel result={result} onOpenSettings={() => setSettingsTab('hardware')} />}
            </Suspense>
          )}
        </aside>
      </main>
      <Toasts />
      {settingsTab && (
        <Suspense fallback={null}>
          <SettingsModal issues={issues} initialTab={settingsTab} onClose={() => setSettingsTab(null)} />
        </Suspense>
      )}
      {guideOpen && !settingsTab && (
        <GuideModal
          errorCount={issues.length}
          onClose={closeGuide}
          onOpenSettings={(tb) => setSettingsTab(tb)}
          onOpenCode={() => {
            setTab('code');
            closeGuide();
          }}
        />
      )}
    </div>
  );
}
