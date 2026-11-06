import { useEffect, useState, type FormEvent } from 'react';
import { useTuglet } from '../ui/api';
import { PullPreview } from '../ui/PullPreview';
import { dueQueue, upcoming } from '../domain/engine';
import { formatWhen, parseLocalInput, toLocalInput } from '../domain/time';
import { siteLabel, sitePatternFor } from '../domain/sites';
import { TITLE_MAX, UNDO_WINDOW_MS, type Reminder } from '../shared/types';

const QUICK = [5, 15, 30, 60];
type Errors = { title?: string; time?: string; form?: string };

function ReminderForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: { title: string; when: string };
  submitLabel: string;
  onSubmit: (title: string, dueAt: number, when: string) => Promise<Errors | null>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [when, setWhen] = useState(initial?.when ?? toLocalInput(Date.now() + 15 * 60_000));
  const [errors, setErrors] = useState<Errors>({});
  const parsed = when ? parseLocalInput(when) : null;
  const idp = submitLabel.replace(/\W/g, '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (!title.trim()) errs.title = 'Enter a title.';
    else if (title.trim().length > TITLE_MAX) errs.title = `Keep the title to ${TITLE_MAX} characters or fewer.`;
    if (!parsed) errs.time = 'Choose a date and time.';
    else if (!parsed.ok) errs.time = parsed.message;
    if (errs.title || errs.time || !parsed?.ok) { setErrors(errs); return; }
    const res = await onSubmit(title, parsed.at, when);
    setErrors(res ?? {});
    if (!res && !initial) { setTitle(''); setWhen(toLocalInput(Date.now() + 15 * 60_000)); }
  }

  return (
    <form onSubmit={submit} noValidate className="form">
      <label htmlFor={`${idp}-title`}>Reminder</label>
      <input id={`${idp}-title`} value={title} maxLength={TITLE_MAX + 20} onChange={(e) => setTitle(e.target.value)}
        aria-invalid={!!errors.title} aria-describedby={errors.title ? `${idp}-title-err` : undefined} placeholder="e.g. Check the release smoke test" />
      {errors.title && <p className="error" id={`${idp}-title-err`}>{errors.title}</p>}
      <label htmlFor={`${idp}-when`}>When</label>
      <input id={`${idp}-when`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
        aria-invalid={!!errors.time} aria-describedby={`${idp}-when-help${errors.time ? ` ${idp}-when-err` : ''}`} />
      <p className="muted small" id={`${idp}-when-help`}>
        {parsed?.ok ? `${formatWhen(parsed.at)}${parsed.ambiguous ? ' — this clock time happens twice today; Tuglet will use the first (offset shown).' : ''}` : 'Your computer’s time zone is used.'}
      </p>
      {errors.time && <p className="error" id={`${idp}-when-err`}>{errors.time}</p>}
      {!initial && (
        <div className="quick" role="group" aria-label="Quick times">
          {QUICK.map((m) => <button type="button" key={m} onClick={() => setWhen(toLocalInput(Date.now() + m * 60_000))}>In {m} min</button>)}
        </div>
      )}
      {errors.form && <p className="error" role="alert">{errors.form}</p>}
      <div className="row">
        <button type="submit" className="primary">{submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

const toErrors = (r: { ok: boolean; error?: string; message?: string }): Errors | null =>
  r.ok ? null : r.error === 'title' ? { title: r.message } : r.error === 'time' ? { time: r.message } : { form: r.message };

function SiteAccess({ sites, run }: { sites: { pattern: string }[]; run: ReturnType<typeof useTuglet>['run'] }) {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [granted, setGranted] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t ?? null), () => setTab(null)); }, []);
  const pattern = sitePatternFor(tab?.url);
  const enabled = !!pattern && sites.some((s) => s.pattern === pattern);
  useEffect(() => { if (pattern) chrome.permissions.contains({ origins: [pattern] }).then(setGranted, () => setGranted(false)); }, [pattern, enabled]);

  if (!tab || tab.id === undefined || !pattern) {
    return <p className="muted">{ 'Tuglet can’t appear on this page (Chrome pages, the Web Store, PDFs and local files are off-limits). Your reminders stay in this list and on the toolbar badge.' }</p>;
  }
  const host = siteLabel(pattern);
  if (enabled && granted) {
    return (
      <div>
        <p>Pip is on for <strong>{host}</strong>.</p>
        <button type="button" onClick={() => run({ type: 'disableSite', pattern }).then((r) => setNote(r.ok ? 'Turned off for this site.' : r.message))}>Turn off for this site</button>
        {note && <p className="muted" role="status">{note}</p>}
      </div>
    );
  }
  const always = async () => {
    // Must run directly in the click handler: Chrome only shows the prompt for a user gesture.
    const ok = await chrome.permissions.request({ origins: [pattern] }).catch(() => false);
    if (!ok) { setNote('Access not granted. Reminders still work here and on the badge; you can enable this site later.'); return; }
    const r = await run({ type: 'enableSite', pattern, tabId: tab.id });
    setNote(r.ok ? (r.warning ?? `Pip will appear on ${host}.`) : r.message);
  };
  const temporary = async () => {
    const r = await run({ type: 'showOnPage', tabId: tab.id! });
    setNote(r.ok ? 'Pip is on this page until you leave or reload it.' : r.message);
  };
  return (
    <div>
      <p className="muted small">Pip only appears on sites you choose. Without access, use this list and the badge.</p>
      <div className="stack">
        <button type="button" onClick={temporary}>Show on this page</button>
        <p className="muted small">Temporary: lasts until you leave or reload this page. No lasting access.</p>
        <button type="button" onClick={always}>Always allow on {host}</button>
        <p className="muted small">Chrome will ask you to allow Tuglet to “read and change” data on {host}. Tuglet uses this only to draw Pip on those pages; it never reads or sends page content. You can turn it off in Tuglet settings or Chrome.</p>
      </div>
      {note && <p className="muted" role="status">{note}</p>}
    </div>
  );
}

