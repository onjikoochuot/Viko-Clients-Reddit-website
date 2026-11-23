// Free PDFs: downloads readers get in exchange for their email.
// Stored in src/_data/freebies.json; files in src/media/downloads/.
// Each article shows the default PDF unless its `freebie` field names another one, or "none".
import bundled from "../src/_data/freebies.json";
import { h, icon, modal, confirmBox, toast, busy, slugify } from "./ui.js";
import { utf8ToBase64, bytesToBase64 } from "./github.js";
import { parseArticle, serializeArticle, POSTS_DIR } from "./content.js";
import { canvasToBlob } from "./media.js";
import { pickFile } from "./tools.js";
import { openPdf, renderPage } from "./importers.js";
import { displaySrc } from "./nodes.js";

export const FREEBIES_PATH = "src/_data/freebies.json";
const DIR = "src/media/downloads";
const MAX_MB = 24;

let freebies = bundled.map((f) => ({ ...f }));
let loaded = false;

export const getFreebies = () => freebies;
export const defaultFreebie = () => freebies.find((f) => f.default) || freebies[0] || null;
export const findFreebie = (id) => freebies.find((f) => f.id === id);

export async function loadFreebies(gh, force = false) {
  if (loaded && !force) return freebies;
  try {
    const list = JSON.parse((await gh.getFile(FREEBIES_PATH)).text);
    if (Array.isArray(list)) freebies = list;
  } catch {}
  loaded = true;
  return freebies;
}

// The original Visibility Check files are also used on its landing page, so they're never deleted.
const owned = (p) => typeof p === "string" && p.startsWith("/media/downloads/") && !p.includes("/reddit-visibility-check");
const save = (list) => ({ path: FREEBIES_PATH, base64: utf8ToBase64(JSON.stringify(list, null, 2) + "\n") });

