const TARGET_MID = "1661441201";
const UAPIS_API_KEY = "";
const CACHE_KEY = `uapis-cache:${TARGET_MID}`;
const CACHE_TTL_MS = 10 * 60 * 1000;
const ONLINE_CACHE_KEY = `uapis-live-cache:${TARGET_MID}`;
const ONLINE_CACHE_TTL_MS = 1 * 60 * 1000;
const PAGE_SIZE = 20;
const TICKER_TEXTS = ["怎么会这样", "你是给", "78.91vip.tv", "窑子开张了"];

const query = new URLSearchParams(location.search);
const currentTab = query.get("tab") || "latest";
const initialPage = Math.max(1, Number(query.get("page") || 1));
let currentPage = initialPage;

const categoryNav = document.getElementById("categoryNav");
const listTitle = document.getElementById("listTitle");
const listGrid = document.getElementById("listGrid");
const linkItemTemplate = document.getElementById("linkItemTemplate");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageInfo = document.getElementById("pageInfo");
const pager = document.getElementById("pager");
const topTickerText = document.getElementById("topTickerText");
const topSearchForm = document.getElementById("topSearchForm");
const topSearchInput = document.getElementById("topSearchInput");
const topSearchClear = document.getElementById("topSearchClear");

let baseSortedVideos = [];

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Ignore registration failures.
    });
  });
}

const navCategories = [
  { name: "主页", url: "home.html" },
  { name: "最新", url: "list.html?tab=latest" },
  { name: "热门", url: "list.html?tab=hot" },
  { name: "在线", url: "list.html?tab=online" }
];

const tabMeta = {
  latest: { title: "Latest Update" },
  hot: { title: "Hot" },
  online: { title: "在线" }
};

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function normalizeVideo(video) {
  return {
    aid: video.aid,
    bvid: video.bvid,
    title: video.title,
    created: video.publish_time || video.create_time || video.created || Math.floor(Date.now() / 1000),
    play: video.play_count ?? video.play ?? "--",
    cover: video.cover || video.pic || ""
  };
}

function parsePlayValue(play) {
  if (typeof play === "number" && Number.isFinite(play)) {
    return play;
  }
  const raw = String(play ?? "").trim();
  if (!raw || raw === "--") {
    return 0;
  }
  const normalized = raw.replace(/,/g, "");
  if (normalized.endsWith("万")) {
    const n = Number(normalized.slice(0, -1));
    return Number.isFinite(n) ? Math.round(n * 10000) : 0;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function loadCachedVideos() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const expireAt = Number(parsed?.expireAt || 0);
    const videos = parsed?.videos;
    if (!Array.isArray(videos) || Date.now() > expireAt) {
      return [];
    }
    return videos;
  } catch {
    return [];
  }
}

function saveCachedVideos(videos) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        expireAt: Date.now() + CACHE_TTL_MS,
        videos
      })
    );
  } catch {
    // Ignore cache failures.
  }
}

function buildVideoUrl(video) {
  if (video.bvid) {
    return `https://www.bilibili.com/video/${video.bvid}`;
  }
  if (video.aid) {
    return `https://www.bilibili.com/video/av${video.aid}`;
  }
  return "https://space.bilibili.com/1661441201/upload/video";
}

