import * as store from "../lib/store.js";


chrome.runtime.sendMessage({ type: "sidebar-boot" }).catch(() => {});

setTimeout(async () => {
  const { lastBootReport } = await chrome.storage.local.get("lastBootReport");
  const fresh = lastBootReport?.at && Date.now() - Date.parse(lastBootReport.at) < 5 * 60 * 1000;
  await chrome.storage.local.set({
    sidebarBootCheck: { at: new Date().toISOString(), workerResponded: !!fresh },
  });
}, 5000);

const ALL_SITES = ["*://*/*"];

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
    const alreadyHere = btn.classList.contains("active");
    showPanel(alreadyHere && btn.dataset.panel !== HOME_PANEL ? HOME_PANEL : btn.dataset.panel);
  });
}

document.getElementById("railLogo")?.addEventListener("click", () => {
  openPanelSite("https://sidebar.lightmorphic.com");
});

const ZOOMS = [1, 0.9, 0.8, 0.7];
const panelZoomBtn = document.getElementById("panelZoom");

function paintZoom(z) {
  document.documentElement.style.setProperty("--zoom", String(z));
  if (panelZoomBtn) panelZoomBtn.textContent = `${Math.round(z * 100)}%`;
}

chrome.storage.local.get("panelZoom").then(({ panelZoom = 1 }) => paintZoom(panelZoom));

panelZoomBtn?.addEventListener("click", async () => {
  const now = Number(getComputedStyle(document.documentElement).getPropertyValue("--zoom")) || 0.9;
  const next = ZOOMS[(ZOOMS.findIndex((z) => Math.abs(z - now) < 0.01) + 1) % ZOOMS.length];
  await chrome.storage.local.set({ panelZoom: next });
  paintZoom(next);
});

async function ensureMobileScriptEverywhere() {
  try {
    if (!(await chrome.permissions.contains({ origins: ["*://*/*"] }))) return false;
  } catch {
    return false;
  }
  await registerPair("all", "*://*/*");
  try {
    const keep = new Set(["scroll-all", "mobile-all", "pagerail-all"]);
    const stale = (await chrome.scripting.getRegisteredContentScripts())
      .map((e) => e.id)
      .filter((id) => /^(scroll|mobile|pagerail)-/.test(id) && !keep.has(id));
    if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });
  } catch {
  }
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
    {
      id: `pagerail-${key}`,
      matches: [match],
      allFrames: false,
      runAt: "document_idle",
      js: ["lib/page-rail.js"],
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
    }
  }
}

function siteScope(host) {
  const bare = host.replace(/^www\./i, "");
  const looksLikeADomain = bare.includes(".") && !/^[\d.]+$/.test(bare) && !bare.includes(":");
  return looksLikeADomain ? `*://*.${bare}/*` : `*://${host}/*`;
}

function siteDomain(host) {
  return host.replace(/^www\./i, "");
}

async function ensureMobileScript(host) {
  if (await ensureMobileScriptEverywhere()) return;
  await registerPair(siteDomain(host), siteScope(host));
}

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

const ALL_SITES_RULE_ID = 1;

function hostRuleId(host) {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) & 0x7fffffff;
  return (h % 2000000000) + 2;
}

