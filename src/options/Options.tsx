import { useEffect, useRef, useState } from 'react';
import { downloadText, useTuglet } from '../ui/api';
import { exportJson, MAX_IMPORT_BYTES } from '../domain/schema';
import { formatWhen } from '../domain/time';
import { siteLabel } from '../domain/sites';
import { SNOOZE_CHOICES, type Settings } from '../shared/types';

export function Options() {
  const { state, error, now, run } = useTuglet();
  const [note, setNote] = useState('');
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [alsoRevoke, setAlsoRevoke] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const sitesKey = state?.sites.map((s) => s.pattern).join('|') ?? '';
  useEffect(() => {
    if (!state) return;
    void Promise.all(state.sites.map(async (s) => [s.pattern, await chrome.permissions.contains({ origins: [s.pattern] })] as const))
      .then((pairs) => setGranted(Object.fromEntries(pairs)));
  }, [sitesKey]);

  if (!state) return <main><h1>Tuglet settings</h1><p role={error ? 'alert' : undefined}>{error ?? 'Loading…'}</p></main>;

  const set = async (patch: Partial<Settings>) => {
    const r = await run({ type: 'settings', patch });
    setNote(r.ok ? 'Saved.' : r.message);
  };

  const toggleNotifications = async (on: boolean) => {
    if (on && !(await chrome.permissions.request({ permissions: ['notifications'] }).catch(() => false))) {
      setNote('Notifications were not allowed. The badge and popup still show due reminders.');
      return;
    }
    if (!on) await chrome.permissions.remove({ permissions: ['notifications'] }).catch(() => false);
    await set({ notifications: on });
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { setNote('That file is larger than 256 KB.'); return; }
    if (!confirm('Importing replaces your current reminders and settings. Continue?')) return;
    const r = await run({ type: 'import', text: await file.text() });
    setNote(r.ok ? 'Imported.' : r.message);
    if (fileRef.current) fileRef.current.value = '';
  };

  const reset = async () => {
    const patterns = state.sites.map((s) => s.pattern);
    const r = await run({ type: 'reset' });
    if (r.ok && alsoRevoke && patterns.length) await chrome.permissions.remove({ origins: patterns }).catch(() => false);
    if (r.ok) await chrome.permissions.remove({ permissions: ['notifications'] }).catch(() => false);
    setConfirmReset(false);
    setNote(r.ok ? 'All Tuglet data was removed.' : r.message);
  };

  const completed = state.reminders.filter((r) => r.status === 'completed').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const s = state.settings;

  return (
    <main className="options">
      <h1>Tuglet settings</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted" role="status" aria-live="polite">{note}</p>

      <section aria-labelledby="pip-h">
        <h2 id="pip-h">Pip on pages</h2>
        <label className="field">Side of the page
          <select value={s.position} onChange={(e) => set({ position: e.target.value as Settings['position'] })}>
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </label>
        <label className="field">Snooze length
          <select value={s.snoozeMinutes} onChange={(e) => set({ snoozeMinutes: Number(e.target.value) as Settings['snoozeMinutes'] })}>
            {SNOOZE_CHOICES.map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={s.pauseAnimation} onChange={(e) => set({ pauseAnimation: e.target.checked })} /> Pause animation (Pip stays still; your system “reduce motion” setting is also respected)</label>
      </section>

      <section aria-labelledby="sites-h">
        <h2 id="sites-h">Sites where Pip appears</h2>
        {state.sites.length === 0 && <p className="muted">None yet. Open the Tuglet toolbar popup on a page to enable it.</p>}
        <ul className="list">
          {state.sites.map((site) => (
            <li key={site.pattern} className="item">
              <div>
                <strong>{siteLabel(site.pattern)}</strong>
                <div className="muted small">{granted[site.pattern] ? 'Chrome access granted' : 'Chrome access missing: Pip will not appear until you re-enable it from the popup.'}</div>
                <label className="check"><input type="checkbox" checked={site.showTitles} onChange={(e) => run({ type: 'siteTitles', pattern: site.pattern, showTitles: e.target.checked })} />
                  Show reminder titles on this site (otherwise Pip just says “A reminder is due”). The site’s own scripts could read what is shown.</label>
              </div>
              <div className="row">
                <button type="button" onClick={() => run({ type: 'disableSite', pattern: site.pattern })}>Turn off</button>
                <button type="button" onClick={async () => { await run({ type: 'disableSite', pattern: site.pattern }); await chrome.permissions.remove({ origins: [site.pattern] }).catch(() => false); setNote('Turned off and removed Chrome access.'); }}>Turn off and remove access</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="notif-h">
        <h2 id="notif-h">System notifications (optional)</h2>
        <label className="check"><input type="checkbox" checked={s.notifications} onChange={(e) => toggleNotifications(e.target.checked)} /> Also show a silent system notification when a reminder becomes due</label>
        <label className="check"><input type="checkbox" disabled={!s.notifications} checked={s.notificationTitles} onChange={(e) => set({ notificationTitles: e.target.checked })} /> Include the reminder title (otherwise: “A Tuglet reminder is due.”)</label>
        <p className="muted small">If your operating system blocks notifications or is in Do Not Disturb, the badge and popup still work.</p>
      </section>

      <section aria-labelledby="hist-h">
        <h2 id="hist-h">Completed ({completed.length})</h2>
        <p className="muted small">Tuglet keeps the 100 most recent completed reminders on this device, then drops the oldest.</p>
        <ul className="list">
          {completed.slice(0, 20).map((r) => (
            <li key={r.id} className="item">
              <div><strong>{r.title}</strong><div className="muted small">Completed {formatWhen(r.completedAt ?? now)}</div></div>
              <button type="button" onClick={() => run({ type: 'delete', id: r.id })} aria-label={`Delete ${r.title} from history`}>Delete</button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="data-h">
        <h2 id="data-h">Your data</h2>
        <p className="muted small">Reminders and settings are stored only in this Chrome profile on this device. Tuglet has no account, server, analytics or sync, and makes no network requests.</p>
        <div className="row">
          <button type="button" onClick={() => downloadText(`tuglet-export-${new Date(now).toISOString().slice(0, 10)}.json`, exportJson(state, now))}>Export reminders</button>
          <label className="button">Import reminders…
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr" onChange={(e) => importFile(e.target.files?.[0])} />
          </label>
        </div>
        {!confirmReset ? (
          <button type="button" className="danger" onClick={() => setConfirmReset(true)}>Reset all Tuglet data…</button>
        ) : (
          <div className="banner" role="group" aria-label="Confirm reset">
            <p>This deletes all reminders, history, settings and enabled sites, and removes Pip from open pages.</p>
            <label className="check"><input type="checkbox" checked={alsoRevoke} onChange={(e) => setAlsoRevoke(e.target.checked)} /> Also remove the site access you granted in Chrome</label>
            <div className="row">
              <button type="button" className="danger" onClick={reset}>Delete everything</button>
              <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
