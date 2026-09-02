import * as store from "../lib/store.js";


// Wake the background worker and have it run its once-per-launch boot
// work. This page reliably exists at every launch (the panel auto-opens),
// which makes it the dependable boot trigger -- the worker itself is NOT
// started by Chromium at launch on existing profiles, and onStartup
// doesn't fire for --load-extension extensions.
chrome.runtime.sendMessage({ type: "sidebar-boot" }).catch(() => {});

// Health probe: a few seconds after the ping, check whether the worker
// actually produced a fresh boot report. Written to storage so a
// misbehaving install carries its own evidence (the worker being dead
// explains every "my setting didn't stick" class of bug at once).
setTimeout(async () => {
  const { lastBootReport } = await chrome.storage.local.get("lastBootReport");
  const fresh = lastBootReport?.at && Date.now() - Date.parse(lastBootReport.at) < 5 * 60 * 1000;
  await chrome.storage.local.set({
    sidebarBootCheck: { at: new Date().toISOString(), workerResponded: !!fresh },
  });
}, 5000);

// ---- Icon rail ----
// Only tab buttons (data-panel) switch views. The "+" button and the
// pinned-site favicons are .rail-btn too but have their own handlers --
// binding them here used to deactivate every view when "+" was clicked.
const HOME_PANEL = "search";

function showPanel(name) {
  document.querySelectorAll(".rail-btn[data-panel]").forEach((b) => {
    const on = b.dataset.panel === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll(".panel-view").forEach((p) => {
    p.classList.toggle("active", p.id === `panel-${name}`);
  });
}

for (const btn of document.querySelectorAll(".rail-btn[data-panel]")) {
  btn.addEventListener("click", () => {
    // Clicking the tab you are already on takes you back out of it —
    // otherwise there is no way to shut Information again without picking
    // something else, which is not what pressing the same button means.
    const alreadyHere = btn.classList.contains("active");
    showPanel(alreadyHere && btn.dataset.panel !== HOME_PANEL ? HOME_PANEL : btn.dataset.panel);
  });
}

// The mark under the chevron opens the Lightmorphic Sidebar site in the panel,
// like any pinned site.
document.getElementById("railLogo")?.addEventListener("click", () => {
  openPanelSite("https://sidebar.lightmorphic.com");
});

// ---- Page size ----
// Sites built for a phone are often wider than this panel, and the part that
// falls off the edge is content, not decoration. Rather than crop it, the
// page is laid out wider and drawn smaller.
const ZOOMS = [1, 0.9, 0.8, 0.7];
const panelZoomBtn = document.getElementById("panelZoom");

function paintZoom(z) {
  document.documentElement.style.setProperty("--zoom", String(z));
  if (panelZoomBtn) panelZoomBtn.textContent = `${Math.round(z * 100)}%`;
}

// Full size by default now: pages fit themselves from the inside, which
// works on pages that scaling the frame never could. This is left as a
// preference for anyone who wants everything smaller anyway.
chrome.storage.local.get("panelZoom").then(({ panelZoom = 1 }) => paintZoom(panelZoom));

panelZoomBtn?.addEventListener("click", async () => {
  const now = Number(getComputedStyle(document.documentElement).getPropertyValue("--zoom")) || 0.9;
  const next = ZOOMS[(ZOOMS.findIndex((z) => Math.abs(z - now) < 0.01) + 1) % ZOOMS.length];
  await chrome.storage.local.set({ panelZoom: next });
  paintZoom(next);
});

// ---- Framing pinned sites ----
// Most big sites (BBC, Google, etc.) send X-Frame-Options or a CSP
// frame-ancestors directive that forbids being loaded in an iframe --
// so a plain iframe just shows "refused to connect". To load them in
// the panel we strip those response headers, but ONLY for the exact
// host the user deliberately pinned/opened, via a per-host session
// declarativeNetRequest rule. Clickjacking protection stays fully intact
// for every other site in the browser; the tradeoff is limited to sites
// the user explicitly chose to embed. (DNR can only remove a whole
// header, not edit within CSP, so the site's entire CSP is dropped for
// its framed load -- documented, and scoped to that one host.)
// Registered once per host, and only for a host the user has allowed. The
// script itself refuses to run anywhere except inside this panel, so a tab
// the user opens on the same site behaves exactly as it always did.
// When every site is allowed, register once for everything rather than
// waiting to meet each host. Charlie's own install is in exactly that state,
// and per-host registration meant the first visit to a site still got the
// old scrollbar.
async function ensureMobileScriptEverywhere() {
  try {
    if (!(await chrome.permissions.contains({ origins: ["*://*/*"] }))) return false;
  } catch {
    return false;
  }
  await registerPair("all", "*://*/*");
  return true;
}

async function registerPair(key, match) {
  const wanted = [
    {
      id: `scroll-${key}`,
      matches: [match],
      allFrames: true,
      runAt: "document_start",
      js: ["lib/panel-scroll.js"],
    },
    {
      id: `mobile-${key}`,
      matches: [match],
      allFrames: true,
      runAt: "document_start",
      world: "MAIN",
      js: ["lib/mobile-ua.js"],
    },
  ];
  let existing = [];
  try {
    existing = await chrome.scripting.getRegisteredContentScripts();
  } catch {
    return;
  }
  const have = new Set(existing.map((e) => e.id));
  for (const script of wanted) {
    if (have.has(script.id)) continue;
    try {
      await chrome.scripting.registerContentScripts([script]);
    } catch {
      /* this one is not allowed here; the other still stands */
    }
  }
}

async function ensureMobileScript(host) {
  if (await ensureMobileScriptEverywhere()) return;
  await registerPair(host, `*://${host}/*`);
}

// A current Chrome on Android. Kept close to the real thing so nothing
// refuses to serve it.
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

function hostRuleId(host) {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) & 0x7fffffff;
  return (h % 2000000000) + 1; // DNR ids must be >= 1
}

// Host permission is OPTIONAL and asked for at the moment the user opens
// a panel, from their own click -- Lightmorphic Sidebar ships with no access to any
// site until they pin one. Returns false if they decline, so the caller can
// fall back to opening the site in a tab instead of showing a dead frame.
async function ensureHostAccess(host) {
  const origins = [`*://${host}/*`];
  if (await chrome.permissions.contains({ origins })) return true;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false; // not called from a user gesture
  }
}

