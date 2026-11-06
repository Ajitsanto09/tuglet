import { isSitePattern } from '../domain/sites';

/** Commands only this extension's own pages may send. */
export type AdminMessage =
  | { type: 'state' }
  | { type: 'create'; title: string; dueAt: number }
  | { type: 'edit'; id: string; revision: number; title: string; dueAt: number }
  | { type: 'delete'; id: string }
  | { type: 'snooze' | 'complete'; id: string; revision: number; opId: string }
  | { type: 'undo'; id: string; revision: number }
  | { type: 'settings'; patch: Record<string, unknown> }
  | { type: 'enableSite'; pattern: string; tabId?: number }
  | { type: 'disableSite'; pattern: string }
  | { type: 'siteTitles'; pattern: string; showTitles: boolean }
  | { type: 'showOnPage'; tabId: number }
  | { type: 'import'; text: string }
  | { type: 'reset' };

/** The only commands a page widget may send. */
export type PageMessage =
  | { type: 'view' }
  | { type: 'act'; action: 'snooze' | 'complete'; id: string; occurrenceId: string; revision: number; opId: string }
  | { type: 'pageUndo'; id: string; revision: number }
  | { type: 'presented'; id: string; key: string };

export const MAX_MESSAGE_CHARS = 8 * 1024;
const MAX_IMPORT_MESSAGE_CHARS = 300 * 1024;

const str = (v: unknown, max = 64) => typeof v === 'string' && v.length > 0 && v.length <= max;
const id = (v: unknown) => typeof v === 'string' && /^[\w-]{1,64}$/.test(v);
const int = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const keys = (m: Record<string, unknown>, allowed: string[]) => Object.keys(m).every((k) => allowed.includes(k));

function size(m: unknown): number {
  try { return JSON.stringify(m)?.length ?? Infinity; } catch { return Infinity; }
}

export function parseAdmin(m: unknown): AdminMessage | null {
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  const limit = o.type === 'import' ? MAX_IMPORT_MESSAGE_CHARS : MAX_MESSAGE_CHARS;
  if (size(m) > limit) return null;
  const ok = (allowed: string[], valid: boolean) => (valid && keys(o, ['type', ...allowed]) ? (o as unknown as AdminMessage) : null);
  switch (o.type) {
    case 'state': case 'reset': return ok([], true);
    case 'create': return ok(['title', 'dueAt'], typeof o.title === 'string' && o.title.length <= 1000 && typeof o.dueAt === 'number');
    case 'edit': return ok(['id', 'revision', 'title', 'dueAt'], id(o.id) && int(o.revision) && typeof o.title === 'string' && o.title.length <= 1000 && typeof o.dueAt === 'number');
    case 'delete': return ok(['id'], id(o.id));
    case 'snooze': case 'complete': return ok(['id', 'revision', 'opId'], id(o.id) && int(o.revision) && str(o.opId));
    case 'undo': return ok(['id', 'revision'], id(o.id) && int(o.revision));
    case 'settings': return ok(['patch'], typeof o.patch === 'object' && o.patch !== null && !Array.isArray(o.patch));
    case 'enableSite': return ok(['pattern', 'tabId'], isSitePattern(o.pattern) && (o.tabId === undefined || int(o.tabId)));
    case 'disableSite': return ok(['pattern'], isSitePattern(o.pattern));
    case 'siteTitles': return ok(['pattern', 'showTitles'], isSitePattern(o.pattern) && typeof o.showTitles === 'boolean');
    case 'showOnPage': return ok(['tabId'], int(o.tabId));
    case 'import': return ok(['text'], typeof o.text === 'string');
    default: return null;
  }
}

export function parsePage(m: unknown): PageMessage | null {
  if (typeof m !== 'object' || m === null || Array.isArray(m) || size(m) > 1024) return null;
  const o = m as Record<string, unknown>;
  const ok = (allowed: string[], valid: boolean) => (valid && keys(o, ['type', ...allowed]) ? (o as unknown as PageMessage) : null);
  switch (o.type) {
    case 'view': return ok([], true);
    case 'act': return ok(['action', 'id', 'occurrenceId', 'revision', 'opId'],
      (o.action === 'snooze' || o.action === 'complete') && id(o.id) && id(o.occurrenceId) && int(o.revision) && str(o.opId));
    case 'pageUndo': return ok(['id', 'revision'], id(o.id) && int(o.revision));
    case 'presented': return ok(['id', 'key'], id(o.id) && str(o.key, 100));
    default: return null;
  }
}

/** Messages the worker pushes to page widgets. */
export type ToPage = { type: 'tuglet:refresh' } | { type: 'tuglet:remove' };
