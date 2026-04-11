const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const crypto = require("node:crypto");
const { chromium } = require("playwright");

const HOST = "127.0.0.1";
const PORT = 8080;
const ROOT = process.cwd();
const UAPIS_KEY = process.env.UAPIS_API_KEY || "";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0";

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32,
  15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19,
  29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63,
  57, 62, 11, 36, 20, 34, 44, 52
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function safeDecode(input) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function getMime(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function md5(value) {
  return crypto.createHash("md5").update(value).digest("hex");
}

function getMixinKey(imgKey, subKey) {
  const raw = `${imgKey}${subKey}`;
  let mixed = "";
  for (const idx of MIXIN_KEY_ENC_TAB) {
    mixed += raw[idx] || "";
  }
  return mixed.slice(0, 32);
}

function sanitizeParamValue(value) {
  return String(value).replace(/[!'()*]/g, "");
}

function buildQuery(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(sanitizeParamValue(params[key]))}`)
    .join("&");
}

async function fetchText(url, extraHeaders = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...extraHeaders
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }
  return response.text();
}

async function fetchJson(url, extraHeaders = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      ...extraHeaders
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }
  return response.json();
}

function extractFileKey(url) {
  const clean = url.split("?")[0];
  const file = clean.slice(clean.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}

async function fetchWbiSignedVideoList(mid, ps = 16) {
  const nav = await fetchJson("https://api.bilibili.com/x/web-interface/nav");
  const imgUrl = nav?.data?.wbi_img?.img_url || "";
  const subUrl = nav?.data?.wbi_img?.sub_url || "";
  const imgKey = extractFileKey(imgUrl);
  const subKey = extractFileKey(subUrl);

  if (!imgKey || !subKey) {
    throw new Error("Failed to load WBI keys");
  }

  const mixinKey = getMixinKey(imgKey, subKey);
  const wts = Math.floor(Date.now() / 1000);

  const params = {
    mid,
    pn: 1,
    ps,
    index: 1,
    order: "pubdate",
    platform: "web",
    web_location: "1550101",
    wts
  };

  const query = buildQuery(params);
  const wRid = md5(`${query}${mixinKey}`);
  const apiUrl = `https://api.bilibili.com/x/space/wbi/arc/search?${query}&w_rid=${wRid}`;

  const data = await fetchJson(apiUrl, {
    "Referer": `https://space.bilibili.com/${mid}/upload/video`,
    "Origin": "https://space.bilibili.com"
  });

  const list = data?.data?.list?.vlist;
  if (!Array.isArray(list)) {
    throw new Error(`Unexpected API response: code=${data?.code} message=${data?.message || "unknown"}`);
  }

  return list;
}

async function fetchUapisVideoList({ mid, ps = 16, pn = 1, orderby = "pubdate", keywords = "", apiKey = "" }) {
  const url = new URL("https://uapis.cn/api/v1/social/bilibili/archives");
  url.searchParams.set("mid", String(mid));
  url.searchParams.set("ps", String(ps));
  url.searchParams.set("pn", String(pn));
  url.searchParams.set("orderby", orderby || "pubdate");
  if (keywords) {
    url.searchParams.set("keywords", keywords);
  }

  const authKey = apiKey || UAPIS_KEY;
  const headers = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*"
  };
  if (authKey) {
    headers.Authorization = `Bearer ${authKey}`;
  }

  const response = await fetch(url.toString(), { headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.message || `HTTP ${response.status}`;
    throw new Error(`UAPIS request failed: ${message}`);
  }

  if (!Array.isArray(data?.videos)) {
    throw new Error("UAPIS response has no videos array");
  }

  return data.videos.map((v) => ({
    aid: v.aid,
    bvid: v.bvid,
    title: v.title,
    created: v.publish_time || v.create_time || Math.floor(Date.now() / 1000),
    play: v.play_count ?? "--",
    pic: v.cover || ""
  }));
}

function extractBvidFromUrl(url) {
  const match = String(url).match(/BV[0-9A-Za-z]{10}/);
  return match ? match[0] : "";
}

async function fetchHeadlessVideoList(mid, ps = 16) {
  const targetUrl = `https://space.bilibili.com/${mid}/upload/video`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    locale: "zh-CN",
    viewport: { width: 1366, height: 900 }
  });

  let captured = null;
  try {
    const page = await context.newPage();
    page.on("response", async (response) => {
      try {
        const url = response.url();
        if (!url.includes("/x/space/wbi/arc/search") && !url.includes("/x/space/arc/search")) {
          return;
        }
        const ct = response.headers()["content-type"] || "";
        if (!ct.includes("application/json")) {
          return;
        }
        const json = await response.json();
        const list = json?.data?.list?.vlist;
        if (Array.isArray(list) && list.length) {
          captured = list;
        }
      } catch {
        // Ignore parsing errors in network listener.
      }
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1200);

    if (Array.isArray(captured) && captured.length) {
      return captured.slice(0, ps);
    }

    const domVideos = await page.$$eval('a[href*="/video/BV"]', (anchors) => {
      const seen = new Set();
      const out = [];
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        const text = (a.textContent || "").replace(/\s+/g, " ").trim();
        if (!href || !text) {
          continue;
        }
        const key = `${href}|${text}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        out.push({ href, title: text });
      }
      return out;
    });

    if (!domVideos.length) {
      return [];
    }

    return domVideos.slice(0, ps).map((item) => {
      const normalizedHref = item.href.startsWith("http") ? item.href : `https:${item.href}`;
      const bvidMatch = normalizedHref.match(/BV[0-9A-Za-z]{10}/);
      return {
        bvid: bvidMatch ? bvidMatch[0] : "",
        title: item.title,
        created: Math.floor(Date.now() / 1000),
        play: "--"
      };
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

function extractSpaceMeta(html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const desc = (html.match(/<meta\s+name="description"\s+content="([\s\S]*?)"/i) || [])[1] || "";
  return {
    htmlLength: html.length,
    title,
    description: desc,
    hasInitialState: /__INITIAL_STATE__/.test(html),
    hasAppShell: /id="app"/.test(html)
  };
}

async function handleApi(req, res, parsedUrl) {
  if (parsedUrl.pathname === "/api/bili/space") {
    const mid = parsedUrl.searchParams.get("mid") || "1661441201";
    const url = `https://space.bilibili.com/${mid}/upload/video`;

    try {
      const html = await fetchText(url);
      const meta = extractSpaceMeta(html);
      sendJson(res, 200, {
        ok: true,
        mid,
        userAgent: UA,
        url,
        meta,
        html
      });
      return;
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message, mid, userAgent: UA, url });
      return;
    }
  }

  if (parsedUrl.pathname === "/api/bili/videos") {
    const mid = parsedUrl.searchParams.get("mid") || "1661441201";
    const ps = Number(parsedUrl.searchParams.get("ps") || 16);
    const mode = parsedUrl.searchParams.get("mode") || "auto";
    const pn = Number(parsedUrl.searchParams.get("pn") || 1);
    const orderby = parsedUrl.searchParams.get("orderby") || "pubdate";
    const keywords = parsedUrl.searchParams.get("keywords") || "";
    const apiKeyFromQuery = parsedUrl.searchParams.get("apiKey") || "";

    let uapisError = null;
    let apiError = null;
    let headlessError = null;

    if (mode === "uapis" || mode === "auto") {
      try {
        const list = await fetchUapisVideoList({
          mid,
          ps,
          pn,
          orderby,
          keywords,
          apiKey: apiKeyFromQuery
        });
        sendJson(res, 200, {
          ok: true,
          mode,
          source: "uapis",
          mid,
          page: pn,
          count: list.length,
          userAgent: UA,
          hasApiKey: Boolean(apiKeyFromQuery || UAPIS_KEY),
          videos: list
        });
        return;
      } catch (error) {
        uapisError = error.message;
        if (mode === "uapis") {
          sendJson(res, 502, {
            ok: false,
            mid,
            mode,
            source: "uapis",
            userAgent: UA,
            hasApiKey: Boolean(apiKeyFromQuery || UAPIS_KEY),
            error: uapisError
          });
          return;
        }
      }
    }

    try {
      if (mode !== "headless") {
        const list = await fetchWbiSignedVideoList(mid, ps);
        sendJson(res, 200, {
          ok: true,
          mode,
          source: "wbi-api",
          mid,
          count: list.length,
          userAgent: UA,
          videos: list
        });
        return;
      }
    } catch (error) {
      apiError = error.message;
    }

    try {
      const list = await fetchHeadlessVideoList(mid, ps);
      sendJson(res, 200, {
        ok: true,
        mode,
        source: "headless",
        mid,
        count: list.length,
        userAgent: UA,
        videos: list
      });
      return;
    } catch (error) {
      headlessError = error.message;
      sendJson(res, 502, {
        ok: false,
        mid,
        mode,
        userAgent: UA,
        error: "All video fetch strategies failed",
        details: {
          uapisError,
          apiError,
          headlessError
        }
      });
      return;
    }
  }

  sendJson(res, 404, { ok: false, error: "Not Found" });
}

function serveStatic(req, res, parsedUrl) {
  const reqPath = safeDecode(parsedUrl.pathname || "/");
  const normalized = path.normalize(reqPath).replace(/^([\\/])+/, "");
  const filePath = path.join(ROOT, normalized || "index.html");
  const targetPath = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
    ? path.join(filePath, "index.html")
    : filePath;

  if (!targetPath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(targetPath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": getMime(targetPath) });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (parsedUrl.pathname.startsWith("/api/")) {
    await handleApi(req, res, parsedUrl);
    return;
  }

  serveStatic(req, res, parsedUrl);
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Static root: ${ROOT}`);
  console.log(`UA in use: ${UA}`);
});
