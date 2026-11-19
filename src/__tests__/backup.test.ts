import { describe, expect, it } from 'vitest';
import { BACKUP_KIND, makeBackup, readBackup } from '../model/backup';
import { defaultAuto, defaultConfig, defaultView } from '../model/defaults';
import { usePlanner } from '../store/plannerStore';
import { useToasts, toast } from '../store/toasts';

describe('project backup', () => {
  it('round-trips autos, settings, profiles and runs', () => {
    const a = defaultAuto('Blue left');
    const config = { ...defaultConfig(), commands: ['shoot'], profiles: { competition: { ...defaultConfig().constants } } };
    const backup = makeBackup({ autos: [a], config, view: { ...defaultView(), language: 'tr' as const } });
    expect(backup.kind).toBe(BACKUP_KIND);
    const r = readBackup(JSON.stringify(backup));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.autos[0].name).toBe('Blue left');
    expect(r.project.autos[0].waypoints).toEqual(a.waypoints);
    expect(r.project.config.commands).toEqual(['shoot']);
    expect(r.project.config.profiles.competition).toBeDefined();
    expect(r.project.view.language).toBe('tr');
  });

  it('also restores the file the crash screen downloads (the browser’s saved state)', () => {
    const saved = { state: { autos: [defaultAuto('Saved')], config: {}, view: {} }, version: 4 };
    const r = readBackup(JSON.stringify(saved));
    expect(r.ok && r.project.autos[0].name).toBe('Saved');
  });

  it('refuses files that aren’t backups, with a reason', () => {
    expect(readBackup('{')).toEqual({ ok: false, error: 'backup.notJson' });
    expect(readBackup('{"hello":1}')).toEqual({ ok: false, error: 'backup.notBackup' });
    expect(readBackup(JSON.stringify({ kind: BACKUP_KIND, version: 9, autos: [] }))).toEqual({ ok: false, error: 'backup.newerVersion' });
    expect(readBackup(JSON.stringify({ kind: BACKUP_KIND, version: 1, autos: [{ waypoints: [] }] }))).toEqual({ ok: false, error: 'backup.empty' });
  });

  it('restore replaces everything and can be undone', () => {
    const st = usePlanner.getState();
    st.newAuto();
    const before = { autos: usePlanner.getState().autos, config: usePlanner.getState().config, activeId: usePlanner.getState().activeId };
    const r = readBackup(JSON.stringify(makeBackup({ autos: [defaultAuto('From backup')], config: defaultConfig(), view: defaultView() })));
    if (!r.ok) throw new Error('backup');
    const prev = st.restoreProject(r.project);
    expect(usePlanner.getState().autos.map((a) => a.name)).toEqual(['From backup']);
    usePlanner.getState().restoreProject(prev);
    expect(usePlanner.getState().autos).toBe(before.autos);
    expect(usePlanner.getState().config).toBe(before.config);
    expect(usePlanner.getState().activeId).toBe(before.activeId);
  });
});

describe('undo delete', () => {
  it('puts the deleted auto back where it was', () => {
    const st = usePlanner.getState();
    st.newAuto();
    st.newAuto();
    const names = usePlanner.getState().autos.map((a) => a.name);
    const middle = usePlanner.getState().autos[1];
    st.setActive(middle.id);
    const d = st.deleteAuto();
    expect(usePlanner.getState().autos.map((a) => a.id)).not.toContain(middle.id);
    usePlanner.getState().restoreAuto(d);
    expect(usePlanner.getState().autos.map((a) => a.name)).toEqual(names);
    expect(usePlanner.getState().activeId).toBe(middle.id);
    usePlanner.getState().restoreAuto(d);
    expect(usePlanner.getState().autos).toHaveLength(names.length);
  });

  it('deleting the last auto leaves a fresh one, and undo brings it back', () => {
    const st = usePlanner.getState();
    while (usePlanner.getState().autos.length > 1) usePlanner.getState().deleteAuto();
    const only = usePlanner.getState().autos[0];
    const d = usePlanner.getState().deleteAuto();
    expect(usePlanner.getState().autos).toHaveLength(1);
    expect(usePlanner.getState().autos[0].id).not.toBe(only.id);
    st.restoreAuto(d);
    expect(usePlanner.getState().autos.map((a) => a.id)).toContain(only.id);
  });
});

describe('toasts', () => {
  it('keeps the last three', () => {
    for (let i = 0; i < 5; i++) toast(`t${i}`);
    expect(useToasts.getState().toasts.map((x) => x.text)).toEqual(['t2', 't3', 't4']);
    for (const x of useToasts.getState().toasts) useToasts.getState().dismiss(x.id);
    expect(useToasts.getState().toasts).toEqual([]);
  });
});
