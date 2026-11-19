import { ModeSwitch } from '../../shared/ModeSwitch';
import { useT } from '../i18n';
import { usePlanner } from '../store/plannerStore';

interface Props {
  tab: 'plan' | 'code';
  setTab: (t: 'plan' | 'code') => void;
  openSettings: () => void;
}

export function Toolbar({ tab, setTab, openSettings }: Props) {
  const t = useT();
  const autos = usePlanner((s) => s.autos);
  const activeId = usePlanner((s) => s.activeId);
  const view = usePlanner((s) => s.view);
  const canUndo = usePlanner((s) => s.past.length > 0);
  const canRedo = usePlanner((s) => s.future.length > 0);
  const st = usePlanner.getState();
  const active = autos.find((a) => a.id === activeId) ?? autos[0];

  return (
    <header className="toolbar">
      <div className="brand" title={t('app.credit')}>
        <div>
          <strong>{t('app.title')}</strong>
          <span className="muted tagline">{t('app.tagline')}</span>
        </div>
      </div>
      <ModeSwitch
        current="time"
        language={view.language}
        label={t('mode.label')}
        pathLabel={t('mode.path')}
        pathTitle={t('mode.pathTitle')}
        timeLabel={t('mode.time')}
        timeTitle={t('mode.timeTitle')}
      />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>
          {t('tab.plan')}
        </button>
        <button role="tab" aria-selected={tab === 'code'} className={tab === 'code' ? 'active' : ''} onClick={() => setTab('code')} data-testid="tab-code">
          {t('tab.code')}
        </button>
      </div>
      <div className="tb-group">
        <select value={activeId} onChange={(e) => st.setActive(e.target.value)} aria-label={t('toolbar.auto')} data-testid="auto-select">
          {autos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          className="text name"
          value={active.name}
          aria-label={t('toolbar.autoName')}
          title={t('toolbar.autoName')}
          onChange={(e) => st.renameAuto(e.target.value)}
          data-testid="auto-name"
        />
        <button className="small" onClick={st.newAuto}>
          {t('toolbar.new')}
        </button>
        <button className="small" onClick={st.duplicateAuto}>
          {t('toolbar.duplicate')}
        </button>
        <button className="small" onClick={st.mirrorActive} title={t('toolbar.mirrorTitle')} data-testid="mirror">
          {t('toolbar.mirror')}
        </button>
        <button className="small danger" onClick={() => confirm(t('toolbar.deleteConfirm', { name: active.name })) && st.deleteAuto()}>
          {t('toolbar.delete')}
        </button>
      </div>
      <div className="tb-group right">
        <button className="small" onClick={st.undo} disabled={!canUndo} title="Ctrl/Cmd+Z">
          {t('toolbar.undo')}
        </button>
        <button className="small" onClick={st.redo} disabled={!canRedo} title="Ctrl/Cmd+Shift+Z">
          {t('toolbar.redo')}
        </button>
        <button
          className="small"
          title={t('toolbar.rotate')}
          aria-label={t('toolbar.rotate')}
          onClick={() => st.setView({ rotation: ((view.rotation + 90) % 360) as 0 | 90 | 180 | 270 })}
        >
          ⟳
        </button>
        <button className="small" onClick={() => st.setView({ language: view.language === 'en' ? 'tr' : 'en' })} data-testid="lang">
          {t('toolbar.language')}
        </button>
        <button className="small primary" onClick={openSettings} data-testid="open-settings">
          {t('toolbar.settings')}
        </button>
      </div>
    </header>
  );
}
