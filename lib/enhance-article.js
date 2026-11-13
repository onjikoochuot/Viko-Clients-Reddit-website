// Turns an article body into the finished page content:
// heading anchors + table of contents, link cards, Reddit/YouTube embeds,
// file download cards, responsive tables and lazy images.
import { parse } from "node-html-parser";

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function slugify(text) {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "section";
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// A readable card even when the page couldn't be fetched.
function fallbackFor(url) {
  const host = hostOf(url);
  let title = host || url;
  let description = "";
  try {
    const u = new URL(url);
    const reddit = u.pathname.match(/^\/r\/([^/]+)(?:\/comments\/[^/]+\/([^/]+))?/);
    if (host.endsWith("reddit.com") && reddit) {
      title = reddit[2] ? reddit[2].replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : `r/${reddit[1]}`;
      description = `Discussion in r/${reddit[1]}`;
    } else {
      const last = u.pathname.split("/").filter(Boolean).pop();
      if (last) title = decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    }
  } catch {}
  return { title, description, image: "", site: host };
}

function linkCardHtml(url, data) {
  const d = data && data.title ? data : fallbackFor(url);
  const host = hostOf(url);
  const img = d.image
    ? `<span class="link-card-media"><img src="${esc(d.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`
    : "";
  return `<a class="link-card${d.image ? "" : " link-card--plain"}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">` +
    `<span class="link-card-body"><span class="link-card-site"><img src="https://www.google.com/s2/favicons?domain=${esc(host)}&amp;sz=32" alt="" width="16" height="16" loading="lazy">${esc(d.site || host)}</span>` +
    `<span class="link-card-title">${esc(d.title)}</span>` +
    (d.description ? `<span class="link-card-desc">${esc(d.description)}</span>` : "") +
    `</span>${img}</a>`;
}

function redditEmbedHtml(url) {
  return `<blockquote class="reddit-embed-bq" data-embed-height="520"><a href="${esc(url)}">View this discussion on Reddit</a></blockquote>`;
}

function formatBytes(n) {
  const b = Number(n) || 0;
  if (!b) return "";
  if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + " KB";
  return (b / 1024 / 1024).toFixed(1) + " MB";
}

function fileCardHtml(href, name, size) {
  const ext = (href.split(".").pop() || "").toUpperCase().slice(0, 4);
  return `<div class="file-card"><span class="file-card-icon" aria-hidden="true">${esc(ext || "FILE")}</span>` +
    `<span class="file-card-body"><span class="file-card-name">${esc(name || "Download")}</span>` +
    `<span class="file-card-meta">${esc([ext, formatBytes(size)].filter(Boolean).join(" · "))}</span></span>` +
    `<span class="file-card-actions"><a class="btn btn-outline" href="${esc(href)}" target="_blank" rel="noopener">View</a>` +
    `<a class="btn btn-primary" href="${esc(href)}" download><i class="fas fa-download" aria-hidden="true"></i> Download</a></span></div>`;
}

export function enhanceArticle(html, previews = {}) {
  const root = parse(String(html || ""), { comment: false, blockTextElements: { script: true, style: true, pre: true } });
  const toc = [];
  const used = new Set();
  let hasReddit = false;

  // Headings: stable ids for the table of contents and shareable links.
  for (const h of root.querySelectorAll("h2, h3")) {
    const text = h.text.trim();
    if (!text) continue;
    let id = h.getAttribute("id") || slugify(text);
    let n = 2;
    const base = id;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    h.setAttribute("id", id);
    toc.push({ id, text, level: h.tagName === "H2" ? 2 : 3 });
  }

  // Link cards and embeds saved by Viko Studio.
  for (const el of root.querySelectorAll("[data-url]")) {
    const url = el.getAttribute("data-url");
    const cls = el.getAttribute("class") || "";
    if (!url) continue;
    if (cls.includes("embed--reddit")) {
      el.replaceWith(redditEmbedHtml(url));
      hasReddit = true;
    } else if (cls.includes("link-card")) {
      const typed = { title: el.getAttribute("data-title") || "", description: el.getAttribute("data-description") || "", image: el.getAttribute("data-image") || "" };
      const fetched = previews[url] || {};
      const merged = { ...fetched, ...Object.fromEntries(Object.entries(typed).filter(([, v]) => v)) };
      el.replaceWith(linkCardHtml(url, merged.title ? merged : null));
    }
  }

  for (const el of root.querySelectorAll("div.file-card[data-href]")) {
    el.replaceWith(fileCardHtml(el.getAttribute("data-href"), el.getAttribute("data-name"), el.getAttribute("data-size")));
  }

  // Images: lazy loading; plain images become zoomable figures.
  for (const img of root.querySelectorAll("img")) {
    if (img.closest && img.closest(".link-card")) continue;
    if (!img.getAttribute("loading")) img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    if (img.getAttribute("alt") == null) img.setAttribute("alt", "");
  }

  // YouTube and other iframes: lazy, titled.
  for (const f of root.querySelectorAll("iframe")) {
    f.setAttribute("loading", "lazy");
    if (!f.getAttribute("title")) f.setAttribute("title", "Embedded video");
    f.removeAttribute("width");
    f.removeAttribute("height");
  }

  // Wide tables scroll sideways on phones instead of breaking the layout.
  for (const t of root.querySelectorAll("table")) {
    if (t.parentNode && t.parentNode.getAttribute && (t.parentNode.getAttribute("class") || "").includes("table-wrap")) continue;
    t.replaceWith(`<div class="table-wrap">${t.toString()}</div>`);
  }

  // Links to other sites open in a new tab.
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (/^https?:\/\//i.test(href) && !href.includes("vikoredditexperts.com")) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
  }

  let out = root.toString();
  if (hasReddit) out += `<script async src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>`;
  const text = root.text.replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  return { html: out, toc, words };
}