async function allowFramingFor(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (!(await ensureHostAccess(host))) return false;
  await ensureMobileScript(host);
  const id = hostRuleId(host);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [id],
    addRules: [
      {
        id,
        priority: 1,
        action: {
          type: "modifyHeaders",
          // Ask for the phone layout. The panel is roughly a phone wide, and
          // a desktop page in it is unreadable — Google in particular came
          // back at full width and simply did not fit. Sites decide from the
          // user-agent and the client hints, so both are set, and both for
          // the page and everything it loads.
          requestHeaders: [
            { header: "user-agent", operation: "set", value: MOBILE_UA },
            { header: "sec-ch-ua-mobile", operation: "set", value: "?1" },
            { header: "sec-ch-ua-platform", operation: "set", value: '"Android"' },
          ],
          responseHeaders: [
            { header: "x-frame-options", operation: "remove" },
            { header: "content-security-policy", operation: "remove" },
            { header: "content-security-policy-report-only", operation: "remove" },
          ],
        },
        condition: {
          requestDomains: [host],
          resourceTypes: ["sub_frame", "xmlhttprequest", "script", "stylesheet", "image", "font", "other"],
        },
      },
    ],
  });
  return true;
}

async function loadInFrame(frame, url) {
  if (!(await allowFramingFor(url))) {
    // Declined: a frame without the header rule would just say "refused to
    // connect", so open it where it does work.
    chrome.tabs.create({ url });
    return;
  }
  frame.src = url;
  frameClip.hidden = false;
}

// ---- Search ----
// The new-tab page this replaced was a search box and nothing else, and a
// replaceable page was the wrong home for it: taking over someone's new tab
// is a big thing to do for one text field. It lives here instead, opens on
// top when the panel opens, and shows its results here too — nothing about
// this extension reaches outside the panel.
const searchForm = document.getElementById("searchForm");
const searchBox = document.getElementById("searchBox");
const searchRecent = document.getElementById("searchRecent");

// Seven engines, one letter each. A row of initials is quicker to hit than
// a menu and takes one line: press the letter and it searches with that
// engine there and then, rather than setting a preference and waiting.
const ENGINES = [
  // DuckDuckGo's own lightweight endpoint. The full site does not fit a
  // panel even at phone width — it still scrolls sideways — and it throws a
  // bot challenge at a framed request. This one fits, loads instantly and
  // just works.
  // kae=d is DuckDuckGo's own dark theme, and the light pages have no other
  // way of knowing: they do not follow the browser's setting.
  { id: "ddg", letter: "D", name: "DuckDuckGo", url: "https://lite.duckduckgo.com/lite/?q=", dark: "&kae=d" },
  { id: "google", letter: "G", name: "Google", url: "https://www.google.com/search?q=" },
  { id: "gimages", letter: "I", name: "Google Images", url: "https://www.google.com/search?tbm=isch&q=" },
  { id: "bing", letter: "B", name: "Bing", url: "https://www.bing.com/search?q=" },
  { id: "startpage", letter: "S", name: "Startpage", url: "https://www.startpage.com/sp/search?query=" },
  { id: "mojeek", letter: "M", name: "Mojeek", url: "https://www.mojeek.com/search?q=" },
  { id: "qwant", letter: "Q", name: "Qwant", url: "https://lite.qwant.com/?q=" },
];

let engine = ENGINES[0];

async function loadEngine() {
  const { searchEngine } = await chrome.storage.local.get("searchEngine");
  engine = ENGINES.find((e) => e.id === searchEngine) || ENGINES[0];
  renderEngines();
}

function renderEngines() {
  const box = document.getElementById("searchEngines");
  if (!box) return;
  box.innerHTML = "";
  for (const e of ENGINES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "engine";
    b.textContent = e.letter;
    b.title = `Search with ${e.name}`;
    b.setAttribute("aria-label", `Search with ${e.name}`);
    b.setAttribute("aria-pressed", String(e.id === engine.id));
    b.addEventListener("click", async () => {
      // Ask first, while the click still counts as a gesture.
      await ensureEngineAccess();
      engine = e;
      await chrome.storage.local.set({ searchEngine: e.id });
      renderEngines();
      // Pressing a letter is the search, not a setting: if there is
      // something in the box, go.
      const q = searchBox.value.trim() || lastQuery;
      if (q) runSearch(q);
      else searchBox.focus();
    });
    box.appendChild(b);
  }
}

