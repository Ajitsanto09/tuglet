# Install Tuglet on your computer (local pilot)

This guide is for teammates who do not write code. You do **not** need Node, npm, Git or Claude Code.

This is a *trusted pilot* installation using Chrome's Developer mode. It is not a Chrome Web Store install and it does not update itself. Only install a package you received from your team's trusted repository or maintainer.

**You need:** Google Chrome 120 or newer (check at `chrome://version`) and the file **`tuglet-0.1.0.zip`**.

> **Download:** https://github.com/Ajitsanto09/tuglet/releases/latest (private repository: sign in with an account that has access). Under **Assets**, download **`tuglet-0.1.0.zip`** and `SHA256SUMS`.
>
> Do **not** use the green **Code → Download ZIP** button or the "Source code (zip)" asset. Those contain source code, not the extension, and Chrome will refuse to load them.

## 1. Check the download (optional, recommended)

Compare the file's fingerprint with the one in `SHA256SUMS`:

- **macOS** (Terminal): `shasum -a 256 ~/Downloads/tuglet-0.1.0.zip`
- **Windows** (PowerShell): `Get-FileHash $HOME\Downloads\tuglet-0.1.0.zip -Algorithm SHA256`
- **Linux**: `sha256sum ~/Downloads/tuglet-0.1.0.zip`

The long code must match exactly. For 0.1.0 it is `96b991880670e2983f66ba9bcabb0c78562e57aac0d8c9e7f3345fd163179dc6`. A match shows the file was not damaged or changed; it does not by itself prove who made it, so still get it from a trusted place.

## 2. Unzip into a folder you will keep

1. Make a folder you will not delete or move, for example `Tuglet` in your home folder (`/Users/<you>/Tuglet` or `C:\Users\<you>\Tuglet`).
2. Unzip `tuglet-0.1.0.zip` into it.
3. Open the folder. You should see `manifest.json` **directly inside it** (next to `popup.html`, `background.js` and an `icons` folder). If you instead see one more folder, use that inner folder in the next step.

Do not move or delete this folder later: Chrome runs Tuglet from it.

## 3. Load it in Chrome

1. Go to `chrome://extensions` (type it in the address bar).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the folder that directly contains `manifest.json`.
4. Tuglet appears in the list. Click the puzzle-piece **Extensions** icon in the toolbar and click the pin next to **Tuglet** so its icon stays visible.

If Developer mode or Load unpacked is greyed out, your organization manages Chrome. Stop here and ask IT about an approved way to install extensions. Do not try to work around the policy.

## 4. Your first reminder (about 2 minutes)

1. Open any ordinary website (for example `https://example.com`). If your maintainer gave you the sample page, a developer can serve it at `http://localhost:4173` with `npm run demo`.
2. Click the Tuglet icon. Choose **Try a 1-minute demo reminder**.
3. Under **This page**, choose one:
   - **Show on this page**: Pip appears on this tab only, until you leave or reload it. Chrome grants nothing lasting.
   - **Always allow on _site_**: Chrome asks to let Tuglet "read and change" data on that one site. Tuglet uses this only to draw Pip; it does not read or send page content. Pip then appears whenever you visit that site.
   - Or skip both: reminders still work from the toolbar list and the red badge count.
4. Wait about a minute. Pip swings at the top right of the page and shows "A reminder is due".
5. Try it:
   - Pull Pip **down a little** (roughly a thumb's width) and let go: **snooze**.
   - When it's due again, pull Pip **all the way down** (about 120 px, a long pull) and let go: **complete**. A label tells you which one will happen before you let go.
   - Changed your mind mid-pull? Move back up, or press **Esc**.
   - Or use the **Snooze 5 min** / **Complete** buttons, by mouse or keyboard (Tab, then Enter).
6. Completed by mistake? Click **Undo** within 10 seconds (on the page or in the popup).

The page itself keeps working: links, forms, scrolling and shortcuts are unaffected outside Pip and its panel. **Hide** folds the panel away without completing anything.

## Settings

Click the Tuglet icon, then **Settings**: left/right side, snooze length (5/10/15/30 min), pause animation, which sites show Pip, whether a site may show the reminder's title (off by default; the page shows only "A reminder is due"), optional silent system notifications, export/import, and reset.

## Updating to a new version

1. In Settings, click **Export reminders** (a safety copy).
2. Download and check the new release ZIP as in step 1.
3. Open your existing Tuglet folder and replace its files with the files from the new ZIP (delete only old files *inside that Tuglet folder* if the maintainer's release notes say so). Keep the same folder and the same Chrome profile.
4. At `chrome://extensions`, click the circular **Reload** arrow on the Tuglet card. Check the version number shown there.
5. Refresh pages that were open before the update (old pages lose Pip until refreshed). Check your reminders are still listed.

Do not uninstall to update: uninstalling deletes Tuglet's data. Loading the new version from a *different* folder creates a separate copy with its own empty data.

## Removing Tuglet

1. Optional: **Export reminders** in Settings.
2. Optional: **Reset all Tuglet data…** in Settings (also offers to remove site access).
3. At `chrome://extensions`, click **Remove** on Tuglet. This deletes its stored reminders and settings in this Chrome profile.
4. You may then delete the Tuglet folder.

Reminders belong to one Chrome profile on one computer; other profiles and people do not see them.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| "Manifest file is missing or unreadable" | You picked the wrong folder. Choose the folder that directly contains `manifest.json` (often one level deeper). |
| "Could not load background script" / missing icon / folder named `tuglet-main` | You downloaded the source code (Code → Download ZIP). Download `tuglet-0.1.0.zip` from the Releases page instead. |
| Developer mode / Load unpacked is blocked | Your browser is managed. Ask IT for an approved installation route. |
| Pip doesn't appear | Pip can't appear on `chrome://` pages, the Chrome Web Store, PDFs, local files, or sites you haven't enabled. Use the toolbar popup and badge there. "Show on this page" lasts only until reload. |
| Pip vanished from a site | Access was turned off (in Tuglet Settings or Chrome's extension settings). Re-enable it deliberately from the popup. |
| Pip disappeared after an update | Refresh the page. |
| Reminder came late | Reminders can't fire while Chrome is closed or the computer sleeps. Tuglet marks them due when Chrome runs again. |
| No system notification | Notifications are optional and off by default. If on, check your OS notification settings and Do Not Disturb. The badge and popup still work. |
| Two Tuglet icons / reminders missing | You may have loaded Tuglet twice or be in another Chrome profile. At `chrome://extensions`, keep the one whose folder and version you expect. |
| Pip is in the way | Click **Hide**, move Pip to the left in Settings, or turn the site off. |

**Reporting a bug:** open an issue in the team repository using made-up reminder titles. Include Tuglet's version (from `chrome://extensions`), Chrome's version (`chrome://version`) and your OS. Never include real work details, tokens or screenshots of private pages. Security problems: see SECURITY.md, not a public issue.
