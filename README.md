# Sidemorphic

A private side panel for Chrome. Pinned web panels, notes, bookmarks,
snippets, a clean new tab, and cookie controls — in one panel that stays put
while you browse.

Sidemorphic is a plain MV3 extension for the Chrome Web Store. It grew out of
Lightmorphic Browser, a Chromium AppImage; shipping a whole browser was more
than the idea needed, so the extension is now the product.

Requires Chrome 114 or newer, or a Chromium browser that installs Web Store
extensions — Edge, Brave, Vivaldi, Opera. There is no Firefox version.

## What it does

- **Panels** — pin any site to the rail and open it beside the page you're on.
- **Notes** — a scratchpad that's always one click away.
- **Bookmarks** — browse and add without leaving the page.
- **Snippets** — save text you retype often.
- **Cookies** — allow, session-only, or block, globally or per site.
- **Privacy defaults** — password saving and autofill off on first run.

## Site access

Sidemorphic ships with access to **no websites**. The first time you open a
pinned panel it asks permission for that one site, because loading a site in a
panel means removing its anti-framing headers for that host. Decline and the
site opens in a normal tab instead.

## Layout

| Path | What it is |
|---|---|
| `chrome/` | The extension itself — load this unpacked; `package.sh` zips it for the store |
| `CHROMEWEBSTORE.md` | Listing copy, single purpose, permission justifications |

## Developing

Load `chrome/` at `chrome://extensions` with Developer mode on. There is no
build step.
