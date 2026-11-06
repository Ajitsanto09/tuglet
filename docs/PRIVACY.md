# Tuglet privacy

Applies to Tuglet for Mac 0.2.0. Effective 6 November 2026.

## Summary

Tuglet keeps your reminders on your Mac. It has no account, server, analytics, advertising, cloud sync or AI, and it never connects to the internet.

## What is stored

One file: `~/Library/Application Support/Tuglet/reminders.json`, readable by your macOS user account. It contains:

- Your reminders: the text you type (which may include personal or work details), due time, status (scheduled, due, snoozed, completed) and when it was created or completed.
- Up to the **100 most recent completed** reminders. Older completed ones are deleted automatically.
- Your settings: snooze length, which side Pip hangs on, whether Pip shows reminder text, and whether Pip stays still.

"Open at login" is stored by macOS in its Login Items list, not by Tuglet.

The file is not encrypted. Anyone with access to your Mac user account can read it, so don't put passwords in reminders.

## What Tuglet does not do

- It doesn't send anything anywhere: no network requests, telemetry or crash reports.
- It doesn't read your screen, other apps, files, browsing history or clipboard. It needs no special macOS permissions (no Accessibility, Screen Recording or Notifications).

## On screen

Pip shows the due reminder's text on your screen, so anyone looking at your screen, or watching a screen share, can see it. Turn off **Show the reminder text on Pip** in Settings, and Pip only says "A reminder is due".

## Deleting your data

Delete reminders one by one in the Tuglet menu. To delete everything, quit Tuglet and delete the folder `~/Library/Application Support/Tuglet`. Deleting the app alone keeps your reminders for when you reinstall.

## Changes

Any change to what Tuglet stores, or a future connection such as Slack or GitHub, will be described in CHANGELOG.md and in this file before it ships, and will be opt-in.
