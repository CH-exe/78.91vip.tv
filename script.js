const TARGET_MID = "1661441201";
const UAPIS_API_KEY = "";
const CACHE_KEY = `uapis-cache:${TARGET_MID}`;
const CACHE_TTL_MS = 20 * 60 * 1000;
const TICKER_TEXTS = ["怎么会这样", "你是给", "78.91vip.tv", "窑子开张了"];
const LOCAL_GUESS_COVERS = Array.from({ length: 10 }, (_, idx) => `${idx + 1}.png`);
const API_ORIGIN = "https://api.78.91vip.tv";

const navCategories = [
  { name: "主页", url: "home.html" },
  { name: "最新", url: "list.html?tab=latest" },
  { name: "热门", url: "list.html?tab=hot" },
  { name: "在线", url: "list.html?tab=online" }
];

const categoryNav = document.getElementById("categoryNav");
const guessList = document.getElementById("guessList");
const hotList = document.getElementById("hotList");
const latestList = document.getElementById("latestList");
const linkItemTemplate = document.getElementById("linkItemTemplate");
const topTickerText = document.getElementById("topTickerText");
const topSearchForm = document.getElementById("topSearchForm");
const topSearchInput = document.getElementById("topSearchInput");
const topSearchClear = document.getElementById("topSearchClear");
const searchPanel = document.getElementById("searchPanel");
const searchTitle = document.getElementById("searchTitle");
const searchList = document.getElementById("searchList");

let allMappedVideos = [];

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

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function buildApiCandidates(pathWithQuery) {
  return [`${API_ORIGIN}${pathWithQuery}`, pathWithQuery];
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

function renderMainLists(guessItems, hotItems, latestItems) {
  clearNode(guessList);
  clearNode(hotList);
  clearNode(latestList);

  guessItems.forEach((item) => {
    guessList.appendChild(createLinkItem(item));
  });

  hotItems.forEach((item) => {
    hotList.appendChild(createLinkItem(item));
  });

  latestItems.forEach((item) => {
    latestList.appendChild(createLinkItem(item));
  });
}

function toggleSearchMode(enabled) {
  const normalPanels = [
    document.getElementById("guessTitle")?.closest(".panel"),
    document.getElementById("hotTitle")?.closest(".panel"),
    document.getElementById("latestTitle")?.closest(".panel")
  ].filter(Boolean);

  if (enabled) {
    searchPanel.classList.remove("is-hidden");
    normalPanels.forEach((panel) => panel.classList.add("is-hidden"));
  } else {
    searchPanel.classList.add("is-hidden");
    normalPanels.forEach((panel) => panel.classList.remove("is-hidden"));
  }
}

function renderSearchResults(keywordRaw) {
  const keyword = (keywordRaw || "").trim();
  const lower = keyword.toLowerCase();
  const result = allMappedVideos.filter((item) => item.title.toLowerCase().includes(lower));

  searchTitle.textContent = keyword;
  clearNode(searchList);
  result.forEach((item) => {
    searchList.appendChild(createLinkItem(item));
  });
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

function renderFromKeyword(keywordRaw) {
  const keyword = (keywordRaw || "").trim().toLowerCase();
  const source = keyword
    ? allMappedVideos.filter((item) => item.title.toLowerCase().includes(keyword))
    : allMappedVideos;

  const hotMapped = [...source].sort((a, b) => b.playValue - a.playValue).slice(0, 8);
  const latestMapped = [...source].sort((a, b) => b.ts - a.ts).slice(0, 8);
  const appearedSet = new Set([...hotMapped, ...latestMapped].map((item) => item.url));
  const guessMapped = applyGuessCoverOverrides(pickWeightedRandom(source, 12, appearedSet));

  renderMainLists(guessMapped, hotMapped, latestMapped);
}

function applyGuessCoverOverrides(items) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }

  const output = items.map((item) => ({ ...item }));
  const minReplace = Math.min(4, output.length);
  const maxReplace = Math.min(8, output.length, LOCAL_GUESS_COVERS.length);
  const replaceCount = maxReplace > minReplace
    ? Math.floor(Math.random() * (maxReplace - minReplace + 1)) + minReplace
    : maxReplace;

  if (replaceCount <= 0) {
    return output;
  }

  const indices = output.map((_, idx) => idx);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const covers = [...LOCAL_GUESS_COVERS];
  for (let i = covers.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [covers[i], covers[j]] = [covers[j], covers[i]];
  }

  for (let i = 0; i < replaceCount; i += 1) {
    const itemIndex = indices[i];
    output[itemIndex].cover = covers[i];
  }

  return output;
}

function initSearch() {
  if (!topSearchForm || !topSearchInput) {
    return;
  }
  topSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyword = topSearchInput.value.trim();
    if (!keyword) {
      toggleSearchMode(false);
      renderFromKeyword("");
      return;
    }
    toggleSearchMode(true);
    renderSearchResults(keyword);
  });
  topSearchInput.addEventListener("input", () => {
    const keyword = topSearchInput.value.trim();
    if (!keyword) {
      toggleSearchMode(false);
      renderFromKeyword("");
      return;
    }
    toggleSearchMode(true);
    renderSearchResults(keyword);
  });
  if (topSearchClear) {
    topSearchClear.addEventListener("click", () => {
      topSearchInput.value = "";
      toggleSearchMode(false);
      renderFromKeyword("");
      topSearchInput.focus();
    });
  }
}