async function ensureHostAccess(host) {
  const origins = [siteScope(host)];
  if (await chrome.permissions.contains({ origins })) return true;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

async function mirrorCookiesIntoPanel(host) {
  if (!chrome.cookies?.getAll) return;
  const partitionKey = { topLevelSite: `chrome-extension://${chrome.runtime.id}` };
  const domain = siteDomain(host);
  let cookies = [];
  try {
    cookies = await chrome.cookies.getAll({ domain });
  } catch {
    return;
  }
  await Promise.all(
    cookies.map((c) => {
      const copy = {
        url: `https://${c.domain.replace(/^\./, "")}${c.path}`,
        name: c.name,
        value: c.value,
        path: c.path,
        secure: true,
        httpOnly: c.httpOnly,
        sameSite: "no_restriction",
        partitionKey,
      };
      if (c.domain.startsWith(".")) copy.domain = c.domain;
      if (!c.session) copy.expirationDate = c.expirationDate;
      return chrome.cookies.set(copy).catch(() => {
      });
    })
  );
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
  await mirrorCookiesIntoPanel(host);
  const domain = siteDomain(host);
  let everywhere = false;
  try {
    everywhere = await chrome.permissions.contains({ origins: ALL_SITES });
  } catch {
  }
  const id = everywhere ? ALL_SITES_RULE_ID : hostRuleId(domain);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [id],
    addRules: [
      {
        id,
        priority: 1,
        action: {
          type: "modifyHeaders",
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
          tabIds: [chrome.tabs.TAB_ID_NONE],
          ...(everywhere ? {} : { requestDomains: [domain] }),
          resourceTypes: ["sub_frame", "xmlhttprequest", "script", "stylesheet", "image", "font", "other"],
        },
      },
    ],
  });
  return true;
}

async function loadInFrame(frame, url) {
  if (!(await allowFramingFor(url))) {
    chrome.tabs.create({ url });
    return;
  }
  frame.src = url;
  frameClip.hidden = false;
}

const searchForm = document.getElementById("searchForm");
const searchBox = document.getElementById("searchBox");
const searchRecent = document.getElementById("searchRecent");

const ENGINES = [
  { id: "ddg", letter: "D", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
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
      await ensureEngineAccess();
      engine = e;
      await chrome.storage.local.set({ searchEngine: e.id });
      renderEngines();
      const q = searchBox.value.trim() || lastQuery;
      if (q) runSearch(q);
      else searchBox.focus();
    });
    box.appendChild(b);
  }
}

function searchUrlFor(q) {
  const looksLikeUrl = /^(https?:\/\/|[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$))/i.test(q);
  if (looksLikeUrl) return q.startsWith("http") ? q : `https://${q}`;
  return engine.url + encodeURIComponent(q) + (engine.dark || "");
}

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
  }
}

let lastQuery = "";

async function runSearch(q) {
  const query = (q || "").trim();
  if (!query) return;
  lastQuery = query;
  const url = searchUrlFor(query);
  const { searchOpensIn = "panel" } = await chrome.storage.local.get("searchOpensIn").catch(() => ({}));
  if (searchOpensIn === "tab") {
    const [here] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    chrome.tabs.create({ url, index: here ? here.index + 1 : undefined }).catch(() => {});
    showPanel("search");
  } else {
    openPanelSite(url);
  }
  const { recentSearches = [] } = await chrome.storage.local.get("recentSearches");
  const next = [query, ...recentSearches.filter((r) => r !== query)].slice(0, 6);
  await chrome.storage.local.set({ recentSearches: next });
  renderRecentSearches(next);
}

const recentToggle = document.getElementById("recentToggle");
const recentDrawer = document.getElementById("recentDrawer");

function openRecent() {
  recentDrawer.hidden = false;
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

const webPanelFrame = document.getElementById("webPanelFrame");
const frameClip = document.getElementById("frameClip");
const panelsEmpty = document.getElementById("panelsEmpty");
const panelNav = document.getElementById("panelNav");
const panelNavHost = document.getElementById("panelNavHost");
const railSites = document.getElementById("railSites");
const railAddSite = document.getElementById("railAddSite");

let currentPanelUrl = null;

const panelBackBtn = document.getElementById("panelBack");
const panelForwardBtn = document.getElementById("panelForward");

function paintNavButtons() {
  panelBackBtn.disabled = false;
  panelForwardBtn.disabled = panelIndex >= panelHistory.length - 1;
}

function reloadPanel() {
  if (currentPanelUrl) webPanelFrame.src = currentPanelUrl;
}

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

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "panel-frame-url" || !message.url) return false;
  if (!document.getElementById("panel-panels")?.classList.contains("active")) return false;
  currentPanelUrl = message.url;
  try {
    panelNavHost.textContent = new URL(message.url).hostname;
  } catch {
  }
  return false;
});

