# Chrome Web Store submission

## Package

```bash
cd extension && zip -r ../sidemorphic-0.1.0.zip . -x '.*'
```

## Permission justifications (required at submission)

| Permission | Justification to paste |
|---|---|
| `sidePanel` | The extension IS a side panel. |
| `storage` | Notes, snippets, pinned panels and cookie rules are stored locally. |
| `tabs` | The cookie controls and "pin this page" act on the page the user is looking at; only the URL is read. |
| `bookmarks` | The bookmarks panel lists and adds bookmarks. |
| `contentSettings` | Applies the user's chosen cookie rule (allow / session-only / block) through Chrome's own cookie engine. |
| `browsingData` | Clears cookies at startup for sites the user set to "this session only" — Chrome keeps them after a crash, which would break the promise. |
| `privacy` | Turns off password saving and autofill once, on first run. |
| `declarativeNetRequestWithHostAccess` | Removes X-Frame-Options / CSP frame-ancestors for a single host, only after the user grants permission for that host, so a pinned site can render in the panel. |
| `optional_host_permissions` | Requested at runtime, one site at a time, when the user opens a pinned panel. Never requested at install. |

## Still to do before first submission

- [ ] Sidemorphic icons and logo — `chrome/icons/*` and `chrome/newtab/logo.png` are still the old browser's.
- [ ] Privacy policy hosted at a public URL (required: the listing asks for one).
- [ ] Listing copy, 1280x800 screenshots, small promo tile.
- [ ] Decide the search engine on the new tab page (currently DuckDuckGo).
- [ ] Test the pinned-panel permission prompt on a fresh profile.