// Is the panel dark at this moment — whether that came from the browser or
// from the button on the rail.
function panelIsDark() {
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced) return forced === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function searchUrlFor(q) {
  // Bare domains and addresses go straight there; anything else searches.
  const looksLikeUrl = /^(https?:\/\/|[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$))/i.test(q);
  if (looksLikeUrl) return q.startsWith("http") ? q : `https://${q}`;
  // Engines that follow the browser need nothing; the ones that do not are
  // told, so results match the panel they are sitting in.
  const dark = panelIsDark() && engine.dark ? engine.dark : "";
  return engine.url + encodeURIComponent(q) + dark;
}

// Every engine is a different site, so asking one at a time meant a prompt
// for each — seven interruptions to use a search box. Ask for all of them
// once instead, at the first search, in a single prompt.
const ENGINE_ORIGINS = [
  "*://lite.duckduckgo.com/*",
  "*://www.google.com/*",
  "*://www.bing.com/*",
  "*://www.startpage.com/*",
  "*://www.mojeek.com/*",
  "*://lite.qwant.com/*",
];

let engineAccessAsked = false;

async function ensureEngineAccess() {
  if (engineAccessAsked) return;
  engineAccessAsked = true;
  try {
    if (await chrome.permissions.contains({ origins: ENGINE_ORIGINS })) return;
    await chrome.permissions.request({ origins: ENGINE_ORIGINS });
  } catch {
    /* not a user gesture, or declined — the per-site ask still covers it */
  }
}

let lastQuery = "";

async function runSearch(q) {
  const query = (q || "").trim();
  if (!query) return;
  lastQuery = query;
  // Everything stays in the panel: the results load here, the same way a
  // pinned site does, which means asking for that one host the first time.
  // Only a refusal sends it to a tab, and that is the fallback in
  // loadInFrame rather than a choice made here.
  openPanelSite(searchUrlFor(query));
  const { recentSearches = [] } = await chrome.storage.local.get("recentSearches");
  const next = [query, ...recentSearches.filter((r) => r !== query)].slice(0, 6);
  await chrome.storage.local.set({ recentSearches: next });
  renderRecentSearches(next);
}

const recentToggle = document.getElementById("recentToggle");
const recentDrawer = document.getElementById("recentDrawer");

function openRecent() {
  recentDrawer.hidden = false;
  // A frame between showing it and sliding it, or there is nothing to
  // transition from.
  requestAnimationFrame(() => recentDrawer.classList.add("open"));
  recentToggle.setAttribute("aria-expanded", "true");
}

function closeRecent() {
  recentDrawer.classList.remove("open");
  recentToggle.setAttribute("aria-expanded", "false");
  setTimeout(() => { if (!recentDrawer.classList.contains("open")) recentDrawer.hidden = true; }, 220);
}

recentToggle.addEventListener("click", () =>
  recentDrawer.classList.contains("open") ? closeRecent() : openRecent()
);
document.getElementById("recentClose").addEventListener("click", closeRecent);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && recentDrawer.classList.contains("open")) closeRecent();
});

async function renderRecentSearches(list) {
  const recent = list || (await chrome.storage.local.get("recentSearches")).recentSearches || [];
  searchRecent.innerHTML = "";
  recentToggle.hidden = recent.length === 0;
  if (!recent.length) {
    if (recentDrawer.classList.contains("open")) closeRecent();
    return;
  }
  for (const q of recent) {
    const row = document.createElement("div");
    row.className = "snippet-row";
    const go = document.createElement("button");
    go.className = "snippet-text";
    const inner = document.createElement("span");
    inner.className = "snippet-clamp";
    inner.textContent = q;
    go.appendChild(inner);
    go.title = `Search again for ${q}`;
    go.addEventListener("click", () => {
      closeRecent();
      runSearch(q);
    });
    const drop = document.createElement("button");
    drop.className = "snippet-delete";
    drop.innerHTML =
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6.5 6.5l7 7M13.5 6.5l-7 7"/></svg>';
    drop.title = "Forget this search";
    drop.setAttribute("aria-label", "Forget this search");
    drop.addEventListener("click", async (e) => {
      e.stopPropagation();
      const { recentSearches = [] } = await chrome.storage.local.get("recentSearches");
      const kept = recentSearches.filter((r) => r !== q);
      await chrome.storage.local.set({ recentSearches: kept });
      renderRecentSearches(kept);
    });
    row.append(go, drop);
    searchRecent.appendChild(row);
  }
}

searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = searchBox.value;
  await ensureEngineAccess();
  runSearch(q);
});

// ---- Scratchpad ----
const notepad = document.getElementById("notepad");
let scratchpadSaveTimer = null;

async function loadScratchpad() {
  const { notepadText = "" } = await chrome.storage.local.get("notepadText");
  notepad.value = notepadText;
}

notepad.addEventListener("input", () => {
  clearTimeout(scratchpadSaveTimer);
  scratchpadSaveTimer = setTimeout(async () => {
    await chrome.storage.local.set({ notepadText: notepad.value });
    store.writeScratchpad(notepad.value).catch(() => {});
  }, 600);
});

