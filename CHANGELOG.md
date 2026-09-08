# Changelog

Dates are when the version was submitted to the Chrome Web Store.

## 1.1.1 — 8 September 2026

- Folding drew two strips on sites where more than one copy of the script was
  registered, and the spare one could not be closed and stayed on the page
  when the panel opened. Only one is drawn now, and the old registrations are
  cleared.
- Dragging the strip up or down rebuilt it in the middle of the gesture, so it
  sprang back and sometimes opened the panel. It now stays under the pointer
  and lands where it is dropped.
- Folding on the Chrome Web Store said the site had not been allowed, and sent
  you to grant access that would have made no difference. It now says that
  Chrome forbids every extension from drawing there.
- The message shown when folding is refused is a card in the middle of the
  panel that waits to be read, rather than a faint line at the top that took
  itself away after twenty seconds.
- The first-run dialog is in the panel's own style instead of the browser's
  plain one, and its buttons stay in view in a short window.
- The example pin that ships with a new install is Wikipedia.

## 1.1.0 — 6 September 2026

- A site's icon is taken when it is pinned and kept, so it is there whether
  or not the site has been visited or is reachable.
- Cookie banners answered in an ordinary tab no longer come back in the
  panel. A site in the panel is inside a frame, so the browser withholds its
  cookies; copies now go into a partition belonging to this extension, with
  the originals untouched.
- DuckDuckGo uses its own site rather than its lite endpoint.
- Following a result can open it in the main window at full width.
- The arrow folds the panel to a strip of icons on the page.
- Light theme removed. The panel is dark throughout.
- Text that was too small or too faint throughout the panel.
- A bin on the rail removes everything the extension has saved, on two
  presses.
- Open hands the page you are looking at to a tab, and returns the panel to
  the search box.
- The bin is labelled Danger zone and says what it takes, including the
  bookmarks folder the extension made.

## 1.0.1 — 4 September 2026

- Pinned sites that answered on a different address came back as "refused to
  connect". Permission now covers a site's subdomains, and allowing every
  site installs one rule that applies everywhere.

## 1.0.0 — 2 September 2026

First release.
