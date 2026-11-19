import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { HALF_FIELD, round, wrapDeg } from '../geometry/transform';
import { defaultAuto, defaultConfig, defaultView, makeWaypoint, uid } from '../model/defaults';
import { snapToAnchor } from '../compile/anchors';
import { sanitizeAuto, sanitizeAutos, sanitizeConfig, sanitizeView } from '../model/sanitize';
import { STORE_KEY } from './storageKey';
import type { Project } from '../model/backup';

export interface DeletedAuto {
  auto: Auto;
  index: number;
}
import type { RunRecord } from '../logs/learn';
import type { RunLog } from '../logs/runLog';
import { CALIB_KEYS } from '../model/types';
import type { Action, Anchor, Auto, CalibValues, HardwareConfig, Marker, MirrorMode, ProfileName, RobotFace, ViewPrefs, WallSide, Waypoint } from '../model/types';

const HISTORY_LIMIT = 100;
export const MAX_RUNS = 50;
const MOTOR_KEYS = ['leftFront', 'rightFront', 'leftBack', 'rightBack'] as const;

interface PlannerState {
  autos: Auto[];
  activeId: string;
  config: HardwareConfig;
  view: ViewPrefs;
  selectedId: string | null;
  past: Auto[][];
  future: Auto[][];
  replay: RunLog | null;

  select(id: string | null): void;
  checkpoint(): void;
  addWaypoint(x: number, y: number): void;
  insertAfter(id: string): void;
  updateWaypoint(id: string, patch: Partial<Waypoint>, record?: boolean): void;
  deleteWaypoint(id: string): void;
  moveWaypoint(id: string, dir: -1 | 1): void;
  setActions(id: string, actions: Action[]): void;
  setMarkers(id: string, markers: Marker[]): void;
  setAnchor(id: string, anchor: Anchor | null): void;
  replaceWaypoints(waypoints: Waypoint[]): void;
  switchProfile(name: ProfileName): void;
  addRun(log: RunLog): void;
  setReplay(log: RunLog | null): void;
  clearRuns(): void;

  setConfig(patch: Partial<HardwareConfig>): void;
  setConstants(patch: Partial<HardwareConfig['constants']>): void;
  setView(patch: Partial<ViewPrefs>): void;
  resetConfig(): void;

  setActive(id: string): void;
  newAuto(): void;
  duplicateAuto(): void;
  renameAuto(name: string): void;
  deleteAuto(): DeletedAuto;
  restoreAuto(d: DeletedAuto): void;
  restoreProject(p: Project): Project;
  importAuto(auto: unknown): boolean;
  mirrorActive(): void;
  undo(): void;
  redo(): void;
}

export function migrateSettings(persisted: unknown, version: number): PlannerState {
  const p = persisted as { config?: Partial<HardwareConfig> };
  if (version < 2 && p?.config) {
    const OLD = { leftFront: 'leftFront', rightFront: 'rightFront', leftBack: 'leftBack', rightBack: 'rightBack' };
    const NEW = defaultConfig().motors;
    const same = (a?: object) => !!a && MOTOR_KEYS.every((k) => (a as Record<string, string>)[k] === OLD[k]);
    if (same(p.config.motors)) p.config.motors = { ...NEW };
    if (same(p.config.hardwareNames)) p.config.hardwareNames = { ...p.config.hardwareNames!, ...NEW };
  }
  if (version < 3 && p?.config?.runnerPackage === 'org.firstinspires.ftc.teamcode.pathplanner') {
    p.config.runnerPackage = defaultConfig().runnerPackage;
  }
  if (version < 4 && p?.config?.opModeGroup === 'PathPlanner') {
    p.config.opModeGroup = defaultConfig().opModeGroup;
  }
  return persisted as PlannerState;
}

export function mergeSaved<S extends Pick<PlannerState, 'autos' | 'activeId' | 'view' | 'config'>>(persisted: unknown, current: S): S {
  const p = (typeof persisted === 'object' && persisted !== null ? persisted : {}) as Record<string, unknown>;
  const saved = sanitizeAutos(p.autos);
  const autos = saved.length ? saved : current.autos;
  return {
    ...current,
    autos,
    activeId: autos.some((a) => a.id === p.activeId) ? (p.activeId as string) : autos[0].id,
    view: sanitizeView(p.view),
    config: sanitizeConfig(p.config),
  };
}

export function activeAuto(s: Pick<PlannerState, 'autos' | 'activeId'>): Auto {
  return s.autos.find((a) => a.id === s.activeId) ?? s.autos[0];
}

const clampField = (v: number) => Math.max(-HALF_FIELD, Math.min(HALF_FIELD, v));

const MIRROR_WALL: Record<MirrorMode, Partial<Record<WallSide, WallSide>>> = {
  flipX: { left: 'right', right: 'left' },
  flipY: { audience: 'rear', rear: 'audience' },
  rotate180: { left: 'right', right: 'left', audience: 'rear', rear: 'audience' },
};

