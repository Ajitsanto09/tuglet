# Development

## Requirements

- **Node.js 22.22.2** (LTS; pinned in `.nvmrc`, minimum 22.12). npm 10.9.7 was used with `npm ci`.
  The lockfile was generated with npm 11.6.2 because npm 10.9 hits an `edgesOut` resolver bug on a fresh install of this dependency set; `npm ci` with npm 10 works.
- Chromium for tests is installed by Playwright: `npx playwright install chromium`.

## Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Install the exact locked dependency tree. |
| `npm run dev` | Build to `dist/` and rebuild on change (inline source maps, unminified). After a change, click **Reload** for Tuglet at `chrome://extensions` and refresh open pages. |
| `npm run lint` | ESLint (TypeScript rules; bans `eval`, `new Function`, `innerHTML`). |
| `npm run typecheck` | `tsc --noEmit` over extension, tests and configs. |
| `npm test -- --run` | Vitest domain/worker tests once (timezone fixed to America/New_York for DST cases). |
| `npm run build` | Production build into `dist/` (minified, no source maps). Load `dist/` with **Load unpacked**. |
| `npm run test:e2e` | Playwright: loads `dist/` in Chromium with a disposable profile. Starts the fixture server on :4173. |
| `npm run package` | Writes `release/tuglet-<version>.zip`, `SHA256SUMS`, a permission/file report and release notes. |
| `npm run verify:package` | Checks the ZIP (checksum, root manifest, version, permission policy, assets, forbidden content), extracts it to a fresh temp folder and runs the smoke and access E2E tests against that extraction. `-- --no-e2e` for static checks only. |
| `npm run demo` | Serves the sample page at http://localhost:4173 . |
| `npm run icons` | Regenerates `public/icons/*.png` from `src/shared/pip-art.json`. |
| `node scripts/chrome-smoke.mjs dist` | Optional smoke test in installed Google Chrome (opens a window briefly). |

## Architecture

```
src/
  domain/      Pure logic: engine.ts (transitions, revisions, ordering, idempotence),
               gesture.ts (24/120/180 px thresholds, PullTracker), time.ts (local time, DST),
               sites.ts (match patterns), schema.ts (validation, migration, import/export)
  background/  service.ts: serialized command processor over a narrow Platform interface
               index.ts: Chrome event wiring (listeners registered synchronously at load)
  platform/    chrome.ts: storage, alarms, badge, notifications, scripting, tabs adapters
  content/     Page widget (plain DOM + SVG in a Shadow Root; styles via adoptedStyleSheets)
  popup/ options/ ui/   React administration pages (trusted)
  shared/      Types, message schemas, Pip art (pip-art.json) and SVG builder
```

Rules that keep it safe:

- **The worker is the only writer.** It loads from `chrome.storage.local`, sweeps overdue reminders, applies one transition, persists, and only then replies and updates alarms/badge/pages. Mutations are queued per worker instance; revisions and operation IDs reject stale or repeated commands.
- **Pages get a minimal view.** Content scripts may only request a view, act on the displayed due reminder (ID + occurrence + revision + op ID), undo their own completion, or report it was presented. Admin commands are accepted only from this extension's own pages. `storage.local` is restricted to trusted contexts.
- **Scheduling is derived.** One `tuglet-next` alarm plus a 5-minute `tuglet-reconcile` alarm. Every worker start, install/update, browser startup and alarm re-derives everything from storage.
- **Site access is checked twice:** the user's enabled-site list *and* Chrome's actual grant. Temporary access is bound to tab + origin.

To change the character, edit `src/shared/pip-art.json` (declarative shapes only) and run `npm run icons`.

## Inspecting the worker

At `chrome://extensions`, Developer mode on, click **service worker** under Tuglet to open DevTools. Keeping that inspector open keeps the worker alive, so do not use it to judge idle/suspend behavior (the E2E suite stops the worker through the DevTools Protocol instead). Storage: DevTools → Application → Extension storage → Local, key `tuglet`.

## Tests and test data

Use synthetic titles only (e.g. "Review the checkout mockup", "Take a screen break"). Never commit real reminders, screenshots of private pages, or browser profiles.

E2E notes:

- Chrome's site-permission prompt cannot be clicked by automation. Tests needing a persistent site grant load a temporary copy of the build with a test-only `host_permissions: ["http://localhost/*"]`; the real popup button then succeeds without a prompt. Tests of the exact shipped manifest cover fresh install, refusal without a grant, temporary access and content isolation.
- The toolbar popup is opened with the DevTools Protocol `Extensions.triggerAction`, which grants a genuine `activeTab`.
- Permission revocation "from Chrome's settings" uses `chrome.developerPrivate` on `chrome://extensions`, the API behind that page's controls.

## Dependency review

Dependencies are pinned in `package-lock.json`. Only React (and react-dom/scheduler) is bundled into the extension; everything else is build/test tooling. Run `npm audit` before releases. Known at 0.1.0: a moderate `minimatch` advisory inside `typescript-eslint` (lint-time only, not shipped).
