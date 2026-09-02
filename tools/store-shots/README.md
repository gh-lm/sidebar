# Store images

`./build.sh` rewrites every file in `store/` — the five 1280x800 screenshots
and the 440x280 tile.

What it photographs is the real panel: `chrome/` is copied unchanged and
given `stub.js`, a fake `chrome.*` that answers with fixture data, so the
pixels come from the shipping HTML and CSS rather than a drawing. Screenshot
1 loads the real site in the panel over the network.

Needs `node` and `python3`. Headless Chrome and puppeteer are downloaded on
first run into `work/`, which is not committed.
