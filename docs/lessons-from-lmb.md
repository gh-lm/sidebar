# What we already learned building this as a browser

Carried over from Lightmorphic Browser's runbook, filtered to the things that
still apply to a plain Chrome extension. Every item here was verified by
running it, not by reading docs — several are the opposite of what the docs
imply. The browser, AppImage, Chromium-flag and CI material is deliberately
left behind.

## The side panel

- **`chrome.sidePanel.open()` only works from a direct user gesture.** Wiring
  it to `chrome.windows.onCreated` to auto-open in every window fails
  *silently* — no error, the panel simply never appears. Click-to-open via
  the toolbar action (or the keyboard command) is the only mechanism. Once
  open, the panel does persist across tab switches in that window.
- **A permanent Vivaldi-style rail is not reachable from an extension.**
  Chromium fixes the panel's minimum width, gives extensions no width
  control, and the panel header (pin, X) is browser chrome. Our "minimise"
  is `window.close()` plus a keyboard shortcut to reopen — that is the
  honest ceiling.
- **Chromium never restores the panel across restarts.** Verified: open the
  panel, quit cleanly, relaunch — it is gone, and no preference records it.

## Pinned sites in an iframe

- **Most big sites refuse to be framed** via `X-Frame-Options` or CSP
  `frame-ancestors`. The fix is a per-host session `declarativeNetRequest`
  rule stripping those headers, scoped with `requestDomains: [host]` and
  `resourceTypes: ["sub_frame"]`, so clickjacking protection stays intact
  everywhere else.
- **You cannot drive a cross-origin frame's history from outside** —
  `contentWindow.history` throws. The browser version solved this with a
  content script inside every page; this extension has no content script, so
  back/forward are gone and only Reload and Home ship.
- Favicons come from DuckDuckGo's icon service, with a dot fallback when a
  site has none.
- **The pin dialog's input must be `type="text"`, not `type="url"`.** A url
  input rejects `bbc.com` outright and forces the user to type `https://`
  themselves; we normalise on save instead.
- The rail's right-click menu opens **leftward** and clamps to the viewport —
  the rail sits at the panel's right edge, so a rightward menu goes
  off-screen.

## The service worker

- **`chrome.runtime.onStartup` is not a reliable carrier for once-per-launch
  work.** On a real install it did not fire; boot work silently never ran and
  the evidence was only visible as a missing storage flag.
- **Chromium does not start the MV3 worker at browser launch** on an existing
  profile — it waits for an event. Fresh QA profiles hide this because
  `onInstalled` fires there, and merely inspecting with devtools *wakes* the
  worker, masking it during testing.
- What works: the panel and new-tab pages ping the worker on load, and the
  work is guarded by a `chrome.storage.session` flag so it runs exactly once
  per browser launch (session storage dies with the browser).
- **Every boot step needs its own try/catch.** One unguarded rejection once
  aborted every step after it, and a real profile lost three releases' worth
  of fixes to it. The per-step outcome is written to `lastBootReport` so a
  broken install carries its own evidence.
- **A module-level variable does not survive the worker's ~30s idle kill.**
  Anything that must outlive an await belongs in storage.

## Settings and persistence

- **Cookie rules are enforced by `chrome.contentSettings.cookies`** — the
  same engine as `chrome://settings/content/cookies` — so they persist in the
  profile natively. Our storage is only the UI's source of truth; re-applying
  the whole set is idempotent and cheap.
- **"Session only" needs a boot-time sweep.** Chromium deletes session-only
  cookies on a *clean* exit but deliberately keeps them after a crash, so the
  promise breaks exactly when the user is least forgiving. Verified: a killed
  session's cookie survived into the next launch.
- The sidebar writes settings to storage itself and only *asks* the worker to
  enforce them. Persistence never depends on the worker being alive — this
  was the cure for a whole class of "my setting didn't stick" bugs.

## Testing

- Test on a **fresh profile** for anything first-run: permission grants,
  seeded defaults and one-time migrations are all invisible once they've run.
- **Content scripts only exist in pages loaded after the version that ships
  them** — tabs left open across an update keep the old script until
  reloaded. (Applies again the day we add one.)
- Click through it on a real display. Several of the bugs above were
  invisible to inspection and to headless testing alike.
