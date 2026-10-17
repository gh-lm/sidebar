/* Does the panel's header rule reach ordinary tabs?

   Launches the real extension, grants every site the way a user would,
   makes the panel open a site (which is what installs the rule), then asks
   an ordinary tab what the server saw. */
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const http = require("http");

const REPO = process.argv[2];
const PROFILE = process.argv[3];
const EXT = path.join(REPO, "chrome");

// Says back what it was sent, so a header set by the extension is visible.
const echo = http.createServer((req, res) => {
  const body = JSON.stringify({
    ua: req.headers["user-agent"],
    mobileHint: req.headers["sec-ch-ua-mobile"] || null,
  });
  if (req.url === "/page") {
    res.writeHead(200, {
      "content-type": "text/html",
      "content-security-policy": "default-src 'self'",
      "x-frame-options": "DENY",
    });
    res.end("<!doctype html><title>probe</title><p>probe</p>");
    return;
  }
  res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(body);
});

(async () => {
  await new Promise((r) => echo.listen(8756, "127.0.0.1", r));
  const launch = () =>
    puppeteer.launch({
      headless: "new",
      userDataDir: PROFILE,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
    });
  let browser = await launch();
  const worker = async () => {
    for (let i = 0; i < 60; i++) {
      const t = browser.targets().find((x) => x.type() === "service_worker" && x.url().startsWith("chrome-extension://"));
      if (t) return t;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("no service worker");
  };
  const id = new URL((await worker()).url()).host;
  const PANEL = `chrome-extension://${id}/sidebar/sidebar.html`;

  // Grant every site by writing the profile, as the screenshot harness does:
  // headless Chrome cannot show the permission prompt.
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

  const panel = await browser.newPage();
  await panel.goto(PANEL, { waitUntil: "domcontentloaded" });
  await panel.evaluate(() => chrome.storage.local.set({ welcomeSeen: true, accessChoice: "all" }));
  console.log("all sites allowed:", await panel.evaluate(() => chrome.permissions.contains({ origins: ["*://*/*"] })));

  // Open a site in the panel, which is what installs the header rule.
  await panel.evaluate(() => {
    const box = document.getElementById("searchBox");
    box.value = "http://127.0.0.1:8756/page";
    document.getElementById("searchForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await new Promise((r) => setTimeout(r, 3000));

  const rules = await panel.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
  console.log("session rules:", JSON.stringify(rules, null, 1));

  // Now an ordinary tab, nothing to do with the panel.
  const tab = await browser.newPage();
  await tab.goto("http://127.0.0.1:8756/page", { waitUntil: "domcontentloaded" });
  const seen = await tab.evaluate(async () => ({
    page: navigator.userAgent,
    fetch: await (await fetch("/echo")).json(),
  }));
  // And the panel itself: the probe page refuses framing, so if it rendered
  // there, the rule is still doing its job where it is wanted.
  const framed = panel.frames().find((f) => f.url().startsWith("http://127.0.0.1:8756/"));
  let panelText = "(no frame)";
  if (framed) panelText = await framed.evaluate(() => document.body.innerText.trim()).catch((e) => "(unreadable: " + e.message + ")");
  console.log("PANEL");
  console.log("  framed a page that says X-Frame-Options: DENY:", panelText === "probe");
  console.log("  frame said:", panelText);

  console.log("ORDINARY TAB");
  console.log("  page user-agent :", seen.page.slice(0, 60));
  console.log("  fetch user-agent:", seen.fetch.ua.slice(0, 60));
  console.log("  fetch mobile hint:", seen.fetch.mobileHint);
  console.log("  MISMATCH:", seen.page !== seen.fetch.ua);

  await browser.close();
  echo.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