function mirrorFace(face: RobotFace, mode: MirrorMode): RobotFace {
  if (mode === 'rotate180') return face;
  return face === 'left' ? 'right' : face === 'right' ? 'left' : face;
}

export function mirrorWaypoint(wp: Waypoint, mode: MirrorMode): Waypoint {
  const pos = (x: number, y: number) =>
    mode === 'flipX' ? { x: -x, y } : mode === 'flipY' ? { x, y: -y } : { x: -x, y: -y };
  const hd = (h: number) => round(wrapDeg(mode === 'flipX' ? 180 - h : mode === 'flipY' ? -h : h + 180), 2);
  return {
    ...wp,
    ...pos(wp.x, wp.y),
    heading: hd(wp.heading),
    actions: wp.actions.map((a) => (a.kind === 'turn' ? { ...a, heading: hd(a.heading) } : a)),
    ...(wp.anchor ? { anchor: { ...wp.anchor, wall: MIRROR_WALL[mode][wp.anchor.wall] ?? wp.anchor.wall, face: mirrorFace(wp.anchor.face, mode) } } : {}),
  };
}

export const usePlanner = create<PlannerState>()(
  persist(
    (set, get) => {
      const editAuto = (fn: (a: Auto) => Auto, record = true) =>
        set((s) => {
          const current = activeAuto(s);
          const autos = s.autos.map((a) => (a.id === current.id ? fn(a) : a));
          return record
            ? { autos, past: [...s.past, s.autos].slice(-HISTORY_LIMIT), future: [] }
            : { autos };
        });
      const snap = (w: Waypoint): Waypoint => {
        if (!w.anchor) return w;
        const v = get().view;
        const p = snapToAnchor(w.x, w.y, w.anchor, { lengthIn: v.robotLengthIn, widthIn: v.robotWidthIn });
        return { ...w, x: p.x, y: p.y, heading: p.heading };
      };
      const editWaypoints = (fn: (w: Waypoint[]) => Waypoint[], record = true) =>
        editAuto((a) => ({ ...a, waypoints: fn(a.waypoints).map(snap) }), record);

      const first = defaultAuto();
      return {
        autos: [first],
        activeId: first.id,
        config: defaultConfig(),
        view: defaultView(),
        selectedId: null,
        past: [],
        future: [],
        replay: null,

        select: (id) => set({ selectedId: id }),
        checkpoint: () => set((s) => ({ past: [...s.past, s.autos].slice(-HISTORY_LIMIT), future: [] })),

        addWaypoint: (x, y) => {
          const wps = activeAuto(get()).waypoints;
          const prev = wps[wps.length - 1];
          const wp = makeWaypoint(clampField(x), clampField(y), prev?.heading ?? 90, prev && wps.length > 1 ? prev.power : 0.6);
          editWaypoints((w) => [...w, wp]);
          set({ selectedId: wp.id });
        },
        insertAfter: (id) => {
          const wps = activeAuto(get()).waypoints;
          const i = wps.findIndex((w) => w.id === id);
          if (i < 0) return;
          const a = wps[i];
          const b = wps[i + 1];
          const wp = b
            ? makeWaypoint(round((a.x + b.x) / 2, 2), round((a.y + b.y) / 2, 2), b.heading, b.power)
            : makeWaypoint(clampField(a.x + 12), a.y, a.heading, a.power);
          editWaypoints((w) => [...w.slice(0, i + 1), wp, ...w.slice(i + 1)]);
          set({ selectedId: wp.id });
        },
        updateWaypoint: (id, patch, record = true) =>
          editWaypoints((w) => w.map((wp) => (wp.id === id ? { ...wp, ...patch } : wp)), record),
        deleteWaypoint: (id) => {
          editWaypoints((w) => w.filter((wp) => wp.id !== id));
          if (get().selectedId === id) set({ selectedId: null });
        },
        moveWaypoint: (id, dir) =>
          editWaypoints((w) => {
            const i = w.findIndex((wp) => wp.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= w.length) return w;
            const next = [...w];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
          }),
        setActions: (id, actions) => editWaypoints((w) => w.map((wp) => (wp.id === id ? { ...wp, actions } : wp))),
        setMarkers: (id, markers) => editWaypoints((w) => w.map((wp) => (wp.id === id ? { ...wp, markers } : wp))),
        setAnchor: (id, anchor) =>
          editWaypoints((w) =>
            w.map((wp) => {
              if (wp.id !== id) return wp;
              const { anchor: _old, ...rest } = wp;
              void _old;
              return anchor ? { ...rest, anchor } : rest;
            }),
          ),

        replaceWaypoints: (waypoints) => editWaypoints(() => waypoints),
        switchProfile: (name) =>
          set((s) => {
            const c = s.config;
            if (name === c.activeProfile) return {};
            const pick = (k: CalibValues) => Object.fromEntries(CALIB_KEYS.map((key) => [key, k[key]])) as CalibValues;
            const saved = { ...c.profiles, [c.activeProfile]: pick(c.constants) };
            const load = saved[name];
            return { config: { ...c, activeProfile: name, profiles: saved, constants: load ? { ...c.constants, ...load } : c.constants } };
          }),
        addRun: (log) =>
          set((s) => {
            const c = s.config;
            const id = `${log.name}|${log.duration.toFixed(3)}|${log.samples.length}|${log.walls.map((w) => w.corrIn).join(';')}`;
            const list = c.runHistory[c.activeProfile] ?? [];
            if (list.some((r) => r.id === id)) return { replay: log };
            const record: RunRecord = { id, name: log.name, date: Date.now(), constants: log.constants, drivetrain: log.drivetrain, walls: log.walls };
            return { replay: log, config: { ...c, runHistory: { ...c.runHistory, [c.activeProfile]: [record, ...list].slice(0, MAX_RUNS) } } };
          }),
        setReplay: (replay) => set({ replay }),
        clearRuns: () => set((s) => ({ config: { ...s.config, runHistory: { ...s.config.runHistory, [s.config.activeProfile]: [] } } })),
        setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
        setConstants: (patch) => set((s) => ({ config: { ...s.config, constants: { ...s.config.constants, ...patch } } })),
        setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
        resetConfig: () => set((s) => ({ config: { ...defaultConfig(), runHistory: s.config.runHistory } })),

        setActive: (id) => set({ activeId: id, selectedId: null }),
        newAuto: () => {
          const a = defaultAuto(`Auto ${get().autos.length + 1}`);
          set((s) => ({ autos: [...s.autos, a], activeId: a.id, selectedId: null }));
        },
        duplicateAuto: () => {
          const src = activeAuto(get());
          const copy: Auto = {
            ...structuredClone(src),
            id: uid('auto'),
            name: `${src.name} copy`,
          };
          copy.waypoints = copy.waypoints.map((w) => ({ ...w, id: uid('wp') }));
          set((s) => ({ autos: [...s.autos, copy], activeId: copy.id, selectedId: null }));
        },
        renameAuto: (name) => editAuto((a) => ({ ...a, name }), false),
        deleteAuto: () => {
          const s = get();
          const index = Math.max(0, s.autos.findIndex((a) => a.id === s.activeId));
          const deleted: DeletedAuto = { auto: activeAuto(s), index };
          const rest = s.autos.filter((a) => a.id !== deleted.auto.id);
          const autos = rest.length ? rest : [defaultAuto()];
          set({ autos, activeId: autos[Math.min(index, autos.length - 1)].id, selectedId: null, past: [], future: [] });
          return deleted;
        },
        restoreAuto: ({ auto, index }) =>
          set((s) => {
            if (s.autos.some((a) => a.id === auto.id)) return {};
            const autos = [...s.autos];
            autos.splice(Math.min(index, autos.length), 0, auto);
            return { autos, activeId: auto.id, selectedId: null, past: [], future: [] };
          }),
        restoreProject: (p) => {
          const s = get();
          const previous: Project = { autos: s.autos, config: s.config, view: s.view, activeId: s.activeId };
          const activeId = p.autos.some((a) => a.id === p.activeId) ? p.activeId! : p.autos[0].id;
          set({ autos: p.autos, activeId, config: p.config, view: p.view, selectedId: null, past: [], future: [], replay: null });
          return previous;
        },
        importAuto: (raw) => {
          const clean = sanitizeAuto(raw);
          if (!clean) return false;
          const a: Auto = { ...clean, id: uid('auto'), waypoints: clean.waypoints.map((w) => ({ ...w, id: uid('wp') })) };
          set((s) => ({ autos: [...s.autos, a], activeId: a.id, selectedId: null }));
          return true;
        },
        mirrorActive: () => {
          const mode = get().view.mirrorMode;
          editAuto((a) => ({ ...a, waypoints: a.waypoints.map((w) => mirrorWaypoint(w, mode)) }));
        },
        undo: () =>
          set((s) => {
            if (!s.past.length) return {};
            return { autos: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.autos, ...s.future] };
          }),
        redo: () =>
          set((s) => {
            if (!s.future.length) return {};
            return { autos: s.future[0], future: s.future.slice(1), past: [...s.past, s.autos] };
          }),
      };
    },
    {
      name: STORE_KEY,
      version: 4,
      migrate: migrateSettings,
      partialize: (s) => ({ autos: s.autos, activeId: s.activeId, config: s.config, view: s.view }),
      merge: mergeSaved,
    },
  ),
);

export function useActiveAuto(): Auto {
  return usePlanner((s) => activeAuto(s));
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __planner: typeof usePlanner }).__planner = usePlanner;
