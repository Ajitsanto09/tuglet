export type LocalParse =
  | { ok: true; at: number; ambiguous: boolean; offset: string }
  | { ok: false; message: string };

const pad = (n: number) => String(n).padStart(2, '0');

/** "+05:30"-style offset of the system timezone at an instant. */
export function offsetLabel(at: number): string {
  const m = -new Date(at).getTimezoneOffset();
  const sign = m >= 0 ? '+' : '-';
  return `UTC${sign}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;
}

/** Value for <input type="datetime-local"> in the system timezone. */
export function toLocalInput(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Parses "YYYY-MM-DDTHH:mm" as system-local time. Rejects nonexistent
 * daylight-saving times by round-trip; flags ambiguous (repeated) times.
 */
export function parseLocalInput(value: string): LocalParse {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return { ok: false, message: 'Choose a valid date and time.' };
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const at = new Date(y, mo - 1, d, h, mi).getTime();
  if (Number.isNaN(at) || toLocalInput(at) !== value)
    return { ok: false, message: 'That local time does not exist (for example during a daylight-saving change). Choose another time.' };
  // JS picks the earlier instant for a repeated local time; detect the later twin.
  const ambiguous = toLocalInput(at + 3600_000) === value || toLocalInput(at - 3600_000) === value;
  return { ok: true, at, ambiguous, offset: offsetLabel(at) };
}

export function formatWhen(at: number): string {
  const s = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(at);
  return `${s} (${offsetLabel(at)})`;
}