document.getElementById("panelPopOut").addEventListener("click", () => {
  const url = currentPanelUrl;
  if (!url) return;
  chrome.tabs.query({ active: true, currentWindow: true }).then(([here]) => {
    chrome.tabs.create({ url, index: here ? here.index + 1 : undefined });
  }).catch(() => chrome.tabs.create({ url }));
  webPanelFrame.src = "about:blank";
  currentPanelUrl = null;
  panelHistory = [];
  panelIndex = -1;
  panelNav.hidden = true;
  showPanel("search");
});
const siteDialog = document.getElementById("siteDialog");
const siteForm = document.getElementById("siteForm");
const siteUrlInput = document.getElementById("siteUrl");
const siteCancel = document.getElementById("siteCancel");
const siteDialogTitle = document.getElementById("siteDialogTitle");
const siteMenu = document.getElementById("siteMenu");

let dialogEditingUrl = null;
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
  forgetIcons(list).catch(() => {});
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
  captureIconFor(url).catch(() => {});
});

let panelHistory = [];
let panelIndex = -1;

function openPanelSite(url, { record = true } = {}) {
  if (record) {
    panelHistory = panelHistory.slice(0, panelIndex + 1);
    panelHistory.push(url);
    panelIndex = panelHistory.length - 1;
  }
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

function cachedFaviconUrl(pageUrl, size = 32) {
  const favicon = new URL(chrome.runtime.getURL("/_favicon/"));
  favicon.searchParams.set("pageUrl", pageUrl);
  favicon.searchParams.set("size", String(size));
  return favicon.toString();
}

let placeholderSignature = null;

function signatureOf(image) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, 16, 16);
    return ctx.getImageData(0, 0, 16, 16).data.join(",");
  } catch {
    return null;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const probe = new Image();
    probe.onload = () => resolve(probe);
    probe.onerror = reject;
    probe.src = src;
  });
}

async function getPlaceholderSignature() {
  if (placeholderSignature !== null) return placeholderSignature;
  try {
    const probe = await loadImage(cachedFaviconUrl("https://never.a.real.site.invalid/"));
    placeholderSignature = signatureOf(probe);
  } catch {
    placeholderSignature = null;
  }
  return placeholderSignature;
}

async function useRealFaviconIfPlaceholder(img, host) {
  const placeholder = await getPlaceholderSignature();
  if (!placeholder) return;
  try {
    await (img.complete ? Promise.resolve() : loadImage(img.src));
  } catch {
    return;
  }
  if (signatureOf(img) !== placeholder) return;
  const real = await findSiteIcon(host);
  if (!real) return;
  img.src = real;
  keepIcon(host, real);
}

let keptIcons = {};

chrome.storage.local.get("siteIcons").then(({ siteIcons = {} }) => {
  keptIcons = siteIcons;
}).catch(() => {});

chrome.storage.local.get(["webPanels", "siteIcons"]).then(({ webPanels = [], siteIcons = {} }) => {
  keptIcons = siteIcons;
  for (const url of webPanels) captureIconFor(url).catch(() => {});
}).catch(() => {});

async function keepIcon(host, iconUrl) {
  const domain = siteDomain(host);
  if (keptIcons[domain]) return;
  try {
    const res = await fetch(iconUrl);
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") || blob.size > 120000) return;
    const dataUrl = await shrink(blob).catch(() => readAsDataUrl(blob));
    const { siteIcons = {} } = await chrome.storage.local.get("siteIcons");
    siteIcons[domain] = dataUrl;
    keptIcons = siteIcons;
    await chrome.storage.local.set({ siteIcons });
  } catch {
  }
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function shrink(blob, size = 32) {
  if (blob.type.includes("svg")) return readAsDataUrl(blob);
  const bitmap = await createImageBitmap(blob);
  const side = Math.min(size, Math.max(bitmap.width, bitmap.height)) || size;
  const canvas = new OffscreenCanvas(side, side);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, side, side);
  bitmap.close();
  return readAsDataUrl(await canvas.convertToBlob({ type: "image/png" }));
}

