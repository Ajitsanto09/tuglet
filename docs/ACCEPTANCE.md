# Acceptance record: Tuglet 0.1.0

Recorded 6 November 2026 on macOS 15.7.9 (Apple Silicon), Node 22.22.2, npm 10.9.7.

| Browser | Version | How it was used |
| --- | --- | --- |
| Playwright Chromium | 156.0.8078.4 (Playwright 1.64.1) | Full automated E2E suite, disposable profiles |
| Google Chrome | 157.0.8103.38 | `scripts/chrome-smoke.mjs`: load unpacked, create, due via worker, badge |
| Windows / Linux Chrome | — | **Not run** (no machine available). CI workflow runs the automated suite on Ubuntu once pushed. |

Chrome documentation re-checked the same day: alarms (re-create important alarms at startup; at most once per second), storage (`setAccessLevel` applies to `storage.local`; 10 MB quota), scripting (`registerContentScripts` Chrome 96+), Web Store distribution (all visibilities reviewed; unlisted is URL-accessible).

## Commands and results (clean run from `npm ci`)

| Command | Result |
| --- | --- |
| `npm ci` | OK |
| `npm run lint` | OK, 0 problems (after removing two unused test imports found in this run) |
| `npm run typecheck` | OK (after fixing two test-only `unknown` types found in this run; re-run exit 0) |
| `npm test -- --run` | 88/88 passed (3 files) |
| `npm run build` | OK (4 bundles, no source maps) |
| `npm run test:e2e` | 24/24 passed (1.8 min) |
| `npm run package` | `release/tuglet-0.1.0.zip`, SHA-256 `96b991880670e2983f66ba9bcabb0c78562e57aac0d8c9e7f3345fd163179dc6` |
| `npm run verify:package` | Static checks passed (14 files); extraction loaded in place, 6/6 smoke+access tests passed |
| `node scripts/chrome-smoke.mjs dist` | Passed in Google Chrome 157 (created → due, badge "1") |

`unzip -t` and `shasum -a 256` independently agree with the archive and `SHA256SUMS`.

## Domain and worker tests (`tests/unit`)

| Area | Status | Evidence |
| --- | --- | --- |
| Creation validation, trimming, 120-char limit, capacity 500, past/invalid times | Pass | engine.test.ts "create validation" |
| Scheduled → Due → Snoozed → Due → Completed → Undo; undo stale/expired | Pass | engine.test.ts "lifecycle" |
| Edit reschedules + invalidates stale commands; title-only edit; delete cannot be resurrected | Pass | engine.test.ts |
| Duplicate op ID, stale revision, two-tab double completion | Pass | engine.test.ts "idempotence" |
| Ordering by due time, creation, ID; attention key not replayed; catch-up in one pass; history cap 100 | Pass | engine.test.ts |
| Pull thresholds 23.9/24/119.9/120, negative, NaN, clamp, cross-and-retreat, other pointer, cancel | Pass | gesture-time-sites.test.ts |
| Local time round-trip, nonexistent DST time rejected, ambiguous DST time flagged with offset | Pass | gesture-time-sites.test.ts (America/New_York) |
| Match patterns: ports, case, IPv6, no subdomain widening, refused schemes/Web Store | Pass | gesture-time-sites.test.ts |
| Persist-before-confirm; failed write → error, no change | Pass | service.test.ts |
| Fresh worker from storage: overdue → due, badge, alarms; stale alarm harmless | Pass | service.test.ts |
| Concurrent acknowledgements serialize to one transition | Pass | service.test.ts |
| Notification failure keeps Due; not repeated | Pass | service.test.ts |
| Enabled preference AND Chrome grant required; revoke/disable cleanup; temp grant bound to tab+origin; subframe/prerender/other-origin rejected | Pass | service.test.ts |
| Generic page text by default; titles only after opt-in | Pass | service.test.ts |
| Unsupported newer schema never overwritten; corrupt/oversized/prototype-key/future-version import rejected without data loss; export round-trip | Pass | service.test.ts |
| Message allowlists: admin vs page commands, sizes, enums | Pass | service.test.ts |

## Real-extension E2E (`tests/e2e`, production build)

