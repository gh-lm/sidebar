/* Runs inside a page opened in the Lightmorphic Sidebar panel, before the page's own
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
