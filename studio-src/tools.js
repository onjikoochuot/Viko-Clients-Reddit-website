// Dialogs: cropping, choosing images/thumbnails and the PDF workspace.
import Cropper from "cropperjs";
import { h, icon, modal, toast, busy } from "./ui.js";
import { prepareImage, canvasToBlob, trackBlob } from "./media.js";
import { displaySrc } from "./nodes.js";
import { openPdf, renderPage, extractPdfImages, extractPdfText } from "./importers.js";

export function pickFile(accept, multiple = false) {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept, multiple, style: { display: "none" } });
    input.addEventListener("change", () => { resolve(multiple ? [...input.files] : input.files[0] || null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

// ---------- Crop any image ----------
const ASPECTS = [
  { label: "Free", value: NaN },
  { label: "Thumbnail 16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
  { label: "Square", value: 1 },
];

export function cropImage(src, { title = "Crop image", aspect = NaN, actions } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const img = h("img", { crossorigin: "anonymous", alt: "", style: { maxWidth: "100%", display: "block" } });
    img.src = displaySrc(src);
    let cropper;
    const ratioButtons = ASPECTS.map((a) => h("button", { type: "button", class: "st-chip" + (sameRatio(a.value, aspect) ? " is-on" : ""),
      onclick: (e) => {
        cropper && cropper.setAspectRatio(a.value);
        ratioButtons.forEach((b) => b.classList.remove("is-on"));
        e.currentTarget.classList.add("is-on");
      } }, a.label));
    const body = h("div", { class: "st-crop" },
      h("div", { class: "st-chip-group" }, ratioButtons),
      h("div", { class: "st-crop-stage" }, img),
      h("p", { class: "st-muted" }, "Drag the box to choose the part you want. Drag its corners to resize it."));
    const finish = async (close, kind) => {
      const canvas = cropper.getCroppedCanvas({ maxWidth: 2400, maxHeight: 2400, imageSmoothingQuality: "high", fillColor: "#fff" });
      if (!canvas) return;
      const blob = await canvasToBlob(canvas);
      const url = trackBlob(blob, "crop", blob.type.includes("webp") ? "webp" : "jpg");
      done = true;
      close();
      resolve({ src: url, kind });
    };
    modal({
      title,
      body,
      wide: true,
      onClose: () => { if (cropper) cropper.destroy(); if (!done) resolve(null); },
      actions: [{ label: "Cancel", onClick: (close) => close() },
        ...(actions || [{ label: "Use this crop", value: "use", primary: true }]).map((a) => ({ label: a.label, primary: a.primary, onClick: (close) => finish(close, a.value) }))],
    });
    img.addEventListener("load", () => {
      cropper = new Cropper(img, { viewMode: 1, aspectRatio: aspect, autoCropArea: 0.9, background: false, responsive: true });
    }, { once: true });
    img.addEventListener("error", () => toast("This image couldn't be opened for cropping.", { type: "error" }), { once: true });
  });
}

function sameRatio(a, b) {
  return (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) < 0.001;
}

// ---------- Choose an image: upload, from the article, or from a link ----------
export function chooseImage({ title = "Add an image", articleImages = [], allowUrl = true, cropAspect } = {}) {
  return new Promise((resolve) => {
    let done = false;
    let m;
    const finish = (val) => { done = true; m.close(); resolve(val); };
    const drop = h("label", { class: "st-drop" },
      icon("cloud-arrow-up", "st-drop-icon"),
      h("strong", {}, "Click to upload, or drop an image here"),
      h("span", {}, "JPG, PNG, WebP or GIF. Large photos are resized automatically."),
      h("input", { type: "file", accept: "image/*", style: { display: "none" }, onchange: (e) => useFile(e.target.files[0]) }));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); useFile(e.dataTransfer.files[0]); });

    async function useFile(file) {
      if (!file || !file.type.startsWith("image/")) return toast("Please choose an image file.", { type: "error" });
      const b = busy("Preparing image…");
      try {
        let src = await prepareImage(file);
        b.done();
        if (cropAspect) {
          const c = await cropImage(src, { aspect: cropAspect, title: "Crop the thumbnail" });
          if (c) src = c.src;
        }
        finish({ src, alt: "" });
      } catch (e) { b.done(); toast("That image couldn't be read: " + e.message, { type: "error" }); }
    }

    const urlInput = h("input", { type: "url", placeholder: "https://example.com/picture.jpg" });
    const fromUrl = allowUrl ? h("form", { class: "st-inline-form", onsubmit: (e) => {
      e.preventDefault();
      const u = urlInput.value.trim();
      if (/^https?:\/\//.test(u)) finish({ src: u, alt: "" });
    } }, urlInput, h("button", { class: "st-btn", type: "submit" }, "Use link")) : null;

    const gallery = articleImages.length ? h("div", {},
      h("p", { class: "st-label" }, "Or pick one already in this article"),
      h("div", { class: "st-gallery" }, articleImages.map((im) => h("button", { type: "button", class: "st-gallery-item",
        onclick: async () => {
          if (cropAspect) {
            const c = await cropImage(im.src, { aspect: cropAspect, title: "Crop the thumbnail",
              actions: [{ label: "Use whole image", value: "whole" }, { label: "Use this crop", value: "crop", primary: true }] });
            if (!c) return;
            finish(c.kind === "whole" ? { src: im.src, alt: im.alt } : { src: c.src, alt: im.alt });
          } else finish({ src: im.src, alt: im.alt });
        } }, h("img", { src: displaySrc(im.src), alt: im.alt || "", loading: "lazy" }))))) : null;

    m = modal({
      title,
      wide: !!articleImages.length,
      body: h("div", { class: "st-form" }, drop, gallery,
        fromUrl ? h("div", {}, h("p", { class: "st-label" }, "Or use an image from another website"), fromUrl,
          h("small", { class: "st-muted" }, "Only use images you have the right to publish.")) : null),
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

// ---------- PDF workspace ----------
// mode "new": building a new article from the PDF. mode "insert": adding to the current one.
export async function pdfWorkspace(file, { mode = "insert" } = {}) {
  const b = busy("Opening the PDF…");
  let pdf;
  try {
    pdf = await openPdf(file);
  } catch (e) {
    b.done();
    toast("This PDF couldn't be opened. It may be password-protected or damaged.", { type: "error" });
    return null;
  }
  b.done();

  return new Promise((resolve) => {
    let done = false;
    const result = { insertHtml: "", thumbnail: null, attach: false, title: "", description: "" };
    const picked = []; // { src, alt } images chosen for the article
    let foundImages = null;

    const pagesGrid = h("div", { class: "st-pages" });
    const imagesGrid = h("div", { class: "st-gallery" }, h("p", { class: "st-muted" }, "Looking for pictures…"));
    const pickedList = h("div", { class: "st-picked" });
    const thumbBox = h("div", { class: "st-thumb-preview is-empty" }, h("span", {}, "No thumbnail chosen yet"));
    const textMode = h("select", {},
      h("option", { value: "text", selected: true }, mode === "new" ? "Use the PDF's text as the article" : "Insert the PDF's text"),
      h("option", { value: "none" }, "Don't use the text"));
    const attach = h("input", { type: "checkbox", checked: mode === "new" });

    function refreshPicked() {
      pickedList.replaceChildren(...(picked.length ? picked.map((p, i) => h("div", { class: "st-picked-item" },
        h("img", { src: p.src, alt: "" }),
        h("button", { type: "button", class: "st-icon-btn", "aria-label": "Remove", onclick: () => { picked.splice(i, 1); refreshPicked(); } }, icon("xmark")))) :
        [h("p", { class: "st-muted" }, "Images you add appear here, and are placed in the article in this order.")]));
    }
    function setThumb(src) {
      result.thumbnail = src;
      thumbBox.classList.remove("is-empty");
      thumbBox.replaceChildren(h("img", { src, alt: "" }));
    }
    refreshPicked();

    async function cropFromPage(n) {
      const bb = busy(`Rendering page ${n}…`);
      let canvas;
      try { canvas = await renderPage(pdf.doc, n, 2000); } finally { bb.done(); }
      const blob = await canvasToBlob(canvas, 0.9);
      const url = URL.createObjectURL(blob);
      const c = await cropImage(url, {
        title: `Page ${n}: select a part`,
        actions: [
          { label: "Use as thumbnail", value: "thumb" },
          { label: "Add to article", value: "add", primary: true },
        ],
      });
      URL.revokeObjectURL(url);
      if (!c) return;
      if (c.kind === "thumb") setThumb(c.src);
      else { picked.push({ src: c.src, alt: "" }); refreshPicked(); }
    }

    const body = h("div", { class: "st-pdf" },
      h("div", { class: "st-pdf-main" },
        h("h3", {}, "Pages"),
        h("p", { class: "st-muted" }, "Click a page to select any part of it: a chart, a table, a photo or a quote. Use it as the thumbnail or add it to the article."),
        pagesGrid,
        h("h3", {}, "Pictures found in the PDF"),
        h("p", { class: "st-muted" }, "Click a picture to add it to the article. Use the star to make it the thumbnail."),
        imagesGrid),
      h("aside", { class: "st-pdf-side" },
        h("label", { class: "st-field" }, h("span", {}, "Text"), textMode,
          h("small", {}, "Paragraphs, headings and lists are rebuilt from the PDF. Check the result, since PDFs don't always keep their layout.")),
        h("div", { class: "st-field" }, h("span", {}, "Thumbnail"), thumbBox),
        h("div", { class: "st-field" }, h("span", {}, "Images to add"), pickedList),
        h("label", { class: "st-check" }, attach, h("span", {}, "Offer the original PDF as a download at the end of the article"))));

    const m = modal({
      title: file.name,
      body,
      wide: true,
      className: "st-modal--full",
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: "Cancel", onClick: (close) => close() },
        { label: mode === "new" ? "Create article" : "Add to article", primary: true, onClick: async (close) => {
          const bb = busy("Preparing…");
          try {
            if (textMode.value === "text") {
              const t = await extractPdfText(pdf, (msg) => bb.update(msg));
              result.title = t.title;
              result.description = t.description;
              result.insertHtml = t.html;
              if (t.empty) toast("This PDF has no selectable text (it may be a scan). Add images of its pages instead, or type the text.", { type: "warning", timeout: 9000 });
            }
            if (picked.length) {
              const figs = picked.map((p) => `<figure><img src="${p.src}" alt=""></figure>`);
              if (result.insertHtml) {
                // Spread the images through the text, after every few paragraphs.
                const parts = result.insertHtml.split(/(?=<h[23]>)/);
                const step = Math.max(1, Math.floor(parts.length / (figs.length + 1)));
                let html = "";
                parts.forEach((part, i) => { html += part; if ((i + 1) % step === 0 && figs.length) html += figs.shift(); });
                result.insertHtml = html + figs.join("");
              } else result.insertHtml = figs.join("");
            }
            result.attach = attach.checked;
          } finally { bb.done(); }
          done = true;
          close();
          resolve(result);
        } },
      ],
    });

    // Page previews, rendered a few at a time.
    (async () => {
      const total = Math.min(pdf.numPages, 80);
      for (let n = 1; n <= total; n++) {
        if (!document.body.contains(m.box)) return;
        const btn = h("button", { type: "button", class: "st-pdfpage", title: `Select part of page ${n}`, onclick: () => cropFromPage(n) },
          h("span", { class: "st-page-num" }, `Page ${n}`));
        pagesGrid.append(btn);
        try {
          const c = await renderPage(pdf.doc, n, 260);
          c.className = "st-page-canvas";
          btn.prepend(c);
        } catch {}
      }
      if (pdf.numPages > total) pagesGrid.append(h("p", { class: "st-muted" }, `Showing the first ${total} of ${pdf.numPages} pages.`));
    })();

    (async () => {
      foundImages = await extractPdfImages(pdf, () => {}, file.name.replace(/\.pdf$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) || "pdf");
      if (!document.body.contains(m.box)) return;
      imagesGrid.replaceChildren(...(foundImages.length ? foundImages.map((im) => h("div", { class: "st-gallery-item st-gallery-item--tools" },
        h("img", { src: im.src, alt: "" }),
        h("div", { class: "st-gallery-tools" },
          h("button", { type: "button", class: "st-chip", onclick: () => { picked.push({ src: im.src, alt: "" }); refreshPicked(); toast("Added to the article list."); } }, icon("plus"), " Add"),
          h("button", { type: "button", class: "st-chip", onclick: () => setThumb(im.src), title: "Use as thumbnail" }, icon("star"))))) :
        [h("p", { class: "st-muted" }, "No separate pictures were found. Click a page above to select part of it instead.")]));
    })();
  });
}

// ---------- Insert a link, link card or embed ----------
export function classifyUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return "youtube";
  if (/(^|\.)reddit\.com$/.test(host) && /\/comments\//.test(u.pathname)) return "reddit";
  return "link";
}
