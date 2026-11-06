# Acceptance record: Tuglet for Mac 0.3.0

Recorded 6 November 2026 on macOS 15.7.9 (Apple silicon), Swift 6.2.4 (Command Line Tools 26.3).

## Automated

| Check | Result |
| --- | --- |
| `scripts/check.sh` | 36 checks passed, 0 failed: pull thresholds (23.9 / 24 / 119.9 / 120, upward, NaN, clamp), validation and 120-character limit, scheduled → due → snoozed → due → completed → undo, undo window, no double snooze or complete, delete can't be undone by a later action, snooze length, ordering, catch-up, swing not replayed, newest 100 history, 500 capacity, save round trip, newer or corrupt files refused and left untouched |
| `scripts/build.sh` | Built universal app (arm64 + x86_64), ad-hoc signature verified (`codesign --verify --strict`) |
| `scripts/package.sh` | `release/Tuglet-0.2.0-mac.zip` unzipped and re-verified: signature, version 0.2.0, both architectures, icon, SHA-256 |
| `spctl -a build/Tuglet.app` | Rejected, as expected for an unnotarized app. This is why teammates do the one-time **Open Anyway** step |

## Live checks on this Mac (real app, made-up reminders)

| Scenario | Result | How |
| --- | --- | --- |
| Launch shows Pip below the menu bar, top right, above other apps | Pass | Window list: 72×110 pt panel at layer 25 (status-bar level), y = 38 |
| Reminder becomes due while the app is running; saved as due and presented | Pass | 8-second test reminder; data file showed `due`, `presented: true`; panel grew to show the card |
| Full pull (130 pt) completes; short pull (40 pt) snoozes; tiny pull (15 pt) does nothing | Pass | Pointer events posted by a test helper; data file afterwards: completed / snoozed / due |
| Window returns to normal size after a pull | Pass | 276×280 pt after the drags |
| Pull distance unaffected by the window growing when a drag starts | Pass (after fix) | First run measured a 150 pt pull as a snooze; now measured from the pointer's screen position |
| 0.2.1: first launch with no reminders opens the Tuglet window | Pass | 360×588 pt window on screen |
| 0.2.1: launch with existing reminders stays quiet (Pip only) | Pass | Only the Pip panel on screen |
| 0.2.1: double-click while running reopens the window | Pass | `open` on the running app showed the window |
| 0.2.1: clicking idle Pip opens the window | Pass | Posted click on Pip |
| 0.3.0: settings files from 0.2.x (no character setting) still load | Pass | Self-check "0.2.x settings load with default avatar" |
| 0.3.0: chosen character (cat, robot) is used and saved | Pass | Live runs with `avatar` set; data file kept it |
| 0.3.0: due animation makes room (window 280 → 326 pt during the swing) and settles back | Pass | Window sampled during and after the swing |
| 0.3.0: repeat shake while due | Pass | Window grew at about 47 s after launch and settled 1 s later |
| 0.3.0: pull still works at the new position (130 pt → completed) | Pass | Posted pointer events |
| 0.3.0: rope resistance curve (grows, always less than the pointer, never past the maximum) | Pass | Self-checks |
| 0.3.0: release with flash: 140 pt completed, 50 pt snoozed, 15 pt cancelled; window kept room during the snap-back (460 pt) and settled to 280 pt | Pass | Posted pointer events, fox character |
| Rendered views (light and dark): due card, strained pull, flash burst, menu, characters | Pass | `docs/screenshots/` from `Tuglet --snapshots` |

Found by a teammate after 0.2.0 shipped and fixed in 0.2.1: double-clicking appeared to do nothing (menu bar icon hidden behind the notch, no window). Bugs found and fixed during these checks: the "Let go to…" label shifted Pip and was clipped in the narrow idle window; card buttons were truncated; pulls were mismeasured when the window resized; a cancelled drag could leave Pip stuck in dragging mode.

## Manual checks still to do

Run on at least one other Mac, ideally an Intel Mac and macOS 13 or 14, using the downloaded release ZIP:

1. **First open:** download from Releases, move to Applications, double-click → blocked → System Settings → Privacy & Security → **Open Anyway** works as INSTALL.md describes. On macOS 13/14, right-click → Open.
2. **Menu bar:** the ☆ appears; it shows ★ and a number when due; the menu opens and every section works (add, shortcuts, demo, delete with confirm, settings).
3. **Pip over everything:** visible above a full-screen app, on every Space, and over Slack, a browser and an editor. Clicks beside Pip reach the app underneath.
4. **Animation:** drop, bounce and swing on a new due reminder; a short shake every 45 s while due; none with "Keep the character still" or macOS Reduce motion; no shake mid-pull. Pull feels resistant, trembles past the complete point, snaps back with a gold or blue flash; no flash on cancel. Try every character on light and dark wallpapers.
5. **Buttons:** Snooze, Complete, Hide (card folds, reminder stays due, clicking Pip reopens it), Undo within 10 s, and Undo from the menu.
6. **Sleep:** reminder due during sleep → due on wake. Quit Tuglet past a due time → due on next launch.
7. **Open at login:** turn it on, log out and in, and Tuglet starts. If macOS refuses, the message points to Login Items.
8. **Left side and multiple screens:** Pip moves to the left; with two displays, it sits on the main one.
9. **Screen sharing:** with "Show the reminder text on Pip" off, Pip says "A reminder is due".
10. **VoiceOver:** "Tuglet: a reminder is due" is announced once, and the buttons have clear names.
11. **Update in place:** replace the app with a newer build; reminders are kept.

## Known limitations

- Unnotarized: each Mac needs one **Open Anyway** (and often again after an update).
- Reminders only fire while Tuglet runs; no system notifications yet.
- No editing or repeating reminders yet; Pip uses the main display only.
- Keyboard users act through the menu bar window; the floating card doesn't take keyboard focus.
