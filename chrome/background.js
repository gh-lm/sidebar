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
  if (message?.type === "fold" || message?.type === "fold-dry-run") {
    // Answered, not fire-and-forget: if the strip cannot be drawn where the
    // user is standing, the panel needs to say so rather than closing and
    // leaving an empty screen. Every step is written down as it happens, so
    // a fold that still goes wrong can be read back from Information.
    const dryRun = message.type === "fold-dry-run";
    const note = { at: new Date().toISOString(), dryRun, steps: [] };
    const say = (step) => {
      note.steps.push(step);
      chrome.storage.local.set({ lastFold: note }).catch(() => {});
    };
    (async () => {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      note.activeUrl = (active && active.url) || "(none)";
      say(`active tab: ${note.activeUrl.slice(0, 60)}`);
      if (!active || !/^https?:/i.test(active.url || "")) {
        say("stopped: not a page an extension may draw on");
        sendResponse({ ok: false, reason: "chrome-page" });
        return;
      }
      // The Web Store is an ordinary https address but Chrome protects it
      // anyway: no extension may script it, whatever permissions it holds.
      // Worth naming, because the general "not allowed yet" advice sends the
      // user off to grant access that would make no difference here.
      if (/^https?:\/\/(chromewebstore\.google\.com([/?#]|$)|chrome\.google\.com\/webstore)/i.test(active.url)) {
        say("stopped: the Web Store cannot be scripted by any extension");
        sendResponse({ ok: false, reason: "web-store" });
        return;
      }
      // Written BEFORE injecting, or the script reads it as still folded
      // away and draws nothing.
      await chrome.storage.local.set({ pageStrip: true });
      say("pageStrip set to true");
      try {
        await chrome.scripting.executeScript({
          target: { tabId: active.id },
          files: ["lib/page-rail.js"],
        });
        say("strip injected into the active tab");
      } catch (e) {
        say(`injection refused: ${String(e).slice(0, 120)}`);
        await chrome.storage.local.set({ pageStrip: false });
        sendResponse({ ok: false, reason: "no-access", detail: String(e) });
        return;
      }
      const tabs = await chrome.tabs.query({});
      let others = 0;
      await Promise.all(
        tabs
          .filter((t) => t.id !== active.id && t.id != null && /^https?:/i.test(t.url || ""))
          .map((t) =>
            chrome.scripting
              .executeScript({ target: { tabId: t.id }, files: ["lib/page-rail.js"] })
              .then(() => { others += 1; })
              .catch(() => {
                /* a site that has not been allowed; it simply has no strip */
              })
          )
      );
      say(`also injected into ${others} other tab(s)`);
      // Not just "is it there" but "where did it land". A fixed element can
      // be present and still be nowhere the eye can find it, and that is
      // invisible to every other check.
      const drawn = await chrome.scripting
        .executeScript({
          target: { tabId: active.id },
          func: async () => {
            // Drawing waits on a read of the saved pins, so looking straight
            // away reports "not there" for a strip that is about to appear.
            const find = () =>
              [...document.documentElement.children].find(
                (el) => el.dataset && el.dataset.lmSidebarRailHost === "1"
              );
            let host = find();
            for (let i = 0; i < 20 && !host; i++) {
              await new Promise((r) => setTimeout(r, 100));
              host = find();
            }
            if (!host) return { present: false, marker: !!document.documentElement.dataset.lmSidebarRail };
            const r = host.getBoundingClientRect();
            const cs = getComputedStyle(host);
            return {
              present: true,
              rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
              onScreen: r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 &&
                r.left < innerWidth && r.top < innerHeight,
              position: cs.position,
              visibility: cs.visibility,
              display: cs.display,
              opacity: cs.opacity,
              viewport: `${innerWidth}x${innerHeight}`,
            };
          },
        })
        .then((r) => r?.[0]?.result)
        .catch((e) => ({ error: String(e).slice(0, 80) }));
      say(`strip on the page: ${JSON.stringify(drawn)}`);
      // Closing the panel on the strength of "the injection did not throw"
      // is how this kept failing quietly. Check it is actually on screen,
      // and if it is not, stay open and say what was found.
      if (!drawn || drawn.onScreen !== true) {
        await chrome.storage.local.set({ pageStrip: false });
        sendResponse({ ok: false, reason: "not-visible", detail: JSON.stringify(drawn) });
        return;
      }
      sendResponse({ ok: true });
      if (dryRun) {
        say("dry run, panel left open");
        return;
      }
      const win = await chrome.windows.getCurrent();
      if (chrome.sidePanel?.close) {
        await chrome.sidePanel.close({ windowId: win.id }).catch((e) => say(`close refused: ${String(e).slice(0, 80)}`));
      }
      say("panel closed");
    })().catch((e) => {
      say(`threw: ${String(e).slice(0, 140)}`);
      sendResponse({ ok: false, reason: "error", detail: String(e) });
    });
    return true; // the reply comes later
  }
  // A link followed inside the panel, handed to the main window.
  if (message?.type === "open-tab" && message.url) {
    (async () => {
      const [here] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.create({ url: message.url, index: here ? here.index + 1 : undefined });
    })().catch(() => {});
    return false;
  }
  if (message?.type === "open-panel") {
    // Opening the side panel is only allowed while the user's click still
    // counts, and every await spends a little of that. So it goes first,
    // before anything is written or looked up, using the window the click
    // came from rather than asking which window is current.
    const windowId = sender?.tab?.windowId;
    let opening;
    try {
      opening =
        windowId == null
          ? Promise.reject(new Error("no window for this click"))
          : chrome.sidePanel.open({ windowId });
    } catch (e) {
      opening = Promise.reject(e);
    }

    (async () => {
      await chrome.storage.local.set({
        openPanel: { panel: message.panel, url: message.url, at: Date.now() },
      });
      try {
        await opening;
      } catch (e) {
        // The panel did not open, so the strip must stay: hiding it first
        // and failing here is how a click ended up making everything
        // disappear with nothing to click on.
        sendResponse({ ok: false, detail: String(e) });
        return;
      }
      await chrome.storage.local.set({ pageStrip: false });
      sendResponse({ ok: true });
    })().catch((e) => sendResponse({ ok: false, detail: String(e) }));
    return true;
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
