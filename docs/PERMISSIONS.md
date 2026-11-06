# Permissions

Tuglet asks for as little as possible. Required permissions are granted at install; optional ones are only requested when you turn the matching feature on.

| Permission | Required? | When it is used | What it lets Tuglet do | How to revoke |
| --- | --- | --- | --- | --- |
| `storage` | Required | Always | Save reminders and settings in this Chrome profile (`chrome.storage.local`, restricted to Tuglet's own pages and worker). | Uninstall, or Settings → Reset all Tuglet data. |
| `alarms` | Required | Always | Wake Tuglet's background worker when the next reminder is due, and every 5 minutes to repair scheduling. | Uninstall. |
| `scripting` | Required | When you show Pip on a page | Inject Tuglet's own packaged `content.js` into a page you allowed. No page code is ever evaluated. | Uninstall; it cannot act without `activeTab` or a site grant. |
| `activeTab` | Required | Only after you click the Tuglet icon | Temporary access to the current tab for **Show on this page**. Ends when you leave or reload the page. | Expires automatically. |
| Site access, e.g. `https://example.com/*` | Optional, per site | When you click **Always allow on _site_** | Show Pip automatically on that one site (scheme + host, any port; not subdomains). Chrome's prompt says "read and change your data on _site_"; Tuglet only draws Pip and does not read or send page content. | Tuglet Settings → **Turn off and remove access**, or `chrome://extensions` → Tuglet → Details → Site access. |
| `notifications` | Optional | When you enable system notifications in Settings | Show a silent notification when a reminder becomes due. Text is generic unless you opt in to titles. | Untick it in Settings (also removes the permission), or Chrome/OS notification settings. |

The manifest declares `https://*/*` and `http://*/*` as **optional** host permissions. That is only the range of sites Tuglet *may ask* for, one site at a time; nothing is granted until you approve a specific site.

Not requested: `tabs`, `history`, `cookies`, `webRequest`, `downloads`, `identity`, `management`, `unlimitedStorage`, any required host access, static content scripts, `externally_connectable`, or web-accessible resources. Tuglet does not run in Incognito.

Turning a site off in Tuglet stops Pip there even if Chrome still holds a grant. Removing access in Chrome also removes Pip from already-open pages and stops future injection; reminders are not acknowledged by either action.

Any future permission change will be listed in CHANGELOG.md and this file, with a reason.
