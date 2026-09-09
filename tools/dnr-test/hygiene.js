/* Is an ordinary website, in an ordinary tab, in any way different because
   this extension is installed?

   Every measurement is taken twice: once in a browser with the extension
   loaded, once in a browser with nothing loaded at all. Anything that does
   not match is a way the extension is reaching into pages it has no business
   in, which is what broke logins.

   Four states are measured, because the fault only appeared in one of them:
     clean    no extension
     idle     installed, every site allowed, nothing opened
     panel    a site open in the panel  (this is what installs the header rule)
     strip    that site folded away to the strip on the page

   Usage:  DISPLAY=:0 node hygiene.js <repo> <scratch dir>
*/
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const http = require("http");

const REPO = process.argv[2];
const SCRATCH = process.argv[3];
const EXT = path.join(REPO, "chrome");
const PORT = 8761;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let requests = []; // every header the server was given

const server = http.createServer((req, res) => {
  requests.push({
    url: req.url,
    ua: req.headers["user-agent"],
    mobile: req.headers["sec-ch-ua-mobile"] || null,
    platform: req.headers["sec-ch-ua-platform"] || null,
    cookie: req.headers.cookie || "",
    accept: req.headers.accept || "",
  });
  const send = (code, headers, body) => { res.writeHead(code, headers); res.end(body); };

  switch (req.url) {
    case "/":
      // Pulls in one of every kind of thing a page loads, so each is
      // measured separately: they are separate resource types to the rule.
      return send(200, { "content-type": "text/html", "set-cookie": ["sid=real; Path=/; HttpOnly; SameSite=Lax"] }, `<!doctype html><title>site</title>
<link rel="stylesheet" href="/style.css">
<style>@font-face{font-family:P;src:url(/font.woff2) format("woff2")} body{font-family:P}</style>
<img src="/pic.png" alt="">
<iframe src="/inner" title="inner"></iframe>
<script src="/script.js"></script>
<script>document.cookie = "jscookie=yes; SameSite=Lax";</script>
<p id="hello">hello</p>`);
    case "/style.css": return send(200, { "content-type": "text/css" }, "body{color:#123456}");
    case "/script.js": return send(200, { "content-type": "text/javascript" }, "window.__script = true;");
    case "/pic.png": return send(200, { "content-type": "image/png" }, Buffer.from("89504e470d0a1a0a", "hex"));
    case "/font.woff2": return send(200, { "content-type": "font/woff2" }, Buffer.alloc(8));
    case "/inner": return send(200, { "content-type": "text/html" }, "<!doctype html><p>inner</p>");
    case "/echo": return send(200, { "content-type": "application/json" }, JSON.stringify({ ok: true }));
    case "/csp":
      // If the policy survives, the inline script cannot run.
      return send(200, { "content-type": "text/html", "content-security-policy": "script-src 'none'" },
        `<!doctype html><title>csp</title><p id="ran">no</p><script>document.getElementById("ran").textContent="yes"</script>`);
    case "/denyframe":
      return send(200, { "content-type": "text/html", "x-frame-options": "DENY" }, "<!doctype html><p>secret</p>");
    case "/framer":
      return send(200, { "content-type": "text/html" },
        `<!doctype html><title>framer</title><iframe id="f" src="/denyframe" title="denied"></iframe>`);
    default: return send(404, { "content-type": "text/plain" }, "no");
  }
});