function formatDate(ts) {
  const date = new Date(ts * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function createLinkItem(item) {
  const node = linkItemTemplate.content.cloneNode(true);
  const link = node.querySelector(".list-item");
  const cover = node.querySelector(".item-cover");
  const title = node.querySelector(".item-title");
  const meta = node.querySelector(".item-meta");

  link.href = item.url;
  if (item.cover) {
    cover.src = item.cover;
    cover.classList.remove("is-hidden");
  } else {
    cover.removeAttribute("src");
    cover.classList.add("is-hidden");
  }

  title.textContent = item.title;
  meta.textContent = item.meta;

  return node;
}

function loadCachedOnlineStatus() {
  try {
    const raw = localStorage.getItem(ONLINE_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const expireAt = Number(parsed?.expireAt || 0);
    if (Date.now() > expireAt || !parsed?.data) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function saveCachedOnlineStatus(data) {
  try {
    localStorage.setItem(
      ONLINE_CACHE_KEY,
      JSON.stringify({
        expireAt: Date.now() + ONLINE_CACHE_TTL_MS,
        data
      })
    );
  } catch {
    // Ignore cache failures.
  }
}

function setPagerVisible(visible) {
  pager.style.display = visible ? "flex" : "none";
}

function initTicker() {
  if (!topTickerText) {
    return;
  }
  let idx = 0;
  topTickerText.textContent = TICKER_TEXTS[idx];
  setInterval(() => {
    idx = (idx + 1) % TICKER_TEXTS.length;
    topTickerText.textContent = TICKER_TEXTS[idx];
  }, 10000);
}

function filterByKeyword(list, keywordRaw) {
  const keyword = (keywordRaw || "").trim().toLowerCase();
  if (!keyword) {
    return list;
  }
  return list.filter((item) => item.title.toLowerCase().includes(keyword));
}

function initSearch() {
  if (!topSearchForm || !topSearchInput) {
    return;
  }
  topSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    currentPage = 1;
    renderPaged(filterByKeyword(baseSortedVideos, topSearchInput.value));
  });
  topSearchInput.addEventListener("input", () => {
    currentPage = 1;
    renderPaged(filterByKeyword(baseSortedVideos, topSearchInput.value));
  });
  if (topSearchClear) {
    topSearchClear.addEventListener("click", () => {
      topSearchInput.value = "";
      currentPage = 1;
      renderPaged(filterByKeyword(baseSortedVideos, ""));
      topSearchInput.focus();
    });
  }
}

async function fetchLiveRoomStatus(mid) {
  const url = `https://uapis.cn/api/v1/social/bilibili/liveroom?mid=${encodeURIComponent(mid)}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: UAPIS_API_KEY ? { Authorization: `Bearer ${UAPIS_API_KEY}` } : {}
  });

  // Based on observed behavior, offline may return 404 from this API.
  if (response.status === 404) {
    return { live_status: 0 };
  }

  if (!response.ok) {
    throw new Error(`Liveroom request failed: ${response.status}`);
  }

  return response.json();
}

function renderOnlineState(liveData) {
  clearNode(listGrid);

  const status = Number(liveData?.live_status ?? 0);
  const isLive = status === 1 || status === 2;
  const title = isLive
    ? (liveData?.title || "直播中")
    : "当前未开播";

  const statusTextMap = {
    0: "未开播",
    1: "直播中",
    2: "轮播中"
  };

  const meta = isLive
    ? `${statusTextMap[status] || "直播中"} · 人气 ${liveData?.online ?? "--"}`
    : "主播暂未开播";

  const roomId = liveData?.room_id || 0;
  const liveUrl = roomId
    ? `https://live.bilibili.com/${roomId}`
    : `https://space.bilibili.com/${TARGET_MID}`;

  const cover =
    liveData?.user_cover ||
    liveData?.keyframe ||
    liveData?.background ||
    "";

  const card = createLinkItem({
    title,
    meta,
    url: liveUrl,
    cover
  });

  listGrid.appendChild(card);
}

async function fetchUapisPage(mid, pn = 1, ps = 50) {
  const uapisUrl = `https://uapis.cn/api/v1/social/bilibili/archives?mid=${encodeURIComponent(mid)}&ps=${encodeURIComponent(ps)}&pn=${encodeURIComponent(pn)}&orderby=pubdate`;
  const response = await fetch(uapisUrl, {
    cache: "no-store",
    headers: UAPIS_API_KEY ? { Authorization: `Bearer ${UAPIS_API_KEY}` } : {}
  });
  if (!response.ok) {
    throw new Error(`UAPIS page request failed: ${response.status}`);
  }
  return response.json();
}

function dedupeVideos(videos) {
  const seen = new Set();
  const out = [];
  for (const v of videos) {
    const key = v.bvid || `aid:${v.aid || ""}` || v.title;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(v);
  }
  return out;
}

async function fetchAllVideos(mid, pageSize = 50) {
  const firstPage = await fetchUapisPage(mid, 1, pageSize);
  const firstVideos = Array.isArray(firstPage?.videos) ? firstPage.videos.map(normalizeVideo) : [];
  const total = Number(firstPage?.total || firstVideos.length || 0);
  const size = Number(firstPage?.size || pageSize || 50);
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, size)));

  let allVideos = [...firstVideos];

  for (let pn = 2; pn <= totalPages; pn += 1) {
    try {
      const pageData = await fetchUapisPage(mid, pn, size);
      if (Array.isArray(pageData?.videos) && pageData.videos.length) {
        allVideos = allVideos.concat(pageData.videos.map(normalizeVideo));
      }
    } catch {
      // Skip failed page and continue best-effort.
    }
  }

  return dedupeVideos(allVideos);
}