async function captureIconFor(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  if (keptIcons[siteDomain(host)]) return;
  const found = await findSiteIcon(host);
  if (found) await keepIcon(host, found);
  renderRailSites(await getWebPanels());
}

async function forgetIcons(keep) {
  const domains = new Set(
    keep.map((u) => {
      try {
        return siteDomain(new URL(u).hostname);
      } catch {
        return "";
      }
    })
  );
  const { siteIcons = {} } = await chrome.storage.local.get("siteIcons").catch(() => ({}));
  let changed = false;
  for (const domain of Object.keys(siteIcons)) {
    if (!domains.has(domain)) {
      delete siteIcons[domain];
      changed = true;
    }
  }
  if (changed) {
    keptIcons = siteIcons;
    await chrome.storage.local.set({ siteIcons }).catch(() => {});
  }
}

async function findSiteIcon(host) {
  for (const path of ["/favicon.ico", "/favicon.svg", "/favicon.png", "/apple-touch-icon.png"]) {
    try {
      const im = await loadImage(`https://${host}${path}`);
      if (im.naturalWidth > 0) return im.src;
    } catch {
    }
  }
  try {
    if (!(await chrome.permissions.contains({ origins: [siteScope(host)] }))) return null;
  } catch {
    return null;
  }
  try {
    const res = await fetch(`https://${host}/`, { credentials: "omit" });
    const html = (await res.text()).slice(0, 60000);
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
    for (const tag of links) {
      if (!/rel\s*=\s*["']?[^"'>]*\bicon\b/i.test(tag)) continue;
      const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!href) continue;
      try {
        const im = await loadImage(new URL(href, `https://${host}/`).href);
        if (im.naturalWidth > 0) return im.src;
      } catch {
      }
    }
  } catch {
  }
  return null;
}

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
    const kept = keptIcons[siteDomain(host)];
    img.src = kept || cachedFaviconUrl(url);
    img.alt = "";
    img.addEventListener("error", () => {
      img.remove();
      btn.textContent = "•";
    });
    if (!kept) useRealFaviconIfPlaceholder(img, host);
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.webPanels) {
    renderRailSites(changes.webPanels.newValue || []);
  }
});

async function applySide() {
  let { sidePreference = "auto" } = await chrome.storage.local.get("sidePreference").catch(() => ({}));
  let panelSide = "right";
  try {
    if (chrome.sidePanel?.getLayout) {
      const layout = await chrome.sidePanel.getLayout();
      if (layout?.side) panelSide = layout.side;
    }
  } catch {
  }
  document.querySelector(".shell").classList.toggle("rail-left", panelSide === "right" ? false : true);
  const stripSide = sidePreference === "auto" ? panelSide : sidePreference;
  await chrome.storage.local.set({ stripSide, panelSide }).catch(() => {});
  for (const input of document.querySelectorAll('input[name="sidePreference"]')) {
    input.checked = input.value === sidePreference;
  }
}

applySide();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") applySide();
});

document.addEventListener("change", (e) => {
  if (e.target.name === "sidePreference") {
    chrome.storage.local.set({ sidePreference: e.target.value }).then(applySide).catch(() => {});
  }
  if (e.target.name === "searchOpensIn") {
    chrome.storage.local.set({ searchOpensIn: e.target.value }).catch(() => {});
  }
  if (e.target.name === "linksOpenIn") {
    chrome.storage.local.set({ linksOpenIn: e.target.value }).catch(() => {});
  }
});

