# Chrome Web Store listing draft (not submitted)

**Name:** Tuglet

**Short description (≤132 characters):**
Personal reminders with a friendly star that hangs on pages you choose. Small pull to snooze, full pull to complete.

**Category:** Productivity (Workflow & planning)

**Long description:**

Tuglet gives you simple one-time reminders while you work in Chrome.

Add a reminder from the toolbar. When it's due, Pip, a small star on a string, swings briefly at the top of the page, then waits quietly until you act:
• Pull Pip down a little and let go to snooze.
• Pull Pip all the way down to complete it (Undo for 10 seconds).
• Or use the Snooze and Complete buttons, by mouse or keyboard.

You choose where Pip appears: just this page for now, or always on a specific site. Everywhere else, the toolbar badge and list keep you covered.

Private by design: reminders stay in your Chrome profile on your device. No account, no servers, no analytics, no network requests. Pages see only "A reminder is due" unless you choose to show titles on a site.

Pip appears inside web pages, below Chrome's toolbar. It can't appear on Chrome settings pages, the Chrome Web Store, PDFs or local files; reminders still work there through the toolbar.

## Single purpose

Personal reminders, shown in the toolbar and optionally by an in-page hanging character.

## Permission justifications

- **storage:** saves the user's reminders and settings locally.
- **alarms:** wakes the extension when a reminder becomes due.
- **scripting:** injects the extension's own packaged widget into a page the user has enabled.
- **activeTab:** "Show on this page" temporarily on the tab where the user clicked the toolbar icon.
- **Optional host permissions (http/https):** requested one site at a time only when the user chooses "Always allow on this site", to show the character there automatically. No page content is read or sent.
- **notifications (optional):** silent notification when a reminder is due, only if the user enables it.

**Remote code:** No. All code is packaged.

## Data usage (dashboard)

User-provided reminder text is stored locally in the extension and never collected, transmitted or sold. The developer does not collect any data. (Re-check every box against the dashboard's current wording at submission.)

## Reviewer instructions

1. Open https://example.com and click the Tuglet icon.
2. Click "Try a 1-minute demo reminder", then "Show on this page".
3. After about a minute the star swings at the top right. Drag it down a little to snooze, or ~120 px to complete; or use the buttons.
4. No account or login is required.
