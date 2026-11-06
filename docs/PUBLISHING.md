# Publishing a release

Tuglet is shared as a ZIP on the repository's GitHub **Releases** page. No App Store and no paid Apple account are involved.

## Make a release

1. Bump `CFBundleShortVersionString` (and `CFBundleVersion`) in `Resources/Info.plist`. Add a `## [x.y.z] - date` section to CHANGELOG.md.
2. Build and check from a clean tree:
   ```bash
   scripts/check.sh && scripts/build.sh && scripts/package.sh
   ```
3. Open `build/Tuglet.app` and run the manual checks in [ACCEPTANCE.md](ACCEPTANCE.md).
4. Commit, tag and push:
   ```bash
   git tag -a v0.2.0 -m "Tuglet 0.2.0" && git push origin v0.2.0
   ```
5. Publish exactly the verified files:
   ```bash
   gh release create v0.2.0 release/Tuglet-0.2.0-mac.zip release/SHA256SUMS --title "Tuglet 0.2.0 for Mac" --notes-file <notes.md>
   ```
6. Tell teammates. Link [INSTALL.md](INSTALL.md) and mention whether they'll need to do **Open Anyway** again (usually yes, for each new version).

The repository is private, so teammates need GitHub access to download. To share more widely, make the repository public first, and turn on private vulnerability reporting (SECURITY.md).

## Signing: free now, optional later

- **Now (free):** `scripts/build.sh` signs ad hoc (`codesign --sign -`). It runs on the building Mac. Other Macs need the one-time **Open Anyway** approval described in INSTALL.md.
- **Later (optional, paid):** with an Apple Developer Program membership (US$99/year), sign with a *Developer ID Application* certificate and notarize (`xcrun notarytool submit … --wait`, then `xcrun stapler staple`). The app then opens with no warning. Only the build script changes; the app doesn't. Keep certificates and passwords out of the repository and CI logs.

There is no free way to remove the Gatekeeper prompt on other Macs. Don't tell teammates to disable Gatekeeper or strip quarantine flags.

## Rolling back

Point teammates to an earlier release. Reminder data is kept between versions. An older version shows "saved by a newer Tuglet" and leaves the data untouched rather than overwriting it. If a schema change ever happens, prefer releasing a fix forward.

## Retired: Chrome extension

v0.1.0 (Chrome extension) is retired. Its release notes say so, and its code remains at tag `v0.1.0`. It isn't on the Chrome Web Store, so there is nothing to unpublish.
