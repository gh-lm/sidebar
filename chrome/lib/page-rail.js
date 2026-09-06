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
  if (document.documentElement.dataset.lmSidebarRail) return; // already here
  document.documentElement.dataset.lmSidebarRail = "1";

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

  function build() {
    host = document.createElement("div");
    host.style.cssText =
      "all: initial; position: fixed; right: 0; top: 50%; " +
      "transform: translateY(-50%); z-index: 2147483647;";
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
        border-radius: 10px 0 0 10px;
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-right: 0;
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
    `;
    shadow.append(style);

    const strip = document.createElement("div");
    strip.className = "strip";
    strip.setAttribute("role", "toolbar");
    strip.setAttribute("aria-label", "Lightmorphic Sidebar");
    shadow.append(strip);
    return strip;
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
      chrome.runtime.sendMessage({ type: "open-panel", panel, url }).catch(() => {});
    });
    return b;
  }

  async function render() {
    const strip = shadow ? shadow.querySelector(".strip") : build();
    strip.textContent = "";

    strip.append(
      iconButton({
        label: "Lightmorphic Sidebar",
        img: chrome.runtime.getURL("icons/icon-32.png"),
        panel: "search",
      })
    );
    strip.append(document.createElement("hr"));
    for (const [panel, label] of [
      ["search", "Search"],
      ["scratchpad", "Scratchpad"],
      ["snippets", "Snippets"],
    ]) {
      strip.append(iconButton({ label, svg: ICONS[panel], panel }));
    }

    let pins = [];
    try {
      ({ webPanels: pins = [] } = await chrome.storage.local.get("webPanels"));
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
      // page, and this is a web page, so a real icon is not available here.
      // A letter is at least legible, rather than a broken image.
      strip.append(iconButton({ label: name, letter: name.replace(/^www\./, "")[0], url }));
    }

    if (!host.isConnected) document.documentElement.append(host);
  }

  function hide() {
    if (host && host.isConnected) host.remove();
  }

  async function sync() {
    let visible = false;
    try {
      ({ pageStrip: visible = false } = await chrome.storage.local.get("pageStrip"));
    } catch {
      return;
    }
    if (visible) await render();
    else hide();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && ("pageStrip" in changes || "webPanels" in changes)) sync();
  });

  sync();
})();
