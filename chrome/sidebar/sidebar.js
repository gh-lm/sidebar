
// Wake the background worker and have it run its once-per-launch boot
// work. This page reliably exists at every launch (the panel auto-opens),
// which makes it the dependable boot trigger -- the worker itself is NOT
// started by Chromium at launch on existing profiles, and onStartup
// doesn't fire for --load-extension extensions.
chrome.runtime.sendMessage({ type: "sidemorphic-boot" }).catch(() => {});

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
for (const btn of document.querySelectorAll(".rail-btn[data-panel]")) {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".rail-btn").forEach((b) => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", String(b === btn));
    });
    document.querySelectorAll(".panel-view").forEach((p) => {
      p.classList.toggle("active", p.id === `panel-${btn.dataset.panel}`);
    });
  });
}

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
function hostRuleId(host) {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) & 0x7fffffff;
  return (h % 2000000000) + 1; // DNR ids must be >= 1
}

// Host permission is OPTIONAL and asked for at the moment the user opens
// a panel, from their own click -- Sidemorphic ships with no access to any
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
  const id = hostRuleId(host);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [id],
    addRules: [
      {
        id,
        priority: 1,
        action: {
          type: "modifyHeaders",
          responseHeaders: [
            { header: "x-frame-options", operation: "remove" },
            { header: "content-security-policy", operation: "remove" },
            { header: "content-security-policy-report-only", operation: "remove" },
          ],
        },
        condition: { requestDomains: [host], resourceTypes: ["sub_frame"] },
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
  frame.hidden = false;
}

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
const panelsEmpty = document.getElementById("panelsEmpty");
const panelNav = document.getElementById("panelNav");
const panelNavHost = document.getElementById("panelNavHost");
const railSites = document.getElementById("railSites");
const railAddSite = document.getElementById("railAddSite");

let currentPanelUrl = null;

// Back / forward / reload for the open pinned site. The sidebar can't
// touch a cross-origin iframe's history from outside (same-origin policy),
// so it postMessages the command to the frame, where our content script
// -- same-origin to the page -- runs it (see clipboard-watch.js). This
// gives real back/forward AND a reload that keeps the user's in-frame
// position (rather than jumping back to the pinned URL).
// Back and forward inside a pinned panel are NOT available. The frame is
// cross-origin, so contentWindow.history throws; the browser version drove
// it from a content script injected into every page, which this extension
// deliberately no longer has. Reload works because re-setting src is
// same-document-agnostic. Buttons that silently do nothing are worse than
// buttons that aren't there, so only Reload and Home ship.
function reloadPanel() {
  if (currentPanelUrl) webPanelFrame.src = currentPanelUrl;
}

function homePanel() {
  if (currentPanelUrl) openPanelSite(currentPanelUrl);
}

document.getElementById("panelHome").addEventListener("click", homePanel);
document.getElementById("panelReload").addEventListener("click", reloadPanel);
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

function openPanelSite(url) {
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

// Minimise: collapse to the icon rail only -- the vertical menu stays,
// the content column hides, and clicking ANY rail icon (or the chevron
// again) expands it back. (Chromium fixes the panel's width, so the
// collapsed state can't physically narrow the panel itself; the content
// area is simply blank until reopened.)
const shellEl = document.querySelector(".shell");
const railMinimize = document.getElementById("railMinimize");

function setCollapsed(collapsed) {
  shellEl.classList.toggle("collapsed", collapsed);
  railMinimize.classList.toggle("flipped", collapsed);
  railMinimize.dataset.tip = collapsed ? "Expand sidebar" : "Minimise sidebar";
}

railMinimize.addEventListener("click", () => {
  setCollapsed(!shellEl.classList.contains("collapsed"));
});

// Any click on a rail tab, pinned favicon, or the "+" while collapsed
// expands the sidebar again (capture phase so it runs before the
// button's own handler switches views).
document.querySelector(".rail").addEventListener(
  "click",
  (e) => {
    if (!shellEl.classList.contains("collapsed")) return;
    if (e.target.closest("#railMinimize")) return; // chevron handles itself
    if (e.target.closest(".rail-btn")) setCollapsed(false);
  },
  true
);

railAddSite.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const prefill = tab?.url && /^https?:\/\//.test(tab.url) ? tab.url : "";
  openSiteDialog({ url: prefill });
});

// ---- Snippets ----
const snippetList = document.getElementById("snippetList");
const addSnippetForm = document.getElementById("addSnippetForm");
const addSnippetLabel = document.getElementById("addSnippetLabel");
const addSnippetText = document.getElementById("addSnippetText");

async function loadSnippets() {
  const { snippets = [] } = await chrome.storage.local.get("snippets");
  snippetList.innerHTML = "";
  for (const snippet of snippets) {
    const item = document.createElement("div");
    item.className = "panel-item";

    // Click to copy. The browser version inserted snippets through a
    // context menu and expanded them as you typed; both needed a content
    // script on every page, which this extension deliberately does not
    // have. Copying is the honest equivalent — it works from the panel's
    // own click, with no access to any site.
    const label = document.createElement("button");
    label.className = "snippet-copy";
    label.textContent = snippet.label || snippet.text.slice(0, 40);
    label.title = `Copy: ${snippet.text}`;
    label.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(snippet.text);
        const was = label.textContent;
        label.textContent = "Copied";
        setTimeout(() => { label.textContent = was; }, 1200);
      } catch {
        label.textContent = "Press Ctrl+C";
      }
    });

    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.title = "Delete";
    remove.addEventListener("click", async () => {
      const { snippets: current = [] } = await chrome.storage.local.get("snippets");
      await chrome.storage.local.set({ snippets: current.filter((s) => s.id !== snippet.id) });
      loadSnippets();
    });

    item.append(label, remove);
    snippetList.appendChild(item);
  }
}

addSnippetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = addSnippetText.value.trim();
  if (!text) return;
  const { snippets = [] } = await chrome.storage.local.get("snippets");
  const next = [
    ...snippets,
    {
      id: crypto.randomUUID(),
      label: addSnippetLabel.value.trim(),
      text,
    },
  ];
  await chrome.storage.local.set({ snippets: next });
  addSnippetLabel.value = "";
  addSnippetText.value = "";
  loadSnippets();
});

// ---- Start ----
loadScratchpad();
loadWebPanels();
loadSnippets();

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
