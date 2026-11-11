// Photographs the extension actually running.
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
    file: "05-private.png",
    h: "It starts with|access to|no websites",
    s: "No account, no server, no analytics. What you save lives|in one bookmarks folder, which is yours to delete.",
    tab: "information",
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

  const warm = await browser.newPage();
  for (const url of SAMPLE.pins) {
    await warm.goto(url, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
  }
  await warm.close();
  await new Promise((r) => setTimeout(r, 1500));

  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 720, deviceScaleFactor: 3 });

  for (const shot of SHOTS) {
    await page.goto(PANEL, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1200));
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