chrome.storage.local.get(["searchOpensIn", "linksOpenIn"]).then((saved) => {
  for (const [name, fallback] of [["searchOpensIn", "panel"], ["linksOpenIn", "panel"]]) {
    const value = saved[name] || fallback;
    for (const input of document.querySelectorAll(`input[name="${name}"]`)) {
      input.checked = input.value === value;
    }
  }
}).catch(() => {});

const railMinimize = document.getElementById("railMinimize");

let mayDrawOnPages = false;

function refreshDrawPermission() {
  chrome.permissions
    .contains({ origins: ALL_SITES })
    .then((yes) => {
      mayDrawOnPages = yes;
    })
    .catch(() => {});
}

refreshDrawPermission();
chrome.permissions.onAdded.addListener(refreshDrawPermission);
chrome.permissions.onRemoved.addListener(refreshDrawPermission);

async function foldAway() {
  let result;
  try {
    result = await chrome.runtime.sendMessage({ type: "fold" });
  } catch {
    result = { ok: false, reason: "error" };
  }
  if (result?.ok) {
    window.close();
    return;
  }
  const REASONS = {
    "chrome-page": {
      title: "Chrome will not allow it here",
      body:
        "The strip is drawn on the page itself, and Chrome forbids every extension " +
        "from drawing on its own pages \u2014 chrome:// settings, the new tab page and " +
        "the Web Store. The rule protects those pages from being tampered with, and " +
        "no permission can lift it.",
      then: "Go to an ordinary website and fold there.",
    },
    "web-store": {
      title: "Chrome will not allow it here",
      body:
        "The strip is drawn on the page itself, and Chrome forbids every extension " +
        "from drawing on the Web Store \u2014 this is the page where extensions are " +
        "installed and removed, so nothing is allowed to touch it. It is a rule of " +
        "the browser, not a setting in this extension, and no permission can lift it.",
      then: "Go to an ordinary website and fold there.",
    },
    "no-access": {
      title: "This site has not been allowed",
      body:
        "Nothing can be drawn on a site until you allow it, and this one has not " +
        "been allowed yet.",
      then: "Open Information, turn on access for every site, then fold.",
    },
  };

  const problem = REASONS[result?.reason] ||
    (result?.reason === "not-visible"
      ? {
          title: "The strip went somewhere it cannot be seen",
          body: "It was drawn, but not anywhere on screen.",
          then: "Click this to copy what was found, and send it to me.",
        }
      : {
          title: "The strip could not be drawn",
          body: "Something stopped it, so the panel has stayed open.",
          then: "",
        });
  showFoldProblem(problem, result?.detail);
}

function showFoldProblem({ title, body, then }, copyable) {
  let note = document.getElementById("foldProblem");
  if (!note) {
    note = document.createElement("div");
    note.id = "foldProblem";
    note.className = "fold-problem";
    note.setAttribute("role", "alertdialog");
    note.setAttribute("aria-labelledby", "foldProblemTitle");
    document.querySelector(".content").prepend(note);
  }
  note.textContent = "";

  const h = document.createElement("p");
  h.className = "fold-problem-title";
  h.id = "foldProblemTitle";
  h.textContent = title;

  const p = document.createElement("p");
  p.textContent = body;

  note.append(h, p);
  if (then) {
    const next = document.createElement("p");
    next.className = "fold-problem-then";
    next.textContent = then;
    note.append(next);
  }

  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "fold-problem-ok";
  ok.textContent = copyable ? "Copy and close" : "Got it";
  note.append(ok);

  note.hidden = false;
  clearTimeout(showFoldProblem.timer);
  ok.addEventListener("click", () => {
    if (copyable) {
      navigator.clipboard.writeText(copyable).catch(() => {});
      const range = document.createRange();
      range.selectNodeContents(note);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try {
        document.execCommand("copy");
      } catch {
      }
    }
    note.hidden = true;
  });
  ok.focus();
}

