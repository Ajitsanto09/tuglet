# Tuglet privacy policy

Applies to Tuglet 0.1.0. Effective 6 November 2026.

## Summary

Tuglet keeps your reminders on your device. It has no account, server, analytics, advertising, cloud sync or AI service, and it makes no network requests.

## What is stored, and where

In `chrome.storage.local` for your Chrome profile on this computer:

- Your reminders: title (text you type, which may contain personal or work information), due times, status (scheduled, due, snoozed, completed), creation/update times and internal IDs.
- Up to 100 most recent completed reminders. Older completed ones are deleted automatically; you can delete any of them in Settings.
- Settings: snooze length, left/right position, animation pause, notification choices.
- The sites you enabled Pip on (e.g. `https://example.com/*`) and whether each may show titles.
- A short list of recent operation IDs used to ignore duplicate clicks.

Temporary data in `chrome.storage.session` (cleared when Chrome closes): which tab you used "Show on this page" in, and the last selected tab per window.

Chrome storage is not encrypted secret storage. Anyone with access to your Chrome profile can read it. Don't store passwords in reminder titles.

## What Tuglet does not do

- No data leaves your device. No telemetry, crash reporting or remote logging.
- It does not read page content, browsing history, cookies or your clipboard.
- It does not record which sites you visit; it only checks the current page's address to decide whether you enabled Pip there.

## Web pages

On sites you enable, Pip is drawn inside the page. By default the page only gets the text "A reminder is due", a due count and your snooze length, never reminder titles. If you turn on **Show reminder titles on this site**, the title of the reminder being shown is placed in that page, where the site's own scripts could read it. Only turn it on for sites you trust.

## Notifications

Optional and off by default. If enabled, Chrome shows a silent system notification saying "A Tuglet reminder is due." Titles are included only if you opt in. Your operating system may keep notification history.

## Export, reset and uninstall

- **Export** saves a JSON file you download; you control where it goes. **Import** replaces reminders and settings from such a file (site access is never imported).
- **Reset all Tuglet data** deletes reminders, history, settings, alarms, notifications and enabled sites, removes Pip from open pages, and can also remove site access you granted in Chrome.
- **Removing the extension** in `chrome://extensions` deletes its stored data in that profile.

## Contact

Questions: open an issue in the project repository (without private details). Security issues: see SECURITY.md.

Changes to this policy will be recorded in CHANGELOG.md.
