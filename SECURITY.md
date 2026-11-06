# Security policy

## Supported versions

Only the latest released version of Tuglet receives fixes. Pilot users should update to it.

## Reporting a vulnerability

Please **do not open a public issue** and do not include real reminders, tokens or private screenshots.

Report privately through GitHub's **"Report a vulnerability"** button on the repository's Security tab (GitHub private vulnerability reporting).

> Maintainer setup: before the repository is shared beyond the pilot or made public, enable *Settings → Code security → Private vulnerability reporting*. Until that is on, ask reporters to contact the maintainer directly through your team's private channel. No security email address exists yet; do not publish one that nobody monitors.

What to expect: acknowledgement within 5 working days, a fix or mitigation plan agreed with you, and credit in the changelog if you want it. Reports are kept confidential until a fix is released.

## Scope and design notes

- No network access, backend or credentials exist in this version.
- Pages only receive generic due information unless the user opts in per site; the page-mounted UI is not treated as a secret store.
- All messages from pages are validated against a strict allowlist; administration commands are accepted only from the extension's own pages.
- Reminder data in `chrome.storage.local` is restricted to trusted extension contexts but is not encrypted.