function pickWeightedRandom(items, count, appearedKeySet) {
  const pool = items.map((item) => ({
    item,
    key: item.url,
    weight: appearedKeySet.has(item.url) ? 0.5 : 1
  }));

  const picked = [];
  const maxCount = Math.min(count, pool.length);

  for (let i = 0; i < maxCount; i += 1) {
    const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) {
      break;
    }

    let threshold = Math.random() * totalWeight;
    let pickIndex = 0;

    for (let idx = 0; idx < pool.length; idx += 1) {
      threshold -= pool[idx].weight;
      if (threshold <= 0) {
        pickIndex = idx;
        break;
      }
    }

    const [pickedEntry] = pool.splice(pickIndex, 1);
    if (pickedEntry) {
      picked.push(pickedEntry.item);
    }
  }

  return picked;
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

function loadCachedVideos(options = {}) {
  const allowExpired = Boolean(options.allowExpired);
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const expireAt = Number(parsed?.expireAt || 0);
    const videos = parsed?.videos;
    if (!Array.isArray(videos)) {
      return [];
    }
    if (!allowExpired && Date.now() > expireAt) {
      return [];
    }
    return videos;
  } catch {
    return [];
  }
}

function saveCachedVideos(videos) {
  try {
    const payload = {
      expireAt: Date.now() + CACHE_TTL_MS,
      videos
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures.
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

async function fetchUapisPage(mid, pn = 1, ps = 50) {
  const sameOriginUrl = `/api/bili/videos?mid=${encodeURIComponent(mid)}&ps=${encodeURIComponent(ps)}&pn=${encodeURIComponent(pn)}&orderby=pubdate&mode=uapis`;
  const directUrl = `https://uapis.cn/api/v1/social/bilibili/archives?mid=${encodeURIComponent(mid)}&ps=${encodeURIComponent(ps)}&pn=${encodeURIComponent(pn)}&orderby=pubdate`;

  const plans = [
    ...buildApiCandidates(sameOriginUrl).map((url) => ({ url, headers: {} })),
    { url: directUrl, headers: UAPIS_API_KEY ? { Authorization: `Bearer ${UAPIS_API_KEY}` } : {} }
  ];

  for (const plan of plans) {
    try {
      const response = await fetch(plan.url, {
        cache: "no-store",
        headers: plan.headers
      });
      if (!response.ok) {
        continue;
      }
      return response.json();
    } catch {
      // Try next endpoint.
    }
  }

  throw new Error("All archives endpoints failed");
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

async function fetchUploadedVideos(mid, pageSize = 50) {
  try {
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

    allVideos = dedupeVideos(allVideos);
    if (allVideos.length) {
      return allVideos;
    }
  } catch {
    // Fall through to backup sources below.
  }

  const directUrl = `https://api.bilibili.com/x/space/arc/search?mid=${mid}&pn=1&ps=${pageSize}&index=1&order=pubdate`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;

  const requestPlan = [
    {
      url: directUrl,
      headers: {}
    },
    {
      url: proxyUrl,
      headers: {}
    }
  ];

  for (const plan of requestPlan) {
    try {
      const response = await fetch(plan.url, {
        cache: "no-store",
        headers: plan.headers
      });
      if (!response.ok) {
        continue;
      }
      const json = await response.json();

      if (Array.isArray(json?.videos) && json.videos.length > 0) {
        return json.videos.map(normalizeVideo);
      }

      const list = json?.data?.list?.vlist;
      if (Array.isArray(list) && list.length > 0) {
        return list.map(normalizeVideo);
      }
    } catch (error) {
      // Try next endpoint.
    }
  }

  return [];
}

navCategories.forEach((category) => {
  const link = document.createElement("a");
  link.className = "nav-link";
  link.textContent = category.name;
  link.href = category.url;
  categoryNav.appendChild(link);
});

async function init() {
  initTicker();
  initSearch();

  renderMainLists([], [], []);

  let videos = loadCachedVideos();
  if (!videos.length) {
    videos = await fetchUploadedVideos(TARGET_MID, 50);
    if (videos.length) {
      saveCachedVideos(videos);
    }
  }

  if (!videos.length) {
    videos = loadCachedVideos({ allowExpired: true });
  }

  if (!videos.length) {
    return;
  }

  allMappedVideos = videos.map((video) => ({
    title: video.title,
    meta: `${formatDate(video.created)} · 播放 ${video.play ?? "--"}`,
    url: buildVideoUrl(video),
    playValue: parsePlayValue(video.play),
    cover: video.cover || "",
    ts: Number(video.created) || 0
  }));

  renderFromKeyword("");
}

registerServiceWorker();
init();