// ---------- The Free PDFs page ----------
export async function showFreebies({ gh, app, topBar, tabs, listArticles }) {
  document.title = "Free PDFs — Viko Studio";
  const grid = h("div", { class: "st-freebies" }, h("p", { class: "st-muted" }, "Loading…"));
  app.replaceChildren(
    topBar(),
    h("main", { class: "st-list" },
      tabs("freebies"),
      h("div", { class: "st-list-head" },
        h("div", {}, h("h1", {}, "Free PDFs"),
          h("p", { class: "st-muted" }, "Readers get these in exchange for their email, in a box at the end of each article. New articles get the default one; you can pick another or none per article.")),
        h("div", { class: "st-list-actions" },
          h("button", { class: "st-btn st-btn--primary", onclick: () => edit(null) }, icon("file-circle-plus"), " Add a PDF"))),
      grid));

  let articles = [];
  const usage = (f) => {
    const isDef = f === defaultFreebie();
    return articles.filter((a) => {
      const v = a.data.freebie;
      if (v === "none") return false;
      if (v && v === f.id) return true;
      return isDef && (!v || !findFreebie(v));
    }).length;
  };

  const render = () => {
    if (!freebies.length) {
      grid.replaceChildren(h("div", { class: "st-empty" }, h("p", {}, "No free PDFs yet, so articles don't show a download box."),
        h("button", { class: "st-btn st-btn--primary", onclick: () => edit(null) }, icon("file-circle-plus"), " Add your first PDF")));
      return;
    }
    grid.replaceChildren(...freebies.map((f, i) => {
      const isDef = f === defaultFreebie();
      const n = usage(f);
      return h("div", { class: "st-freebie-card" + (isDef ? " is-default" : "") },
        h("img", { class: "st-freebie-cover", src: displaySrc(f.cover), alt: "" }),
        h("div", { class: "st-freebie-body" },
          h("h3", {}, f.title, isDef ? h("span", { class: "st-badge" }, "Default") : null),
          f.blurb ? h("p", {}, f.blurb) : h("p", { class: "st-muted" }, "No description"),
          h("p", { class: "st-small st-muted" },
            f.pages ? `${f.pages} page${f.pages === 1 ? "" : "s"} · ` : "",
            `Shown on ${n} article${n === 1 ? "" : "s"}`),
          h("div", { class: "st-freebie-actions" },
            h("button", { class: "st-btn", onclick: () => edit(i) }, icon("pen"), " Edit"),
            isDef ? null : h("button", { class: "st-btn", onclick: () => makeDefault(i) }, icon("star"), " Make default"),
            h("a", { class: "st-btn st-btn--ghost", href: f.pdf, target: "_blank", rel: "noopener" }, icon("eye"), " Open PDF"),
            h("button", { class: "st-btn st-btn--danger-ghost", onclick: () => remove(i, n), title: `Delete ${f.title}` }, icon("trash-can")))));
    }));
  };

  await loadFreebies(gh, true);
  try { articles = await listArticles(); } catch {}
  render();

  async function commit(next, files, deletes, message, okText) {
    const b = busy("Saving…");
    try {
      await gh.commit({ files: [...files, save(next)], deletes, message, onProgress: (m) => b.update && b.update(m) });
      freebies = next;
      b.done();
      toast(`${okText} The site updates in a minute or two.`, { type: "success" });
      render();
    } catch (e) {
      b.done();
      toast(e.message, { type: "error" });
    }
  }

  async function edit(index) {
    const old = index === null ? null : freebies[index];
    const r = await freebieForm(old, !freebies.length);
    if (!r) return;
    const { data, pdfFile, coverBlob } = r;
    const files = [], deletes = [];
    const stamp = Date.now().toString(36).slice(-5);
    const base = slugify(data.title).slice(0, 50) || "free-pdf";
    if (!old) data.id = freebies.some((f) => f.id === base) ? `${base}-${stamp}` : base;
    if (pdfFile) {
      const path = `${DIR}/${base}-${stamp}.pdf`;
      files.push({ path, base64: bytesToBase64(new Uint8Array(await pdfFile.arrayBuffer())) });
      data.pdf = path.replace(/^src/, "");
      if (old && owned(old.pdf)) deletes.push("src" + old.pdf);
    }
    if (coverBlob) {
      const path = `${DIR}/${base}-${stamp}-cover.webp`;
      files.push({ path, base64: bytesToBase64(new Uint8Array(await coverBlob.arrayBuffer())) });
      data.cover = path.replace(/^src/, "");
      if (old && owned(old.cover)) deletes.push("src" + old.cover);
    }
    let next = freebies.slice();
    if (data.default) next = next.map((f) => ({ ...f, default: false }));
    if (index === null) next.push(data); else next[index] = data;
    if (!next.some((f) => f.default)) next[0] = { ...next[0], default: true };
    await commit(next, files, deletes, `${old ? "Update" : "Add"} free PDF: ${data.title}`, `"${data.title}" saved.`);
  }

  async function makeDefault(index) {
    const f = freebies[index];
    const next = freebies.map((x, i) => ({ ...x, default: i === index }));
    await commit(next, [], [], `Make "${f.title}" the default free PDF`, `"${f.title}" is now the default. Articles without their own choice show it.`);
  }

  async function remove(index, used) {
    const f = freebies[index];
    const isDef = f === defaultFreebie();
    const rest = freebies.filter((_, i) => i !== index);
    const fallback = isDef ? rest[0] : defaultFreebie();
    const ok = await confirmBox({
      title: `Delete "${f.title}"?`,
      message: (used ? `It's shown on ${used} article${used === 1 ? "" : "s"}. ` : "") +
        (fallback ? `${used ? "Those articles will show" : "Articles that would show it will show"} "${fallback.title}" instead${isDef ? ", which becomes the new default" : ""}.`
                  : "It's your only free PDF, so articles won't show a download box until you add another.") +
        " The PDF file is removed from the site.",
      okLabel: "Delete PDF", danger: true });
    if (!ok) return;
    let next = rest;
    if (isDef && next.length) next = next.map((x, i) => ({ ...x, default: i === 0 }));
    const deletes = [f.pdf, f.cover].filter(owned).map((p) => "src" + p);
    // Articles that named this PDF go back to the default.
    const files = [];
    for (const a of articles) {
      if (a.data.freebie !== f.id) continue;
      try {
        const file = await gh.getFile(`${POSTS_DIR}/${a.slug}.md`);
        const parsed = parseArticle(file.text);
        delete parsed.data.freebie;
        files.push({ path: `${POSTS_DIR}/${a.slug}.md`, base64: utf8ToBase64(serializeArticle(parsed.data, parsed.html)) });
      } catch {}
    }
    await commit(next, files, deletes, `Delete free PDF: ${f.title}`, `"${f.title}" deleted.`);
    try { articles = await listArticles(); } catch {}
    render();
  }
}

