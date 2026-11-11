// Lightmorphic Sidebar — service worker.

const DEFAULT_PIN = "https://en.wikipedia.org";

async function seedPins() {
  const { pinsSeeded } = await chrome.storage.local.get("pinsSeeded");
  if (pinsSeeded) return;
  const { webPanels = [] } = await chrome.storage.local.get("webPanels");
  if (!webPanels.includes(DEFAULT_PIN)) webPanels.unshift(DEFAULT_PIN);
  await chrome.storage.local.set({ webPanels, pinsSeeded: true });
}

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
  if (message?.type === "sidebar-boot") {
    bootTasks();
    return false;
  }
  if (message?.type === "fold" || message?.type === "fold-dry-run") {
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
      if (/^https?:\/\/(chromewebstore\.google\.com([/?#]|$)|chrome\.google\.com\/webstore)/i.test(active.url)) {
        say("stopped: the Web Store cannot be scripted by any extension");
        sendResponse({ ok: false, reason: "web-store" });
        return;
      }
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
              })
          )
      );
      say(`also injected into ${others} other tab(s)`);
      const drawn = await chrome.scripting
        .executeScript({
          target: { tabId: active.id },
          func: async () => {
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
    return true;
  }
  if (message?.type === "open-tab" && message.url) {
    (async () => {
      const [here] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.create({ url: message.url, index: here ? here.index + 1 : undefined });
    })().catch(() => {});
    return false;
  }
  if (message?.type === "open-panel") {
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

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
