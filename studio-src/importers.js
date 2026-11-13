// Turning Word and PDF files into article content.
// The heavy libraries load only when a file is imported.
import { prepareImage, canvasToBlob, trackBlob } from "./media.js";

// ======================= Word (.docx) =======================

const WORD_STYLE_MAP = [
  "p[style-name='Title'] => h1.doc-title:fresh",
  "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
  "p[style-name='Heading 1'] => h2:fresh",
  "p[style-name='Heading 2'] => h3:fresh",
  "p[style-name='Heading 3'] => h4:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Caption'] => p.doc-caption:fresh",
  "r[style-name='Strong'] => strong",
  "highlight => mark",
];

export async function importWord(file, onProgress = () => {}) {
  onProgress("Reading the Word document…");
  const mammothMod = await import("mammoth/mammoth.browser.js");
  const mammoth = mammothMod.default || mammothMod;
  const images = [];
  let n = 0;
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      styleMap: WORD_STYLE_MAP,
      convertImage: mammoth.images.imgElement(async (image) => {
        n++;
        onProgress(`Preparing image ${n}…`);
        const bytes = await image.read();
        const blob = new Blob([bytes], { type: image.contentType });
        let src;
        try {
          src = await prepareImage(blob, `${baseName(file.name)}-image`);
        } catch {
          src = trackBlob(blob, `${baseName(file.name)}-image`);
        }
        images.push(src);
        return { src, alt: image.altText || "" };
      }),
    },
  );

  const doc = new DOMParser().parseFromString(`<div>${result.value}</div>`, "text/html");
  const root = doc.body.firstElementChild;

  // Title: the Word "Title" style, else the first top-level heading, else the file name.
  let title = "";
  const titleEl = root.querySelector("h1.doc-title") || root.querySelector("h1");
  if (titleEl) { title = titleEl.textContent.trim(); titleEl.remove(); }
  for (const h1 of [...root.querySelectorAll("h1")]) replaceTag(doc, h1, "h2");
  let description = "";
  const sub = root.querySelector("p.doc-subtitle");
  if (sub) { description = sub.textContent.trim(); sub.remove(); }
  if (!title) {
    const first = root.firstElementChild;
    if (first && /^H[2-4]$/.test(first.tagName)) { title = first.textContent.trim(); first.remove(); }
    else title = humanName(file.name);
  }

  tidy(doc, root);
  if (!description) description = firstSentences(root);
  return { title, description, html: root.innerHTML, images, notes: result.messages.filter((m) => m.type === "warning").length };
}

// ======================= PDF =======================

let pdfjsPromise;
async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = "/admin/studio/pdf.worker.min.mjs";
      return lib;
    });
  }
  return pdfjsPromise;
}

export async function openPdf(file) {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
  return { doc, lib, numPages: doc.numPages };
}

export async function renderPage(doc, pageNumber, targetWidth = 1600) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: targetWidth / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  return canvas;
}

// Pictures embedded in the PDF (photos, screenshots, charts saved as images).
export async function extractPdfImages(pdf, onProgress = () => {}, name = "pdf-image") {
  const { doc, lib } = pdf;
  const out = [];
  const seen = new Set();
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress(`Looking for pictures on page ${p} of ${doc.numPages}…`);
    try {
      const page = await doc.getPage(p);
      const ops = await page.getOperatorList();
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        if (fn !== lib.OPS.paintImageXObject && fn !== lib.OPS.paintInlineImageXObject) continue;
        const arg = ops.argsArray[i][0];
        const key = typeof arg === "string" ? arg : null;
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        const img = typeof arg === "string" ? await getObj(page, key) : arg;
        const canvas = imageToCanvas(img);
        if (!canvas || canvas.width < 160 || canvas.height < 120) continue;
        const blob = await canvasToBlob(canvas);
        out.push({ src: trackBlob(blob, name, blob.type.includes("webp") ? "webp" : "jpg"), page: p, width: canvas.width, height: canvas.height });
        if (out.length >= 60) return out;
      }
    } catch { /* skip pages pdf.js can't read */ }
  }
  return out;
}

function getObj(page, key) {
  return new Promise((resolve) => {
    const objs = key.startsWith("g_") ? page.commonObjs : page.objs;
    try {
      if (objs.has(key)) { resolve(objs.get(key)); return; }
      objs.get(key, resolve);
    } catch { resolve(null); }
    setTimeout(() => resolve(null), 4000);
  });
}

