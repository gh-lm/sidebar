/* Runs inside a page opened in the Sidemorphic panel, before the page's own
   scripts, in the page's world.

   The panel already asks for the phone layout in the request headers, which
   is enough for anything rendered on a server. It is not enough for a site
   that decides in JavaScript: those read navigator, see a desktop browser,
   and lay out a desktop page — which then cannot fit however far it is
   zoomed out. This tells them the same thing the headers do.

   It applies ONLY to a frame whose ancestor is this extension. A tab the
   user opens themselves is a top-level frame and is never touched. */
(() => {
  try {
    const inPanel =
      window !== window.top &&
      location.ancestorOrigins &&
      Array.from(location.ancestorOrigins).some((o) => o.startsWith("chrome-extension://"));
    if (!inPanel) return;
  } catch {
    return; // no ancestorOrigins: assume not ours and leave the page alone
  }

  const UA =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

  const fix = (obj, prop, value) => {
    try {
      Object.defineProperty(obj, prop, { get: () => value, configurable: true });
    } catch {
      /* some properties are locked down; the rest still help */
    }
  };

  fix(navigator, "userAgent", UA);
  fix(navigator, "appVersion", UA.replace("Mozilla/", ""));
  fix(navigator, "platform", "Linux armv8l");
  fix(navigator, "maxTouchPoints", 5);
  fix(navigator, "vendor", "Google Inc.");

  // The page's own scrollbar is the last old-fashioned thing in the panel:
  // a wide grey trough with a raised block in it. Phones do not have one,
  // and this frame is claiming to be a phone. Only inside the panel — the
  // guard above has already established that.
  const thin = document.createElement("style");
  thin.textContent = `
    ::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
    ::-webkit-scrollbar-track { background: transparent !important; }
    ::-webkit-scrollbar-corner { background: transparent !important; }
    ::-webkit-scrollbar-thumb {
      background: rgba(128,128,128,.32) !important;
      border: 2px solid transparent !important;
      background-clip: content-box !important;
      border-radius: 999px !important;
    }
    ::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,.55) !important; background-clip: content-box !important; }
    html { scrollbar-width: thin !important; scrollbar-color: rgba(128,128,128,.32) transparent !important; }
  `;
  const attach = () => (document.head || document.documentElement).appendChild(thin);
  if (document.documentElement) attach();
  else document.addEventListener("DOMContentLoaded", attach, { once: true });

  if (navigator.userAgentData) {
    const uad = navigator.userAgentData;
    fix(navigator, "userAgentData", {
      brands: uad.brands,
      mobile: true,
      platform: "Android",
      getHighEntropyValues: (hints) =>
        uad.getHighEntropyValues(hints).then((v) => ({ ...v, mobile: true, platform: "Android" })),
      toJSON: () => ({ brands: uad.brands, mobile: true, platform: "Android" }),
    });
  }
})();
