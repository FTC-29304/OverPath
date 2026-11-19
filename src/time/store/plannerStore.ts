import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { defaultAuto, newId } from '../model/defaults';
import { mirrorAuto } from '../model/mirror';
import { sanitizeSaved, type SavedData } from '../model/sanitize';
import type { Auto, Calibration, HardwareConfig, Pose, Step, ViewPrefs } from '../model/types';
import { defaultLang } from '../i18n/translate';

import { STORE_KEY } from './storageKey';
const HISTORY = 100;

interface Snapshot {
  autos: Auto[];
  activeId: string;
}

export interface PlannerState extends SavedData {
  selectedStepId: string | null;
  past: Snapshot[];
  future: Snapshot[];

  select(id: string | null): void;
  checkpoint(): void;
  undo(): void;
  redo(): void;

  setActive(id: string): void;
  newAuto(): void;
  duplicateAuto(): void;
  deleteAuto(): void;
  mirrorActive(): void;
  renameAuto(name: string): void;
  setStart(start: Partial<Pose>, record?: boolean): void;

  insertStep(step: Step, index?: number): void;
  updateStep(id: string, patch: Partial<Step>, record?: boolean): void;
  removeStep(id: string): void;
  moveStep(id: string, delta: -1 | 1): void;
  duplicateStep(id: string): void;

  setCalibration(patch: Partial<Calibration>): void;
  setHw(patch: Partial<HardwareConfig>): void;
  setView(patch: Partial<ViewPrefs>): void;
  restore(data: unknown): boolean;
}

const snap = (s: PlannerState): Snapshot => ({ autos: s.autos, activeId: s.activeId });

export const usePlanner = create<PlannerState>()(
  persist(
    (set, get) => {
      const commit = (fn: (s: PlannerState) => Partial<PlannerState>, record = true) =>
        set((s) => {
          const next = fn(s);
          return record ? { ...next, past: [...s.past, snap(s)].slice(-HISTORY), future: [] } : next;
        });
      const mapActive = (s: PlannerState, fn: (a: Auto) => Auto) => ({
        autos: s.autos.map((a) => (a.id === s.activeId ? fn(a) : a)),
      });
      const active = (s: PlannerState) => s.autos.find((a) => a.id === s.activeId) ?? s.autos[0];

      return {
        ...sanitizeSaved(null, defaultLang()),
        selectedStepId: null,
        past: [],
        future: [],

        select: (id) => set({ selectedStepId: id }),
        checkpoint: () => set((s) => ({ past: [...s.past, snap(s)].slice(-HISTORY), future: [] })),
        undo: () =>
          set((s) => {
            const prev = s.past[s.past.length - 1];
            if (!prev) return {};
            return { ...prev, past: s.past.slice(0, -1), future: [snap(s), ...s.future] };
          }),
        redo: () =>
          set((s) => {
            const next = s.future[0];
            if (!next) return {};
            return { ...next, future: s.future.slice(1), past: [...s.past, snap(s)] };
          }),

        setActive: (id) => set({ activeId: id, selectedStepId: null }),
        newAuto: () =>
          commit((s) => {
            const a = defaultAuto(`Auto${s.autos.length + 1}`);
            return { autos: [...s.autos, a], activeId: a.id, selectedStepId: null };
          }),
        duplicateAuto: () =>
          commit((s) => {
            const src = active(s);
            const a: Auto = {
              ...src,
              id: newId('auto'),
              name: `${src.name}Copy`,
              steps: src.steps.map((st) => ({ ...st, id: newId('st') })),
            };
            return { autos: [...s.autos, a], activeId: a.id, selectedStepId: null };
          }),
        deleteAuto: () =>
          commit((s) => {
            const rest = s.autos.filter((a) => a.id !== s.activeId);
            const autos = rest.length ? rest : [defaultAuto()];
            return { autos, activeId: autos[0].id, selectedStepId: null };
          }),
        mirrorActive: () =>
          commit((s) => {
            const a = mirrorAuto(active(s), s.view.mirrorMode);
            return { autos: [...s.autos, a], activeId: a.id, selectedStepId: null };
          }),
        renameAuto: (name) => commit((s) => mapActive(s, (a) => ({ ...a, name })), false),
        setStart: (start, record = true) => commit((s) => mapActive(s, (a) => ({ ...a, start: { ...a.start, ...start } })), record),

        insertStep: (step, index) =>
          commit((s) => {
            const at = index ?? active(s).steps.length;
            return {
              ...mapActive(s, (a) => ({ ...a, steps: [...a.steps.slice(0, at), step, ...a.steps.slice(at)] })),
              selectedStepId: step.id,
            };
          }),
        updateStep: (id, patch, record = true) =>
          commit(
            (s) => mapActive(s, (a) => ({ ...a, steps: a.steps.map((st) => (st.id === id ? ({ ...st, ...patch, id, kind: st.kind } as Step) : st)) })),
            record,
          ),
        removeStep: (id) =>
          commit((s) => ({
            ...mapActive(s, (a) => ({ ...a, steps: a.steps.filter((st) => st.id !== id) })),
            selectedStepId: s.selectedStepId === id ? null : s.selectedStepId,
          })),
        moveStep: (id, delta) =>
          commit((s) =>
            mapActive(s, (a) => {
              const i = a.steps.findIndex((st) => st.id === id);
              const j = i + delta;
              if (i < 0 || j < 0 || j >= a.steps.length) return a;
              const steps = [...a.steps];
              [steps[i], steps[j]] = [steps[j], steps[i]];
              return { ...a, steps };
            }),
          ),
        duplicateStep: (id) => {
          const s = get();
          const steps = active(s).steps;
          const i = steps.findIndex((st) => st.id === id);
          if (i >= 0) get().insertStep({ ...steps[i], id: newId('st') }, i + 1);
        },

        setCalibration: (patch) => set((s) => ({ calibration: { ...s.calibration, ...patch } })),
        setHw: (patch) => set((s) => ({ hw: { ...s.hw, ...patch } })),
        setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
        restore: (data) => {
          if (typeof data !== 'object' || data === null || !Array.isArray((data as { autos?: unknown }).autos)) return false;
          const clean = sanitizeSaved(data, get().view.language);
          commit(() => ({ ...clean, selectedStepId: null }));
          return true;
        },
      };
    },
    {
      name: STORE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): SavedData => ({ autos: s.autos, activeId: s.activeId, calibration: s.calibration, hw: s.hw, view: s.view }),
      merge: (persisted, current) => ({ ...current, ...sanitizeSaved(persisted, current.view.language) }),
    },
  ),
);

export function useActiveAuto(): Auto {
  return usePlanner((s) => s.autos.find((a) => a.id === s.activeId) ?? s.autos[0]);
}

export function backupData(): SavedData & { app: 'overtime'; version: 1 } {
  const s = usePlanner.getState();
  return { app: 'overtime', version: 1, autos: s.autos, activeId: s.activeId, calibration: s.calibration, hw: s.hw, view: s.view };
}
