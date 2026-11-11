// Lightmorphic Sidebar storage.

const ROOT_TITLE = "Lightmorphic Sidebar";
const OLD_ROOT_TITLES = ["Sidemorphic"];
const OLD_HEAD = "https://sidemorphic.invalid/#sm1:";
const OLD_TITLES = {
  "Sidemorphic scratchpad": "Lightmorphic Sidebar scratchpad",
  "Sidemorphic snippets": "Lightmorphic Sidebar snippets",
};
const SCRATCH_TITLE = "Lightmorphic Sidebar scratchpad";
const SNIPPETS_TITLE = "Lightmorphic Sidebar snippets";

const HEAD = "https://lightmorphic.invalid/#sb1:";

const bm = chrome.bookmarks;

function encode(value) {
  return HEAD + encodeURIComponent(JSON.stringify(value));
}

function decode(url) {
  if (typeof url !== "string") return null;
  const head = url.startsWith(HEAD) ? HEAD : url.startsWith(OLD_HEAD) ? OLD_HEAD : null;
  if (!head) return null;
  try {
    return JSON.parse(decodeURIComponent(url.slice(head.length)));
  } catch {
    return null;
  }
}

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

async function rootId({ create = true } = {}) {
  if (rootIdCache) {
    const [still] = await bm.get(rootIdCache).catch(() => []);
    if (still) return rootIdCache;
    rootIdCache = null;
  }
  const parentId = await otherBookmarksId();
  const kids = await bm.getChildren(parentId);
  let found = kids.find((k) => !k.url && k.title === ROOT_TITLE);
  if (!found) {
    const old = kids.find((k) => !k.url && OLD_ROOT_TITLES.includes(k.title));
    if (old) {
      await bm.update(old.id, { title: ROOT_TITLE });
      found = old;
      await renameOldEntries(old.id);
    }
  }
  if (!found && !create) return null;
  const node = found || (await bm.create({ parentId, title: ROOT_TITLE }));
  rootIdCache = node.id;
  return node.id;
}

async function renameOldEntries(folderId) {
  const kids = await bm.getChildren(folderId);
  for (const kid of kids) {
    const wanted = OLD_TITLES[kid.title];
    if (!wanted) continue;
    const url =
      typeof kid.url === "string" && kid.url.startsWith(OLD_HEAD)
        ? HEAD + kid.url.slice(OLD_HEAD.length)
        : kid.url;
    await bm.update(kid.id, { title: wanted, url }).catch(() => {});
  }
}

async function childByTitle(title, { create = true } = {}) {
  const id = await rootId({ create });
  if (!id) return null;
  const kids = await bm.getChildren(id);
  return kids.find((k) => k.title === title && k.url) || null;
}

function isEmpty(value) {
  if (Array.isArray(value)) return value.length === 0;
  return value === "" || value === null || value === undefined;
}

async function putBlob(title, value) {
  const url = encode(value);
  const create = !isEmpty(value);
  const existing = await childByTitle(title, { create });
  if (existing) {
    if (existing.url !== url) await bm.update(existing.id, { url });
    return;
  }
  if (!create) return;
  await bm.create({ parentId: await rootId(), title, url });
}

async function getBlob(title, fallback) {
  const node = await childByTitle(title, { create: false });
  if (!node) return fallback;
  const value = decode(node.url);
  return value === null ? fallback : value;
}


export async function readAll() {
  const id = await rootId({ create: false });
  if (!id) return { webPanels: [], notepadText: "", snippets: [] };
  const kids = await bm.getChildren(id);
  const webPanels = kids
    .filter((k) => k.url && !k.url.startsWith(HEAD) && !k.url.startsWith(OLD_HEAD))
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

export async function writePanels(urls) {
  const id = await rootId({ create: urls.length > 0 });
  if (!id) return;
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
    await otherBookmarksId();
    return true;
  } catch {
    return false;
  }
}

export async function removeEverything() {
  const parentId = await otherBookmarksId();
  const kids = await bm.getChildren(parentId);
  const ours = kids.filter(
    (k) => !k.url && (k.title === ROOT_TITLE || OLD_ROOT_TITLES.includes(k.title))
  );
  for (const folder of ours) await bm.removeTree(folder.id);
  rootIdCache = null;
  return ours.length;
}
