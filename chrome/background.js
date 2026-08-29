// Sidemorphic — service worker.
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
// profile has been seeded. Sidemorphic's own site is on the rail already, as
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

chrome.runtime.onMessage.addListener((message) => {
  // The panel pings us when it opens; message delivery starts the worker,
  // which is the reliable carrier for once-per-launch work (onStartup alone
  // has proved unreliable in practice).
  if (message?.type === "sidemorphic-boot") {
    bootTasks();
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