| Scenario | Status | Evidence / notes |
| --- | --- | --- |
| Fresh install: only storage/alarms/scripting/activeTab; no origins, no registered or static content scripts | Pass | access.spec.ts |
| No site grant: nothing injected, `enableSite` refused, popup lists due, badge counts, popup Complete works | Pass | access.spec.ts |
| Temporary page grant via the **real popup** (toolbar action triggered over CDP = genuine activeTab) | Pass | access.spec.ts, smoke.spec.ts |
| Re-injection keeps one widget; reload ends temporary access; second site gets nothing | Pass | access.spec.ts |
| Content script cannot read `storage.local`; admin/oversized/unknown page messages rejected; view never contains titles | Pass | access.spec.ts |
| No extension-initiated network requests during flows | Pass | access.spec.ts (page/extension-page requests observed; worker fetches not separately captured, CSP `connect-src 'none'` covers extension pages) |
| Enable current site via the real popup → only `http://localhost/*` registered; works immediately and after reload | Pass* | widget.spec.ts |
| Due with popup closed → Due, badge, swing < 5 s, not replayed on reload; reduced motion = no animation | Pass | widget.spec.ts |
| Pull boundaries 23/24/119/120 px, cross-then-retreat, success after worker confirmation, Undo | Pass | widget.spec.ts |
| Cancel: Escape, pointercancel, lostpointercapture, window blur → unchanged | Pass | widget.spec.ts |
| Buttons by keyboard (Enter/Space), polite announcement | Pass | widget.spec.ts |
| Multiple due: stable order, "1 of 3", advances after acting, badge | Pass | widget.spec.ts |
| Two tabs: only selected tab presents; stale acknowledgement rejected | Pass | widget.spec.ts |
| Turn off in Tuglet while Chrome still grants: widget removed mid-drag, registration removed, no reinjection, task unchanged | Pass* | widget.spec.ts |
| Revoke in Chrome's extension settings: widget removed, no reinjection, badge still works | Pass* | widget.spec.ts (`developerPrivate.removeHostPermission`) |
| Strict CSP + hostile CSS: widget correct size, no CSP errors, page styles and buttons unaffected | Pass | widget.spec.ts |
| HTML-like title (incl. after import) is plain text; no markup executed | Pass | widget.spec.ts, service.test.ts |
| SPA pushState + body re-render: one widget | Pass | widget.spec.ts |
| Storage quota full: visible error, no false completion, retry succeeds | Pass | widget.spec.ts |
| Export → reset (clears data, alarms, registrations, widget) → corrupt import rejected → import restores | Pass | widget.spec.ts |
| Real `chrome.alarms` delivery after the worker was stopped via DevTools Protocol (20 s reminder) | Pass | recovery.spec.ts |
| Close/reopen browser with same profile: catch-up, persisted registration, settings retained | Pass | recovery.spec.ts |
| In-place upgrade (0.1.0 → 0.1.1 via Reload): data kept, orphaned widget removes itself, refresh restores | Pass | recovery.spec.ts |
| Extracted release ZIP loaded in place: smoke + access suites | Pass | verify-package.mjs |
| Light/dark screenshots of idle, due, pulling states | Done | docs/screenshots/ |

\* Chrome's permission prompt cannot be clicked by automation. These tests load a temporary copy of the build with a test-only required `http://localhost/*` grant so the popup's request succeeds without a prompt. The prompt itself and the "deny" answer are manual checks below. The shipped manifest is untouched and is verified by `verify:package`.

## Manual checks still to do (unverified)

Run these on real Chrome on macOS **and** Windows with the release ZIP, synthetic titles, and a spare profile:

1. **Permission prompt:** popup → *Always allow on example.com* → Chrome prompt appears naming only that site. Deny → popup says access not granted; no Pip. Repeat and Allow → Pip appears without reload.
2. **Sleep/wake:** reminder due in 3 min; sleep the computer 5 min; wake → Due once, badge 1, no duplicate notification.
3. **Chrome closed past due:** quit Chrome, wait past due, reopen → Due on startup; nothing claimed while closed.
4. **Restricted pages:** chrome://settings, Chrome Web Store, a PDF, a `file://` page → no Pip; popup shows the fallback message; badge works.
5. **Fullscreen:** on an enabled site, enter page fullscreen (e.g. a video) → Pip hidden; exit → back; reminder unchanged.
6. **Revoke in Chrome UI:** chrome://extensions → Tuglet → Details → Site access → remove the site → Pip disappears from open tabs.
7. **Notifications:** enable in Settings (Chrome asks), deny at OS level / Do Not Disturb → badge and popup still correct.
8. **Motion:** OS "Reduce motion" on, and Settings → Pause animation → no swing; due marker visible.
9. **Accessibility:** keyboard only (Tab to buttons, Enter/Space), visible focus, screen reader announces "a reminder is due" once; popup and options at 200% zoom; short window (~400 px tall) → buttons usable.
10. **Page unaffected:** forms, scrolling, links and shortcuts work outside Pip on several real sites.
11. **Idle cost:** DevTools Performance on an idle page with Pip → no continuous animation frames or polling.
12. **Hide button:** Hide collapses the panel without completing; clicking Pip reopens it.

## Known limitations

- Pip renders inside pages below Chrome's toolbar; not over the address bar/tabs, nor on restricted pages.
- Delivery is best effort while Chrome runs; catch-up after sleep/closure. Some Chrome versions apply a 30-second minimum alarm delay to packed (store) extensions, so a reminder can be up to ~30 s late there.
- Shadow DOM is `open` (needed for tests); it is not a security boundary in either mode. Titles appear in page DOM only after the per-site opt-in.
- Hide-in-fullscreen is always on (no setting).
- The `minimatch` advisory in `typescript-eslint` affects lint tooling only.
