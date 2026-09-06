// Lightmorphic Sidebar — service worker.
//
// Scope is deliberately small: open the side panel, and seed a first pinned
// site. Everything else the panel does, it does itself and saves to storage,
// so nothing depends on this worker being awake. No ad blocking, no sync, no
// cookie or privacy settings, no native messaging, no self-updater — those
// all belonged to the AppImage browser this extension grew out of, or were
// dropped as too invasive for what this is.

// ---- Pinned panels ----
// One pin ships with the install, so the rail is not empty and the idea is
// obvious the moment the panel opens: click the icon, the site opens here.
// It is an ordinary pin — editable, removable, and never re-added once the
// profile has been seeded. Lightmorphic Sidebar's own site is on the rail already, as
// the mark under the close chevron.
const DEFAULT_PIN = "https://lightmorphic.com";

async function seedPins() {
  const { pinsSeeded } = await chrome.storage.local.get("pinsSeeded");
  if (pinsSeeded) return;
  const { webPanels = [] } = await chrome.storage.local.get("webPanels");
  if (!webPanels.includes(DEFAULT_PIN)) webPanels.unshift(DEFAULT_PIN);
  await chrome.storage.local.set({ webPanels, pinsSeeded: true });
}

// ---- Boot ----
// Every step runs in its own guard: one failing API must never kill the
// steps after it (a real profile once lost three releases' worth of fixes
// because one unguarded await rejected and silently aborted the rest).
// The per-step outcomes are written to storage as lastBootReport, so a
// misbehaving install can be diagnosed from its profile instead of
// guessed at.
async function bootTasks() {
  const { bootDone } = await chrome.storage.session.get("bootDone");
  if (bootDone) return;
  await chrome.storage.session.set({ bootDone: true });
  const report = { at: new Date().toISOString(), steps: {} };
  const step = async (name, fn) => {
    try {
      await fn();
      report.steps[name] = "ok";
    } catch (e) {
      report.steps[name] = `ERROR: ${e?.message || e}`;
    }
  };
  await step("seedPins", seedPins);
  await chrome.storage.local.set({ lastBootReport: report });
}
bootTasks();

chrome.runtime.onInstalled.addListener(bootTasks);
chrome.runtime.onStartup.addListener(bootTasks);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // The panel pings us when it opens; message delivery starts the worker,
  // which is the reliable carrier for once-per-launch work (onStartup alone
  // has proved unreliable in practice).
  if (message?.type === "sidebar-boot") {
    bootTasks();
    return false;
  }
  // A click on the on-page icon strip. The strip cannot open the panel
  // itself -- sidePanel.open() has to be called from an extension page or
  // the worker, and needs the window the click happened in.
  // Folding. Done here rather than in the panel because the panel is about
  // to close, and a registered content script only reaches pages loaded
  // AFTER it is registered -- which never includes the tab being looked at.
  // So the strip is injected into the open tabs directly.
  if (message?.type === "fold") {
    // Answered, not fire-and-forget: if the strip cannot be drawn where the
    // user is standing, the panel needs to say so rather than closing and
    // leaving an empty screen, which is what it did.
    (async () => {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!active || !/^https?:/i.test(active.url || "")) {
        sendResponse({ ok: false, reason: "chrome-page" });
        return;
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: active.id },
          files: ["lib/page-rail.js"],
        });
      } catch (e) {
        sendResponse({ ok: false, reason: "no-access", detail: String(e) });
        return;
      }
      await chrome.storage.local.set({ pageStrip: true });
      // Now the rest of the open tabs, so the strip is already there when
      // the user switches to one.
      const tabs = await chrome.tabs.query({});
      await Promise.all(
        tabs
          .filter((t) => t.id !== active.id && t.id != null && /^https?:/i.test(t.url || ""))
          .map((t) =>
            chrome.scripting
              .executeScript({ target: { tabId: t.id }, files: ["lib/page-rail.js"] })
              .catch(() => {
                /* a site that has not been allowed; it simply has no strip */
              })
          )
      );
      sendResponse({ ok: true });
      const win = await chrome.windows.getCurrent();
      if (chrome.sidePanel?.close) await chrome.sidePanel.close({ windowId: win.id }).catch(() => {});
    })().catch((e) => sendResponse({ ok: false, reason: "error", detail: String(e) }));
    return true; // the reply comes later
  }
  if (message?.type === "open-panel") {
    (async () => {
      await chrome.storage.local.set({
        openPanel: { panel: message.panel, url: message.url },
        pageStrip: false,
      });
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: win.id });
    })().catch(() => {});
    return false;
  }
  return false;
});

// A truly permanent, un-closable rail like Vivaldi's isn't reachable from
// an extension -- that's real native browser-chrome UI, not something the
// sidePanel API can inject. chrome.sidePanel.open() also silently does
// nothing outside a direct user gesture, so click-to-open is the real
// mechanism; once opened the panel stays open across tab switches in that
// window until deliberately closed.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
