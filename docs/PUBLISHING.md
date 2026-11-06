# Publishing guide

Checked against Chrome's official documentation on 6 November 2026. Recheck the linked pages before each submission; requirements and fees change.

There are three distinct steps, and none implies the next:

1. **GitHub repository** (source code, CI, issues).
2. **GitHub Release** (a verified extension ZIP that teammates can load unpacked).
3. **Chrome Web Store** (reviewed, signed, auto-updating install). The maintainer's account is needed for this.

## 1. Create the GitHub repository

From a clean checkout with the work committed:

```bash
git status            # nothing unexpected staged
git ls-files          # only project files: no dist/, release/, profiles, .env, keys
gh auth status        # signed in? (does not print your token)
gh repo create OWNER/tuglet --private --source . --remote origin --push
```

Replace `OWNER`. Use `--public` only if you decided the project should be public. Then on GitHub:

- Settings → Code security → enable **Private vulnerability reporting** (SECURITY.md relies on it).
- Settings → Actions → General → Workflow permissions: **Read repository contents**. CI needs no secrets.
- Optionally protect `main` and require the CI check.

## 2. Make a GitHub Release (prebuilt ZIP for teammates)

1. Update `version` in **both** `package.json` and `manifest.json` (every distributed update needs a higher version) and add a `## [x.y.z]` section to CHANGELOG.md, including any permission or data changes.
2. Run the full check from a clean tree:
   ```bash
   npm ci && npm run lint && npm run typecheck && npm test -- --run && npm run build && npm run test:e2e && npm run package && npm run verify:package
   ```
3. Commit, tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
4. Create the release from that tag and attach exactly the verified files:
   ```bash
   gh release create v0.1.0 release/tuglet-0.1.0.zip release/SHA256SUMS release/tuglet-0.1.0-report.md --title "Tuglet 0.1.0" --notes-file release/RELEASE-NOTES-0.1.0.md
   ```
5. Tell teammates to download `tuglet-0.1.0.zip`, not GitHub's automatic "Source code" archives, and to follow docs/LOCAL-INSTALL.md.

Unpacked installs don't auto-update; announce new releases and link the update steps.

## 3. Chrome Web Store

Sources: [Publish](https://developer.chrome.com/docs/webstore/publish) · [Register](https://developer.chrome.com/docs/webstore/register) · [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) · [Distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) · [Program policies](https://developer.chrome.com/docs/webstore/program-policies)

**Publisher-only steps** (cannot be done by the build):

1. Register a Chrome Web Store developer account and pay the one-time registration fee (the docs don't state the amount on that page; it is shown during registration). The account email cannot be changed later. Complete any identity/contact verification the dashboard asks for and turn on the account security it requires (e.g. 2-Step Verification on the Google account).
2. Decide who publishes: a personal account or a group publisher for the team.

**Prepare the submission:**

1. Use the verified `release/tuglet-<version>.zip` (manifest at the root) and its report.
2. Listing assets: 128×128 icon (packaged `icons/128.png`), at least one 1280×800 or 640×400 screenshot of real behavior with synthetic data (re-capture `npm run test:e2e -- screenshots` with `SCREENSHOTS=1` and crop/compose to size), short and long description. Draft text: [STORE-LISTING.md](STORE-LISTING.md).
3. Host the privacy policy ([PRIVACY.md](PRIVACY.md)) at a public URL for this version (for example GitHub Pages or the repository file if the repo is public).
4. Privacy tab: single purpose; justification for each permission (copy from STORE-LISTING.md); data use declarations based on the real implementation: user-entered content (reminder titles) is **stored locally only and not collected or transmitted**; no remote code; certify Limited Use compliance only if accurate.
5. Reviewer notes: how to create a 1-minute synthetic reminder, use **Show on this page** on `https://example.com`, and pull Pip/click buttons. No account is needed.
6. Distribution: choose visibility. **Public**, **Unlisted** (no search listing, but anyone with the URL can install: *not* access control), or **Private** (trusted testers, a Google Group, or a Google Workspace domain if enabled). All visibility options go through the same review.
7. Submit. Report "submitted" only once it is, and "published" only after approval.

**After approval:** share the real listing URL, install it in a clean Chrome profile, and check an upgrade from the previous version keeps reminders. Store installs have a different extension ID from unpacked pilots, so pilot users should Export, install from the store, Import, then remove the unpacked copy.

**Updates and rollback:** upload a new ZIP with a higher version. Store users update automatically. Prefer a quick fixed-forward release over trying to roll back: an older build refuses newer stored data (by design) rather than corrupting it. Explain any new permissions in the release notes; Chrome may disable the extension until users accept them.

## Enterprise alternative

Organizations can deploy the store item (including Private visibility) or a self-hosted package through Chrome Enterprise policy (`ExtensionInstallForcelist` and related settings). Let your browser administrators choose a supported method. Dragging a `.crx` file from GitHub into Chrome is not a supported distribution route for ordinary users. See [Chrome distribution](https://developer.chrome.com/docs/extensions/how-to/distribute).