function buildSortedVideos(videos, tab) {
  const mapped = videos.map((video) => ({
    title: video.title,
    meta: `${formatDate(video.created)} · 播放 ${video.play ?? "--"}`,
    url: buildVideoUrl(video),
    playValue: parsePlayValue(video.play),
    cover: video.cover || "",
    ts: Number(video.created) || 0
  }));

  if (tab === "hot") {
    return mapped.sort((a, b) => b.playValue - a.playValue);
  }
  return mapped.sort((a, b) => b.ts - a.ts);
}

function renderNav() {
  navCategories.forEach((category) => {
    const link = document.createElement("a");
    link.className = "nav-link";
    if (
      (currentTab === "latest" && category.name === "最新") ||
      (currentTab === "hot" && category.name === "热门") ||
      (currentTab === "online" && category.name === "在线")
    ) {
      link.classList.add("is-active");
    }
    link.textContent = category.name;
    link.href = category.url;
    categoryNav.appendChild(link);
  });
}

function renderPaged(sortedVideos) {
  const totalPages = Math.max(1, Math.ceil(sortedVideos.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = sortedVideos.slice(start, end);

  clearNode(listGrid);
  pageItems.forEach((item) => {
    listGrid.appendChild(createLinkItem(item));
  });

  pageInfo.textContent = `${currentPage} / ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;

  const url = new URL(location.href);
  url.searchParams.set("tab", currentTab);
  url.searchParams.set("page", String(currentPage));
  history.replaceState(null, "", url.toString());

  return totalPages;
}

async function init() {
  initTicker();
  initSearch();

  renderNav();
  const title = tabMeta[currentTab]?.title || tabMeta.latest.title;
  listTitle.textContent = title;
  document.title = `${title} - 78.91vip.tv`;

  if (currentTab === "online") {
    setPagerVisible(false);
    const cachedLive = loadCachedOnlineStatus();
    if (cachedLive) {
      renderOnlineState(cachedLive);
      return;
    }
    try {
      const liveData = await fetchLiveRoomStatus(TARGET_MID);
      saveCachedOnlineStatus(liveData);
      renderOnlineState(liveData);
    } catch {
      const fallback = { live_status: 0 };
      saveCachedOnlineStatus(fallback);
      renderOnlineState(fallback);
    }
    return;
  }

  setPagerVisible(true);

  let videos = loadCachedVideos();
  if (!videos.length) {
    videos = await fetchAllVideos(TARGET_MID, 50);
    if (videos.length) {
      saveCachedVideos(videos);
    }
  }

  const sortedVideos = buildSortedVideos(videos, currentTab);
  baseSortedVideos = sortedVideos;
  renderPaged(filterByKeyword(baseSortedVideos, topSearchInput ? topSearchInput.value : ""));

  prevBtn.addEventListener("click", () => {
    if (currentPage <= 1) {
      return;
    }
    currentPage -= 1;
    renderPaged(filterByKeyword(baseSortedVideos, topSearchInput ? topSearchInput.value : ""));
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  nextBtn.addEventListener("click", () => {
    const filtered = filterByKeyword(baseSortedVideos, topSearchInput ? topSearchInput.value : "");
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage >= totalPages) {
      return;
    }
    currentPage += 1;
    renderPaged(filtered);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

registerServiceWorker();
init();
