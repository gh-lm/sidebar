// Sidemorphic — service worker.
//
// Scope is deliberately small: the side panel, the new-tab page, cookie
// controls and a few privacy defaults. No ad blocking, no sync, no native
// messaging, no self-updater — those belonged to the AppImage browser this
// extension grew out of.

// ---- Cookies ----
// Enforced by Chromium's own content-settings engine (the same machinery
// behind chrome://settings/content/cookies), which persists rules in the
// profile natively. Three modes, global and per-site:
//   allow | session_only (accepted, wiped when the browser closes) | block
// Our storage (cookieGlobalSetting + cookieSiteRules) is the source of
// truth for the UI; applyCookieRules() clears our previously-set rules
// and re-applies the whole set, so removing a per-site override is just
// dropping it from the map. Re-run at boot for consistency (idempotent).
async function applyCookieRules() {
  if (!chrome.contentSettings?.cookies) return;
  const { cookieGlobalSetting = "allow", cookieSiteRules = {} } =
    await chrome.storage.local.get(["cookieGlobalSetting", "cookieSiteRules"]);
  const cookies = chrome.contentSettings.cookies;
  await new Promise((r) => cookies.clear({}, r));
  if (cookieGlobalSetting !== "allow") {
    await new Promise((r) =>
      cookies.set({ primaryPattern: "<all_urls>", setting: cookieGlobalSetting }, r)
    );
  }
  for (const [host, setting] of Object.entries(cookieSiteRules)) {
    for (const scheme of ["http", "https"]) {
      await new Promise((r) =>
        cookies.set({ primaryPattern: `${scheme}://[*.]${host}/*`, setting }, r)
      );
    }
  }
}

// "This session only" must mean it: cookies added during a session are
// gone by the next one. Chromium's session_only content setting deletes
// them on a CLEAN exit, but after a crash/kill it deliberately keeps
// session cookies for recovery (verified live: a killed session's cookie
// survived into the next launch). This boot-time sweep closes that gap:
// under a session-only policy, wipe cookies at the start of each session
// -- keeping cookies for sites the user explicitly set to "allow".
async function enforceSessionCookiePolicy() {
  if (!chrome.browsingData) return;
  const { cookieGlobalSetting = "allow", cookieSiteRules = {} } =
    await chrome.storage.local.get(["cookieGlobalSetting", "cookieSiteRules"]);
  const originsFor = (host) => [`https://${host}`, `http://${host}`];
  try {
    if (cookieGlobalSetting === "session_only") {
      const keep = Object.entries(cookieSiteRules)
        .filter(([, s]) => s === "allow")
        .flatMap(([h]) => originsFor(h));
      await chrome.browsingData.remove({ excludeOrigins: keep }, { cookies: true });
    } else {
      const wipe = Object.entries(cookieSiteRules)
        .filter(([, s]) => s === "session_only")
        .flatMap(([h]) => originsFor(h));
      if (wipe.length) {
        await chrome.browsingData.remove({ origins: wipe }, { cookies: true });
      }
    }
  } catch {
    /* browsingData unavailable -- Chromium's own clean-exit path still applies */
  }
}

async function setCookieGlobal(setting) {
  if (!["allow", "session_only", "block"].includes(setting)) return;
  await chrome.storage.local.set({ cookieGlobalSetting: setting });
  await applyCookieRules();
}

async function setCookieSite(host, setting) {
  if (!host) return;
  const { cookieSiteRules = {} } = await chrome.storage.local.get("cookieSiteRules");
  if (setting === "default") delete cookieSiteRules[host];
  else if (["allow", "session_only", "block"].includes(setting)) cookieSiteRules[host] = setting;
  else return;
  await chrome.storage.local.set({ cookieSiteRules });
  await applyCookieRules();
}

// ---- Privacy defaults ----
// Applied ONCE (flag-guarded) so a user who deliberately re-enables
// something isn't fought on every launch.
async function applyPrivacyDefaults() {
  const { privacyDefaultsApplied } = await chrome.storage.local.get("privacyDefaultsApplied");
  if (privacyDefaultsApplied || !chrome.privacy?.services) return;
  const set = (pref, value) =>
    new Promise((resolve) => {
      try {
        pref.set({ value }, resolve);
      } catch {
        resolve();
      }
    });
  await set(chrome.privacy.services.passwordSavingEnabled, false);
  await set(chrome.privacy.services.autofillAddressEnabled, false);
  await set(chrome.privacy.services.autofillCreditCardEnabled, false);
  await chrome.storage.local.set({ privacyDefaultsApplied: true });
}

// ---- Pinned panels ----
const DEFAULT_PIN = "https://sidemorphic.com";

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
  await step("enforceSessionCookiePolicy", enforceSessionCookiePolicy);
  await step("applyCookieRules", applyCookieRules);
  await step("applyPrivacyDefaults", applyPrivacyDefaults);
  await step("seedPins", seedPins);
  await chrome.storage.local.set({ lastBootReport: report });
}
bootTasks();

chrome.runtime.onInstalled.addListener(bootTasks);
chrome.runtime.onStartup.addListener(bootTasks);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // The sidebar and new-tab pages ping us on load; message delivery
  // starts the worker, which is the reliable carrier for once-per-launch
  // work (onStartup alone has proved unreliable in practice).
  if (message?.type === "sidemorphic-boot") {
    bootTasks();
    return false;
  }
  // The sidebar saves settings to storage itself and just asks us to
  // enforce whatever storage now says. Persistence never depends on this
  // worker being healthy.
  if (message?.type === "sidemorphic-apply-settings") {
    applyCookieRules().catch(() => {});
    return false;
  }
  if (message?.type === "sidemorphic-cookies-global") {
    setCookieGlobal(message.setting).then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  if (message?.type === "sidemorphic-cookies-site") {
    setCookieSite(message.host, message.setting).then(() => sendResponse({ ok: true }));
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
