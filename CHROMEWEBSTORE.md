# Chrome Web Store listing

## Single purpose

Sidemorphic gives you one side panel that holds the things you keep reaching
for while browsing: pinned websites that open beside the page you are on,
notes, bookmarks and saved snippets.

## Description

Sidemorphic puts a private side panel beside whatever you are reading.

Pin a site to the rail and it opens right here in the panel, like a small
window beside whatever you are reading — your mail, a chat, docs, anything you
keep flicking tabs to reach. Keep a notepad one click away. Browse and add
bookmarks without leaving the page. Save snippets of text you retype often and
copy one with a click.

It starts with access to no websites at all. When you open a pinned panel it
asks permission for that one site, and nothing else. Nothing is sent anywhere:
no accounts, no servers, no analytics, no remote code. Everything stays in your
browser.

Sidemorphic also replaces the new tab page with a plain search box.

## Category

Productivity

## Permission justifications

| Permission | Justification |
|---|---|
| `sidePanel` | The extension is a side panel. |
| `clipboardWrite` | Copies a saved snippet to the clipboard when you click it. |
| `storage` | Notes, snippets and pinned panels are saved in the browser. Nothing leaves it. |
| `tabs` | "Pin this page" needs the address of the tab you are on, to fill it into the dialog. Only the URL is read, never page content. |
| `bookmarks` | The bookmarks panel lists your bookmarks and adds new ones. |
| `favicon` | Draws the site icon on each pinned button, from the browser's own cache. No network request. |
| `declarativeNetRequestWithHostAccess` | Removes the headers that stop a site being shown in a panel — for one site, only after you have granted permission for it. |
| Optional site access | Requested one site at a time, from your click, when you open a pinned panel. Never requested at install. |

## Trader status

Non-trader. Free, no payments, no business use.

## Assets

Ready in `store/`:

| File | Use |
|---|---|
| `01-panel.png` … `05-newtab.png` | Screenshots, 1280x800. Upload at least one; five is the maximum. |
| `promo-tile-440x280.png` | Small promotional tile. |

Icons are generated from `brand/icon.svg` by `make-icons.sh`.

**Privacy policy URL:** https://lightmorphic.github.io/sidemorphic/ — live,
served from `site/` by the Pages workflow. Paste this into the listing's
privacy practices tab.

## Submission checklist

- [ ] Pay the one-off $5 developer fee if the account is new
- [ ] Upload `dist/sidemorphic-0.1.0.zip`
- [ ] Paste the description and single-purpose sentence above
- [ ] Paste each permission justification
- [ ] Privacy policy URL: https://lightmorphic.github.io/sidemorphic/
- [ ] Upload screenshots from `store/` and the promo tile
- [ ] Category: Productivity. Non-trader.
