# Roadmap

Version 0.1 is manual reminders with Pip only. Nothing below is implemented, and the extension requests no permissions, tokens or connections for it. Each item is a separate release with its own threat model, tests, permission/data-flow review, documentation and user consent.

## Order

1. **Pilot 0.1** with the team; fix usability and reliability issues found.
2. **Bundled characters and visual preferences.**
3. **GitHub pull-request review notifications** (narrow scope).
4. **Slack notifications** for chosen cases, once workspace, OAuth and event-access requirements are known.

None needs an AI model; useful, explicit notifications come first.

## Extension point (already shaped for this)

The reminder engine and worker are provider-agnostic. A future adapter would hand the worker a normalized, validated event: provider kind, account/workspace ID, event ID, timestamp, generic summary and a validated link. Events are deduplicated by provider + account + event ID. All provider text is untrusted data (never instructions) and goes through the same plain-text rendering and generic-by-default page display.

Completing a Tuglet reminder only acknowledges Tuglet's copy. It must never mark Slack messages read, send messages, approve/merge a PR or submit a review without a separate, explicit feature.

## Characters

- A packaged character manifest: ID, display name, original or licensed assets, accessible description, anchor point, and states (idle, due, pulling, snoozed, completed, static). Today's `src/shared/pip-art.json` is the starting point.
- Gesture thresholds, motion settings and button alternatives stay the same for every character.
- Asset packs are declarative data and images only: no scripts, arbitrary HTML/SVG scripting, remote CSS or network URLs. User uploads (if ever) would need size/type validation and sanitization. Attribution and licensing documented per character.

## GitHub: "my PR got a review"

- First case: *I requested a review on my PR; tell me when a review is submitted* (Approved / Changes requested / Commented, worded accurately). Distinct from review requests to me, ordinary comments, or line comments.
- Prefer a GitHub App limited to selected repositories with minimum read permissions; explicit watched PRs/repos; initial sync that doesn't flood with old reviews; disconnect.
- Push delivery needs a backend receiving verified `pull_request_review` webhooks with per-installation authorization; an extension worker cannot be a webhook listener. A smaller polling variant would use alarms, conditional requests and backoff, without broad site permissions.
- Tokens never reach content scripts, page UI or logs; links validated against the expected GitHub origin.

## Slack

- Start from a user-selected scope (e.g. mentions or chosen channels), not mirroring all Slack notifications.
- Official OAuth with consent naming the workspace, minimal scopes, disconnect/revoke and a settings page showing connections. Never embed a client secret or ask people to paste workspace tokens; use PKCE only where Slack supports the chosen flow, otherwise a narrow authorization backend.
- A backend receiving Slack events must verify signatures, deduplicate retries, enforce per-user/workspace authorization, secure stored tokens and support deletion.
- Message bodies stay out of content scripts; on-page text stays generic by default.

Any of these adds a data flow and therefore updates to PRIVACY.md, PERMISSIONS.md, the store privacy declarations, and CHANGELOG.md.
