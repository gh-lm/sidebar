/* Screenshot harness only. Never shipped. Feeds the real panel code a
   fake browser so it draws with fixture data. */
(function () {
  const P = new URLSearchParams(location.search);
  const HEAD = "https://lightmorphic.invalid/#sb1:";
  const enc = (v) => HEAD + encodeURIComponent(JSON.stringify(v));

  const SCRATCH = `Wednesday

  ring the framer back — 3pm
  invoice 214 still unpaid
  book the ferry before the price goes up

Sarah's new address
  14 Bell Lane, Norwich NR2 1AB

That paragraph I'm not sure about yet:
  "...which is why we stopped charging per seat."`;

  const SNIPPETS = [
    { text: "sidebar@lightmorphic.com" },
    { text: "Lightmorphic Ltd, 82A James Carter Road, Mildenhall, Suffolk IP28 7DE" },
    { text: "Thanks for this — I'll come back to you before the end of the week." },
    { text: "Sorry for the slow reply, it has been a busy fortnight here." },
    { text: "https://sidebar.lightmorphic.com/" },
  ];

  const PINS = P.get("pins") === "0" ? [] : [
    "https://lightmorphic.com",
    "https://news.ycombinator.com",
    "https://en.wikipedia.org",
  ];

  let seq = 100;
  const node = (o) => Object.assign({ id: String(seq++), children: undefined }, o);
  const root = node({ title: "", children: [] });
  const other = node({ title: "Other bookmarks", parentId: root.id, children: [] });
  root.children.push(node({ id: "1", title: "Bookmarks bar", children: [] }), other);
  other.id = "2";
  const folder = node({ title: "Lightmorphic Sidebar", parentId: "2", children: [] });
  other.children.push(folder);
  for (const url of PINS) {
    folder.children.push(node({ title: new URL(url).hostname, url, parentId: folder.id }));
  }
  folder.children.push(node({ title: "Lightmorphic Sidebar scratchpad", url: enc(SCRATCH), parentId: folder.id }));
  folder.children.push(node({ title: "Lightmorphic Sidebar snippets", url: enc(SNIPPETS), parentId: folder.id }));

  const index = new Map();
  (function walk(n) { index.set(n.id, n); (n.children || []).forEach(walk); })(root);

  const ev = () => ({ addListener() {}, removeListener() {} });
  const store = new Map([["recentSearches", ["norwich tide times", "side panel extensions", "best bread flour"]]]);
  if (P.get("welcome") !== "1") store.set("welcomeSeen", true);

  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "1.0.0" }),
      getURL: (p) => {
        if (String(p).includes("_favicon")) return location.origin + "/fav/";
        return new URL("../" + p, location.href).href;
      },
      sendMessage: () => Promise.resolve(),
      lastError: null,
      onMessage: ev(),
    },
    storage: {
      local: {
        get: (k) => {
          const keys = k == null ? [...store.keys()] : typeof k === "string" ? [k] : Array.isArray(k) ? k : Object.keys(k);
          const out = {};
          for (const key of keys) if (store.has(key)) out[key] = store.get(key);
          if (k && !Array.isArray(k) && typeof k === "object") for (const key of keys) if (!(key in out)) out[key] = k[key];
          return Promise.resolve(out);
        },
        set: (o) => { for (const [k, v] of Object.entries(o)) store.set(k, v); return Promise.resolve(); },
        remove: (k) => { (Array.isArray(k) ? k : [k]).forEach((x) => store.delete(x)); return Promise.resolve(); },
      },
      onChanged: ev(),
    },
    bookmarks: {
      getTree: () => Promise.resolve([root]),
      get: (id) => Promise.resolve(index.has(id) ? [index.get(id)] : Promise.reject(new Error("no"))),
      getChildren: (id) => Promise.resolve((index.get(id)?.children || []).slice()),
      create: (d) => {
        const n = node({ ...d, children: d.url ? undefined : [] });
        index.set(n.id, n);
        const p = index.get(d.parentId);
        if (p) (p.children ||= []).splice(d.index ?? p.children.length, 0, n);
        return Promise.resolve(n);
      },
      update: (id, ch) => { Object.assign(index.get(id) || {}, ch); return Promise.resolve(index.get(id)); },
      move: () => Promise.resolve(),
      remove: (id) => {
        const n = index.get(id); const p = n && index.get(n.parentId);
        if (p) p.children = p.children.filter((c) => c.id !== id);
        return Promise.resolve();
      },
      onChanged: ev(), onCreated: ev(), onRemoved: ev(), onMoved: ev(),
    },
    permissions: {
      contains: () => Promise.resolve(true),
      request: () => Promise.resolve(true),
      remove: () => Promise.resolve(true),
      onAdded: ev(), onRemoved: ev(),
    },
    tabs: {
      query: () => Promise.resolve([{ id: 1, url: "https://lightmorphic.com/", title: "Lightmorphic" }]),
      create: () => Promise.resolve({}),
      onActivated: ev(), onUpdated: ev(),
    },
    windows: { getCurrent: () => Promise.resolve({ id: 1 }) },
    sidePanel: { close: () => Promise.resolve() },
    scripting: {
      executeScript: () => Promise.resolve([]),
      getRegisteredContentScripts: () => Promise.resolve([]),
      registerContentScripts: () => Promise.resolve(),
      unregisterContentScripts: () => Promise.resolve(),
    },
    declarativeNetRequest: { updateSessionRules: () => Promise.resolve() },
    commands: { getAll: () => Promise.resolve([{ name: "_execute_action", shortcut: "Ctrl+Shift+S" }]) },
  };

  // Rewrite the browser's own favicon service to local copies of the real
  // site icons, since the harness has no profile cache to read.
  const FAV = {
    "lightmorphic.com": "/fav/lightmorphic.svg",
    "news.ycombinator.com": "/fav/hn.png",
    "en.wikipedia.org": "/fav/wikipedia.png",
  };
  function fixFavicons() {
    for (const img of document.querySelectorAll('img[src*="/fav/?"]')) {
      try {
        const page = new URL(new URL(img.src).searchParams.get("pageUrl"));
        const f = FAV[page.hostname];
        if (f) img.src = f;
      } catch { /* leave it */ }
    }
  }
  new MutationObserver(fixFavicons).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
  document.addEventListener("DOMContentLoaded", fixFavicons);
})();
