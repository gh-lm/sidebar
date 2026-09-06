# Changelog

Dates are when the version was submitted to the Chrome Web Store.

## 1.0.1 — unreleased

- Pinned sites that answered on a different address came back as "refused to
  connect". Permission now covers a site's subdomains, and allowing every
  site installs one rule that applies everywhere.
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

## 1.0.0 — 2 September 2026

First release.
