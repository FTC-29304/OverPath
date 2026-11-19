import { useRef } from 'react';
import { useT } from '../i18n';
import { activeAuto, usePlanner } from '../store/plannerStore';
import { toast, toastError } from '../store/toasts';
import { ModeSwitch } from '../shared/ModeSwitch';
import { Seg } from './fields';
import { downloadJson, fileSafe } from './files';

export function Toolbar({ onSettings, onGuide, errorCount }: { onSettings: () => void; onGuide: () => void; errorCount: number }) {
  const t = useT();
  const autos = usePlanner((s) => s.autos);
  const activeId = usePlanner((s) => s.activeId);
  const view = usePlanner((s) => s.view);
  const config = usePlanner((s) => s.config);
  const canUndo = usePlanner((s) => s.past.length > 0);
  const canRedo = usePlanner((s) => s.future.length > 0);
  const st = usePlanner.getState();
  const auto = activeAuto({ autos, activeId });
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const list: unknown[] = Array.isArray(data) ? data : [data?.auto ?? data];
      const added = list.filter((a) => st.importAuto(a)).length;
      if (!added) throw new Error(t('toolbar.importNoAuto'));
      toast(t('toast.imported', { n: added }));
    } catch (e) {
      toastError(t('toolbar.importError', { error: (e as Error).message }));
    }
  };

  return (
    <header className="toolbar">
      <div className="brand" title={t('app.credit')}>
        <span className="brand-name">OverPath</span>
      </div>
      <ModeSwitch
        current="path"
        language={view.language}
        label={t('mode.label')}
        pathLabel={t('mode.path')}
        pathTitle={t('mode.pathTitle')}
        timeLabel={t('mode.time')}
        timeTitle={t('mode.timeTitle')}
      />

      <div className="tb-group">
        <select value={activeId} onChange={(e) => st.setActive(e.target.value)} aria-label={t('toolbar.chooseAuto')} data-testid="auto-select">
          {autos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name || t('toolbar.unnamed')}
            </option>
          ))}
        </select>
        <input
          className="text auto-name"
          value={auto.name}
          onChange={(e) => st.renameAuto(e.target.value)}
          aria-label={t('toolbar.autoName')}
          title={t('toolbar.autoName')}
        />
        <button className="small" onClick={st.newAuto} title={t('toolbar.newTitle')}>
          {t('toolbar.new')}
        </button>
        <button className="small" onClick={st.duplicateAuto} title={t('toolbar.duplicateTitle')}>
          {t('toolbar.duplicate')}
        </button>
        <button
          className="small danger"
          onClick={() => {
            const d = st.deleteAuto();
            toast(t('toast.autoDeleted', { name: d.auto.name || t('toolbar.unnamed') }), { label: t('toast.undo'), run: () => usePlanner.getState().restoreAuto(d) });
          }}
          data-testid="delete-auto"
          title={t('toolbar.deleteTitle')}
        >
          {t('toolbar.delete')}
        </button>
      </div>

      <div className="tb-group">
        <button className="small" onClick={st.undo} disabled={!canUndo} title={t('toolbar.undoTitle')}>
          {t('toolbar.undo')}
        </button>
        <button className="small" onClick={st.redo} disabled={!canRedo} title={t('toolbar.redoTitle')}>
          {t('toolbar.redo')}
        </button>
        <button className="small" onClick={st.mirrorActive} title={t('toolbar.mirrorTitle')}>
          {t('toolbar.mirror')}
        </button>
        <button className="small" onClick={() => downloadJson(`${fileSafe(auto.name)}.ftcauto.json`, { version: 1, auto })}>
          {t('toolbar.export')}
        </button>
        <button className="small" onClick={() => fileRef.current?.click()}>
          {t('toolbar.import')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="tb-group">
        <Seg
          value={view.units}
          options={[
            { value: 'in', label: 'in' },
            { value: 'cm', label: 'cm' },
          ]}
          onChange={(units) => st.setView({ units })}
        />
        <Seg
          value={view.convention}
          options={[
            { value: 'ftc', label: '±72' },
            { value: 'corner', label: '0–144' },
          ]}
          onChange={(convention) => st.setView({ convention })}
        />
        <button className="small" onClick={() => st.setView({ rotation: ((view.rotation + 90) % 360) as 0 | 90 | 180 | 270 })} title={t('toolbar.rotateTitle')}>
          ⟳ {view.rotation}°
        </button>
      </div>

      <div className="tb-group right">
        <span title={t('toolbar.language')}>
          <Seg
            value={view.language}
            testId="language"
            options={[
              { value: 'en', label: 'EN' },
              { value: 'tr', label: 'TR' },
            ]}
            onChange={(language) => st.setView({ language })}
          />
        </span>
        <button className="small" onClick={onGuide} data-testid="open-guide">
          {t('toolbar.startHere')}
        </button>
        <button className="small pill" onClick={onSettings} title={t('toolbar.drivetrainTitle')}>
          {config.drivetrain === 'tank' ? t('toolbar.tank') : t('toolbar.mecanum')}
        </button>
        <button className="primary small" onClick={onSettings} data-testid="open-settings">
          {t('toolbar.settings')}
          {errorCount > 0 && <span className="err-badge">{errorCount}</span>}
        </button>
      </div>
    </header>
  );
}
