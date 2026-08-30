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

  // The page's own scrollbar is the last old-fashioned thing in the panel: a
  // wide trough with a raised block in it. Styling it is not enough — plenty
  // of sites paint their own — so it is hidden outright and replaced with a
  // small blob that fades in while you scroll and can be dragged. Phones
  // have had this for fifteen years.
  const hide = document.createElement("style");
  hide.textContent = `
    html { scrollbar-width: none !important; -ms-overflow-style: none !important; }
    html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
    #sidemorphic-scroll {
      position: fixed; right: 3px; width: 6px; z-index: 2147483647;
      border-radius: 999px; background: rgba(128,128,128,.55);
      opacity: 0; transition: opacity .25s ease; pointer-events: auto;
      cursor: grab; touch-action: none;
    }
    #sidemorphic-scroll.on { opacity: 1; }
    #sidemorphic-scroll:active { cursor: grabbing; background: rgba(128,128,128,.8); }
  `;

  const startBlob = () => {
    (document.head || document.documentElement).appendChild(hide);

    const blob = document.createElement("div");
    blob.id = "sidemorphic-scroll";
    document.documentElement.appendChild(blob);

    const doc = () => document.scrollingElement || document.documentElement;
    let fade = null;
    let dragging = false;

    function place() {
      const d = doc();
      const view = window.innerHeight;
      const total = d.scrollHeight;
      if (total <= view + 4) {
        blob.style.display = "none";
        return;
      }
      blob.style.display = "block";
      const height = Math.max(28, Math.round((view / total) * view) - 8);
      const span = view - height - 8;
      const top = 4 + Math.round((d.scrollTop / (total - view)) * span);
      blob.style.height = `${height}px`;
      blob.style.top = `${top}px`;
    }

    function show() {
      blob.classList.add("on");
      clearTimeout(fade);
      if (!dragging) fade = setTimeout(() => blob.classList.remove("on"), 1100);
    }

    // Dragging the blob scrolls the page, in proportion.
    blob.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      dragging = true;
      blob.setPointerCapture(e.pointerId);
      const d = doc();
      const startY = e.clientY;
      const startTop = d.scrollTop;
      const view = window.innerHeight;
      const span = view - blob.offsetHeight - 8;

      const move = (ev) => {
        const moved = ev.clientY - startY;
        const ratio = (d.scrollHeight - view) / (span || 1);
        d.scrollTop = startTop + moved * ratio;
      };
      const up = () => {
        dragging = false;
        blob.removeEventListener("pointermove", move);
        blob.removeEventListener("pointerup", up);
        show();
      };
      blob.addEventListener("pointermove", move);
      blob.addEventListener("pointerup", up);
    });

    window.addEventListener("scroll", () => { place(); show(); }, { passive: true });
    window.addEventListener("resize", place);
    // Search results arrive after the first paint, so keep an eye on the
    // document's height for a while rather than measuring once.
    new MutationObserver(place).observe(document.documentElement, { childList: true, subtree: true });
    place();
  };

  if (document.documentElement) startBlob();
  else document.addEventListener("DOMContentLoaded", startBlob, { once: true });

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
