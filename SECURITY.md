# Security policy

## Supported versions

Only the latest released version of Tuglet receives fixes. Pilot users should update to it.

## Reporting a vulnerability

Please **do not open a public issue** and do not include real reminders, tokens or private screenshots.

Report privately through GitHub's **"Report a vulnerability"** button on the repository's Security tab (GitHub private vulnerability reporting).

> Maintainer setup: before the repository is shared beyond the pilot or made public, enable *Settings → Code security → Private vulnerability reporting*. Until that is on, ask reporters to contact the maintainer directly through your team's private channel. No security email address exists yet; do not publish one that nobody monitors.

What to expect: acknowledgement within 5 working days, a fix or mitigation plan agreed with you, and credit in the changelog if you want it. Reports are kept confidential until a fix is released.

## Scope and design notes

- The Mac app has no network access, backend, credentials or special macOS permissions.
- Reminder data is a JSON file in the user's Library folder; it is not encrypted.
- Releases are ad-hoc signed (not notarized). Verify downloads against `SHA256SUMS` and only download from the repository's Releases page.
- The retired Chrome extension (v0.1.0) is no longer supported.
