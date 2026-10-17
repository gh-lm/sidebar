/* Does the rule still reach the side panel itself?

   The question the first probe could not answer: a side panel is not a tab,
   but that has to be shown, not assumed. So this opens the real side panel
   -- through a real click, which is the only thing sidePanel.open() accepts
   -- and asks whether a page that refuses framing appears in it. */
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
    "content-security-policy": "default-src 'self'",
    "x-frame-options": "DENY",
    "set-cookie": ["sid=original; Path=/; HttpOnly; SameSite=Lax"],
  });
  res.end("<!doctype html><title>probe</title><p>probe</p>");
});

(async () => {
  await new Promise((r) => echo.listen(8757, "127.0.0.1", r));
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

  // sidePanel.open() only works from a real gesture, so put a real button on
  // the page and click it with the mouse.
  await opener.evaluate(() => {
    const b = document.createElement("button");
    b.id = "openIt";
    b.textContent = "open";
    b.style.cssText = "position:fixed;top:0;left:0;z-index:99999;width:120px;height:40px";
    b.addEventListener("click", async () => {
      const w = await chrome.windows.getCurrent();
      chrome.sidePanel.open({ windowId: w.id });
    });
    document.body.append(b);
  });
  await opener.click("#openIt");
  await new Promise((r) => setTimeout(r, 3000));

  const panelTargets = browser.targets().filter((t) => t.url().startsWith(PANEL));
  console.log("targets at", PANEL, ":", panelTargets.length);
  let sidePanel = null;
  for (const t of panelTargets) {
    console.log("  target type:", t.type());
    let pg = await t.page().catch(() => null);
    if (!pg && t.asPage) pg = await t.asPage().catch(() => null);
    if (pg && pg !== opener) sidePanel = pg;
  }
  if (!sidePanel) {
    console.log("RESULT: could not get hold of the side panel");
    await browser.close();
    echo.close();
    return;
  }
  console.log("got the side panel");

  // A logged-in tab, in effect: the same site, with a session cookie.
  const tab = await browser.newPage();
  await tab.goto("http://127.0.0.1:8757/", { waitUntil: "domcontentloaded" });
  const before = await tab.cookies();
  console.log("cookie in the tab before:", JSON.stringify(before.map((c) => [c.name, c.value, c.sameSite, c.httpOnly])));

  await sidePanel.evaluate(() => {
    const box = document.getElementById("searchBox");
    box.value = "http://127.0.0.1:8757/";
    document.getElementById("searchForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await new Promise((r) => setTimeout(r, 4000));

  const framed = sidePanel.frames().find((f) => f.url().startsWith("http://127.0.0.1:8757/"));
  const text = framed ? await framed.evaluate(() => document.body.innerText.trim()).catch((e) => "(unreadable)") : "(no frame)";
  console.log("RESULT: side panel framed a page that says X-Frame-Options DENY:", text === "probe", "|", text);

  const after = await tab.cookies();
  console.log("cookie in the tab after :", JSON.stringify(after.map((c) => [c.name, c.value, c.sameSite, c.httpOnly])));
  const same =
    before.length === after.length &&
    before.every((b) => after.some((a) => a.name === b.name && a.value === b.value && a.sameSite === b.sameSite && a.httpOnly === b.httpOnly));
  console.log("RESULT: the site's real cookies are untouched:", same);

  await browser.close();
  echo.close();
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