// ---- Web panels (pinned sites) ----
// Pinned sites live as favicon buttons in the rail (Vivaldi-style). The
// "+" grabs the current tab's URL, opens a dialog to edit it before
// saving, and the saved site appears as a rail icon. Click an icon to
// open the site in the panel; right-click it to edit or remove. Framing
// headers are stripped per-host in loadInFrame so sites that block
// iframing (BBC etc.) still load.
const webPanelFrame = document.getElementById("webPanelFrame");
const frameClip = document.getElementById("frameClip");
const panelsEmpty = document.getElementById("panelsEmpty");
const panelNav = document.getElementById("panelNav");
const panelNavHost = document.getElementById("panelNavHost");
const railSites = document.getElementById("railSites");
const railAddSite = document.getElementById("railAddSite");

let currentPanelUrl = null;

// Back / forward / reload for the open pinned site.
// The frame is cross-origin, so its history is out of reach, and the panel's
// own history() does not step it either — that was tried and does nothing.
// So the panel keeps its own list of what it has opened. Back walks that
// list, and stepping back off the front of it returns to the search page,
// which is where the journey started.
const panelBackBtn = document.getElementById("panelBack");
const panelForwardBtn = document.getElementById("panelForward");

function paintNavButtons() {
  panelBackBtn.disabled = false; // back always does something: page, or search
  panelForwardBtn.disabled = panelIndex >= panelHistory.length - 1;
}

function reloadPanel() {
  if (currentPanelUrl) webPanelFrame.src = currentPanelUrl;
}

// Coming back to the search page, the words you searched for are still in
// the box and selected — so a different engine is one key away, and typing
// replaces it. Going back to an empty box would mean retyping it to try
// somewhere else, which is the whole reason for going back.
function returnToSearch() {
  showPanel(HOME_PANEL);
  if (lastQuery) searchBox.value = lastQuery;
  searchBox.focus();
  searchBox.select();
}

function panelBack() {
  if (panelIndex > 0) {
    panelIndex -= 1;
    openPanelSite(panelHistory[panelIndex], { record: false });
  } else {
    // Off the front of the list: back to where the search started.
    returnToSearch();
  }
}

function panelForward() {
  if (panelIndex < panelHistory.length - 1) {
    panelIndex += 1;
    openPanelSite(panelHistory[panelIndex], { record: false });
  }
}

panelBackBtn.addEventListener("click", panelBack);
panelForwardBtn.addEventListener("click", panelForward);
document.getElementById("panelHome").addEventListener("click", returnToSearch);
document.getElementById("panelReload").addEventListener("click", reloadPanel);

// Some things want the whole window: a form to fill in, something to print,
// a page to keep. This hands the panel's page to a real tab. It is the one
// thing here that deliberately reaches outside the panel, and only when
// asked.
document.getElementById("panelPopOut").addEventListener("click", () => {
  if (currentPanelUrl) chrome.tabs.create({ url: currentPanelUrl });
});
const siteDialog = document.getElementById("siteDialog");
const siteForm = document.getElementById("siteForm");
const siteUrlInput = document.getElementById("siteUrl");
const siteCancel = document.getElementById("siteCancel");
const siteDialogTitle = document.getElementById("siteDialogTitle");
const siteMenu = document.getElementById("siteMenu");

let dialogEditingUrl = null; // null = adding; a string = editing that URL
let menuTargetUrl = null;

function normaliseUrl(raw) {
  const u = (raw || "").trim();
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

async function getWebPanels() {
  const { webPanels = [] } = await chrome.storage.local.get("webPanels");
  return webPanels;
}
async function setWebPanels(list) {
  await chrome.storage.local.set({ webPanels: list });
  renderRailSites(list);
  store.writePanels(list).catch(() => {});
}

function openSiteDialog({ url = "", editing = null } = {}) {
  dialogEditingUrl = editing;
  siteDialogTitle.textContent = editing ? "Edit pinned site" : "Pin this page";
  siteUrlInput.value = url;
  siteDialog.showModal();
  siteUrlInput.focus();
  siteUrlInput.select();
}

siteCancel.addEventListener("click", () => siteDialog.close());

siteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = normaliseUrl(siteUrlInput.value);
  if (!url) return;
  const list = await getWebPanels();
  if (dialogEditingUrl) {
    await setWebPanels(list.map((u) => (u === dialogEditingUrl ? url : u)));
  } else if (!list.includes(url)) {
    await setWebPanels([...list, url]);
  }
  siteDialog.close();
  openPanelSite(url);
});

// What the panel has opened, and where in that list we are. Only navigations
// the panel makes are in here — a link followed inside the frame is
// invisible to us, cross-origin.
let panelHistory = [];
let panelIndex = -1;

function openPanelSite(url, { record = true } = {}) {
  if (record) {
    panelHistory = panelHistory.slice(0, panelIndex + 1);
    panelHistory.push(url);
    panelIndex = panelHistory.length - 1;
  }
  // Deactivate the tab buttons and highlight the favicon of the site
  // being opened -- the favicons themselves are the "Panels" UI now.
  document.querySelectorAll(".rail-btn[data-panel]").forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });
  document.querySelectorAll("#railSites .rail-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.url === url);
  });
  document.querySelectorAll(".panel-view").forEach((p) => {
    p.classList.toggle("active", p.id === "panel-panels");
  });
  currentPanelUrl = url;
  panelsEmpty.hidden = true;
  panelNav.hidden = false;
  try { panelNavHost.textContent = new URL(url).hostname; } catch { panelNavHost.textContent = ""; }
  paintNavButtons();
  loadInFrame(webPanelFrame, url);
}

