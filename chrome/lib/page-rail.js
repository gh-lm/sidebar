/* The icon strip, drawn on an ordinary web page.

   Chromium will not let the side panel be narrower than 360px, and gives an
   extension no way to change that, so folding the panel can never leave a
   thin strip: the page stays squeezed by 360px whatever we hide. The only
   way to give the page its width back and still keep the icons within reach
   is to close the panel and draw them here instead.

   It appears only after the panel has been folded away, and only on sites
   the user has already allowed. Everything lives in a closed shadow root so
   no page styling can reach it and nothing of ours leaks into the page.
   Runs in the ISOLATED world: it never touches the page's own scripts. */
(() => {
  if (window.top !== window) return; // top-level pages only, never a frame

  // A copy of this script from before the extension was reloaded can still
  // be sitting on the page. Its listener is dead -- reloading an extension
  // cuts every content script already running from it -- but its mark is
  // still on the page. Bowing out on seeing that mark is what left the strip
  // permanently unable to appear on any tab that had been open across a
  // reload. So take over from it instead of standing down.
  const previous = document.documentElement.__lmSidebarRail;
  if (previous && typeof previous.teardown === "function") {
    try {
      previous.teardown();
    } catch {
      /* it was already cut off; its host is removed below either way */
    }
  }
  document.documentElement.dataset.lmSidebarRail = "1";

  // Retired the moment a newer copy takes over. Drawing waits on a read of
  // the saved pins, so a copy can be retired while it is still part-way
  // through drawing; without this it finished anyway and left a second strip
  // on the page with no listener behind it -- one that could not be closed
  // and stayed put when the panel opened.
  let alive = true;

  // Anything belonging to a copy that has gone. Matched on our own attribute
  // rather than a z-index, which a page is free to use itself.
  function sweep(keep) {
    for (const el of [...document.documentElement.children]) {
      if (el !== keep && el.dataset && el.dataset.lmSidebarRailHost === "1") el.remove();
    }
  }
  sweep(null);

  const CLOSE_ICON = '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>';

  const ICONS = {
    search:
      '<circle cx="9" cy="9" r="5.25"/><path d="M12.9 12.9L16.5 16.5"/>',
    scratchpad:
      '<path d="M4 3h9l3 3v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M13 3v3h3"/><path d="M6.5 9.5h7M6.5 12.5h7M6.5 15.5h4"/>',
    snippets:
      '<path d="M7 3h6v2H7z"/><path d="M5 5h10v12H5z"/><path d="M7.5 9h5M7.5 12h5"/>',
  };

  let host = null;
  let shadow = null;
  let side = "right";
  let topPercent = 50;
  let dragging = false;
  let missedRender = false;

  function build() {
    host = document.createElement("div");
    host.dataset.lmSidebarRailHost = "1";
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";
    shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .strip {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 6px 4px;
        border-radius: var(--corners);
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
        font-family: system-ui, sans-serif;
      }
      button {
        all: unset;
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        cursor: pointer;
        color: #cbd5e1;
      }
      button:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
      button:focus-visible { outline: 2px solid #FBC711; outline-offset: -2px; }
      svg { width: 17px; height: 17px; }
      img { width: 17px; height: 17px; border-radius: 3px; }
      .mark { width: 20px; height: 20px; border-radius: 4px; }
      .letter { font: 600 12px system-ui, sans-serif; }
      hr { width: 16px; border: 0; border-top: 1px solid rgba(255,255,255,.14); margin: 3px 0; }
      .grip { cursor: grab; color: #64748b; }
      .grip:active { cursor: grabbing; }
      .close:hover { background: rgba(239, 68, 68, 0.25); color: #fecaca; }
    `;
    shadow.append(style);

    const strip = document.createElement("div");
    strip.className = "strip";
    strip.setAttribute("role", "toolbar");
    strip.setAttribute("aria-label", "Lightmorphic Sidebar");
    shadow.append(strip);
    return strip;
  }

  // A click that did not work should look like it did not work.
  function flash(button) {
    button.animate(
      [{ background: "rgba(239,68,68,.45)" }, { background: "transparent" }],
      { duration: 700 }
    );
    button.title = "Could not open the panel. Use the toolbar icon.";
  }

  function iconButton({ label, svg, img, letter, panel, url }) {
    const b = document.createElement("button");
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    if (svg) {
      b.innerHTML =
        `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" ` +
        `stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;
    } else if (letter) {
      b.textContent = letter.toUpperCase();
      b.classList.add("letter");
    } else if (img) {
      const el = document.createElement("img");
      el.src = img;
      el.alt = "";
      if (label === "Lightmorphic Sidebar") el.className = "mark";
      b.append(el);
    }
    b.addEventListener("click", () => {
      // A drag ends with a click; ignore that one, or moving the strip also
      // opens the panel.
      if (b.dataset.dragged === "1") {
        delete b.dataset.dragged;
        return;
      }
      chrome.runtime
        .sendMessage({ type: "open-panel", panel, url })
        .then((reply) => {
          // If the panel refused to open, the strip stays put and says so,
          // rather than the click appearing to do nothing.
          if (reply && reply.ok === false) flash(b);
        })
        .catch(() => flash(b));
    });
    return b;
  }

  async function render() {
    if (!alive) return;
    if (dragging) {
      missedRender = true; // drawn again the moment the pointer is let go
      return;
    }
    const strip = shadow ? shadow.querySelector(".strip") : build();
    strip.textContent = "";

    // Drag handle. The mark doubles as it, so the strip does not grow a
    // control that does nothing but exist.
    const grip = iconButton({
      label: "Lightmorphic Sidebar \u2014 drag to move it up or down",
      img: chrome.runtime.getURL("icons/icon-32.png"),
      panel: "search",
    });
    grip.classList.add("grip");
    makeDraggable(grip);
    strip.append(grip);
    strip.append(document.createElement("hr"));
    strip.appendChild(document.createComment("sections"));
    strip.append(
    );
    for (const [panel, label] of [
      ["search", "Search"],
      ["scratchpad", "Scratchpad"],
      ["snippets", "Snippets"],
    ]) {
      strip.append(iconButton({ label, svg: ICONS[panel], panel }));
    }

    let pins = [];
    let icons = {};
    try {
      const saved = await chrome.storage.local.get(["webPanels", "siteIcons"]);
      pins = saved.webPanels || [];
      icons = saved.siteIcons || {};
    } catch {
      /* no pins to draw */
    }
    if (pins.length) strip.append(document.createElement("hr"));
    for (const url of pins.slice(0, 6)) {
      let name = url;
      try {
        name = new URL(url).hostname;
      } catch {
        /* keep the raw string */
      }
      // The browser's favicon service is only readable from an extension
      // page, and this is a web page. The copy kept when the site was pinned
      // is an image we already hold, so it works here; a letter is the
      // fallback for a pin made before icons were kept.
      const kept = icons[name.replace(/^www\./, "")];
      strip.append(
        kept
          ? iconButton({ label: name, img: kept, url })
          : iconButton({ label: name, letter: name.replace(/^www\./, "")[0], url })
      );
    }

    // Sending it away. It comes back the next time the panel is folded, or
    // from the toolbar icon, so this is a dismissal rather than a setting.
    strip.append(document.createElement("hr"));
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.title = "Hide this strip";
    close.setAttribute("aria-label", "Hide this strip");
    close.innerHTML =
      `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" ` +
      `stroke-linecap="round">${CLOSE_ICON}</svg>`;
    close.addEventListener("click", () => {
      chrome.storage.local.set({ pageStrip: false }).catch(() => {});
    });
    strip.append(close);

    // The read above gave every other copy a chance to retire this one.
    if (!alive) return;
    place();
    if (!host.isConnected) document.documentElement.append(host);
    sweep(host);
  }

  // Which edge, and how far down. Both are remembered, so the strip stays
  // where it was put.
  function place() {
    if (!host) return;
    host.style.left = side === "left" ? "0px" : "auto";
    host.style.right = side === "left" ? "auto" : "0px";
    host.style.top = `${topPercent}%`;
    host.style.transform = "translateY(-50%)";
    const strip = shadow.querySelector(".strip");
    if (strip) {
      strip.style.setProperty("--corners", side === "left" ? "0 10px 10px 0" : "10px 0 0 10px");
      strip.style[side === "left" ? "borderLeft" : "borderRight"] = "0";
      strip.style[side === "left" ? "borderRight" : "borderLeft"] = "";
    }
  }

  // Dragging moves it up and down only: the edge is a deliberate choice made
  // in Information, not something to lose by accident with a stray drag.
  function makeDraggable(handle) {
    handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer went away between the event and this line */
      }
      e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging || !host) return;
      const pct = Math.min(92, Math.max(8, (e.clientY / window.innerHeight) * 100));
      if (Math.abs(pct - topPercent) > 0.5) handle.dataset.dragged = "1";
      topPercent = pct;
      host.style.top = `${pct}%`;
    });
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      if (missedRender) {
        missedRender = false;
        sync();
      }
      // Saving where it was put used to bring the whole strip down and build
      // it again, which threw away the very button the pointer was holding,
      // in the middle of the gesture that was holding it.
      chrome.storage.local.set({ stripTop: topPercent }).catch(() => {});
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    handle.addEventListener("lostpointercapture", stop);
  }

  function hide() {
    if (host && host.isConnected) host.remove();
    sweep(null); // strays left by a copy that no longer has a listener
  }

  async function sync() {
    let settings;
    try {
      settings = await chrome.storage.local.get(["pageStrip", "stripSide", "stripTop"]);
    } catch {
      return;
    }
    side = settings.stripSide === "left" ? "left" : "right";
    topPercent = typeof settings.stripTop === "number" ? settings.stripTop : 50;
    if (settings.pageStrip) await render();
    else hide();
  }

  const onChanged = (changes, area) => {
    if (area !== "local") return;
    // Where it sits is a move. Only what it holds is worth drawing again.
    if ("stripTop" in changes || "stripSide" in changes) {
      if (typeof changes.stripTop?.newValue === "number") topPercent = changes.stripTop.newValue;
      if (changes.stripSide) side = changes.stripSide.newValue === "left" ? "left" : "right";
      place();
    }
    if (["pageStrip", "webPanels", "siteIcons"].some((k) => k in changes)) sync();
  };
  chrome.storage.onChanged.addListener(onChanged);

  // What the next copy needs to retire this one cleanly.
  document.documentElement.__lmSidebarRail = {
    teardown() {
      alive = false;
      dragging = false;
      chrome.storage.onChanged.removeListener(onChanged);
      if (host && host.isConnected) host.remove();
    },
  };

  sync();
})();
