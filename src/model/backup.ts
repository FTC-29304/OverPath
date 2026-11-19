import type { MsgKey } from '../i18n';
import { RUNNER_VERSION } from '../codegen/version';
import { sanitizeAutos, sanitizeConfig, sanitizeView } from './sanitize';
import type { Auto, HardwareConfig, ViewPrefs } from './types';

export const BACKUP_KIND = 'overpath-project';

export interface Project {
  autos: Auto[];
  config: HardwareConfig;
  view: ViewPrefs;
  activeId?: string;
}

export function makeBackup(p: Project) {
  return { kind: BACKUP_KIND, version: 1, overpath: RUNNER_VERSION, savedAt: new Date().toISOString(), ...p };
}

export type BackupRead = { ok: true; project: Project } | { ok: false; error: MsgKey };

export function readBackup(text: string): BackupRead {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'backup.notJson' };
  }
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return { ok: false, error: 'backup.notBackup' };
  const body = o.kind === BACKUP_KIND ? o : typeof o.state === 'object' && o.state !== null ? (o.state as Record<string, unknown>) : null;
  if (!body) return { ok: false, error: 'backup.notBackup' };
  if (o.kind === BACKUP_KIND && typeof o.version === 'number' && o.version > 1) return { ok: false, error: 'backup.newerVersion' };
  const autos = sanitizeAutos(body.autos);
  if (autos.length === 0) return { ok: false, error: 'backup.empty' };
  return { ok: true, project: { autos, config: sanitizeConfig(body.config), view: sanitizeView(body.view) } };
}
