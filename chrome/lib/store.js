/* Sidemorphic storage.
   Everything lives in bookmarks, so the browser's own sync carries it —
   no account, no server, and it works in Brave and Vivaldi, which sync
   bookmarks but not extension storage.

   Bookmarks/Other bookmarks/
     Sidemorphic/
       <pinned site>          one ordinary bookmark per pinned panel,
                              in rail order — clickable, readable, and
                              useful even without the extension
       Sidemorphic scratchpad url holds the scratchpad text
       Sidemorphic snippets   url holds the snippets, as JSON

   Extension storage is still written as a local mirror, so the panel has
   something to draw before the bookmark read finishes and something to
   fall back on if the bookmarks API is unavailable.
*/

const ROOT_TITLE = "Sidemorphic";
const SCRATCH_TITLE = "Sidemorphic scratchpad";
const SNIPPETS_TITLE = "Sidemorphic snippets";

// Data is parked in the bookmark's url. A reserved .invalid host means a
// stray click goes nowhere, and no browser treats it as code — unlike a
// javascript: url, which some browsers strip outright.
const HEAD = "https://sidemorphic.invalid/#sm1:";

const bm = chrome.bookmarks;

function encode(value) {
  return HEAD + encodeURIComponent(JSON.stringify(value));
}

function decode(url) {
  if (typeof url !== "string" || !url.startsWith(HEAD)) return null;
  try {
    return JSON.parse(decodeURIComponent(url.slice(HEAD.length)));
  } catch {
    return null;
  }
}

// Chrome numbers its roots 1/2/3; other browsers name them, and not all of
// them are somewhere you would want to put anything. Vivaldi, checked
// directly: "1 Bookmarks", "2 Other bookmarks", "4 Deleted" — so the old
// last-resort of "take the last root" would have filed everything in the
// bin. Ask the tree, and never pick a bin.
const BIN = /^(deleted|trash|bin|recycle)/i;

async function otherBookmarksId() {
  const tree = await bm.getTree();
  const roots = ((tree[0] && tree[0].children) || []).filter((r) => !BIN.test(r.title || ""));
  const pick =
    roots.find((r) => r.id === "unfiled_____") ||
    roots.find((r) => r.id === "2") ||
    roots.find((r) => /other/i.test(r.title || "")) ||
    roots.find((r) => r.id === "1") ||
    roots.find((r) => /bookmark/i.test(r.title || "")) ||
    roots[0];
  return pick ? pick.id : "2";
}

let rootIdCache = null;

async function rootId() {
  if (rootIdCache) {
    const [still] = await bm.get(rootIdCache).catch(() => []);
    if (still) return rootIdCache;
    rootIdCache = null;
  }
  const parentId = await otherBookmarksId();
  const kids = await bm.getChildren(parentId);
  const found = kids.find((k) => !k.url && k.title === ROOT_TITLE);
  const node = found || (await bm.create({ parentId, title: ROOT_TITLE }));
  rootIdCache = node.id;
  return node.id;
}

async function childByTitle(title) {
  const kids = await bm.getChildren(await rootId());
  return kids.find((k) => k.title === title && k.url) || null;
}

async function putBlob(title, value) {
  const url = encode(value);
  const existing = await childByTitle(title);
  if (existing) {
    if (existing.url !== url) await bm.update(existing.id, { url });
  } else {
    await bm.create({ parentId: await rootId(), title, url });
  }
}

async function getBlob(title, fallback) {
  const node = await childByTitle(title);
  if (!node) return fallback;
  const value = decode(node.url);
  return value === null ? fallback : value;
}

/* ---- the three things we keep -------------------------------------- */

export async function readAll() {
  const kids = await bm.getChildren(await rootId());
  const webPanels = kids
    .filter((k) => k.url && !k.url.startsWith(HEAD))
    .map((k) => k.url);
  return {
    webPanels,
    notepadText: await getBlob(SCRATCH_TITLE, ""),
    snippets: await getBlob(SNIPPETS_TITLE, []),
  };
}

export async function writeScratchpad(text) {
  await putBlob(SCRATCH_TITLE, text);
}

export async function writeSnippets(snippets) {
  await putBlob(SNIPPETS_TITLE, snippets);
}

// Pinned sites are real bookmarks, and their order in the folder is the
// rail order. Rewriting the whole set keeps the two in step without
// having to track which bookmark belongs to which pin.
export async function writePanels(urls) {
  const id = await rootId();
  const kids = await bm.getChildren(id);
  const current = kids.filter((k) => k.url && !k.url.startsWith(HEAD));
  for (const k of current) {
    if (!urls.includes(k.url)) await bm.remove(k.id).catch(() => {});
  }
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    let host = url;
    try {
      host = new URL(url).hostname;
    } catch {
      /* keep the raw string as the title */
    }
    const existing = current.find((k) => k.url === url);
    if (existing) {
      await bm.move(existing.id, { parentId: id, index: i }).catch(() => {});
      if (existing.title !== host) await bm.update(existing.id, { title: host }).catch(() => {});
    } else {
      await bm.create({ parentId: id, title: host, url, index: i }).catch(() => {});
    }
  }
}

export async function available() {
  try {
    await rootId();
    return true;
  } catch {
    return false;
  }
}
