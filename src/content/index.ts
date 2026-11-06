import css from './widget.css';
import { buildCharacter, characterName } from '../shared/pip';
import { PullTracker } from '../domain/gesture';
import type { PageMessage } from '../shared/messages';
import type { PageView } from '../shared/types';

type Due = NonNullable<PageView['due']>;
type Handle = { refresh(): void };
const FLAG = '__tugletWidget';
const g = globalThis as typeof globalThis & { [FLAG]?: Handle };

// Re-injection (registered script + activeTab, or repeated clicks) reuses the single mounted widget.
if (g[FLAG]) g[FLAG].refresh();
else g[FLAG] = mount();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function mount(): Handle {
  const ac = new AbortController();
  const on = { signal: ac.signal };
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, f: () => void) => { const t = setTimeout(() => { timers.delete(t); f(); }, ms); timers.add(t); return t; };

  const host = document.createElement('tuglet-overlay');
  const hostStyle: [string, string][] = [['all', 'initial'], ['display', 'block'], ['position', 'fixed'], ['top', '0'], ['left', '0'],
    ['width', '0'], ['height', '0'], ['overflow', 'visible'], ['z-index', '2147483647'], ['pointer-events', 'none']];
  for (const [k, v] of hostStyle) host.style.setProperty(k, v, 'important');
  const root = host.attachShadow({ mode: 'open' }) // open so tests can inspect it; Shadow DOM is not a security boundary either way;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [sheet];

  const wrap = el('div', 'wrap'); wrap.hidden = true;
  const hang = el('div', 'hang');
  const rope = el('div', 'rope');
  const pip = el('div', 'pip');
  pip.tabIndex = 0;
  pip.setAttribute('role', 'button');
  const dot = el('span', 'dot', '!'); dot.setAttribute('aria-hidden', 'true');
  const armed = el('span', 'armed'); armed.hidden = true; armed.setAttribute('aria-hidden', 'true');
  pip.append(buildCharacter(), dot, armed);
  hang.append(rope, pip);

  const panel = el('div', 'panel');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Tuglet reminder');
  const dueBox = el('div');
  const msg = el('p', 'msg');
  const count = el('p', 'count');
  const hint = el('p', 'hint', `Pull ${characterName} down a little to snooze, or all the way to complete.`);
  const actions = el('div', 'actions');
  const btnSnooze = el('button', 'primary');
  const btnComplete = el('button', 'primary', 'Complete');
  btnComplete.setAttribute('aria-label', 'Complete this reminder');
  const btnHide = el('button', undefined, 'Hide');
  btnHide.setAttribute('aria-label', 'Hide reminder controls (does not complete it)');
  for (const b of [btnSnooze, btnComplete, btnHide]) b.type = 'button';
  actions.append(btnSnooze, btnComplete, btnHide);
  dueBox.append(msg, count, hint, actions);
  const statusRow = el('div', 'status-row');
  const status = el('p', 'status');
  const btnUndo = el('button', undefined, 'Undo');
  btnUndo.type = 'button';
  btnUndo.setAttribute('aria-label', 'Undo completion');
  statusRow.append(status, btnUndo);
  panel.append(dueBox, statusRow);
  const live = el('div', 'sr');
  live.setAttribute('aria-live', 'polite');
  wrap.append(hang, panel, live);
  root.append(wrap);
  document.documentElement.append(host);

  let view: PageView | null = null;
  let collapsed = false;
  let saving = false;
  let announcedKey = '';
  let statusUntil = 0;
  let undoTarget: { id: string; revision: number } | null = null;
  let pinned: Due | null = null;
  let suppressClickUntil = 0;
  let dragMoved = false;
  let alive = true;
  const tracker = new PullTracker();

  async function call(m: PageMessage): Promise<{ ok: boolean; view?: PageView; message?: string } | null> {
    if (!alive) return null;
    try { return await chrome.runtime.sendMessage(m); } catch {
      if (!chrome.runtime?.id) teardown(); // extension reloaded or removed: this copy is orphaned
      return null;
    }
  }

  async function refresh() {
    const r = await call({ type: 'view' });
    if (!r?.ok || !r.view) return;
    if (r.view.remove) { teardown(); return; }
    view = r.view;
    render();
  }

  const statusActive = () => Date.now() < statusUntil;

  function setStatus(text: string, ms: number, undo: { id: string; revision: number } | null = null) {
    status.textContent = text;
    undoTarget = undo;
    btnUndo.hidden = !undo;
    statusUntil = Date.now() + ms;
    later(ms + 20, render);
  }

  function render() {
    if (!alive || !view) return;
    const showStatus = statusActive();
    const show = (view.visible || showStatus) && view.active && document.visibilityState === 'visible' && !document.fullscreenElement;
    wrap.hidden = !show;
    if (!show) { cancelDrag(); return; }
    wrap.classList.toggle('left', view.position === 'left');
    wrap.classList.toggle('still', !view.motion);
    const due = view.due;
    if (pinned && (!due || due.id !== pinned.id || due.revision !== pinned.revision)) cancelDrag();
    wrap.dataset.state = due ? 'due' : 'idle';
    dot.textContent = view.dueCount > 9 ? '9+' : '!';
    if (due) {
      if (due.key !== announcedKey && due.swing) collapsed = false;
      msg.textContent = due.label; // textContent only: titles are plain text
      count.textContent = view.dueCount > 1 ? `1 of ${view.dueCount} due` : '';
      count.hidden = view.dueCount < 2;
      btnSnooze.textContent = `Snooze ${view.snoozeMinutes} min`;
      btnSnooze.setAttribute('aria-label', `Snooze this reminder for ${view.snoozeMinutes} minutes`);
      pip.setAttribute('aria-label', `${characterName}: a reminder is due. ${collapsed ? 'Show' : 'Hide'} controls`);
      pip.setAttribute('aria-expanded', String(!collapsed));
    } else {
      pip.setAttribute('aria-label', `${characterName}: a reminder is scheduled`);
      pip.removeAttribute('aria-expanded');
    }
    dueBox.hidden = !due || collapsed;
    statusRow.hidden = !showStatus;
    panel.hidden = dueBox.hidden && statusRow.hidden;
    for (const b of [btnSnooze, btnComplete]) b.disabled = saving;

    if (due && due.swing && due.key !== announcedKey) {
      announcedKey = due.key;
      live.textContent = view.dueCount > 1 ? `Tuglet: a reminder is due (${view.dueCount} due).` : 'Tuglet: a reminder is due.';
      if (view.motion) animate('swing', 4900);
      void call({ type: 'presented', id: due.id, key: due.key });
    }
  }

  function animate(cls: 'swing' | 'bounce' | 'settle', ms: number) {
    hang.classList.remove('swing', 'bounce', 'settle');
    void hang.offsetWidth; // restart the CSS animation
    hang.classList.add(cls);
    later(ms, () => hang.classList.remove(cls));
  }

  async function act(action: 'snooze' | 'complete', target: Due) {
    if (saving) return;
    saving = true;
    render();
    const r = await call({ type: 'act', action, id: target.id, occurrenceId: target.occurrenceId, revision: target.revision, opId: crypto.randomUUID() });
    saving = false;
    if (r?.ok) {
      if (action === 'complete') {
        setStatus('Completed.', 10_000, { id: target.id, revision: target.revision + 1 });
        live.textContent = 'Reminder completed. Undo is available for 10 seconds.';
        if (view?.motion) animate('bounce', 650);
      } else {
        setStatus(`Snoozed for ${view?.snoozeMinutes ?? 5} minutes.`, 4000);
        live.textContent = status.textContent;
        if (view?.motion) animate('settle', 450);
      }
    } else {
      setStatus(r?.message ?? 'Tuglet could not save that. Try again.', 6000);
      live.textContent = status.textContent;
    }
    await refresh();
    render();
  }

  function setStretch(px: number) { wrap.style.setProperty('--stretch', `${px}px`); }

  function cancelDrag() {
    if (tracker.active) tracker.cancel();
    pinned = null;
    wrap.classList.remove('dragging');
    armed.hidden = true;
    setStretch(0);
  }

  pip.addEventListener('pointerdown', (e) => {
    if (!view?.due || saving || e.button !== 0 || tracker.active) return;
    tracker.start(e.pointerId, e.clientY);
    dragMoved = false;
    pinned = { ...view.due };
    try { pip.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    wrap.classList.add('dragging');
    e.preventDefault();
  }, on);
  pip.addEventListener('pointermove', (e) => {
    const m = tracker.move(e.pointerId, e.clientY);
    if (!m) return;
    if (Math.abs(m.dy) > 5) dragMoved = true;
    setStretch(m.stretch);
    armed.hidden = !m.armed;
    armed.textContent = m.armed === 'complete' ? 'Release to complete' : m.armed === 'snooze' ? `Release to snooze ${view?.snoozeMinutes ?? 5} min` : '';
  }, on);
  pip.addEventListener('pointerup', (e) => {
    const target = pinned;
    const action = tracker.end(e.pointerId, e.clientY);
    if (action === undefined) return; // another pointer: ignore
    cancelDrag();
    suppressClickUntil = performance.now() + 400;
    if (action && target) void act(action, target);
  }, on);
  pip.addEventListener('pointercancel', () => cancelDrag(), on);
  pip.addEventListener('lostpointercapture', () => { if (tracker.active) cancelDrag(); }, on);
  pip.addEventListener('click', () => {
    // Ignore the click synthesized after a drag, including one cancelled with Escape.
    if (dragMoved || performance.now() < suppressClickUntil || !view?.due) { dragMoved = false; return; }
    collapsed = !collapsed;
    render();
  }, on);
  pip.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && view?.due) { e.preventDefault(); collapsed = !collapsed; render(); }
  }, on);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tracker.active) { e.preventDefault(); e.stopPropagation(); cancelDrag(); }
  }, { capture: true, signal: ac.signal });

  btnSnooze.addEventListener('click', () => { if (view?.due) void act('snooze', view.due); }, on);
  btnComplete.addEventListener('click', () => { if (view?.due) void act('complete', view.due); }, on);
  btnHide.addEventListener('click', () => { collapsed = true; render(); pip.focus(); }, on);
  btnUndo.addEventListener('click', async () => {
    if (!undoTarget) return;
    const r = await call({ type: 'pageUndo', ...undoTarget });
    setStatus(r?.ok ? 'Restored. The reminder is due again.' : (r?.message ?? 'Could not undo.'), 4000);
    live.textContent = status.textContent;
    await refresh();
  }, on);

  document.addEventListener('visibilitychange', () => { cancelDrag(); if (document.visibilityState === 'visible') void refresh(); else render(); }, on);
  document.addEventListener('fullscreenchange', () => render(), on);
  window.addEventListener('blur', () => cancelDrag(), on);
  window.addEventListener('focus', () => void refresh(), on);
  window.addEventListener('pageshow', (e) => { if (e.persisted) void refresh(); }, on);

  const onMessage = (m: unknown, sender: chrome.runtime.MessageSender) => {
    if (sender.id !== chrome.runtime.id || typeof m !== 'object' || m === null) return;
    const type = (m as { type?: unknown }).type;
    if (type === 'tuglet:refresh') void refresh();
    else if (type === 'tuglet:remove') teardown();
  };
  chrome.runtime.onMessage.addListener(onMessage);

  function teardown() {
    if (!alive) return;
    alive = false;
    cancelDrag();
    ac.abort();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch { /* orphaned context */ }
    host.remove();
    if (g[FLAG] === handle) delete g[FLAG];
  }

  const handle: Handle = { refresh: () => void refresh() };
  void refresh();
  return handle;
}
