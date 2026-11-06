import { isSitePattern } from './sites';
import { updateSettings } from './engine';
import {
  type Reminder, type State, type Fail, emptyState,
  SCHEMA_VERSION, TITLE_MAX, MAX_ACTIVE_REMINDERS, MAX_COMPLETED_HISTORY,
} from '../shared/types';

export const MAX_IMPORT_BYTES = 256 * 1024;
const STATUSES = new Set(['scheduled', 'due', 'snoozed', 'completed']);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 8.64e15;
const isId = (v: unknown) => typeof v === 'string' && /^[\w-]{1,64}$/.test(v);
const isKey = (v: unknown) => v === undefined || (typeof v === 'string' && v.length <= 100);

export function validReminder(v: unknown): v is Reminder {
  if (!isObj(v)) return false;
  const r = v as Partial<Reminder>;
  return isId(r.id) && isId(r.occurrenceId) && typeof r.title === 'string' && r.title.trim().length > 0 &&
    r.title.length <= TITLE_MAX && isTime(r.originalDueAt) && isTime(r.effectiveDueAt) && isTime(r.createdAt) &&
    isTime(r.updatedAt) && STATUSES.has(r.status as string) && Number.isInteger(r.revision) && (r.revision as number) > 0 &&
    (r.completedAt === undefined || isTime(r.completedAt)) && isKey(r.presentedKey) && isKey(r.notifiedKey);
}

function cleanReminder(r: Reminder): Reminder {
  const { id, occurrenceId, title, originalDueAt, effectiveDueAt, createdAt, updatedAt, status, revision, completedAt, presentedKey, notifiedKey } = r;
  return { id, occurrenceId, title, originalDueAt, effectiveDueAt, createdAt, updatedAt, status, revision, completedAt, presentedKey, notifiedKey };
}

export type Loaded = { ok: true; state: State } | { ok: false; error: 'unsupported_schema' | 'corrupt'; message: string };

/** Validates persisted data. Never "repairs" by discarding a newer schema. */
export function migrate(raw: unknown): Loaded {
  if (raw === undefined) return { ok: true, state: emptyState() };
  if (!isObj(raw)) return { ok: false, error: 'corrupt', message: 'Saved Tuglet data is unreadable.' };
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION)
    return { ok: false, error: 'unsupported_schema', message: 'Your reminders were saved by a newer Tuglet version. Update Tuglet; nothing was changed.' };
  if (raw.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: 'corrupt', message: 'Saved Tuglet data has an unknown format.' };
  const base = emptyState();
  const reminders = Array.isArray(raw.reminders) ? raw.reminders : null;
  if (!reminders || !reminders.every(validReminder)) return { ok: false, error: 'corrupt', message: 'Saved reminders are damaged.' };
  const settings = isObj(raw.settings) ? updateSettings(base, raw.settings) : null;
  if (!settings?.ok) return { ok: false, error: 'corrupt', message: 'Saved settings are damaged.' };
  const sites = Array.isArray(raw.sites) ? raw.sites.filter((x): x is State['sites'][number] => isObj(x) && isSitePattern(x.pattern) && typeof x.showTitles === 'boolean') : [];
  const recentOps = Array.isArray(raw.recentOps) ? raw.recentOps.filter((x): x is string => typeof x === 'string').slice(-200) : [];
  const lc = raw.lastCompletion;
  const lastCompletion = isObj(lc) && isId(lc.id) && Number.isInteger(lc.revision) && isTime(lc.at)
    ? { id: lc.id as string, revision: lc.revision as number, at: lc.at as number } : undefined;
  return {
    ok: true,
    state: { ...base, reminders: reminders.map(cleanReminder), settings: settings.state.settings, sites: sites.map(({ pattern, showTitles }) => ({ pattern, showTitles })), recentOps, lastCompletion },
  };
}

export function exportJson(s: State, now: number): string {
  return JSON.stringify({ format: 'tuglet-export', schemaVersion: SCHEMA_VERSION, exportedAt: now, reminders: s.reminders, settings: s.settings }, null, 2);
}

/**
 * Parses an export file as untrusted data. Returns the reminders and settings
 * to restore; site access is deliberately never imported.
 */
export function parseImport(text: string): { ok: true; reminders: Reminder[]; settings: State['settings'] } | Fail {
  const bad = (message: string): Fail => ({ ok: false, error: 'import', message });
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) return bad('The file is empty or larger than 256 KB.');
  let data: unknown;
  try {
    data = JSON.parse(text, (k, v: unknown) => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new Error('forbidden key');
      return v;
    });
  } catch { return bad('That file is not a valid Tuglet export.'); }
  if (!isObj(data) || data.format !== 'tuglet-export') return bad('That file is not a Tuglet export.');
  if (data.schemaVersion !== SCHEMA_VERSION) return bad('That export comes from an unsupported Tuglet version.');
  const loaded = migrate({ schemaVersion: SCHEMA_VERSION, reminders: data.reminders, settings: data.settings });
  if (!loaded.ok) return bad('The export contains invalid reminders or settings. Nothing was imported.');
  const ids = new Set(loaded.state.reminders.map((r) => r.id));
  if (ids.size !== loaded.state.reminders.length) return bad('The export contains duplicate reminders.');
  const open = loaded.state.reminders.filter((r) => r.status !== 'completed').length;
  if (open > MAX_ACTIVE_REMINDERS || loaded.state.reminders.length > MAX_ACTIVE_REMINDERS + MAX_COMPLETED_HISTORY)
    return bad('The export has more reminders than Tuglet can hold.');
  return { ok: true, reminders: loaded.state.reminders, settings: loaded.state.settings };
}
