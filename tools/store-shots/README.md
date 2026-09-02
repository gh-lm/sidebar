# Store images

`./build.sh` rewrites every file in `store/` — the five 1280x800 screenshots,
the 440x280 tile and the 1400x560 marquee — and checks each one against
what the store accepts.

They are captures of the extension actually running, not mockups. Chrome is
launched with `chrome/` loaded unpacked and each shot is the extension's own
panel page, with the real bookmarks, storage and favicon service behind it.
Screenshot 1 has a real site loaded in the panel over the network.

The sample data is `store/sample-data.json`: invented people, an
`@example.com` address, and a phone number from the Ofcom drama range
(`07700 900xxx`) which is reserved and can never belong to anyone. Nothing
real goes into a public image.

Headless Chrome cannot show the dialog that grants an optional host
permission, so `shoot.js` writes the grant into the throwaway profile
instead — the same end state as pressing "Allow all sites".

Needs `node` and `python3`. Puppeteer and Chrome download on first run into
`work/`, along with the throwaway browser profile. None of it is committed.
