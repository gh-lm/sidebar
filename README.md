# Lightmorphic Sidebar

A private side panel for Chrome. Pin any website to the rail and it opens
beside the page you are reading, like a small window — plus search, a
scratchpad and snippets, in one panel that stays put while you browse.

Lightmorphic Sidebar is a plain MV3 extension for the Chrome Web Store. It grew out of
Lightmorphic Browser, a Chromium AppImage; shipping a whole browser was more
than the idea needed, so the extension is now the product.

Requires Chrome 114 or newer, or a Chromium browser that installs Web Store
extensions — Edge, Brave, Vivaldi, Opera. There is no Firefox version.

## What it does

- **Panels** — pin any site to the rail and open it beside the page you're on.
- **Search** — the panel opens on a search box with a row of letters for the
  engines. Press one and it searches there; results open in the panel, in the
  site's phone layout.
- **Scratchpad** — somewhere to put things, always one click away.
- **Snippets** — text you retype often; click one to drop it into the box
  you were typing in, right-click to edit it.
- **Syncs itself** — everything is stored in one bookmarks folder, so the
  browser's own bookmark sync carries it. No account, no server.

## Site access

Lightmorphic Sidebar ships with access to **no websites**. The first time you open a
pinned panel it asks permission for that one site, because loading a site in a
panel means removing its anti-framing headers for that host. Decline and the
site opens in a normal tab instead.

The search engines are asked for together on the first search, so that is one
prompt rather than seven. Information offers a single "allow every site" for
anyone who would rather not be asked at all — off by default, and revocable
from the same button.

## Layout

| Path | What it is |
|---|---|
| `chrome/` | The extension itself — load this unpacked; `package.sh` zips it for the store |
| `SUBMIT.md` | Everything to paste into the Web Store form, ready to copy |
| `store/` | The listing images; `tools/store-shots/build.sh` regenerates them |
| `site/` | sidebar.lightmorphic.com, published by the Pages workflow |

## Developing

Load `chrome/` at `chrome://extensions` with Developer mode on. There is no
build step.
