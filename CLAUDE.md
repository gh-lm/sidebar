# Lightmorphic Sidebar — working notes for Claude

A private side panel for Chrome, shipped as a plain MV3 extension on the
Chrome Web Store. `chrome/` is the whole product; there is no build step.

**Chrome only.** Chrome and the Chromium browsers that take Web Store
extensions — Edge, Brave, Vivaldi, Opera. Firefox is a maybe for the future
and nothing more: it has no `chrome.sidePanel` (it uses `sidebarAction`), so
the panel — the entire product — would need rewriting. Do not add
`browser_specific_settings`, polyfills, or `browser.*` call sites "to be
ready"; that is speculative work on a decision Charlie has not made.
`minimum_chrome_version` is 114, the release that shipped the side panel.

## Memory

Durable project memory is **not** auto-loaded — it lives outside this repo in
`/opt/projects/.claude/projects/lm-sidebar/memory/`. Read `MEMORY.md`
there at the start of a session, and write new durable facts into that folder.

## Where this came from

Extracted 2026-08-29 from Lightmorphic Browser, a Chromium AppImage whose
repo is being deleted — `docs/lessons-from-lmb.md` is what survived it. Shipping a browser was
abandoned. Do not propose features that need a packaged browser, Chromium
flags, or a native messaging host — if a normal Chrome user can't get it from
an extension they installed from the store, it is out of scope.

## Store constraints that shaped the code

Read `docs/store-submission.md` before touching the manifest. In short: the
extension installs with access to **no websites**; host permission is
optional and requested from a user click, one site at a time, when a pinned
panel is opened. Every permission in the manifest needs a written
justification at submission, so don't add one casually.

## Pushing

No git identity is configured on this machine, so pass it inline:
`git -c user.name='FOSSCharlie' -c user.email='github@lightmorphic.co.uk' commit`.
The repo is `https://github.com/gh-lm/sidebar` (Buildmorphic is gone; the old
`lightmorphic/sidebar` repo is not used). Push over HTTPS as user `gh-lm` with a
`GIT_ASKPASS` script reading `~/9-Claude/secrets/sidebar/sidebar-github-token`
— never echo the token.

## Testing

Load `chrome/` unpacked at `chrome://extensions` with Developer mode on.
Test the pinned-panel permission prompt on a **fresh profile** — the grant is
remembered, so an already-granted profile hides the first-run behaviour.
