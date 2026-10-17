/* With the strip drawn on a page and the panel closed, is that page in any
   way different from a page with no extension at all?

   The report was a login that took a two-factor code and then asked to log
   in again, which is what a session lost between requests looks like. So
   this walks a whole login: a form post that sets a session cookie, a
   redirect, and a page that only renders when the cookie comes back.

   Everything is measured twice -- once with the extension loaded and the
   strip on the page, once with no extension at all -- and the two runs must
   agree. */
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const http = require("http");

const REPO = process.argv[2];
const PROFILE = process.argv[3];
const EXT = path.join(REPO, "chrome");

const seen = []; // what the server was told, request by request

const site = http.createServer((req, res) => {
  const cookies = req.headers.cookie || "";
  seen.push({ url: req.url, ua: req.headers["user-agent"], hint: req.headers["sec-ch-ua-mobile"] || null, cookies });
  if (req.url === "/login") {
    // The two-factor step: hand out a session and send them on.
    res.writeHead(302, {
      "set-cookie": ["session=abc123; Path=/; HttpOnly; SameSite=Lax"],
      location: "/account",
    });
    res.end();
    return;
  }
  if (req.url === "/account") {
    const ok = cookies.includes("session=abc123");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><title>account</title><p id="state">${ok ? "logged in" : "asked to log in again"}</p>`);
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end('<!doctype html><title>start</title><p>start</p>');
});

const run = async (withExtension) => {
  const profile = PROFILE + (withExtension ? "-ext" : "-bare");
  fs.rmSync(profile, { recursive: true, force: true });
  const args = ["--no-first-run"];
  if (withExtension) args.push(`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`);
  let browser = await puppeteer.launch({ headless: false, userDataDir: profile, args });

  let id = null;
  if (withExtension) {
    for (let i = 0; i < 80 && !id; i++) {
      const t = browser.targets().find((x) => x.type() === "service_worker" && x.url().startsWith("chrome-extension://"));
      if (t) id = new URL(t.url()).host;
      else await new Promise((r) => setTimeout(r, 250));
    }
    // Grant every site, which is the state the fault was reported in.
    await browser.close();
    const prefsPath = path.join(profile, "Default", "Preferences");
    const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    const ext = prefs.extensions.settings[id];
    for (const key of ["granted_permissions", "active_permissions"]) {
      ext[key].explicit_host = ["*://*/*"];
      ext[key].scriptable_host = ["*://*/*"];
    }
    fs.writeFileSync(prefsPath, JSON.stringify(prefs));
    browser = await puppeteer.launch({ headless: false, userDataDir: profile, args });
    for (let i = 0; i < 80; i++) {
      if (browser.targets().some((t) => t.type() === "service_worker")) break;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // The panel is opened before any ordinary tab: sidePanel.open() needs the
  // click to land on a focused page, and a second tab in front of it eats
  // the gesture.
  let strip = false;
  let tab = null;
  if (withExtension) {
    const PANEL = `chrome-extension://${id}/sidebar/sidebar.html`;
    const opener = await browser.newPage();
    await opener.goto(PANEL, { waitUntil: "domcontentloaded" });
    await opener.evaluate(() => chrome.storage.local.set({ welcomeSeen: true, accessChoice: "all" }));
    await opener.evaluate(() => {
      const b = document.createElement("button");
      b.id = "openIt";
      b.style.cssText = "position:fixed;top:0;left:0;z-index:99999;width:120px;height:40px";
      b.addEventListener("click", async () => {
        const w = await chrome.windows.getCurrent();
        chrome.sidePanel.open({ windowId: w.id });
      });
      document.body.append(b);
    });
    await opener.click("#openIt");
    await new Promise((r) => setTimeout(r, 2500));
    let sidePanel = null;
    for (const t of browser.targets().filter((t) => t.url().startsWith(PANEL))) {
      let pg = await t.page().catch(() => null);
      if (!pg && t.asPage) pg = await t.asPage().catch(() => null);
      if (pg && pg !== opener) sidePanel = pg;
    }
    if (!sidePanel) {
      console.log("  panel targets:", browser.targets().filter((t) => t.url().startsWith(PANEL)).length);
      console.log("  all targets:", browser.targets().map((t) => t.type() + " " + t.url().slice(0, 70)).join("\n    "));
      throw new Error("no side panel");
    }
    // Open a site in it, which is what installs the header rule, then fold
    // to the strip -- the exact state the fault was reported in.
    await sidePanel.evaluate(() => {
      const box = document.getElementById("searchBox");
      box.value = "http://127.0.0.1:8759/";
      document.getElementById("searchForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await new Promise((r) => setTimeout(r, 2500));
    tab = await browser.newPage();
    await tab.goto("http://127.0.0.1:8759/", { waitUntil: "domcontentloaded" });
    await sidePanel.evaluate(() => chrome.runtime.sendMessage({ type: "fold" }));
    await new Promise((r) => setTimeout(r, 3000));
    await tab.bringToFront();
    strip = await tab.evaluate(() => !!document.querySelector("[data-lm-sidebar-rail-host]"));
  } else {
    tab = await browser.newPage();
    await tab.goto("http://127.0.0.1:8759/", { waitUntil: "domcontentloaded" });
  }

  // The login itself, in the ordinary tab.
  seen.length = 0;
  await tab.goto("http://127.0.0.1:8759/login", { waitUntil: "domcontentloaded" });
  const state = await tab.evaluate(() => document.getElementById("state")?.textContent || "(no state)");
  const uas = [...new Set(seen.map((s) => s.ua))];
  const hints = [...new Set(seen.map((s) => s.hint))];
  const cookieOnAccount = (seen.find((s) => s.url === "/account") || {}).cookies || "";

  await browser.close();
  return { strip, state, differentUserAgents: uas.length, hints, cookieOnAccount, requests: seen.map((s) => s.url) };
};

(async () => {
  await new Promise((r) => site.listen(8759, "127.0.0.1", r));
  // The run with the extension goes first: sidePanel.open() needs a focused
  // window, and a browser that has just closed can still hold the focus.
  const ext = await run(true);
  const bare = await run(false);
  site.close();
  console.log("NO EXTENSION :", JSON.stringify(bare));
  console.log("WITH STRIP   :", JSON.stringify(ext));
  console.log("");
  console.log("strip really was on the page :", ext.strip);
  console.log("login survived two factor    :", ext.state === "logged in", `(${ext.state})`);
  console.log("one user-agent throughout    :", ext.differentUserAgents === 1);
  // Chrome sends this hint itself; what matters is that it says the same
  // thing with the extension as without it.
  console.log("mobile hint unchanged        :", JSON.stringify(ext.hints) === JSON.stringify(bare.hints), JSON.stringify(ext.hints));
  console.log("same as with no extension    :", ext.state === bare.state && ext.cookieOnAccount === bare.cookieOnAccount);
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
