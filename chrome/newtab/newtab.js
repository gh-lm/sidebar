// New tab page: DuckDuckGo search. (The update widget lives only in the
// sidebar footer now -- a replaceable page is the wrong home for it.)

// Second boot trigger alongside the sidebar (see background.js bootTasks
// comment): the worker isn't started at launch on existing profiles, so
// whichever of our pages appears first wakes it to run its boot work.
chrome.runtime.sendMessage({ type: "sidemorphic-boot" }).catch(() => {});

const searchForm = document.getElementById("searchForm");
const searchBox = document.getElementById("searchBox");

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = searchBox.value.trim();
  if (!q) return;
  // Bare domains / URLs navigate directly; anything else searches.
  const looksLikeUrl = /^(https?:\/\/|[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$))/i.test(q);
  const url = looksLikeUrl
    ? (q.startsWith("http") ? q : `https://${q}`)
    : `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  location.href = url;
});