function showSiteMenu(x, y, url) {
  menuTargetUrl = url;
  // Show first so we can measure it, then position. The rail is on the
  // right edge, so open the menu to the LEFT of the cursor (into the
  // panel) and clamp to the viewport so it's never off-screen.
  siteMenu.hidden = false;
  const pad = 8;
  const w = siteMenu.offsetWidth;
  const h = siteMenu.offsetHeight;
  let left = x - w;
  if (left < pad) left = pad;
  if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
  let top = y;
  if (top + h > window.innerHeight - pad) top = window.innerHeight - h - pad;
  if (top < pad) top = pad;
  siteMenu.style.left = `${left}px`;
  siteMenu.style.top = `${top}px`;
}
function hideSiteMenu() {
  siteMenu.hidden = true;
  menuTargetUrl = null;
}

siteMenu.addEventListener("click", async (e) => {
  const act = e.target.dataset.act;
  const url = menuTargetUrl;
  hideSiteMenu();
  if (!url || !act) return;
  if (act === "edit") {
    openSiteDialog({ url, editing: url });
  } else if (act === "delete") {
    const list = await getWebPanels();
    await setWebPanels(list.filter((u) => u !== url));
  }
});
document.addEventListener("click", hideSiteMenu);
window.addEventListener("blur", hideSiteMenu);

let dragSiteUrl = null;

function renderRailSites(webPanels) {
  railSites.innerHTML = "";
  for (const url of webPanels) {
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    const btn = document.createElement("button");
    btn.className = "rail-btn";
    btn.dataset.url = url;
    btn.title = host;
    // Drag-and-drop reordering; the saved webPanels order is the rail
    // order, so dropping persists the arrangement.
    btn.draggable = true;
    btn.addEventListener("dragstart", (e) => {
      dragSiteUrl = url;
      e.dataTransfer.effectAllowed = "move";
    });
    btn.addEventListener("dragover", (e) => {
      if (!dragSiteUrl || dragSiteUrl === url) return;
      e.preventDefault();
      btn.classList.add("drop-target");
    });
    btn.addEventListener("dragleave", () => btn.classList.remove("drop-target"));
    btn.addEventListener("drop", async (e) => {
      e.preventDefault();
      btn.classList.remove("drop-target");
      const from = dragSiteUrl;
      dragSiteUrl = null;
      if (!from || from === url) return;
      const list = await getWebPanels();
      const fromIdx = list.indexOf(from);
      const toIdx = list.indexOf(url);
      if (fromIdx < 0 || toIdx < 0) return;
      list.splice(toIdx, 0, ...list.splice(fromIdx, 1));
      await setWebPanels(list);
    });
    btn.addEventListener("dragend", () => {
      dragSiteUrl = null;
      railSites.querySelectorAll(".drop-target").forEach((b) => b.classList.remove("drop-target"));
    });
    const img = document.createElement("img");
    img.className = "rail-site-icon";
    // Chrome's own cached favicon, served from the profile. The browser
    // version fetched these from DuckDuckGo's icon service, which told a
    // third party every site the user had pinned, every time the panel
    // opened — indefensible in a privacy extension, and a remote request
    // in a package that should make none.
    const favicon = new URL(chrome.runtime.getURL("/_favicon/"));
    favicon.searchParams.set("pageUrl", url);
    favicon.searchParams.set("size", "32");
    img.src = favicon.toString();
    img.alt = "";
    img.addEventListener("error", () => {
      img.remove();
      btn.textContent = "•";
    });
    btn.appendChild(img);
    btn.addEventListener("click", () => openPanelSite(url));
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showSiteMenu(e.clientX, e.clientY, url);
    });
    railSites.appendChild(btn);
  }
}

async function loadWebPanels() {
  renderRailSites(await getWebPanels());
}

// Keep the rail live: if the background worker changes webPanels after
// this page loaded (e.g. the one-time leaked-pin cleanup at boot), the
// favicon list must reflect it without a manual reopen.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.webPanels) {
    renderRailSites(changes.webPanels.newValue || []);
  }
});

// ---- Close ----
const railMinimize = document.getElementById("railMinimize");

// Collapsing the panel's CONTENTS does nothing useful: Chromium owns the
// side panel's width, so hiding what is inside leaves the page squeezed
// exactly as before — it still looks open, because it is. The only way to
// give the page its width back is to close the panel. Chrome 132 added
// sidePanel.close(); older versions get window.close(), which a side panel
// page is allowed to call on itself.
async function closePanel() {
  try {
    if (chrome.sidePanel?.close) {
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.close({ windowId: win.id });
      return;
    }
  } catch {
    /* fall through */
  }
  window.close();
}

railMinimize.addEventListener("click", closePanel);

railAddSite.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const prefill = tab?.url && /^https?:\/\//.test(tab.url) ? tab.url : "";
  openSiteDialog({ url: prefill });
});

// ---- Snippets ----
// A snippet is just its text: no title to invent and keep in step with the
// thing it labels. Collapsed it shows two lines; right-click opens it out
// to edit, and clicking away saves. Left-click drops it into whatever box
// you were last typing in.
const snippetList = document.getElementById("snippetList");
const addSnippetText = document.getElementById("addSnippetText");

let expandedSnippetId = null;

