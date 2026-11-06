# Changelog

All notable changes to Tuglet are recorded here. The version is `CFBundleShortVersionString` in `Resources/Info.plist`.

## [0.3.0] - 2026-11-06

First version of **characters**.

### Added
- **Choose your character** (Tuglet window or menu → Character): Pip the star, 12 animals (cat, dog, fox, panda, frog, monkey, owl, penguin, octopus, unicorn, bee, sloth) and 12 computer characters (robot, space invader, laptop, desktop, keyboard, mouse, floppy disk, joystick, bug, rocket, coffee, nerd face). The animals and computer characters use the Mac's built-in emoji.

### Changed
- **Livelier attention animation.** When a reminder becomes due, the character drops on its rope and bounces back, then swings hard with a quick "pop". While the reminder stays due, it gives a short shake every 45 seconds until you snooze or complete it. "Keep the character still" and macOS Reduce motion turn all movement off.
- The character sits a little further from the screen edge so its swing isn't cut off.

### Compatibility
- Reminders and settings from 0.2.x load unchanged (the new setting defaults to Pip).

## [0.2.1] - 2026-11-06

### Fixed
- Double-clicking Tuglet now always opens the **Tuglet window** (reminders, add form, settings). In 0.2.0 nothing seemed to happen: the app ran only in the menu bar, where a full menu bar can hide the ☆ behind the camera notch.
- The first launch shows the window with a short welcome from Pip.
- Clicking Pip when nothing is due opens the window.

## [0.2.0] - 2026-11-06

**Tuglet is now a Mac app.** This is the first iteration of the Mac version; more updates are coming.

### Added
- Menu bar app (☆ / ★ with the due count) for macOS 13+, on Apple silicon and Intel.
- Pip hangs from the top of the screen above every app, Space and full-screen app. It swings for under 5 seconds when a reminder becomes due, and shows a due badge and a card with **Snooze**, **Complete** and **Hide**.
- Pull Pip 24–119 pt and let go to snooze; 120 pt or more to complete. A label shows which will happen. Undo for 10 seconds.
- One-time reminders with 5/15/30/60-minute shortcuts and a 1-minute demo. Delete with confirmation.
- Settings: snooze length (5/10/15/30), left/right side, hide reminder text on Pip (for screen sharing), keep Pip still, open at login. Follows macOS Reduce motion.
- Catches up on missed reminders after sleep, clock changes and relaunch. Unreadable or newer data files are never overwritten.
- Free ad-hoc-signed release ZIP with SHA-256 checksum; install guide with the one-time "Open Anyway" step.

### Removed
- The Chrome extension (0.1.0) is retired. Its code remains at tag `v0.1.0`. Reminders from the extension are not carried over.

### Known limitations
- Reminders only fire while Tuglet is running (turn on "Open at login").
- New Macs need a one-time "Open Anyway" approval because the app isn't notarized by Apple.
- No editing (delete and re-add), repeating reminders or system notifications yet.
- Pip uses the main screen only.

## [0.1.0] - 2026-11-06 (Chrome extension, retired)

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
