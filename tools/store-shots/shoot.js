/* Photographs the extension actually running.
   Chrome is launched with chrome/ loaded unpacked, and every shot is a
   capture of chrome-extension://<id>/sidebar/sidebar.html -- the real page,
   with the real chrome.bookmarks, chrome.storage and favicon service behind
   it. The sample data is written through the browser's own bookmarks API,
   so the panel reads it exactly as it reads a real user's. */
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const REPO = process.argv[2];
const OUT = process.argv[3];
const PROFILE = process.argv[4];
const EXT = path.join(REPO, "chrome");
const SAMPLE = JSON.parse(fs.readFileSync(path.join(REPO, "store", "sample-data.json"), "utf8"));

const SHOTS = [
  {
    file: "01-panel.png",
    h: "Any website,|beside the one|you are reading",
    s: "Pin a site to the rail and it opens here in the panel,|like a small window beside whatever you are reading.",
    // A neutral third-party site, not our own. The listing was once rejected
    // for a run of brand names, and our own hero carries a list of browsers
    // in its small print, which is the same thing in a picture.
    open: "https://en.wikipedia.org/wiki/Side_panel",
    settle: 5000,
  },
  {
    file: "02-search.png",
    h: "Search here,|not in a new tab",
    s: "The mark, the name, one box, and a row of letters|for seven engines. Results open in the panel.",
    tab: "search",
  },
  {
    file: "03-scratchpad.png",
    h: "A scratchpad|that follows you",
    s: "One click away, saved as you type, and carried|to your other machines by your own bookmark sync.",
    tab: "scratchpad",
  },
  {
    file: "04-snippets.png",
    h: "The lines you|retype every week",
    s: "Click one and it drops straight into the box|you were typing in. No titles to fill out.",
    tab: "snippets",
  },
  {
    file: "05-light.png",
    h: "Light or dark,|however you read",
    s: "One button cycles light, dark, and following|the browser. Everything stays in your browser.",
    tab: "snippets",
    light: true,
  },
];

(async () => {
  const launch = () =>
    puppeteer.launch({
      headless: "new",
      userDataDir: PROFILE,
      args: [
        `--disable-extensions-except=${EXT}`,
        `--load-extension=${EXT}`,
        "--no-first-run",
        "--hide-scrollbars",
        "--font-render-hinting=none",
        "--force-color-profile=srgb",
      ],
    });
  let browser = await launch();

  let sw = null;
  for (let i = 0; i < 60 && !sw; i++) {
    sw = browser.targets().find((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"));
    if (!sw) await new Promise((r) => setTimeout(r, 250));
  }
  if (!sw) throw new Error("the extension's service worker never started");
  const id = new URL(sw.url()).host;
  const PANEL = `chrome-extension://${id}/sidebar/sidebar.html`;
  console.log("extension id", id);

  // Write the sample data through the real bookmarks API, from a page that
  // is the extension itself, so nothing here is a stand-in for the store.
  const seed = await browser.newPage();
  await seed.goto(PANEL, { waitUntil: "domcontentloaded" });
  await seed.evaluate(async (sample) => {
    const HEAD = "https://lightmorphic.invalid/#sb1:";
    const enc = (v) => HEAD + encodeURIComponent(JSON.stringify(v));
    const tree = await chrome.bookmarks.getTree();
    const roots = tree[0].children.filter((r) => !/^(deleted|trash|bin|recycle)/i.test(r.title || ""));
    const other = roots.find((r) => r.id === "2") || roots.find((r) => /other/i.test(r.title || "")) || roots[0];
    const kids = await chrome.bookmarks.getChildren(other.id);
    for (const k of kids) if (!k.url && k.title === "Lightmorphic Sidebar") await chrome.bookmarks.removeTree(k.id);
    const folder = await chrome.bookmarks.create({ parentId: other.id, title: "Lightmorphic Sidebar" });
    for (const url of sample.pins) {
      await chrome.bookmarks.create({ parentId: folder.id, title: new URL(url).hostname, url });
    }
    await chrome.bookmarks.create({ parentId: folder.id, title: "Lightmorphic Sidebar scratchpad", url: enc(sample.scratchpad) });
    await chrome.bookmarks.create({ parentId: folder.id, title: "Lightmorphic Sidebar snippets", url: enc(sample.snippets) });
  }, SAMPLE);

  // Answer the first-run dialog the way a user would, with a real click on
  // "Allow all sites", so the pinned site in shot 1 is being shown under a
  // permission the extension actually holds.
  await seed.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1000));
  const welcome = await seed.$("#welcomeAllow");
  if (welcome) await welcome.click().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  const granted = await seed.evaluate(() => chrome.permissions.contains({ origins: ["*://*/*"] }));
  console.log("all-sites permission granted:", granted);
  if (!granted) {
    await seed.evaluate(() => chrome.storage.local.set({ welcomeSeen: true, accessChoice: "ask" }));
  }
  await seed.close();

  // Headless Chrome has no UI to confirm an optional permission, so the
  // click above cannot grant it. Write the grant into the profile instead
  // and reopen: the same end state as a user pressing "Allow all sites",
  // and shot 1 then shows a site the extension really is allowed to load.
  if (!granted) {
    await browser.close();
    const prefsPath = path.join(PROFILE, "Default", "Preferences");
    const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    const ext = prefs.extensions.settings[id];
    for (const key of ["granted_permissions", "active_permissions"]) {
      ext[key].explicit_host = ["*://*/*"];
      ext[key].scriptable_host = ["*://*/*"];
    }
    fs.writeFileSync(prefsPath, JSON.stringify(prefs));
    browser = await launch();
    for (let i = 0; i < 60; i++) {
      if (browser.targets().some((t) => t.type() === "service_worker")) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const check = await browser.newPage();
    await check.goto(PANEL, { waitUntil: "domcontentloaded" });
    console.log("all-sites after profile grant:", await check.evaluate(() => chrome.permissions.contains({ origins: ["*://*/*"] })));
    await check.evaluate(() => chrome.storage.local.set({ welcomeSeen: true, accessChoice: "all" }));
    await check.close();
  }

  // The rail draws each pin with Chrome's own cached favicon. A fresh
  // profile has cached nothing, so every pin would come out as the generic
  // globe. Visiting each site once fills the cache, the same way it fills
  // for a real user who has been to the site they pinned.
  const warm = await browser.newPage();
  for (const url of SAMPLE.pins) {
    await warm.goto(url, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
  }
  await warm.close();
  await new Promise((r) => setTimeout(r, 1500));

  // Each shot is a straight capture of the extension's own page. No
  // composition page in front of it: sidebar.html is not a web-accessible
  // resource, so an http page cannot frame it, and it should not have to.
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 720, deviceScaleFactor: 3 });

  for (const shot of SHOTS) {
    await page.goto(PANEL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1200));
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), shot.light ? "light" : "dark");
    if (shot.tab) await page.evaluate((n) => document.querySelector(`.rail-btn[data-panel="${n}"]`).click(), shot.tab);
    if (shot.open) {
      await page.evaluate((u) => {
        const b = [...document.querySelectorAll("#railSites .rail-btn")].find((x) => x.dataset.url && u.startsWith(new URL(x.dataset.url).origin));
        (b || document.getElementById("railLogo")).click();
      }, shot.open);
    }
    await new Promise((r) => setTimeout(r, shot.settle || 900));
    const out = path.join(OUT, "panel-" + shot.file);
    await page.screenshot({ path: out });
    console.log("wrote", out);
  }
  fs.writeFileSync(path.join(OUT, "shots.json"), JSON.stringify(SHOTS, null, 2));
  await browser.close();
})();