async function getSnippets() {
  const { snippets = [] } = await chrome.storage.local.get("snippets");
  return snippets;
}

async function saveSnippets(list) {
  await chrome.storage.local.set({ snippets: list });
  store.writeSnippets(list).catch(() => {});
  loadSnippets();
}

// The active tab's origin, kept current in the background. It has to be
// known SYNCHRONOUSLY when a snippet is clicked: chrome.permissions.request
// only counts as user-initiated if it is called before the click handler
// awaits anything, and looking the tab up first would spend the gesture.
// That was the bug behind "it copies but never pastes".
let activeOrigin = null;

async function refreshActiveOrigin() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeOrigin =
      tab?.url && /^https?:/.test(tab.url) ? `*://${new URL(tab.url).hostname}/*` : null;
  } catch {
    activeOrigin = null;
  }
}
refreshActiveOrigin();
chrome.tabs.onActivated.addListener(refreshActiveOrigin);
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.url || info.status === "complete") refreshActiveOrigin();
});

// Runs in the page. Puts the text in at the cursor of whatever was last
// focused, and tells the page about it the way frameworks expect.
function insertAtCursor(value) {
  const el = document.activeElement;
  if (!el) return false;
  if (el.isContentEditable) {
    document.execCommand("insertText", false, value);
    return true;
  }
  const editable =
    (el.tagName === "TEXTAREA" || el.tagName === "INPUT") && !el.disabled && !el.readOnly;
  if (!editable) return false;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + value + el.value.slice(end);
  const caret = start + value.length;
  try {
    el.setSelectionRange(caret, caret);
  } catch {
    /* number and email inputs refuse a selection range */
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

async function pasteSnippet(text) {
  // Ask FIRST, while the click still counts as a gesture. Already granted
  // resolves straight through without a prompt.
  let allowed = false;
  if (activeOrigin) {
    try {
      allowed = await chrome.permissions.request({ origins: [activeOrigin] });
    } catch {
      allowed = false;
    }
  }
  navigator.clipboard.writeText(text).catch(() => {});
  if (!allowed) return "copied";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return "copied";
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      args: [text],
      func: insertAtCursor,
    });
    // The box may be in a frame, so any frame reporting success counts.
    return results.some((r) => r?.result) ? "pasted" : "copied";
  } catch {
    return "copied";
  }
}

function flash(row, word) {
  row.dataset.flash = word;
  setTimeout(() => delete row.dataset.flash, 1200);
}

function renderCollapsed(snippet) {
  const row = document.createElement("div");
  row.className = "snippet-row";

  const body = document.createElement("button");
  body.className = "snippet-text";
  // The text goes in a span: -webkit-line-clamp does not apply to a
  // button's own anonymous inner box, so clamping the button directly let
  // a third line peek out from under the padding.
  const clamped = document.createElement("span");
  clamped.className = "snippet-clamp";
  clamped.textContent = snippet.text;
  body.appendChild(clamped);
  body.title = "Click to put it where you were typing — right-click to edit";
  body.addEventListener("click", async () => {
    flash(row, await pasteSnippet(snippet.text) === "pasted" ? "Pasted" : "Copied");
  });
  body.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    expandedSnippetId = snippet.id;
    loadSnippets();
  });

  // Small and quiet, on the right, and it says what it is about to do at
  // every step: an x until you go near it, a bin when you do, a red tick
  // once it is asking. Fixed icon strings, never anything typed.
  const ICON_CROSS =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6.5 6.5l7 7M13.5 6.5l-7 7"/></svg>';
  const ICON_BIN =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 6h11"/><path d="M8 6V4.5h4V6"/><path d="M6 6l.7 9.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8L14 6"/><path d="M8.75 9v4.5M11.25 9v4.5"/></svg>';
  const ICON_TICK =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 10.5l3 3 6-6.5"/></svg>';

  const remove = document.createElement("button");
  remove.className = "snippet-delete";
  remove.innerHTML = ICON_CROSS;
  remove.title = "Delete this snippet";
  remove.setAttribute("aria-label", "Delete this snippet");

  let armed = false;
  let armedTimer = null;
  let hovering = false;

  function disarm() {
    armed = false;
    clearTimeout(armedTimer);
    remove.classList.remove("armed");
    remove.innerHTML = hovering ? ICON_BIN : ICON_CROSS;
    remove.title = "Delete this snippet";
    remove.setAttribute("aria-label", "Delete this snippet");
  }

  remove.addEventListener("mouseenter", () => {
    hovering = true;
    if (!armed) remove.innerHTML = ICON_BIN;
  });
  remove.addEventListener("mouseleave", () => {
    hovering = false;
    if (!armed) remove.innerHTML = ICON_CROSS;
  });

  remove.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!armed) {
      armed = true;
      remove.classList.add("armed");
      remove.innerHTML = ICON_TICK;
      remove.title = "Click again to delete this snippet";
      remove.setAttribute("aria-label", "Confirm deleting this snippet");
      armedTimer = setTimeout(disarm, 4000);
      return;
    }
    clearTimeout(armedTimer);
    saveSnippets((await getSnippets()).filter((s) => s.id !== snippet.id));
  });

  // Changing your mind should be as easy as doing nothing: moving off the
  // row puts it back, without waiting out the timer.
  row.addEventListener("mouseleave", () => {
    if (armed) disarm();
  });

  row.append(body, remove);
  return row;
}

