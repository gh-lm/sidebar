# Sidemorphic

A private side panel for Chrome. Pin any website to the rail and it opens
beside the page you are reading, like a small window — plus
a scratchpad, snippets and a clean new tab, in one panel that stays put while
you browse.

Sidemorphic is a plain MV3 extension for the Chrome Web Store. It grew out of
Lightmorphic Browser, a Chromium AppImage; shipping a whole browser was more
than the idea needed, so the extension is now the product.

Requires Chrome 114 or newer, or a Chromium browser that installs Web Store
extensions — Edge, Brave, Vivaldi, Opera. There is no Firefox version.

## What it does

- **Panels** — pin any site to the rail and open it beside the page you're on.
- **Scratchpad** — somewhere to put things, always one click away.
- **Snippets** — text you retype often; click one to copy it.
- **Syncs itself** — everything is stored in one bookmarks folder, so the
  browser's own bookmark sync carries it. No account, no server.

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
