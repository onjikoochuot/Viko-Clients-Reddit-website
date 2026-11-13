// Fetches the title, description and image for every link card used in an
// article, once per build. Any link that can't be fetched still gets a tidy
// card built from its address, so a slow or blocked site never breaks a build.
import fs from "node:fs";
import path from "node:path";

const POSTS_DIR = "src/insights/posts";
const CACHE_FILE = ".cache/link-previews.json";
const TIMEOUT_MS = 7000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function collectUrls() {
  const urls = new Set();
  if (!fs.existsSync(POSTS_DIR)) return urls;
  for (const file of fs.readdirSync(POSTS_DIR)) {
    if (!file.endsWith(".md")) continue;
    const text = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
    for (const m of text.matchAll(/class="link-card"[^>]*data-url="([^"]+)"|data-url="([^"]+)"[^>]*class="link-card"/g)) {
      urls.add(decode(m[1] || m[2]));
    }
  }
  return urls;
}

function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function meta(html, names) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
    const tag = html.match(re);
    if (tag) {
      const c = tag[0].match(/content=["']([^"']*)["']/i);
      if (c && c[1].trim()) return decode(c[1].trim());
    }
  }
  return "";
}

async function fetchPreview(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VikoLinkPreview/1.0; +https://vikoredditexperts.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok || !/html/i.test(res.headers.get("content-type") || "")) return null;
    const html = (await res.text()).slice(0, 400000);
    const title = meta(html, ["og:title", "twitter:title"]) || decode((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "").trim();
    let image = meta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]);
    if (image) {
      try { image = new URL(image, res.url).href; } catch { image = ""; }
    }
    if (!title) return null;
    return {
      title: title.slice(0, 200),
      description: meta(html, ["og:description", "twitter:description", "description"]).slice(0, 300),
      image,
      site: meta(html, ["og:site_name"]),
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function () {
  const urls = [...collectUrls()];
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch {}
  if (process.env.SKIP_LINK_PREVIEWS) return cache;

  const todo = urls.filter((u) => !cache[u] || Date.now() - (cache[u].fetchedAt || 0) > MAX_AGE_MS);
  const queue = [...todo];
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      const data = await fetchPreview(url);
      if (data) cache[url] = data;
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {}
  return cache;
}
