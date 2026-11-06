# Contributing

Thanks for helping. Setup and architecture are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Before opening a pull request

```bash
npm ci
npm run lint && npm run typecheck && npm test -- --run
npm run build && npm run test:e2e
npm run package && npm run verify:package   # if you touched build, manifest or packaging
```

## Ground rules

- **Synthetic data only** in tests, screenshots and issues (e.g. "Review the checkout mockup"). No real names, internal URLs or work data.
- **Permission changes need review.** Any change to `src/manifest.json` permissions, host access, storage contents or network behavior must explain why in the PR and update docs/PERMISSIONS.md, docs/PRIVACY.md and CHANGELOG.md. `npm run verify:package` enforces the current permission policy and must be updated deliberately.
- **No remote code**, `eval`, inline scripts, CDN assets or analytics.
- **Keep the worker the only writer** of reminder state; pages send narrow, validated commands.
- **Accessibility:** every drag action needs a button/keyboard path; visible focus; respect reduced motion.
- Add tests for behavior you change (domain tests in `tests/unit`, real-extension tests in `tests/e2e`).

## Character assets

Characters must be original or properly licensed, described in `src/shared/pip-art.json`-style declarative data (shapes or packaged images only, no scripts or external URLs), readable on light and dark pages, and include an accessible description. Note the license and attribution in the PR. Regenerate icons with `npm run icons`.