function renderExpanded(snippet) {
  const row = document.createElement("div");
  row.className = "snippet-row snippet-row-open";

  const edit = document.createElement("textarea");
  edit.className = "snippet-edit";
  edit.value = snippet.text;
  // Open it out far enough to see the whole thing, within reason: wrapped
  // lines count too, or a long single-line snippet opens as a slot.
  const lines = snippet.text.split("\n").length + Math.ceil(snippet.text.length / 38);
  edit.rows = Math.min(14, Math.max(3, lines));

  // No Save button. Clicking away saves; Escape leaves it as it was.
  let cancelled = false;
  edit.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cancelled = true;
      expandedSnippetId = null;
      loadSnippets();
    }
  });
  edit.addEventListener("blur", async () => {
    if (cancelled) return;
    const text = edit.value.trim();
    const list = await getSnippets();
    expandedSnippetId = null;
    if (text === snippet.text) return loadSnippets();
    if (!text) return saveSnippets(list.filter((s) => s.id !== snippet.id));
    saveSnippets(list.map((s) => (s.id === snippet.id ? { ...s, text } : s)));
  });

  row.append(edit);
  queueMicrotask(() => {
    edit.focus();
    edit.setSelectionRange(edit.value.length, edit.value.length);
  });
  return row;
}

async function loadSnippets() {
  const snippets = await getSnippets();
  snippetList.innerHTML = "";
  for (const snippet of snippets) {
    snippetList.appendChild(
      snippet.id === expandedSnippetId ? renderExpanded(snippet) : renderCollapsed(snippet)
    );
  }
}

// Typing in the box at the bottom and clicking away saves it. Nothing to
// press, and nothing lost by forgetting to.
addSnippetText.addEventListener("blur", async () => {
  const text = addSnippetText.value.trim();
  if (!text) return;
  addSnippetText.value = "";
  await saveSnippets([...(await getSnippets()), { id: crypto.randomUUID(), text }]);
});

// ---- Start ----
loadScratchpad();
loadWebPanels();
loadSnippets();
renderRecentSearches();
loadEngine();
// If every site is already allowed, get the scripts in place when the panel
// opens rather than waiting for the first page to be opened in it.
ensureMobileScriptEverywhere().catch(() => {});
// The panel opens on the search box, ready to type.
searchBox.focus();

// ---- Sync, via bookmarks ----
// Bookmarks are the one thing Brave and Vivaldi both sync, so that is
// where the real copy lives; extension storage is only a local mirror so
// the panel has something to draw immediately. On load, whatever the
// bookmarks say wins — that is what may have arrived from another
// machine. First run seeds the folder from whatever is already here.
async function syncFromBookmarks() {
  if (!(await store.available())) return;
  const remote = await store.readAll();

  // Seed the folder only when it is genuinely empty. Deciding this from a
  // local "have I seeded" flag would be a data-loss bug: a second machine
  // with a fresh profile has no flag, and would overwrite the folder that
  // just synced to it with its own empty state.
  const remoteEmpty =
    remote.webPanels.length === 0 && !remote.notepadText && remote.snippets.length === 0;
  if (remoteEmpty) {
    const local = await chrome.storage.local.get(["webPanels", "notepadText", "snippets"]);
    const localEmpty =
      !(local.webPanels || []).length && !local.notepadText && !(local.snippets || []).length;
    if (localEmpty) return; // nothing anywhere yet
    await store.writePanels(local.webPanels || []);
    await store.writeScratchpad(local.notepadText || "");
    await store.writeSnippets(local.snippets || []);
    return;
  }
  await chrome.storage.local.set({
    webPanels: remote.webPanels,
    // Never let an empty remote wipe text that only exists here — a
    // half-created folder would otherwise erase the scratchpad.
    notepadText: remote.notepadText || (await chrome.storage.local.get("notepadText")).notepadText || "",
    snippets: remote.snippets,
  });
  loadWebPanels();
  loadSnippets();
  const { notepadText = "" } = await chrome.storage.local.get("notepadText");
  if (document.activeElement !== notepad) notepad.value = notepadText;
}
syncFromBookmarks().catch(() => {});

// A change arriving from another machine lands as a bookmark event.
if (chrome.bookmarks?.onChanged) {
  const refresh = () => {
    clearTimeout(refresh.t);
    refresh.t = setTimeout(() => syncFromBookmarks().catch(() => {}), 400);
  };
  chrome.bookmarks.onChanged.addListener(refresh);
  chrome.bookmarks.onCreated.addListener(refresh);
  chrome.bookmarks.onRemoved.addListener(refresh);
  chrome.bookmarks.onMoved.addListener(refresh);
}

// The two links at the bottom of Information open in the panel itself,
// the same as any pinned site.
for (const link of document.querySelectorAll(".info-link")) {
  link.addEventListener("click", () => openPanelSite(link.dataset.site));
}

// ---- Site access ----
// One prompt instead of one per site, for anyone who would rather not be
// asked again. Off by default and revocable from the same button, because
// "allow everything" should be a decision someone makes rather than one
// they are walked into.
const ALL_SITES = ["*://*/*"];
const allowAllBtn = document.getElementById("allowAllBtn");
const allowAllState = document.getElementById("allowAllState");

