# Changelog

All notable changes to Tuglet are recorded here. Versions follow the `version` in `src/manifest.json`.

## [0.1.0] - 2026-11-06

First pilot build (not yet submitted to the Chrome Web Store).

### Added
- One-shot personal reminders stored only in this Chrome profile: create, edit, delete, snooze, complete, and Undo (10 seconds).
- Pip, an original star character that hangs from the top edge of web pages you enable. It swings briefly (under 5 seconds) when a reminder becomes due, then shows a still due marker.
- Pull gestures: release after 24–119 px to snooze, 120 px or more to complete. Snooze and Complete buttons and keyboard access as alternatives.
- Per-page temporary access ("Show on this page") and per-site persistent access ("Always allow"), both opt-in. Toolbar badge and popup work everywhere without site access.
- Settings: left/right position, snooze length (5/10/15/30 min), pause animation, per-site title display, optional silent system notifications, export/import, reset.
- Recovery: alarms are re-derived from storage after worker shutdown, browser restart, sleep and updates; overdue reminders are caught up.

### Permissions
- Required: `storage`, `alarms`, `scripting`, `activeTab`. Optional: `notifications`; site access per site you choose.

### Known limitations
- Pip appears below Chrome's toolbar, inside web pages only; not on chrome:// pages, the Chrome Web Store, PDFs or local files.
- Reminders cannot fire while Chrome is closed or the computer sleeps; they are marked due when Chrome runs again.
- No recurring reminders, sync, Slack or GitHub integration.