function imageToCanvas(img) {
  if (!img) return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (img.bitmap) {
    canvas.width = img.bitmap.width;
    canvas.height = img.bitmap.height;
    ctx.drawImage(img.bitmap, 0, 0);
    return canvas;
  }
  if (!img.data || !img.width) return null;
  canvas.width = img.width;
  canvas.height = img.height;
  const pixels = img.width * img.height;
  const rgba = new Uint8ClampedArray(pixels * 4);
  const src = img.data;
  if (src.length === pixels * 4) rgba.set(src);
  else if (src.length === pixels * 3) {
    for (let i = 0, j = 0; i < pixels; i++) { rgba[j++] = src[i * 3]; rgba[j++] = src[i * 3 + 1]; rgba[j++] = src[i * 3 + 2]; rgba[j++] = 255; }
  } else if (src.length === pixels) {
    for (let i = 0, j = 0; i < pixels; i++) { rgba[j++] = src[i]; rgba[j++] = src[i]; rgba[j++] = src[i]; rgba[j++] = 255; }
  } else return null;
  ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  return canvas;
}

// Rebuilds paragraphs, headings and lists from the PDF's text.
export async function extractPdfText(pdf, onProgress = () => {}) {
  const { doc } = pdf;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress(`Reading text on page ${p} of ${doc.numPages}…`);
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // Group text pieces into lines. Pieces whose baselines are close belong to the same line
    // (bullets and superscripts often sit slightly higher or lower).
    const pieces = [];
    for (const it of tc.items) {
      if (!("str" in it) || !it.str) continue;
      const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      pieces.push({ x: it.transform[4], y: it.transform[5], str: it.str, size, w: it.width, bold: /bold|black|heavy/i.test(it.fontName || "") });
    }
    pieces.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const pc of pieces) {
      const row = rows.find((r) => Math.abs(r.y - pc.y) < Math.max(r.size, pc.size) * 0.45);
      if (row) { row.items.push(pc); row.size = Math.max(row.size, pc.size); }
      else rows.push({ y: pc.y, size: pc.size, items: [pc] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      const items = row.items.sort((a, b) => a.x - b.x);
      let text = "";
      let lastEnd = null;
      for (const it of items) {
        if (lastEnd !== null && it.x - lastEnd > it.size * 0.2 && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
        text += it.str;
        lastEnd = it.x + (it.w || 0);
      }
      text = text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const textItems = items.filter((i) => i.str.trim() && !/^[•●▪◦■]$/.test(i.str.trim()));
      const size = Math.max(...(textItems.length ? textItems : items).map((i) => i.size));
      lines.push({ text, size, y: row.y, page: p, x: items[0].x, bold: (textItems.length ? textItems : items).every((i) => i.bold) });
    }
  }
  if (!lines.length) return { title: "", description: "", html: "", empty: true };

  // Drop repeated page headers/footers and bare page numbers.
  const counts = new Map();
  for (const l of lines) counts.set(l.text, (counts.get(l.text) || 0) + 1);
  const minRepeat = Math.max(3, Math.ceil(doc.numPages * 0.6));
  const body = lines.filter((l) => !/^(page\s*)?\d{1,3}(\s*(of|\/)\s*\d{1,3})?$/i.test(l.text) && !(doc.numPages >= 3 && counts.get(l.text) >= minRepeat));

  const sizes = body.map((l) => Math.round(l.size * 2) / 2).sort((a, b) => a - b);
  const bodySize = mode(sizes);
  const largest = Math.max(...sizes);

  // Title: the largest text near the top of the first page.
  let title = "";
  const firstPage = body.filter((l) => l.page === 1);
  if (largest >= bodySize * 1.3) {
    const titleLines = [];
    for (const l of firstPage) {
      const last = titleLines[titleLines.length - 1];
      if (Math.abs(l.size - largest) < 0.6 && (!last || (last.y - l.y < l.size * 1.6 && Math.abs(l.x - last.x) < l.size * 1.5))) titleLines.push(l);
      else if (titleLines.length) break;
    }
    if (titleLines.length && titleLines.length <= 4) {
      title = titleLines.map((l) => l.text).join(" ");
      for (const l of titleLines) l.skip = true;
    }
  }

  const blocks = [];
  let para = null;
  let prev = null;
  let pendingBullet = false;
  const flush = () => { if (para) { blocks.push(para); para = null; } };
  for (const l of body) {
    if (l.skip) continue;
    const ratio = l.size / bodySize;
    const isHeading = (ratio >= 1.15 || (l.bold && l.text.length < 90 && !/[.,;:]$/.test(l.text))) && l.text.length < 140;
    if (/^[•●▪◦■\-–*]$/.test(l.text)) { pendingBullet = true; prev = l; continue; }
    if (pendingBullet) { pendingBullet = false; flush(); blocks.push({ type: "ul", text: l.text }); prev = l; continue; }
    const bullet = l.text.match(/^([•●▪◦■\-–*]|\d{1,2}[.)])\s+(.*)$/);
    const gap = prev && prev.page === l.page ? prev.y - l.y : Infinity;
    const newBlock = !prev || gap > l.size * 1.75 || Math.abs(prev.size - l.size) > 0.8 || prev.page !== l.page && /[.!?:"”]$/.test(prev.text);
    if (isHeading) {
      if (para && para.type === "heading" && !newBlock && para.size === l.size) { para.text += " " + l.text; prev = l; continue; }
      flush();
      para = { type: "heading", level: ratio >= 1.5 ? 2 : 3, text: l.text, size: l.size };
    } else if (bullet) {
      flush();
      blocks.push({ type: /\d/.test(bullet[1]) ? "ol" : "ul", text: bullet[2] });
    } else if (para && para.type === "p" && !newBlock) {
      para.text = para.text.endsWith("-") && /^[a-z]/.test(l.text) ? para.text.slice(0, -1) + l.text : para.text + " " + l.text;
    } else if (!newBlock && blocks.length && /^(ul|ol)$/.test(blocks[blocks.length - 1].type) && !para) {
      blocks[blocks.length - 1].text += " " + l.text; // wrapped bullet line
    } else {
      flush();
      para = { type: "p", text: l.text };
    }
    prev = l;
  }
  flush();

  let html = "";
  let list = null;
  for (const b of blocks) {
    if (b.type === "ul" || b.type === "ol") {
      if (list !== b.type) { if (list) html += `</${list}>`; html += `<${b.type}>`; list = b.type; }
      html += `<li>${escapeHtml(b.text)}</li>`;
      continue;
    }
    if (list) { html += `</${list}>`; list = null; }
    html += b.type === "heading" ? `<h${b.level}>${escapeHtml(b.text)}</h${b.level}>` : `<p>${escapeHtml(b.text)}</p>`;
  }
  if (list) html += `</${list}>`;

  const firstP = blocks.find((b) => b.type === "p");
  return { title, description: firstP ? clip(firstP.text, 160) : "", html };
}

// ======================= Helpers =======================

function tidy(doc, root) {
  // Images on their own line become figures; a following caption line becomes the caption.
  for (const img of [...root.querySelectorAll("img")]) {
    const p = img.closest("p");
    const fig = doc.createElement("figure");
    const clone = img.cloneNode();
    fig.append(clone);
    if (p && p.textContent.trim() === "" && p.querySelectorAll("img").length === 1) {
      const next = p.nextElementSibling;
      if (next && (next.classList.contains("doc-caption") || /^(figure|fig\.|image|source)\b/i.test(next.textContent.trim()))) {
        const cap = doc.createElement("figcaption");
        cap.textContent = next.textContent.trim();
        fig.append(cap);
        next.remove();
      }
      p.replaceWith(fig);
    } else if (p) {
      img.remove();
      p.after(fig);
    }
  }
  for (const cap of [...root.querySelectorAll("p.doc-caption")]) cap.removeAttribute("class");
  // Empty paragraphs and Word's bookmark anchors.
  for (const p of [...root.querySelectorAll("p")]) if (!p.textContent.trim() && !p.querySelector("img")) p.remove();
  for (const a of [...root.querySelectorAll("a[id]:not([href])")]) a.replaceWith(...a.childNodes);
  // Footnote back-links Word adds are noise on the web.
  for (const a of [...root.querySelectorAll('a[href^="#footnote-ref"]')]) a.remove();
}

function replaceTag(doc, el, tag) {
  const n = doc.createElement(tag);
  n.innerHTML = el.innerHTML;
  el.replaceWith(n);
}

function firstSentences(root) {
  const p = [...root.querySelectorAll("p")].find((x) => x.textContent.trim().length > 40);
  return p ? clip(p.textContent.trim(), 160) : "";
}

function clip(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (stop > 60) return cut.slice(0, stop + 1);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

function mode(nums) {
  const c = new Map();
  for (const n of nums) c.set(n, (c.get(n) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const baseName = (n) => n.replace(/\.[a-z0-9]+$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) || "doc";
const humanName = (n) => n.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