export function Popup() {
  const { state, error, now, run } = useTuglet();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  if (!state) return <main><h1>Tuglet</h1><p role={error ? 'alert' : undefined}>{error ?? 'Loading…'}</p></main>;

  const due = dueQueue(state);
  const next = upcoming(state);
  const lc = state.lastCompletion;
  const undoable = lc && now - lc.at < UNDO_WINDOW_MS ? state.reminders.find((r) => r.id === lc.id && r.revision === lc.revision) : undefined;
  const act = async (type: 'snooze' | 'complete', r: Reminder) => {
    const res = await run({ type, id: r.id, revision: r.revision, opId: crypto.randomUUID() });
    setActionError(res.ok ? '' : res.message);
  };

  return (
    <main>
      <header className="top">
        <h1>Tuglet</h1>
        <button type="button" className="link" onClick={() => chrome.runtime.openOptionsPage()}>Settings</button>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {actionError && <p className="error" role="alert">{actionError}</p>}

      {undoable && (
        <div className="banner" role="status">
          <span>Completed “{undoable.title}”.</span>
          <button type="button" onClick={() => run({ type: 'undo', id: undoable.id, revision: undoable.revision })}>Undo</button>
        </div>
      )}

      {due.length > 0 && (
        <section aria-labelledby="due-h">
          <h2 id="due-h">Due now ({due.length})</h2>
          <ul className="list">
            {due.map((r) => (
              <li key={r.id} className="item due">
                <div><strong>{r.title}</strong><div className="muted small">Due {formatWhen(r.effectiveDueAt)}</div></div>
                <div className="row">
                  <button type="button" onClick={() => act('snooze', r)} aria-label={`Snooze ${r.title} for ${state.settings.snoozeMinutes} minutes`}>Snooze {state.settings.snoozeMinutes} min</button>
                  <button type="button" className="primary" onClick={() => act('complete', r)} aria-label={`Complete ${r.title}`}>Complete</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="new-h">
        <h2 id="new-h">New reminder</h2>
        <ReminderForm submitLabel="Add reminder" onSubmit={async (title, dueAt) => toErrors(await run({ type: 'create', title, dueAt }))} />
        <button type="button" className="link" onClick={() => run({ type: 'create', title: 'Demo: Pip says hello', dueAt: Date.now() + 60_000 })}>
          Try a 1-minute demo reminder
        </button>
      </section>

      <section aria-labelledby="site-h">
        <h2 id="site-h">This page</h2>
        <SiteAccess sites={state.sites} run={run} />
      </section>

      <section aria-labelledby="up-h">
        <h2 id="up-h">Upcoming ({next.length})</h2>
        {next.length === 0 && <p className="muted">Nothing scheduled.</p>}
        <ul className="list">
          {next.map((r) => (
            <li key={r.id} className="item">
              {editing === r.id ? (
                <ReminderForm
                  initial={{ title: r.title, when: toLocalInput(r.effectiveDueAt) }}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (title, dueAt, when) => {
                    const unchanged = when === toLocalInput(r.effectiveDueAt);
                    const res = await run({ type: 'edit', id: r.id, revision: r.revision, title, dueAt: unchanged ? r.originalDueAt : dueAt });
                    if (res.ok) setEditing(null);
                    return toErrors(res);
                  }}
                />
              ) : (
                <>
                  <div><strong>{r.title}</strong><div className="muted small">{r.status === 'snoozed' ? 'Snoozed until ' : ''}{formatWhen(r.effectiveDueAt)}</div></div>
                  <div className="row">
                    <button type="button" onClick={() => setEditing(r.id)} aria-label={`Edit ${r.title}`}>Edit</button>
                    {confirmDelete === r.id ? (
                      <button type="button" className="danger" onClick={() => { void run({ type: 'delete', id: r.id }); setConfirmDelete(null); }}>Confirm delete</button>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelete(r.id)} aria-label={`Delete ${r.title}`}>Delete</button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <details>
        <summary>How pulling Pip works</summary>
        <PullPreview />
      </details>
    </main>
  );
}
