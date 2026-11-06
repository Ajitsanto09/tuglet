const BLOCKED_HOSTS = new Set(['chromewebstore.google.com', 'chrome.google.com']);

/**
 * Chrome match pattern for exactly this page's scheme and host (any port, no
 * subdomains), or null when Tuglet cannot run there.
 */
export function sitePatternFor(url: string | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname || BLOCKED_HOSTS.has(u.hostname)) return null;
  const host = u.hostname.startsWith('[') ? u.hostname : u.hostname.toLowerCase();
  return `${u.protocol}//${host}/*`;
}

/** True when `url` falls under a pattern produced by sitePatternFor. */
export function patternMatches(pattern: string, url: string | undefined): boolean {
  return sitePatternFor(url) === pattern;
}

export function isSitePattern(p: unknown): p is string {
  return typeof p === 'string' && p.length <= 300 && /^https?:\/\/[^/*\s]+\/\*$/.test(p) && sitePatternFor(p.slice(0, -1)) === p;
}

export const siteLabel = (pattern: string) => pattern.replace(/\/\*$/, '');
