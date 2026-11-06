import { useCallback, useEffect, useState } from 'react';
import type { AdminMessage } from '../shared/messages';
import type { AdminResponse } from '../background/service';
import type { State } from '../shared/types';

export async function send(m: AdminMessage): Promise<AdminResponse> {
  try {
    return (await chrome.runtime.sendMessage(m)) ?? { ok: false, error: 'internal', message: 'Tuglet did not respond. Try again.' };
  } catch {
    return { ok: false, error: 'internal', message: 'Tuglet did not respond. Try again.' };
  }
}

/** Authoritative state from the worker, refreshed whenever storage changes. */
export function useTuglet() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const apply = useCallback((r: AdminResponse) => {
    if (r.state) setState(r.state);
    if (r.now) setNow(r.now);
    if (!r.ok && !r.state) setError(r.message);
    else if (r.state) setError(null);
    return r;
  }, []);

  const run = useCallback(async (m: AdminMessage) => apply(await send(m)), [apply]);

  useEffect(() => {
    void run({ type: 'state' });
    const onChange = (_: unknown, area: string) => { if (area === 'local') void run({ type: 'state' }); };
    chrome.storage.onChanged.addListener(onChange);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { chrome.storage.onChanged.removeListener(onChange); clearInterval(tick); };
  }, [run]);

  return { state, error, now, run };
}

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
