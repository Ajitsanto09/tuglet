import { describe, expect, it } from 'vitest';
import { classifyPull, COMPLETE_THRESHOLD_PX, MAX_STRETCH_PX, PullTracker, SNOOZE_THRESHOLD_PX, visualStretch } from '../../src/domain/gesture';
import { parseLocalInput, toLocalInput } from '../../src/domain/time';
import { isSitePattern, patternMatches, sitePatternFor } from '../../src/domain/sites';

describe('pull classification', () => {
  it('uses the documented thresholds', () => {
    expect([SNOOZE_THRESHOLD_PX, COMPLETE_THRESHOLD_PX, MAX_STRETCH_PX]).toEqual([24, 120, 180]);
  });
  it.each([
    [-50, null], [0, null], [23.9, null], [24, 'snooze'], [119.9, 'snooze'], [120, 'complete'], [500, 'complete'], [NaN, null],
  ])('%s px → %s', (dy, action) => expect(classifyPull(dy)).toBe(action));
  it('clamps visual stretch', () => {
    expect(visualStretch(-10)).toBe(0);
    expect(visualStretch(400)).toBe(MAX_STRETCH_PX);
  });
  it('final release position decides after crossing then retreating', () => {
    const t = new PullTracker();
    t.start(1, 100);
    expect(t.move(1, 260)?.armed).toBe('complete');
    expect(t.move(1, 150)?.armed).toBe('snooze');
    expect(t.end(1, 150)).toBe('snooze');
    expect(t.active).toBe(false);
  });
  it('ignores other pointers and cancellation commits nothing', () => {
    const t = new PullTracker();
    t.start(1, 0);
    expect(t.move(2, 300)).toBeNull();
    expect(t.end(2, 300)).toBeUndefined();
    expect(t.active).toBe(true);
    t.cancel();
    expect(t.end(1, 300)).toBeUndefined();
  });
});

describe('local time (America/New_York)', () => {
  it('round-trips ordinary times', () => {
    const r = parseLocalInput('2026-11-06T10:15');
    expect(r).toMatchObject({ ok: true, ambiguous: false, offset: 'UTC-05:00' });
    if (r.ok) expect(toLocalInput(r.at)).toBe('2026-11-06T10:15');
  });
  it('rejects nonexistent spring-forward time', () => {
    expect(parseLocalInput('2026-03-08T02:30')).toMatchObject({ ok: false });
  });
  it('flags ambiguous fall-back time and picks the first instant', () => {
    const r = parseLocalInput('2026-11-01T01:30');
    expect(r).toMatchObject({ ok: true, ambiguous: true, offset: 'UTC-04:00' });
    if (r.ok) expect(r.at).toBe(Date.UTC(2026, 10, 1, 5, 30));
  });
  it('rejects malformed input', () => {
    expect(parseLocalInput('2026-02-30T10:00').ok).toBe(false);
    expect(parseLocalInput('tomorrow').ok).toBe(false);
  });
});

describe('site match patterns', () => {
  it.each([
    ['https://example.com/path?q=1', 'https://example.com/*'],
    ['http://localhost:5173/app', 'http://localhost/*'],
    ['https://Sub.Example.com/', 'https://sub.example.com/*'],
    ['http://127.0.0.1:8080/', 'http://127.0.0.1/*'],
    ['http://[::1]:3000/', 'http://[::1]/*'],
  ])('%s → %s', (url, pattern) => expect(sitePatternFor(url)).toBe(pattern));
  it.each(['chrome://extensions', 'file:///tmp/a.html', 'https://chromewebstore.google.com/detail/x', 'chrome-extension://abc/popup.html', 'not a url', undefined])(
    'refuses %s', (url) => expect(sitePatternFor(url)).toBeNull());
  it('never widens to subdomains or other schemes', () => {
    expect(patternMatches('https://example.com/*', 'https://evil.example.com/')).toBe(false);
    expect(patternMatches('https://example.com/*', 'http://example.com/')).toBe(false);
    expect(patternMatches('https://example.com/*', 'https://example.com:8443/x')).toBe(true);
  });
  it('validates stored patterns', () => {
    expect(isSitePattern('https://example.com/*')).toBe(true);
    expect(isSitePattern('https://*/*')).toBe(false);
    expect(isSitePattern('<all_urls>')).toBe(false);
    expect(isSitePattern('https://*.example.com/*')).toBe(false);
  });
});