async function paintAllowAll() {
  if (!allowAllBtn) return;
  let on = false;
  try {
    on = await chrome.permissions.contains({ origins: ALL_SITES });
  } catch {
    /* treat as off */
  }
  allowAllBtn.textContent = on ? "Take it back" : "Allow all";
  allowAllState.textContent = on
    ? "Allowed. Panels and snippets work everywhere without asking."
    : "Lightmorphic Sidebar will ask once for each site you open in the panel.";
}

allowAllBtn?.addEventListener("click", async () => {
  await chrome.storage.local.set({ accessChoice: "chosen" });
  let on = false;
  try {
    on = await chrome.permissions.contains({ origins: ALL_SITES });
  } catch {
    /* treat as off */
  }
  try {
    if (on) await chrome.permissions.remove({ origins: ALL_SITES });
    else await chrome.permissions.request({ origins: ALL_SITES });
  } catch {
    /* declined */
  }
  paintAllowAll();
});

paintAllowAll();
chrome.permissions.onAdded?.addListener(paintAllowAll);
chrome.permissions.onRemoved?.addListener(paintAllowAll);

// ---- Appearance ----
// Three states, cycling: follow the browser, force light, force dark. The
// icon shows what is on screen NOW rather than what was chosen, so in
// automatic it changes with the browser and carries a dot to say so.
const railTheme = document.getElementById("railTheme");

const SUN =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3.6"/><path d="M10 1.8v2M10 16.2v2M18.2 10h-2M3.8 10h-2M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4M15.8 15.8l-1.4-1.4M5.6 5.6L4.2 4.2"/></svg>';
const MOON =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16.2 12.4A7 7 0 0 1 7.6 3.8a7 7 0 1 0 8.6 8.6z"/></svg>';

const MODES = ["auto", "light", "dark"];
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

function paintTheme(mode) {
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);

  const dark = mode === "dark" || (mode === "auto" && prefersDark.matches);
  railTheme.innerHTML = dark ? MOON : SUN;
  railTheme.dataset.mode = mode;
  railTheme.dataset.tip =
    mode === "auto" ? "Appearance: following the browser" : `Appearance: always ${mode}`;
  railTheme.setAttribute("aria-label", railTheme.dataset.tip);
}

chrome.storage.local.get("theme").then(({ theme = "auto" }) => paintTheme(theme));

railTheme.addEventListener("click", async () => {
  const now = railTheme.dataset.mode || "auto";
  const next = MODES[(MODES.indexOf(now) + 1) % MODES.length];
  await chrome.storage.local.set({ theme: next });
  paintTheme(next);
});

// In automatic, follow the browser as it changes rather than waiting for
// the panel to be reopened.
prefersDark.addEventListener("change", () => {
  if ((railTheme.dataset.mode || "auto") === "auto") paintTheme("auto");
});

// ---- First run ----
// Chrome gives an extension no install-time dialog, so the panel says it
// the first time it is opened instead.
const welcomeDialog = document.getElementById("welcomeDialog");
// Gated on its own key, not the old welcomeSeen: anyone who dismissed the
// first version of this dialog had already been marked as seen, so they
// never got asked the access question and went on being prompted per site —
// which is exactly the thing the question exists to prevent.
chrome.storage.local.get("accessChoice").then(async ({ accessChoice }) => {
  if (accessChoice || !welcomeDialog?.showModal) return;
  // Already allowed everything by hand? Then there is nothing to ask.
  try {
    if (await chrome.permissions.contains({ origins: ALL_SITES })) {
      await chrome.storage.local.set({ accessChoice: "all" });
      return;
    }
  } catch {
    /* ask anyway */
  }
  welcomeDialog.showModal();
});
async function dismissWelcome(choice) {
  welcomeDialog.close();
  await chrome.storage.local.set({ welcomeSeen: true, accessChoice: choice });
}

document.getElementById("welcomeAsk")?.addEventListener("click", () => dismissWelcome("ask"));

// One answer here saves being asked per site later — which is the thing
// people find irritating. Asked from their click, so it is still their
// decision, and Information can hand it back.
document.getElementById("welcomeAllow")?.addEventListener("click", async () => {
  try {
    await chrome.permissions.request({ origins: ALL_SITES });
  } catch {
    /* declined, or no gesture: the per-site ask still covers it */
  }
  paintAllowAll();
  let granted = false;
  try {
    granted = await chrome.permissions.contains({ origins: ALL_SITES });
  } catch {
    /* treat as not granted */
  }
  dismissWelcome(granted ? "all" : "ask");
});

// ---- About ----
const aboutVersion = document.getElementById("aboutVersion");
if (aboutVersion) aboutVersion.textContent = `v${chrome.runtime.getManifest().version}`;

// Show the shortcut the browser ACTUALLY bound, not the one the manifest
// asked for. People rebind them and browsers refuse some; a label that
// lies is worse than no label.
const shortcutHint = document.getElementById("shortcutHint");
if (shortcutHint && chrome.commands?.getAll) {
  chrome.commands.getAll().then((cmds) => {
    const bound = cmds.find((c) => c.name === "_execute_action")?.shortcut;
    shortcutHint.textContent = bound
      ? `${bound} opens and closes this panel. Change it at chrome://extensions/shortcuts.`
      : "No keyboard shortcut is set. Add one at chrome://extensions/shortcuts.";
  }).catch(() => {
    shortcutHint.textContent = "Set a shortcut at chrome://extensions/shortcuts.";
  });
}