// ---------- Add / edit form ----------
function freebieForm(old, first) {
  return new Promise((resolve) => {
    let done = false;
    let pdfFile = null, coverBlob = null;
    let coverUrl = old ? displaySrc(old.cover) : "";
    let pages = old ? old.pages || "" : "";

    const title = h("input", { type: "text", required: true, placeholder: "e.g. The Reddit Ads Starter Checklist" });
    const blurb = h("textarea", { rows: 3, maxlength: 260, placeholder: "One or two sentences: what's inside and why it's useful." });
    const pagesIn = h("input", { type: "number", min: "1", step: "1", placeholder: "e.g. 8" });
    const isDefault = h("input", { type: "checkbox" });
    title.value = old ? old.title : "";
    blurb.value = old ? old.blurb || "" : "";
    pagesIn.value = pages;
    isDefault.checked = old ? !!old.default : first;

    const fileBox = h("div", { class: "st-freebie-file" });
    const coverBox = h("div", { class: "st-freebie-coverbox" });
    const preview = h("aside", { class: "lm-box st-freebie-preview" });

    const draw = () => {
      const name = pdfFile ? pdfFile.name : old ? old.pdf.split("/").pop() : "";
      fileBox.replaceChildren(
        name ? h("div", { class: "st-attach-file" }, icon("file-pdf"), h("span", {}, name), pdfFile ? h("small", { class: "st-muted" }, ` (${(pdfFile.size / 1048576).toFixed(1)} MB, new)`) : null) : h("p", { class: "st-muted st-small" }, "No PDF chosen yet."),
        h("button", { type: "button", class: "st-btn", onclick: choosePdf }, icon("upload"), name ? " Replace PDF" : " Upload PDF"));
      coverBox.replaceChildren(
        coverUrl ? h("img", { src: coverUrl, alt: "" }) : h("div", { class: "st-freebie-nocover" }, "Cover appears here"),
        h("div", { class: "st-author-photo-btns" },
          h("button", { type: "button", class: "st-btn", onclick: chooseCover }, icon("image"), " Use my own image"),
          h("small", { class: "st-muted" }, "We make a cover from the PDF's first page. Upload an image instead if you prefer.")));
      preview.replaceChildren(
        coverUrl ? h("img", { src: coverUrl, alt: "" }) : h("div", { class: "st-freebie-nocover" }),
        h("div", {},
          h("p", { class: "section-kicker" }, "Free PDF"),
          h("h2", {}, title.value.trim() || "Your PDF's title"),
          h("p", {}, blurb.value.trim() || "Your description."),
          h("span", { class: "btn btn-primary" }, "Send me the free PDF")));
    };
    [title, blurb].forEach((el) => el.addEventListener("input", draw));

    async function choosePdf() {
      const f = await pickFile("application/pdf,.pdf");
      if (!f) return;
      if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return toast("Please choose a PDF file.", { type: "error" });
      if (f.size > MAX_MB * 1048576) return toast(`PDFs must be under ${MAX_MB} MB.`, { type: "error" });
      const b = busy("Reading the PDF…");
      try {
        const pdf = await openPdf(f);
        pages = pdf.numPages;
        pagesIn.value = pages;
        const canvas = await renderPage(pdf.doc, 1, 620);
        coverBlob = await canvasToBlob(canvas, 0.86);
        coverUrl = URL.createObjectURL(coverBlob);
        if (!title.value.trim()) title.value = f.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim();
      } catch {
        toast("This PDF couldn't be opened. It may be password-protected or damaged.", { type: "error" });
        b.done();
        return;
      }
      b.done();
      pdfFile = f;
      draw();
    }

    async function chooseCover() {
      const f = await pickFile("image/*");
      if (!f) return;
      const bmp = await createImageBitmap(f);
      const c = document.createElement("canvas");
      const w = Math.min(620, bmp.width);
      c.width = w; c.height = Math.round(bmp.height * (w / bmp.width));
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      coverBlob = await canvasToBlob(c, 0.86);
      coverUrl = URL.createObjectURL(coverBlob);
      draw();
    }

    const field = (label, input, hint) => h("label", { class: "st-field" }, h("span", {}, label), input, hint ? h("small", {}, hint) : null);
    const body = h("form", { class: "st-form", onsubmit: (e) => { e.preventDefault(); submit(); } },
      h("div", { class: "st-field" }, h("span", {}, "PDF file"), fileBox, h("small", {}, `Up to ${MAX_MB} MB.`)),
      field("Title", title),
      field("Description", blurb, "Shown in the box under the title."),
      field("Number of pages", pagesIn, "Filled in from the PDF. Shown as \"Free, 8 pages\"."),
      h("div", { class: "st-field" }, h("span", {}, "Cover"), coverBox),
      h("label", { class: "st-check" }, isDefault, h("span", {}, h("strong", {}, "Default for articles"), h("br"),
        h("small", { class: "st-muted" }, "Shown on every article that hasn't picked a different PDF or turned it off."))),
      h("div", { class: "st-field" }, h("span", {}, "How it looks at the end of an article"), preview),
      h("button", { type: "submit", hidden: true }));
    draw();

    const m = modal({
      title: old ? `Edit "${old.title}"` : "Add a free PDF",
      body, wide: true,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: "Cancel", onClick: (close) => close() },
        { label: old ? "Save changes" : "Add PDF", primary: true, onClick: () => submit() },
      ],
    });

    function submit() {
      const t = title.value.trim();
      if (!old && !pdfFile) return toast("Upload the PDF first.", { type: "error" });
      if (!t) { title.focus(); title.reportValidity(); return; }
      if (!coverUrl) return toast("Add a cover image.", { type: "error" });
      const data = { ...(old || {}), title: t, blurb: blurb.value.trim(), default: isDefault.checked };
      const p = parseInt(pagesIn.value, 10);
      if (p > 0) data.pages = p; else delete data.pages;
      done = true;
      m.close();
      resolve({ data, pdfFile, coverBlob });
    }
  });
}
