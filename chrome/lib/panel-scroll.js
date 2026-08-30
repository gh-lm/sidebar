/* Runs in a page opened in the Sidemorphic panel.

   Deliberately in the ISOLATED world, unlike the identity script: this only
   needs the DOM, and the isolated world is the one browsers are least fussy
   about. When the other script is blocked, this still runs.

   The platform scrollbar is a wide trough with a raised block in it. It is
   hidden and replaced with a small blob that fades in while scrolling and
   can be dragged — the thing phones have had for fifteen years. */
(() => {
  try {
    const inPanel =
      window !== window.top &&
      location.ancestorOrigins &&
      Array.from(location.ancestorOrigins).some((o) => o.startsWith("chrome-extension://"));
    if (!inPanel) return;
  } catch {
    return;
  }

  if (document.getElementById("sidemorphic-scroll")) return;

  // Dark blob on a light page, light blob on a dark one. Read once the page
  // has painted, because the background is often set by a stylesheet.
  function inkFor() {
    let bg = "";
    try {
      const b = getComputedStyle(document.body || document.documentElement).backgroundColor;
      const h = getComputedStyle(document.documentElement).backgroundColor;
      bg = b && b !== "rgba(0, 0, 0, 0)" ? b : h;
    } catch {
      /* fall through to the default */
    }
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg || "");
    if (!m) return { rest: "rgba(0,0,0,.42)", hot: "rgba(0,0,0,.62)" };
    const light = 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3] > 140;
    return light
      ? { rest: "rgba(0,0,0,.42)", hot: "rgba(0,0,0,.62)" }
      : { rest: "rgba(255,255,255,.5)", hot: "rgba(255,255,255,.75)" };
  }

  const style = document.createElement("style");
  const blob = document.createElement("div");
  blob.id = "sidemorphic-scroll";

  function paint() {
    const ink = inkFor();
    style.textContent = `
      html { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      html::-webkit-scrollbar, body::-webkit-scrollbar,
      :root::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
      #sidemorphic-scroll {
        position: fixed !important; right: 3px !important; width: 6px !important;
        z-index: 2147483647 !important; border-radius: 999px !important;
        background: ${ink.rest} !important; opacity: 0; transition: opacity .25s ease;
        cursor: grab; touch-action: none; margin: 0 !important; padding: 0 !important;
      }
      #sidemorphic-scroll.on { opacity: 1; }
      #sidemorphic-scroll:hover, #sidemorphic-scroll:active {
        background: ${ink.hot} !important; width: 8px !important; right: 2px !important;
      }
    `;
  }

  // Fit the page to the panel from the inside. Scaling the frame from the
  // outside cannot help a page that lays out wider than the frame — it just
  // makes a wider page — but zoom applied to the document reflows it, which
  // is what "fit to width" actually means. Only ever shrinks, never grows.
  function fitWidth() {
    const de = document.documentElement;
    try {
      de.style.zoom = "";
      const need = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0);
      const have = window.innerWidth;
      if (need > have + 2) de.style.zoom = String(Math.max(0.45, have / need));
    } catch {
      /* zoom unsupported: the page simply scrolls sideways as before */
    }
  }

  function start() {
    paint();
    (document.head || document.documentElement).appendChild(style);
    document.documentElement.appendChild(blob);
    setTimeout(paint, 700); // the page has its real colours by now

    const doc = () => document.scrollingElement || document.documentElement;
    let fade = null;
    let dragging = false;

    function place() {
      const d = doc();
      const view = window.innerHeight;
      const total = d.scrollHeight;
      if (!total || total <= view + 4) {
        blob.style.display = "none";
        return;
      }
      blob.style.display = "block";
      const height = Math.max(30, Math.round((view / total) * view) - 8);
      const span = view - height - 8;
      blob.style.height = `${height}px`;
      blob.style.top = `${4 + Math.round((d.scrollTop / (total - view)) * span)}px`;
    }

    function show() {
      blob.classList.add("on");
      clearTimeout(fade);
      if (!dragging) fade = setTimeout(() => blob.classList.remove("on"), 1100);
    }

    blob.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      dragging = true;
      try { blob.setPointerCapture(e.pointerId); } catch { /* older engines */ }
      const d = doc();
      const startY = e.clientY;
      const startTop = d.scrollTop;
      const span = window.innerHeight - blob.offsetHeight - 8;
      const ratio = (d.scrollHeight - window.innerHeight) / (span || 1);

      const move = (ev) => { d.scrollTop = startTop + (ev.clientY - startY) * ratio; };
      const up = () => {
        dragging = false;
        blob.removeEventListener("pointermove", move);
        blob.removeEventListener("pointerup", up);
        show();
      };
      blob.addEventListener("pointermove", move);
      blob.addEventListener("pointerup", up);
    });

    let settle = null;
    const remeasure = () => {
      clearTimeout(settle);
      settle = setTimeout(() => { fitWidth(); place(); }, 120);
    };

    window.addEventListener("scroll", () => { place(); show(); }, { passive: true, capture: true });
    window.addEventListener("resize", remeasure);
    window.addEventListener("load", remeasure);
    // Results arrive after the first paint, so keep measuring for a while
    // rather than sizing the blob once and leaving it wrong.
    new MutationObserver(remeasure).observe(document.documentElement, { childList: true, subtree: true });
    fitWidth();
    place();
    show();
  }

  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
