/* Does opening a site in the panel disturb that site's real cookies?

   A login breaking is what cookies breaking looks like, so the copies the
   panel makes have to be proved to be copies. Sets a session cookie in an
   ordinary tab, opens the same site in the real side panel, then reads the
   tab's cookies back. */
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const http = require("http");

const REPO = process.argv[2];
const PROFILE = process.argv[3];
const EXT = path.join(REPO, "chrome");

const echo = http.createServer((req, res) => {
  res.writeHead(200, {
    "content-type": "text/html",
    "set-cookie": ["sid=original; Path=/; HttpOnly; SameSite=Lax"],
  });
  res.end("<!doctype html><title>probe</title><p>probe</p>");
});

(async () => {
  await new Promise((r) => echo.listen(8758, "127.0.0.1", r));
  const launch = () =>
    puppeteer.launch({
      headless: false,
      userDataDir: PROFILE,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
    });
  let browser = await launch();
  const worker = async () => {
    for (let i = 0; i < 80; i++) {
      const t = browser.targets().find((x) => x.type() === "service_worker" && x.url().startsWith("chrome-extension://"));
      if (t) return t;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("no service worker");
  };
  const id = new URL((await worker()).url()).host;
  const PANEL = `chrome-extension://${id}/sidebar/sidebar.html`;

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
  await worker();

  const opener = await browser.newPage();
  await opener.goto(PANEL, { waitUntil: "domcontentloaded" });
  await opener.evaluate(() => chrome.storage.local.set({ welcomeSeen: true, accessChoice: "all" }));
  await opener.evaluate(() => {
    const b = document.createElement("button");
    b.id = "openIt";
    b.style.cssText = "position:fixed;top:0;left:0;z-index:99999;width:120px;height:40px";
    b.textContent = "open";
    b.addEventListener("click", async () => {
      const w = await chrome.windows.getCurrent();
      chrome.sidePanel.open({ windowId: w.id });
    });
    document.body.append(b);
  });
  let sidePanel = null;
  for (let attempt = 0; attempt < 5 && !sidePanel; attempt++) {
    await opener.bringToFront();
    await opener.click("#openIt").catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));
    for (const t of browser.targets().filter((t) => t.url().startsWith(PANEL))) {
      let pg = await t.page().catch(() => null);
      if (pg && pg !== opener) sidePanel = pg;
    }
  }
  if (!sidePanel) throw new Error("no side panel");
  console.log("got the side panel");

  // A logged-in tab, in effect.
  const tab = await browser.newPage();
  await tab.goto("http://127.0.0.1:8758/", { waitUntil: "domcontentloaded" });
  const before = await tab.cookies();
  console.log("cookie in the tab before:", JSON.stringify(before.map((c) => [c.name, c.value, c.sameSite, c.httpOnly])));

  await sidePanel.evaluate(() => {
    const box = document.getElementById("searchBox");
    box.value = "http://127.0.0.1:8758/";
    document.getElementById("searchForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await new Promise((r) => setTimeout(r, 4000));

  const after = await tab.cookies();
  console.log("cookie in the tab after :", JSON.stringify(after.map((c) => [c.name, c.value, c.sameSite, c.httpOnly])));
  const same =
    before.length === after.length &&
    before.every((b) => after.some((a) => a.name === b.name && a.value === b.value && a.sameSite === b.sameSite && a.httpOnly === b.httpOnly));
  console.log("RESULT: the site's real cookies are untouched:", same);

  await browser.close();
  echo.close();
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