railMinimize.addEventListener("click", () => {
  if (!mayDrawOnPages) {
    let asked;
    try {
      asked = chrome.permissions.request({ origins: ALL_SITES }).catch(() => false);
    } catch {
      asked = Promise.resolve(false);
    }
    const gaveUp = new Promise((resolve) => setTimeout(resolve, 20000, false));
    Promise.race([asked, gaveUp]).then(() => foldAway());
    return;
  }
  foldAway();
});

chrome.storage.local.set({ pageStrip: false }).catch(() => {});

function obeyOpenRequest(openPanel) {
  if (!openPanel) return;
  if (typeof openPanel.at === "number" && Date.now() - openPanel.at > 15000) return;
  chrome.storage.local.remove("openPanel").catch(() => {});
  if (openPanel.url) openPanelSite(openPanel.url);
  else if (openPanel.panel) showPanel(openPanel.panel);
}

chrome.storage.local.get("openPanel").then(({ openPanel }) => obeyOpenRequest(openPanel)).catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.openPanel?.newValue) obeyOpenRequest(changes.openPanel.newValue);
});

railAddSite.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const prefill = tab?.url && /^https?:\/\//.test(tab.url) ? tab.url : "";
  openSiteDialog({ url: prefill });
});

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
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

async function pasteSnippet(text) {
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
  const lines = snippet.text.split("\n").length + Math.ceil(snippet.text.length / 38);
  edit.rows = Math.min(14, Math.max(3, lines));

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
  document
    .getElementById("panel-snippets")
    .classList.toggle("snippets-empty", snippets.length === 0);
}

addSnippetText.addEventListener("blur", async () => {
  const text = addSnippetText.value.trim();
  if (!text) return;
  addSnippetText.value = "";
  await saveSnippets([...(await getSnippets()), { id: crypto.randomUUID(), text }]);
});

loadScratchpad();
loadWebPanels();
loadSnippets();
renderRecentSearches();
loadEngine();
ensureMobileScriptEverywhere().catch(() => {});
searchBox.focus();

async function syncFromBookmarks() {
  if (!(await store.available())) return;
  const remote = await store.readAll();

  const remoteEmpty =
    remote.webPanels.length === 0 && !remote.notepadText && remote.snippets.length === 0;
  if (remoteEmpty) {
    const local = await chrome.storage.local.get(["webPanels", "notepadText", "snippets"]);
    const localEmpty =
      !(local.webPanels || []).length && !local.notepadText && !(local.snippets || []).length;
    if (localEmpty) return;
    await store.writePanels(local.webPanels || []);
    await store.writeScratchpad(local.notepadText || "");
    await store.writeSnippets(local.snippets || []);
    return;
  }
  await chrome.storage.local.set({
    webPanels: remote.webPanels,
    notepadText: remote.notepadText || (await chrome.storage.local.get("notepadText")).notepadText || "",
    snippets: remote.snippets,
  });
  loadWebPanels();
  loadSnippets();
  const { notepadText = "" } = await chrome.storage.local.get("notepadText");
  if (document.activeElement !== notepad) notepad.value = notepadText;
}
syncFromBookmarks().catch(() => {});

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

for (const link of document.querySelectorAll(".info-link")) {
  link.addEventListener("click", () => openPanelSite(link.dataset.site));
}

const allowAllBtn = document.getElementById("allowAllBtn");
const allowAllState = document.getElementById("allowAllState");

async function paintAllowAll() {
  if (!allowAllBtn) return;
  let on = false;
  try {
    on = await chrome.permissions.contains({ origins: ALL_SITES });
  } catch {
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
  }
  try {
    if (on) await chrome.permissions.remove({ origins: ALL_SITES });
    else await chrome.permissions.request({ origins: ALL_SITES });
  } catch {
  }
  paintAllowAll();
});

paintAllowAll();
chrome.permissions.onAdded?.addListener(paintAllowAll);
chrome.permissions.onRemoved?.addListener(paintAllowAll);

