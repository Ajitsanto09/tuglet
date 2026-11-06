# Roadmap

**Tuglet for Mac 0.3.0 is an early iteration**: manual one-time reminders, with Pip plus 24 emoji characters. More updates are coming. Nothing below is built yet, and the app has no connections, accounts or tokens for any of it. Each item ships as its own release, with tests, a privacy review, documentation and opt-in consent.

## Next up (small, from pilot feedback)

- **Edit a reminder** (today: delete and add again).
- **Repeating reminders** (daily, weekdays, weekly).
- Optional **system notification** alongside Pip, off by default.
- **Export/import** of reminders, and a "clear completed history" button.
- **Choose which screen** Pip hangs on.
- Paid Apple signing and notarization, if the team decides the one-time "Open Anyway" step is a hassle (see PUBLISHING.md).

## Later

1. **Custom-drawn characters** with their own poses (idle, due, pulling, done), plus per-character animations. The emoji characters in 0.3.0 are the first step.
2. **GitHub pull-request review notifications** (narrow scope).
3. **Slack notifications** for chosen cases, once workspace, OAuth and event-access requirements are known.

None needs an AI model; useful, explicit notifications come first.

## Extension point (already shaped for this)

The reminder logic (`Sources/Core`) knows nothing about providers. A future adapter would hand the app a normalized, validated event: provider kind, account/workspace ID, event ID, timestamp, generic summary and a validated link. Events are deduplicated by provider + account + event ID. All provider text is untrusted data (never instructions) and is shown as plain text.

Completing a Tuglet reminder only acknowledges Tuglet's copy. It must never mark Slack messages read, send messages, approve/merge a PR or submit a review without a separate, explicit feature.

## Characters

- A packaged character definition: ID, display name, original or licensed assets, accessible description, anchor point, and states (idle, due, pulling, snoozed, completed, static). Today's starting point is `Sources/App/Avatars.swift` (the list and emoji rendering) and `Sources/App/PipArt.swift` (Pip's drawing).
- Gesture thresholds, motion settings and button alternatives stay the same for every character.
- Asset packs are declarative data and images only: no scripts, arbitrary HTML/SVG scripting, remote CSS or network URLs. User uploads (if ever) would need size/type validation and sanitization. Attribution and licensing documented per character.

## GitHub: "my PR got a review"

- First case: *I requested a review on my PR; tell me when a review is submitted* (Approved / Changes requested / Commented, worded accurately). Distinct from review requests to me, ordinary comments, or line comments.
- Prefer a GitHub App limited to selected repositories with minimum read permissions; explicit watched PRs/repos; initial sync that doesn't flood with old reviews; disconnect.
- Push delivery needs a backend receiving verified `pull_request_review` webhooks with per-installation authorization; a desktop app is not a reliable webhook listener. A smaller polling variant would use conditional requests and backoff.
- Tokens are kept in the macOS Keychain, never in logs or the reminders file; links validated against the expected GitHub origin.

## Slack

- Start from a user-selected scope (e.g. mentions or chosen channels), not mirroring all Slack notifications.
- Official OAuth with consent naming the workspace, minimal scopes, disconnect/revoke and a settings page showing connections. Never embed a client secret or ask people to paste workspace tokens; use PKCE only where Slack supports the chosen flow, otherwise a narrow authorization backend.
- A backend receiving Slack events must verify signatures, deduplicate retries, enforce per-user/workspace authorization, secure stored tokens and support deletion.
- Message bodies are shown only if the user opts in; Pip's text stays generic by default for these.

Any of these adds a data flow and therefore updates to PRIVACY.md and CHANGELOG.md, and a clear explanation to the team.
