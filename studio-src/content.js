// Reading and writing article files (YAML front matter + body).
// Older articles are Markdown; Viko Studio saves the body as clean HTML,
// one top-level block per line, which the site renders as-is.
import * as yaml from "js-yaml";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

export const POSTS_DIR = "src/insights/posts";
export const UPLOADS_DIR = "src/media/uploads";

// Fields written in this order; anything else already in a file is kept after them.
const FIELD_ORDER = ["title", "short_title", "summary", "lead", "description", "date", "updated", "category", "author", "stats", "icon",
  "thumbnail", "thumbnail_alt", "featured", "order", "attachment", "attachment_name", "draft"];

export function parseArticle(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  let data = {};
  let body = text;
  if (m) {
    data = yaml.load(m[1]) || {};
    body = m[2];
  }
  for (const k of ["date", "updated"]) {
    if (data[k] instanceof Date) data[k] = data[k].toISOString().slice(0, 10);
    else if (data[k]) data[k] = String(data[k]).slice(0, 10);
  }
  return { data, html: bodyToHtml(body) };
}

// Markdown (or HTML) body -> HTML the editor understands.
export function bodyToHtml(body) {
  const trimmed = String(body || "").trim();
  if (!trimmed) return "";
  const html = md.render(trimmed);
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  // A paragraph holding only an image (optionally followed by an italic line) is a figure with a caption.
  for (const p of [...root.querySelectorAll("p")]) {
    const kids = [...p.childNodes].filter((n) => !(n.nodeType === 3 && !n.textContent.trim()));
    if (kids.length !== 1 || kids[0].nodeName !== "IMG") continue;
    const img = kids[0];
    const fig = doc.createElement("figure");
    fig.append(img);
    const next = p.nextElementSibling;
    if (next && next.tagName === "P" && next.children.length === 1 && next.firstElementChild.tagName === "EM" &&
        next.textContent.trim() === next.firstElementChild.textContent.trim()) {
      const cap = doc.createElement("figcaption");
      cap.textContent = next.textContent.trim();
      fig.append(cap);
      next.remove();
    }
    p.replaceWith(fig);
  }
  return root.innerHTML;
}

export function serializeArticle(data, html) {
  const clean = {};
  for (const k of FIELD_ORDER) if (data[k] !== undefined && data[k] !== "" && data[k] !== null) clean[k] = data[k];
  for (const [k, v] of Object.entries(data)) if (!(k in clean) && !FIELD_ORDER.includes(k) && v !== undefined && v !== "") clean[k] = v;
  clean.draft = !!data.draft;
  const front = yaml.dump(clean, { lineWidth: 1000, quotingType: '"', forceQuotes: false });
  return `---\n${front}---\n${formatBody(html)}\n`;
}

// One top-level block per line, no blank lines: the site treats the whole body as HTML.
export function formatBody(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  for (const cg of [...root.querySelectorAll("colgroup")]) cg.remove();
  for (const t of root.querySelectorAll("table[style]")) t.removeAttribute("style");
  // Video players: keep only what the site needs.
  for (const f of root.querySelectorAll("iframe")) {
    for (const a of [...f.attributes]) if (!["src", "allowfullscreen", "title"].includes(a.name)) f.removeAttribute(a.name);
    f.setAttribute("allowfullscreen", "");
    if (!f.getAttribute("title")) f.setAttribute("title", "Video");
  }
  const lines = [];
  for (const node of root.childNodes) {
    if (node.nodeType === 3) {
      if (node.textContent.trim()) lines.push(`<p>${escapeText(node.textContent.trim())}</p>`);
      continue;
    }
    if (node.nodeType !== 1) continue;
    if (node.tagName === "P" && !node.textContent.trim() && !node.querySelector("img,iframe,br")) continue; // empty paragraphs
    lines.push(node.outerHTML.replace(/\n+/g, " "));
  }
  return lines.join("\n");
}

const escapeText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function wordCount(html) {
  const text = new DOMParser().parseFromString(html, "text/html").body.textContent || "";
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