const launch = (profile, withExtension) =>
  puppeteer.launch({
    headless: false,
    userDataDir: profile,
    args: withExtension
      ? [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"]
      : ["--no-first-run"],
  });

const workerTarget = async (browser) => {
  for (let i = 0; i < 80; i++) {
    const t = browser.targets().find((x) => x.type() === "service_worker" && x.url().startsWith("chrome-extension://"));
    if (t) return t;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("the extension's service worker never started");
};

// Everything measurable about an ordinary page, from inside it.
async function measure(browser) {
  requests = [];
  const tab = await browser.newPage();
  await tab.bringToFront();
  await tab.goto(`${ORIGIN}/`, { waitUntil: "networkidle2" });

  const inPage = await tab.evaluate(async () => {
    const fetched = await fetch("/echo").then((r) => r.json()).catch(() => null);
    return {
      userAgent: navigator.userAgent,
      mobile: navigator.userAgentData ? navigator.userAgentData.mobile : null,
      platform: navigator.platform,
      globals: Object.getOwnPropertyNames(window).sort().join(","),
      htmlChildren: [...document.documentElement.children].map((e) => e.tagName).join(","),
      ourNodes: document.querySelectorAll("[data-lm-sidebar-rail-host]").length,
      ourStyles: document.querySelectorAll("#lightmorphic-sidebar-scroll").length,
      cookie: document.cookie.split("; ").sort().join("; "),
      localStorage: Object.keys(localStorage).sort().join(","),
      sessionStorage: Object.keys(sessionStorage).sort().join(","),
      scrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth || "(unset)",
      bodyColour: getComputedStyle(document.body).color,
      scriptRan: !!window.__script,
      fetched: JSON.stringify(fetched),
    };
  });

  // Is the content security policy still enforced?
  const csp = await tab.goto(`${ORIGIN}/csp`, { waitUntil: "domcontentloaded" })
    .then(() => tab.evaluate(() => document.getElementById("ran").textContent));

  // Is X-Frame-Options still honoured in an ordinary page?
  await tab.goto(`${ORIGIN}/framer`, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 700));
  const framedSecret = await tab.evaluate(() => {
    const f = document.getElementById("f");
    try { return f.contentDocument ? f.contentDocument.body.innerText.trim() : "(blocked)"; }
    catch { return "(blocked)"; }
  });

  const cookies = (await tab.cookies(`${ORIGIN}/`)).map((c) =>
    [c.name, c.value, c.sameSite || "(none)", c.httpOnly, c.secure].join("|")).sort();

  await tab.close();

  // Keyed by what was asked for, so the browser fetching its own favicon in
  // one profile and not another does not read as a difference. Only the
  // headers matter, and only for things both runs asked for.
  const byUrl = {};
  for (const r of requests) {
    if (r.url === "/favicon.ico") continue;
    if (!byUrl[r.url]) byUrl[r.url] = [r.ua, r.mobile, r.platform].join(" | ");
  }

  return { ...inPage, csp, framedSecret, cookies: cookies.join("\n"), headers: byUrl };
}

async function openPanel(browser, id) {
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
  for (const t of browser.targets().filter((t) => t.url().startsWith(PANEL))) {
    let pg = await t.page().catch(() => null);
    if (!pg && t.asPage) pg = await t.asPage().catch(() => null);
    if (pg && pg !== opener) return { sidePanel: pg, opener };
  }
  throw new Error("the side panel would not open");
}

(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH, { recursive: true });
  const results = {};

  // ---- with the extension, in its three states ----
  const profile = path.join(SCRATCH, "ext");
  let browser = await launch(profile, true);
  const id = new URL((await workerTarget(browser)).url()).host;
  await browser.close();
  const prefsPath = path.join(profile, "Default", "Preferences");
  const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
  for (const key of ["granted_permissions", "active_permissions"]) {
    prefs.extensions.settings[id][key].explicit_host = ["*://*/*"];
    prefs.extensions.settings[id][key].scriptable_host = ["*://*/*"];
  }
  fs.writeFileSync(prefsPath, JSON.stringify(prefs));
  browser = await launch(profile, true);
  await workerTarget(browser);

  const { sidePanel, opener } = await openPanel(browser, id);
  results.idle = await measure(browser);

  await sidePanel.bringToFront();
  await sidePanel.evaluate((origin) => {
    const box = document.getElementById("searchBox");
    box.value = origin + "/";
    document.getElementById("searchForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }, ORIGIN);
  await new Promise((r) => setTimeout(r, 3000));
  results.panel = await measure(browser);

  // Folding draws the strip on the page the user is looking at, so an
  // ordinary page has to be the one in front -- fold with an extension page
  // in front and it refuses, and the state under test never happens.
  const front = await browser.newPage();
  await front.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
  await front.bringToFront();
  await sidePanel.evaluate(() => chrome.runtime.sendMessage({ type: "fold" }));
  await new Promise((r) => setTimeout(r, 3500));
  // A successful fold closes the panel, so ask an extension page that is
  // still open rather than the one that has just gone.
  const fold = await opener.evaluate(() => chrome.storage.local.get(["pageStrip", "lastFold"]));
  console.log("fold:", fold.pageStrip ? "strip is on" : "REFUSED", "-", (fold.lastFold?.steps || []).slice(-2).join(" / "));
  results.strip = await measure(browser);
  await browser.close();

  // ---- and with nothing installed at all ----
  const bare = await launch(path.join(SCRATCH, "bare"), false);
  results.clean = await measure(bare);
  await bare.close();
  server.close();

  // ---- report ----
  // Headers are compared request by request, so the browser fetching its
  // own favicon in one profile and not the other is not read as a change.
  const headerDiff = (state) => {
    const a = results.clean.headers;
    const b = results[state].headers;
    return Object.keys(a)
      .filter((u) => u in b && a[u] !== b[u])
      .map((u) => `${u}\n      clean : ${a[u]}\n      ${state.padEnd(6)}: ${b[u]}`);
  };

  const STATES = ["idle", "panel", "strip"];
  const headerDiffs = Object.fromEntries(STATES.map((s2) => [s2, headerDiff(s2)]));
  const fields = Object.keys(results.clean).filter((f) => f !== "headers");
  let bad = 0;

  for (const state of STATES) {
    const diffs = fields.filter((f) => results[state][f] !== results.clean[f]);
    if (headerDiffs[state].length) diffs.push("headers");
    // The strip is meant to be on the page in that state, and nowhere else.
    const expected = state === "strip" ? ["ourNodes", "htmlChildren"] : [];
    const unexpected = diffs.filter((d) => !expected.includes(d));
    console.log(`\n== ${state} vs a browser with no extension ==`);
    if (!diffs.length) console.log("   identical in every measurement");
    for (const d of diffs) {
      const mark = expected.includes(d) ? "expected" : "UNEXPECTED";
      console.log(`   ${mark}: ${d}`);
      if (mark !== "UNEXPECTED") continue;
      if (d === "headers") {
        console.log("   " + headerDiffs[state].join("\n   "));
      } else {
        console.log(`      clean : ${String(results.clean[d]).slice(0, 400)}`);
        console.log(`      ${state.padEnd(6)}: ${String(results[state][d]).slice(0, 400)}`);
      }
    }
    bad += unexpected.length;
  }

  console.log("\nheaders the server was given, for the page and everything it loads:");
  for (const u of Object.keys(results.clean.headers).sort()) {
    const same = STATES.every((s2) => results[s2].headers[u] === results.clean.headers[u]);
    console.log(`   ${u.padEnd(12)} ${same ? "same as clean" : "DIFFERENT"}`);
  }

  console.log("\nsecurity headers still doing their job:");
  console.log("   inline script blocked by the policy :", ["clean", ...STATES].map((s2) => `${s2}=${results[s2].csp}`).join(" "));
  console.log("   framing a DENY page still refused   :", ["clean", ...STATES].map((s2) => `${s2}=${results[s2].framedSecret}`).join(" "));

  // If the strip was never drawn, the state that matters was never tested.
  const stripWasThere = results.strip.ourNodes === 1;
  console.log("\nthe strip really was on the page in the strip run:", stripWasThere);
  if (!stripWasThere) bad += 1;

  console.log(`\nRESULT: ${bad === 0 ? "PASS -- an ordinary page is identical with and without this extension" : bad + " unexpected difference(s)"}`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error("FAILED", e.stack); process.exit(2); });