const welcomeDialog = document.getElementById("welcomeDialog");
chrome.storage.local.get("accessChoice").then(async ({ accessChoice }) => {
  if (accessChoice || !welcomeDialog?.showModal) return;
  try {
    if (await chrome.permissions.contains({ origins: ALL_SITES })) {
      await chrome.storage.local.set({ accessChoice: "all" });
      return;
    }
  } catch {
  }
  welcomeDialog.showModal();
});
async function dismissWelcome(choice) {
  welcomeDialog.close();
  await chrome.storage.local.set({ welcomeSeen: true, accessChoice: choice });
}

document.getElementById("welcomeAsk")?.addEventListener("click", () => dismissWelcome("ask"));

document.getElementById("welcomeAllow")?.addEventListener("click", async () => {
  try {
    await chrome.permissions.request({ origins: ALL_SITES });
  } catch {
  }
  paintAllowAll();
  let granted = false;
  try {
    granted = await chrome.permissions.contains({ origins: ALL_SITES });
  } catch {
  }
  dismissWelcome(granted ? "all" : "ask");
});

const aboutVersion = document.getElementById("aboutVersion");
if (aboutVersion) aboutVersion.textContent = `v${chrome.runtime.getManifest().version}`;

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


document.getElementById("stripTryNow")?.addEventListener("click", async () => {
  const out = document.getElementById("stripTrace");
  out.hidden = false;
  out.textContent = "Trying\u2026";
  let reply;
  try {
    reply = await chrome.runtime.sendMessage({ type: "fold-dry-run" });
  } catch (e) {
    reply = { ok: false, detail: String(e) };
  }
  const { lastFold } = await chrome.storage.local.get("lastFold").catch(() => ({}));
  const perms = await chrome.permissions
    .contains({ origins: ALL_SITES })
    .catch(() => "unknown");
  const lines = [
    `result: ${reply?.ok ? "worked" : "failed"}${reply?.reason ? " (" + reply.reason + ")" : ""}`,
    `every site allowed: ${perms}`,
    ...(lastFold?.steps || []).map((t) => `\u2022 ${t}`),
  ];
  out.textContent = lines.join("\n");
});



const railWipe = document.getElementById("railWipe");

if (railWipe) {
  const WIPE_BIN = railWipe.innerHTML;
  const WIPE_TICK =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 10.5l3 3 6-6.5"/></svg>';
  const wipeWarn = document.getElementById("wipeWarn");
  const IDLE = "Danger zone";
  const ARMED = "Press again to remove everything, bookmarks included";

  let armed = false;
  let armedTimer = null;

  function disarmWipe() {
    armed = false;
    clearTimeout(armedTimer);
    railWipe.classList.remove("armed");
    railWipe.innerHTML = WIPE_BIN;
    railWipe.dataset.tip = IDLE;
    railWipe.setAttribute("aria-label", IDLE);
    if (wipeWarn) wipeWarn.hidden = true;
  }

  railWipe.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!armed) {
      armed = true;
      railWipe.classList.add("armed");
      railWipe.innerHTML = WIPE_TICK;
      railWipe.dataset.tip = ARMED;
      railWipe.setAttribute("aria-label", ARMED);
      if (wipeWarn) wipeWarn.hidden = false;
      armedTimer = setTimeout(disarmWipe, 20000);
      return;
    }
    clearTimeout(armedTimer);
    await store.removeEverything().catch(() => {});
    await chrome.storage.local
      .remove(["notepadText", "snippets", "webPanels", "siteIcons", "recentSearches"])
      .catch(() => {});
    keptIcons = {};
    disarmWipe();
    notepad.value = "";
    loadScratchpad();
    loadSnippets();
    loadWebPanels();
    showPanel("search");
  });

  document.addEventListener("keydown", (e) => {
    if (armed && e.key === "Escape") disarmWipe();
  });

  document.addEventListener("click", (e) => {
    if (armed && !railWipe.contains(e.target)) disarmWipe();
  });
}
