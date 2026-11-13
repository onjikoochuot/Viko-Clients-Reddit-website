// Viko Studio: write, import, edit and publish Insights articles.
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import Placeholder from "@tiptap/extension-placeholder";
import Youtube from "@tiptap/extension-youtube";
import { TableKit } from "@tiptap/extension-table";
import site from "../src/_data/site.json";

import { GitHub, readToken, saveToken, clearToken, utf8ToBase64 } from "./github.js";
import { h, icon, modal, ask, confirmBox, toast, busy, formatDate, slugify, today, esc } from "./ui.js";
import { parseArticle, serializeArticle, POSTS_DIR, UPLOADS_DIR, wordCount } from "./content.js";
import { prepareImage, planUploads, forget, trackBlob, isPending } from "./media.js";
import { Figure, Callout, CALLOUT_KINDS, LinkCard, RedditEmbed, FileCard, CtaButton, hooks, setRawBase, displaySrc } from "./nodes.js";
import { cropImage, chooseImage, pickFile, pdfWorkspace, classifyUrl } from "./tools.js";
import { importWord } from "./importers.js";

const REPO = site.repo;
const BRANCH = site.branch || "main";
setRawBase(`https://raw.githubusercontent.com/${REPO}/${BRANCH}`);

const app = document.getElementById("studio");
let gh = null;
let listCache = null; // [{ path, slug, data }]

// ======================= Start =======================

async function start() {
  const token = readToken();
  if (!token) return showSignIn();
  gh = new GitHub({ token, repo: REPO, branch: BRANCH });
  const b = busy("Connecting to GitHub…");
  try {
    const repo = await gh.checkAccess();
    if (repo.permissions && repo.permissions.push === false) throw Object.assign(new Error("Your token can read this repository but can't save to it. Give it \"Contents: Read and write\"."), { status: 403 });
  } catch (e) {
    b.done();
    return showSignIn(e.message);
  }
  b.done();
  route();
}

window.addEventListener("hashchange", route);

function route() {
  if (!gh) return;
  const m = location.hash.match(/^#\/(edit|new)(?:\/(.+))?$/);
  if (m && m[1] === "edit" && m[2]) return openEditor({ slug: decodeURIComponent(m[2]) });
  if (m && m[1] === "new") return openEditor({});
  showList();
}

function topBar(...right) {
  return h("header", { class: "st-top" },
    h("a", { class: "st-brand", href: "#/" }, h("span", { class: "st-brand-mark" }, "V"), h("span", {}, "Viko Studio")),
    h("div", { class: "st-top-right" }, ...right));
}

// ======================= Sign in =======================

function showSignIn(error) {
  if (currentEditor) { currentEditor.destroy(); currentEditor = null; }
  const input = h("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off", spellcheck: "false" });
  const form = h("form", { class: "st-signin-card", onsubmit: async (e) => {
    e.preventDefault();
    const token = input.value.trim();
    if (!token) return input.focus();
    saveToken(token);
    start();
  } },
  h("span", { class: "st-brand-mark st-brand-mark--lg" }, "V"),
  h("h1", {}, "Viko Studio"),
  h("p", {}, "Write and publish Insights articles. Sign in with your GitHub access token."),
  error ? h("p", { class: "st-error" }, error) : null,
  h("label", { class: "st-field" }, h("span", {}, "Access token"), input,
    h("small", {}, "Lost it? Open ", h("a", { href: "https://github.com/settings/personal-access-tokens", target: "_blank", rel: "noopener" }, "your GitHub tokens"),
      ", click your Viko token and choose Regenerate. The token needs \"Contents: Read and write\" for ", REPO, ".")),
  h("button", { class: "st-btn st-btn--primary st-btn--block", type: "submit" }, "Sign in"),
  h("p", { class: "st-muted st-small" }, "Your token stays in this browser only. Use a private window on shared computers."));
  app.replaceChildren(h("main", { class: "st-signin" }, form));
  setTimeout(() => input.focus(), 50);
}

function signOut() {
  clearToken();
  gh = null;
  listCache = null;
  location.hash = "";
  showSignIn();
}

// ======================= Article list =======================

async function loadList(force = false) {
  if (listCache && !force) return listCache;
  const items = (await gh.listDir(POSTS_DIR)).filter((f) => f.type === "file" && f.name.endsWith(".md"));
  const out = [];
  const queue = [...items];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const f = queue.shift();
      try {
        const file = await gh.getFile(f.path);
        const { data } = parseArticle(file.text);
        out.push({ path: f.path, slug: f.name.replace(/\.md$/, ""), data });
      } catch {}
    }
  }));
  out.sort((a, b) => String(b.data.date || "").localeCompare(String(a.data.date || "")));
  listCache = out;
  return out;
}

async function showList() {
  if (currentEditor) { currentEditor.destroy(); currentEditor = null; }
  document.title = "Articles — Viko Studio";
  const grid = h("div", { class: "st-cards" }, h("p", { class: "st-muted" }, "Loading your articles…"));
  const search = h("input", { type: "search", placeholder: "Search articles", class: "st-search" });
  const filter = h("select", { class: "st-select" },
    h("option", { value: "all" }, "All articles"), h("option", { value: "published" }, "Published"), h("option", { value: "draft" }, "Drafts"));
  app.replaceChildren(
    topBar(
      h("a", { class: "st-btn st-btn--ghost", href: "/admin/cms/", title: "Edit case studies in the classic editor" }, icon("briefcase"), h("span", {}, "Case studies")),
      h("a", { class: "st-btn st-btn--ghost", href: "/insights/", target: "_blank" }, icon("arrow-up-right-from-square"), h("span", {}, "View site")),
      h("button", { class: "st-btn st-btn--ghost", onclick: signOut }, icon("right-from-bracket"), h("span", {}, "Sign out"))),
    h("main", { class: "st-list" },
      h("div", { class: "st-list-head" },
        h("div", {}, h("h1", {}, "Insights articles"), h("p", { class: "st-muted" }, "The newest date shows first on the site. Drafts stay hidden until you publish them.")),
        h("div", { class: "st-list-actions" },
          h("button", { class: "st-btn", onclick: () => importIntoNew("word") }, icon("file-word"), " Import Word"),
          h("button", { class: "st-btn", onclick: () => importIntoNew("pdf") }, icon("file-pdf"), " Import PDF"),
          h("a", { class: "st-btn st-btn--primary", href: "#/new" }, icon("pen-to-square"), " New article"))),
      h("div", { class: "st-list-tools" }, search, filter),
      grid));

  let items;
  try { items = await loadList(true); } catch (e) {
    grid.replaceChildren(h("p", { class: "st-error" }, e.message));
    return;
  }
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const f = filter.value;
    const shown = items.filter((it) => (!q || `${it.data.title} ${it.data.description} ${it.data.category}`.toLowerCase().includes(q)) &&
      (f === "all" || (f === "draft" ? it.data.draft : !it.data.draft)));
    if (!shown.length) {
      grid.replaceChildren(h("div", { class: "st-empty" }, h("p", {}, items.length ? "No articles match." : "No articles yet."),
        h("a", { class: "st-btn st-btn--primary", href: "#/new" }, "Write your first article")));
      return;
    }
    grid.replaceChildren(...shown.map((it) => h("a", { class: "st-card", href: `#/edit/${encodeURIComponent(it.slug)}` },
      h("div", { class: "st-card-thumb" }, it.data.thumbnail
        ? h("img", { src: displaySrc(it.data.thumbnail), alt: "", loading: "lazy" })
        : h("span", {}, it.data.category || "Insights")),
      h("div", { class: "st-card-body" },
        h("div", { class: "st-card-meta" },
          it.data.draft ? h("span", { class: "st-badge st-badge--draft" }, "Draft") : h("span", { class: "st-badge" }, "Published"),
          h("span", {}, formatDate(it.data.date))),
        h("h3", {}, it.data.title || it.slug),
        it.data.description ? h("p", {}, it.data.description) : null))));
  };
  search.addEventListener("input", render);
  filter.addEventListener("change", render);
  render();
}

async function importIntoNew(kind) {
  const file = await pickFile(kind === "word" ? ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ".pdf,application/pdf");
  if (!file) return;
  await openEditor({ importFile: file, importKind: kind });
}

// ======================= Editor =======================

let currentEditor = null;
let state = null;

async function openEditor({ slug, importFile, importKind }) {
  if (currentEditor) { currentEditor.destroy(); currentEditor = null; }
  state = { slug: slug || "", path: slug ? `${POSTS_DIR}/${slug}.md` : null, data: {}, html: "", dirty: false, wasPublished: false, saving: false };

  if (slug) {
    const b = busy("Opening the article…");
    try {
      const file = await gh.getFile(state.path);
      const parsed = parseArticle(file.text);
      state.data = parsed.data;
      state.html = parsed.html;
      state.wasPublished = !parsed.data.draft;
    } catch (e) {
      b.done();
      toast(e.message, { type: "error" });
      location.hash = "#/";
      return;
    }
    b.done();
  } else {
    state.data = { title: "", description: "", date: today(), category: "", author: "", draft: true };
  }

  buildEditorScreen();

  // Offer to restore text that was typed but never saved (browser closed, crash…).
  const backup = readBackup();
  if (backup && backup.html !== currentEditor.getHTML()) {
    const ok = await confirmBox({ title: "Restore unsaved changes?", okLabel: "Restore",
      message: `This article has changes from ${new Date(backup.at).toLocaleString()} that were never saved. Restore them? Images added in that session may need adding again.` });
    if (ok) {
      state.data = { ...state.data, ...backup.data };
      currentEditor.commands.setContent(backup.html, { emitUpdate: false });
      fillFields();
      markDirty();
    } else clearBackup();
  }

  if (importFile) await runImport(importFile, importKind, true);
}

let els = {};

function buildEditorScreen() {
  const d = state.data;
  els = {};
  els.status = h("span", { class: "st-status" });
  els.words = h("span", { class: "st-words" });
  els.publishBtn = h("button", { class: "st-btn st-btn--primary", onclick: () => save("publish") });
  els.draftBtn = h("button", { class: "st-btn", onclick: () => save("draft") });
  els.previewBtn = h("button", { class: "st-btn st-btn--ghost", onclick: togglePreview, title: "See it exactly as readers will" }, icon("eye"), h("span", {}, "Preview"));
  els.phoneBtn = h("button", { class: "st-icon-btn", onclick: () => { els.canvas.classList.toggle("is-phone"); els.phoneBtn.classList.toggle("is-on"); }, title: "Phone-size view" }, icon("mobile-screen"));
  els.settingsBtn = h("button", { class: "st-icon-btn is-on", onclick: () => { els.shell.classList.toggle("no-side"); els.settingsBtn.classList.toggle("is-on"); }, title: "Article settings" }, icon("sliders"));

  // Title, lead and cover sit in the page like the published article.
  els.kicker = h("div", { class: "section-kicker st-kicker" });
  els.title = h("textarea", { class: "st-title", rows: 1, placeholder: "Article title", oninput: (e) => { state.data.title = e.target.value; autoGrow(e.target); markDirty(); if (!state.path && !state.slugManual && els.sideFields) els.sideFields(); } });
  els.lead = h("textarea", { class: "st-lead", rows: 1, placeholder: "One or two sentences that sum up the article. Shown under the title, on cards and in Google.", oninput: (e) => { state.data.description = e.target.value; autoGrow(e.target); markDirty(); updateChecks(); } });
  els.cover = h("div", { class: "st-cover" });
  els.content = h("div", { class: "post-content st-content" });

  els.toolbar = h("div", { class: "st-toolbar", role: "toolbar", "aria-label": "Formatting" });
  els.canvas = h("div", { class: "st-canvas" },
    h("article", { class: "st-page" },
      h("header", { class: "st-page-head" }, els.kicker, els.title, els.lead),
      els.cover,
      els.content));

  els.side = h("aside", { class: "st-side" });
  els.shell = h("div", { class: "st-shell" }, h("div", { class: "st-main" }, els.toolbar, els.canvas), els.side);

  app.replaceChildren(
    topBar(els.status, els.words, els.phoneBtn, els.previewBtn, els.settingsBtn, els.draftBtn, els.publishBtn),
    els.shell);
  app.querySelector(".st-brand").addEventListener("click", (e) => {
    if (state.dirty && !window.confirm("You have unsaved changes. Leave without saving?")) e.preventDefault();
  });

  currentEditor = new Editor({
    element: els.content,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { target: null, rel: null } },
      }),
      Highlight,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Typography,
      Placeholder.configure({ placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : "Start writing, paste from Word or Google Docs, or drop in images…") }),
      Youtube.configure({ nocookie: true, modestBranding: true, width: 640, height: 360 }),
      TableKit.configure({ table: { resizable: false } }),
      Figure, Callout, LinkCard, RedditEmbed, FileCard, CtaButton,
    ],
    content: state.html,
    editorProps: {
      attributes: { class: "st-prose", spellcheck: "true" },
      handlePaste: (view, event) => handlePaste(event),
      handleDrop: (view, event, slice, moved) => !moved && handleDrop(event),
    },
    onUpdate: () => { markDirty(); updateToolbar(); },
    onSelectionUpdate: updateToolbar,
    onTransaction: updateToolbar,
  });

  hooks.onCrop = async (src, apply) => {
    const c = await cropImage(src);
    if (c) apply(c.src);
  };
  hooks.onReplace = async (apply) => {
    const r = await chooseImage({ title: "Replace image" });
    if (r) apply(r.src);
  };
  hooks.onUseAsThumbnail = (src, alt) => {
    state.data.thumbnail = src;
    if (alt && !state.data.thumbnail_alt) state.data.thumbnail_alt = alt;
    fillFields();
    markDirty();
    toast("Set as the thumbnail.");
  };

  // Title and description grow with their text, including when the page width changes (phone view).
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(() => {
      const w = els.title.clientWidth;
      if (w !== lastW) { lastW = w; autoGrow(els.title); autoGrow(els.lead); }
    }).observe(els.title);
  }

  buildToolbar();
  buildSide();
  fillFields();
  state.dirty = false;
  updateStatus();
  updateToolbar();
  document.title = (d.title || "New article") + " — Viko Studio";
}

function autoGrow(t) {
  t.style.height = "auto";
  t.style.height = t.scrollHeight + "px";
}

function fillFields() {
  const d = state.data;
  els.title.value = d.title || "";
  els.lead.value = d.description || "";
  els.kicker.textContent = d.category || "";
  els.kicker.hidden = !d.category;
  requestAnimationFrame(() => { autoGrow(els.title); autoGrow(els.lead); });
  renderCover();
  if (els.sideFields) els.sideFields();
  updateChecks();
}

function renderCover() {
  const d = state.data;
  if (d.thumbnail) {
    els.cover.className = "st-cover article-cover";
    els.cover.replaceChildren(h("img", { src: displaySrc(d.thumbnail), alt: d.thumbnail_alt || "" }),
      h("div", { class: "st-cover-tools" },
        h("button", { class: "st-chip", onclick: chooseThumbnail }, icon("image"), " Change"),
        h("button", { class: "st-chip", onclick: cropThumbnail }, icon("crop"), " Crop"),
        h("button", { class: "st-chip st-chip--danger", onclick: () => { state.data.thumbnail = ""; fillFields(); markDirty(); } }, icon("trash-can"), " Remove")));
  } else {
    els.cover.className = "st-cover st-cover--empty";
    els.cover.replaceChildren(h("button", { class: "st-cover-add", onclick: chooseThumbnail }, icon("image"),
      h("span", {}, h("strong", {}, "Add a thumbnail"), " Shown on the article card, at the top of the article and when shared.")));
  }
}

function articleImages() {
  const out = [];
  currentEditor.state.doc.descendants((n) => { if (n.type.name === "figure" && n.attrs.src) out.push({ src: n.attrs.src, alt: n.attrs.alt }); });
  return out;
}

async function chooseThumbnail() {
  const r = await chooseImage({ title: "Choose a thumbnail", articleImages: articleImages(), allowUrl: false, cropAspect: 16 / 9 });
  if (!r) return;
  state.data.thumbnail = r.src;
  if (r.alt && !state.data.thumbnail_alt) state.data.thumbnail_alt = r.alt;
  fillFields();
  markDirty();
}

async function cropThumbnail() {
  const c = await cropImage(state.data.thumbnail, { aspect: 16 / 9, title: "Crop the thumbnail" });
  if (!c) return;
  state.data.thumbnail = c.src;
  fillFields();
  markDirty();
}

// ---------- Settings panel ----------
function buildSide() {
  const d = state.data;
  const slugInput = h("input", { type: "text", placeholder: "made-from-the-title", oninput: (e) => { state.slugManual = true; state.newSlug = slugify(e.target.value) || ""; markDirty(); } });
  const date = h("input", { type: "date", oninput: (e) => { state.data.date = e.target.value; markDirty(); } });
  const cats = [...new Set([...(site.categories || []), d.category].filter(Boolean))];
  const category = h("select", { onchange: async (e) => {
    if (e.target.value === "__new") {
      const r = await ask({ title: "New category", fields: [{ name: "c", label: "Category name", required: true }] });
      if (r) { cats.push(r.c); state.data.category = r.c; }
      rebuildCats();
    } else state.data.category = e.target.value;
    fillFields();
    markDirty();
  } });
  const rebuildCats = () => category.replaceChildren(h("option", { value: "" }, "No category"),
    ...cats.map((c) => h("option", { value: c, selected: c === state.data.category }, c)), h("option", { value: "__new" }, "+ New category…"));
  const author = h("input", { type: "text", placeholder: site.defaultAuthor || "Viko team", oninput: (e) => { state.data.author = e.target.value; markDirty(); } });
  const alt = h("input", { type: "text", placeholder: "Describe the thumbnail in a few words", oninput: (e) => { state.data.thumbnail_alt = e.target.value; markDirty(); } });
  const attachBox = h("div", { class: "st-attach" });
  const urlHint = h("small", {});
  els.checks = h("ul", { class: "st-checks" });

  els.sideFields = () => {
    const isNew = !state.path;
    slugInput.disabled = !isNew;
    slugInput.value = isNew ? (state.newSlug || slugify(state.data.title)) : state.slug;
    urlHint.replaceChildren(isNew ? "Set from the title. You can change it until the first save." : "Fixed after the first save, so links to it keep working.");
    date.value = state.data.date || "";
    rebuildCats();
    author.value = state.data.author || "";
    alt.value = state.data.thumbnail_alt || "";
    if (state.data.attachment) {
      attachBox.replaceChildren(h("div", { class: "st-attach-file" }, icon("file-arrow-down"),
        h("span", {}, state.data.attachment_name || state.data.attachment.split("/").pop())),
      h("button", { class: "st-chip st-chip--danger", onclick: () => { delete state.data.attachment; delete state.data.attachment_name; els.sideFields(); markDirty(); } }, icon("trash-can"), " Remove"));
    } else {
      attachBox.replaceChildren(h("button", { class: "st-chip", onclick: async () => {
        const f = await pickFile(".pdf,.docx,.xlsx,.pptx,.zip");
        if (!f) return;
        if (f.size > 24 * 1024 * 1024) return toast("Files must be under 24 MB.", { type: "error" });
        state.data.attachment = trackBlob(f, f.name.replace(/\.[a-z0-9]+$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "file", f.name.split(".").pop().toLowerCase());
        state.data.attachment_name = f.name;
        els.sideFields();
        markDirty();
      } }, icon("paperclip"), " Attach a file"));
    }
  };

  els.side.replaceChildren(
    h("section", { class: "st-side-sec" }, h("h2", {}, "Before you publish"), els.checks),
    h("section", { class: "st-side-sec" },
      h("h2", {}, "Article"),
      h("label", { class: "st-field" }, h("span", {}, "Web address"),
        h("div", { class: "st-url" }, h("span", {}, "/insights/"), slugInput), urlHint),
      h("label", { class: "st-field" }, h("span", {}, "Publish date"), date, h("small", {}, "Newest dates appear first.")),
      h("label", { class: "st-field" }, h("span", {}, "Category"), category),
      h("label", { class: "st-field" }, h("span", {}, "Author"), author)),
    h("section", { class: "st-side-sec" },
      h("h2", {}, "Thumbnail"),
      h("button", { class: "st-btn st-btn--block", onclick: chooseThumbnail }, icon("image"), " Choose thumbnail"),
      h("label", { class: "st-field" }, h("span", {}, "Thumbnail description"), alt)),
    h("section", { class: "st-side-sec" },
      h("h2", {}, "Download for readers"),
      h("p", { class: "st-muted st-small" }, "Attach the original PDF or document. It appears as a download at the end of the article."),
      attachBox),
    h("section", { class: "st-side-sec" },
      h("h2", {}, "Status"),
      h("p", { class: "st-small", id: "st-state-text" }),
      state.path && !state.data.draft ? h("a", { class: "st-btn st-btn--block st-btn--ghost", href: `/insights/${state.slug}/`, target: "_blank" }, icon("arrow-up-right-from-square"), " View live article") : null,
      state.path && !state.data.draft ? h("button", { class: "st-btn st-btn--block", onclick: () => save("unpublish") }, icon("eye-slash"), " Unpublish (make a draft)") : null,
      state.path ? h("button", { class: "st-btn st-btn--block st-btn--danger-ghost", onclick: deleteArticle }, icon("trash-can"), " Delete article") : null));
  els.sideFields();
  const st = els.side.querySelector("#st-state-text");
  st.textContent = !state.path ? "New article, not saved yet." : state.data.draft ? "Draft: only you can see it here." : "Published on the site.";
}

function updateChecks() {
  if (!els.checks || !currentEditor) return;
  const d = state.data;
  const words = wordCount(currentEditor.getHTML());
  const list = [
    [!!(d.title && d.title.trim()), "Title"],
    [!!(d.description && d.description.trim().length >= 50), "Description (at least a sentence)"],
    [!!d.thumbnail, "Thumbnail"],
    [!!d.category, "Category"],
    [words >= 300, `Length: ${words} words` + (words < 300 ? " (aim for 800+)" : "")],
    [!articleImages().some((i) => !i.alt), "Every image has a description"],
  ];
  els.checks.replaceChildren(...list.map(([ok, label]) => h("li", { class: ok ? "is-ok" : "" }, icon(ok ? "circle-check" : "circle"), " ", label)));
}

// ---------- Toolbar ----------
const tb = {};

function buildToolbar() {
  const ed = () => currentEditor.chain().focus();
  const btn = (key, iconName, label, run, opts = {}) => {
    const b = h("button", { type: "button", class: "st-tb", title: label, "aria-label": label, onmousedown: (e) => e.preventDefault(), onclick: run }, opts.text ? h("span", { class: "st-tb-text" }, opts.text) : icon(iconName));
    tb[key] = b;
    return b;
  };
  const sep = () => h("span", { class: "st-tb-sep" });

  tb.style = h("select", { class: "st-tb-select", title: "Text style", onchange: (e) => {
    const v = e.target.value;
    if (v === "p") ed().setParagraph().run();
    else ed().setHeading({ level: Number(v) }).run();
  } }, h("option", { value: "p" }, "Normal text"), h("option", { value: "2" }, "Heading"), h("option", { value: "3" }, "Subheading"), h("option", { value: "4" }, "Small heading"));

  const insertMenu = h("div", { class: "st-menu", hidden: true });
  const insertItems = [
    ["image", "Image", "Upload, paste or drop a picture", insertImage],
    ["table", "Table", "Rows and columns", () => { leaveTable(); ed().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }],
    ["circle-info", "Callout box", "Highlight a tip, key point or warning", () => { leaveTable(); ed().toggleCallout("info").run(); }],
    ["link", "Link preview", "A card showing the page's title and image", () => insertLinkBlock()],
    ["youtube", "YouTube video", "Embed a video player", () => insertLinkBlock("youtube"), "fab"],
    ["reddit-alien", "Reddit post", "Show a Reddit post in the article", () => insertLinkBlock("reddit"), "fab"],
    ["hand-pointer", "Button", "A call-to-action button", () => { leaveTable(); ed().insertContent({ type: "ctaButton" }).run(); }],
    ["file-arrow-down", "Download", "A file readers can download", insertDownload],
    ["minus", "Divider", "A line between sections", () => { leaveTable(); ed().setHorizontalRule().run(); }],
    null,
    ["file-word", "From Word document", "Insert a .docx at the cursor", () => importAtCursor("word")],
    ["file-pdf", "From PDF", "Text, pictures or parts of pages", () => importAtCursor("pdf")],
  ];
  insertMenu.append(...insertItems.map((it) => it === null ? h("div", { class: "st-menu-sep" }) :
    h("button", { type: "button", class: "st-menu-item", onmousedown: (e) => e.preventDefault(), onclick: () => { insertMenu.hidden = true; it[3](); } },
      h("i", { class: `${it[4] || "fas"} fa-${it[0]}` }), h("span", {}, h("strong", {}, it[1]), h("small", {}, it[2])))));
  const insertBtn = h("button", { type: "button", class: "st-tb st-tb--insert", onmousedown: (e) => e.preventDefault(), onclick: (e) => { e.stopPropagation(); insertMenu.hidden = !insertMenu.hidden; } },
    icon("plus"), h("span", {}, "Insert"));
  document.addEventListener("click", (e) => { if (!insertMenu.contains(e.target)) insertMenu.hidden = true; });

  const calloutKinds = h("span", { class: "st-tb-group st-tb-context", "data-context": "callout" },
    h("span", { class: "st-tb-label" }, "Box:"),
    ...CALLOUT_KINDS.map((k) => btn(`callout-${k.value}`, k.icon, k.label, () => ed().updateAttributes("callout", { kind: k.value }).run())),
    btn("callout-remove", "xmark", "Remove the box (keep the text)", () => ed().lift("callout").run()));
  const tableTools = h("span", { class: "st-tb-group st-tb-context", "data-context": "table" },
    h("span", { class: "st-tb-label" }, "Table:"),
    btn("row-add", "", "Add a row below", () => ed().addRowAfter().run(), { text: "+ Row" }),
    btn("col-add", "", "Add a column to the right", () => ed().addColumnAfter().run(), { text: "+ Column" }),
    btn("row-del", "", "Delete this row", () => ed().deleteRow().run(), { text: "− Row" }),
    btn("col-del", "", "Delete this column", () => ed().deleteColumn().run(), { text: "− Column" }),
    btn("head-row", "heading", "Header row on/off", () => ed().toggleHeaderRow().run()),
    btn("table-del", "trash-can", "Delete table", () => ed().deleteTable().run()));

  els.toolbar.replaceChildren(
    btn("undo", "rotate-left", "Undo (Ctrl+Z)", () => ed().undo().run()),
    btn("redo", "rotate-right", "Redo (Ctrl+Y)", () => ed().redo().run()),
    sep(), tb.style, sep(),
    btn("bold", "bold", "Bold (Ctrl+B)", () => ed().toggleBold().run()),
    btn("italic", "italic", "Italic (Ctrl+I)", () => ed().toggleItalic().run()),
    btn("underline", "underline", "Underline (Ctrl+U)", () => ed().toggleUnderline().run()),
    btn("strike", "strikethrough", "Strikethrough", () => ed().toggleStrike().run()),
    btn("highlight", "highlighter", "Highlight", () => ed().toggleHighlight().run()),
    btn("link", "link", "Link (Ctrl+K)", editLink),
    sep(),
    btn("bulletList", "list-ul", "Bulleted list", () => ed().toggleBulletList().run()),
    btn("orderedList", "list-ol", "Numbered list", () => ed().toggleOrderedList().run()),
    btn("blockquote", "quote-left", "Quote", () => ed().toggleBlockquote().run()),
    sep(),
    btn("left", "align-left", "Align left", () => ed().setTextAlign("left").run()),
    btn("center", "align-center", "Center", () => ed().setTextAlign("center").run()),
    btn("right", "align-right", "Align right", () => ed().setTextAlign("right").run()),
    sep(),
    h("span", { class: "st-menu-wrap" }, insertBtn, insertMenu),
    calloutKinds, tableTools);
}

function updateToolbar() {
  const e = currentEditor;
  if (!e || !tb.bold) return;
  for (const k of ["bold", "italic", "underline", "strike", "highlight", "link", "bulletList", "orderedList", "blockquote"]) tb[k].classList.toggle("is-on", e.isActive(k));
  for (const a of ["left", "center", "right"]) tb[a].classList.toggle("is-on", e.isActive({ textAlign: a }));
  tb.undo.disabled = !e.can().undo();
  tb.redo.disabled = !e.can().redo();
  tb.style.value = e.isActive("heading", { level: 2 }) ? "2" : e.isActive("heading", { level: 3 }) ? "3" : e.isActive("heading", { level: 4 }) ? "4" : "p";
  const inCallout = e.isActive("callout");
  const inTable = e.isActive("table");
  els.toolbar.querySelector('[data-context="callout"]').classList.toggle("is-shown", inCallout);
  els.toolbar.querySelector('[data-context="table"]').classList.toggle("is-shown", inTable);
  if (inCallout) {
    const kind = e.getAttributes("callout").kind;
    for (const k of CALLOUT_KINDS) tb[`callout-${k.value}`].classList.toggle("is-on", k.value === kind);
  }
}

async function editLink() {
  const e = currentEditor;
  const current = e.getAttributes("link").href || "";
  const { empty } = e.state.selection;
  const fields = [{ name: "url", label: "Link to", value: current, placeholder: "https://… or /insights/another-article/", required: true }];
  if (empty && !current) fields.push({ name: "text", label: "Text to show", placeholder: "The words readers click" });
  const r = await ask({ title: current ? "Edit link" : "Add a link", fields, okLabel: current ? "Update" : "Add link",
    intro: current ? h("button", { type: "button", class: "st-chip st-chip--danger", onclick: () => { e.chain().focus().extendMarkRange("link").unsetLink().run(); document.querySelector(".st-modal-backdrop")?.remove(); } }, icon("link-slash"), " Remove link") : null });
  if (!r) return;
  let url = r.url;
  if (!/^(https?:|mailto:|tel:|\/|#)/i.test(url)) url = "https://" + url;
  if (empty && !current) e.chain().focus().insertContent({ type: "text", text: r.text || url, marks: [{ type: "link", attrs: { href: url } }] }).run();
  else e.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

async function insertLinkBlock(kind) {
  const labels = { youtube: ["YouTube video", "https://www.youtube.com/watch?v=…"], reddit: ["Reddit post", "https://www.reddit.com/r/…/comments/…"] };
  const [title, ph] = labels[kind] || ["Link preview", "https://…"];
  const r = await ask({ title: `Insert ${title.toLowerCase()}`, fields: [{ name: "url", label: "Paste the link", placeholder: ph, required: true }], okLabel: "Insert" });
  if (!r) return;
  insertUrlBlock(r.url, kind);
}

// Blocks like images and videos can't go inside a table cell: put them after the table.
function leaveTable() {
  const e = currentEditor;
  // A selected block (image, video, card…) would be replaced by the insert: go after it instead.
  const sel = e.state.selection;
  if (sel.node && !e.isActive("table")) {
    const after = sel.to;
    e.chain().focus().insertContentAt(after, { type: "paragraph" }).setTextSelection(after + 1).run();
    return;
  }
  if (!e.isActive("table")) return;
  const { $from } = e.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "table") {
      const after = $from.after(d);
      e.chain().focus().insertContentAt(after, { type: "paragraph" }).setTextSelection(after + 1).run();
      return;
    }
  }
}

function insertUrlBlock(url, force) {
  const kind = force || classifyUrl(url);
  leaveTable();
  const chain = currentEditor.chain().focus();
  if (kind === "youtube") {
    if (!chain.setYoutubeVideo({ src: url }).run()) toast("That doesn't look like a YouTube video link.", { type: "error" });
  } else if (kind === "reddit") chain.insertContent({ type: "redditEmbed", attrs: { url } }).run();
  else chain.insertContent({ type: "linkCard", attrs: { url } }).run();
}

async function insertImage() {
  const r = await chooseImage({ title: "Add an image" });
  if (r) leaveTable();
  if (r) currentEditor.chain().focus().insertContent({ type: "figure", attrs: { src: r.src, alt: r.alt || "" } }).run();
}

async function insertDownload() {
  const f = await pickFile("*/*");
  if (!f) return;
  if (f.size > 24 * 1024 * 1024) return toast("Files must be under 24 MB.", { type: "error" });
  const ext = (f.name.split(".").pop() || "file").toLowerCase();
  leaveTable();
  const href = trackBlob(f, f.name.replace(/\.[a-z0-9]+$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "file", ext);
  currentEditor.chain().focus().insertContent({ type: "fileCard", attrs: { href, name: f.name, size: String(f.size) } }).run();
}

function handlePaste(event) {
  const files = [...(event.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
  if (files.length && !event.clipboardData.getData("text/html")) {
    event.preventDefault();
    insertFiles(files);
    return true;
  }
  const text = (event.clipboardData?.getData("text/plain") || "").trim();
  const { $from, empty } = currentEditor.state.selection;
  if (empty && /^https?:\/\/\S+$/.test(text) && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0) {
    event.preventDefault();
    insertUrlBlock(text);
    toast(`Turned the link into ${{ link: "a preview card", youtube: "a video player", reddit: "an embedded Reddit post" }[classifyUrl(text)]}. Press Ctrl+Z to keep it as plain text.`);
    return true;
  }
  return false;
}

function handleDrop(event) {
  const files = [...(event.dataTransfer?.files || [])];
  if (!files.length) return false;
  event.preventDefault();
  const pos = currentEditor.view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (pos) currentEditor.commands.setTextSelection(pos.pos);
  const docx = files.find((f) => /\.docx$/i.test(f.name));
  const pdf = files.find((f) => /\.pdf$/i.test(f.name));
  if (docx) runImport(docx, "word", false);
  else if (pdf) runImport(pdf, "pdf", false);
  else insertFiles(files.filter((f) => f.type.startsWith("image/")));
  return true;
}

async function insertFiles(files) {
  if (!files.length) return;
  leaveTable();
  const b = busy("Preparing images…");
  try {
    for (const f of files) {
      const src = await prepareImage(f);
      currentEditor.chain().focus().insertContent({ type: "figure", attrs: { src, alt: "" } }).run();
    }
  } catch (e) { toast("An image couldn't be read: " + e.message, { type: "error" }); }
  finally { b.done(); }
}

// ---------- Importing ----------
async function importAtCursor(kind) {
  const file = await pickFile(kind === "word" ? ".docx" : ".pdf");
  if (file) runImport(file, kind, false);
}

async function runImport(file, kind, asNewArticle) {
  if (kind === "word") {
    if (!/\.docx$/i.test(file.name)) return toast("Please choose a .docx file. Older .doc files: open them in Word and save as .docx first.", { type: "error", timeout: 8000 });
    const b = busy("Reading the Word document…");
    let r;
    try { r = await importWord(file, (m) => b.update(m)); } catch (e) {
      b.done();
      return toast("This Word document couldn't be read: " + e.message, { type: "error" });
    }
    b.done();
    applyImport({ html: r.html, title: r.title, description: r.description, images: r.images }, asNewArticle);
    toast(`Imported "${esc(file.name)}"${r.images.length ? ` with ${r.images.length} image${r.images.length > 1 ? "s" : ""}` : ""}. Check it through, then choose a thumbnail.`, { type: "success", timeout: 7000 });
    if (asNewArticle && r.images.length && !state.data.thumbnail) chooseThumbnail();
  } else {
    const r = await pdfWorkspace(file, { mode: asNewArticle ? "new" : "insert" });
    if (!r) return;
    if (r.attach) {
      state.data.attachment = trackBlob(file, file.name.replace(/\.pdf$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "document", "pdf");
      state.data.attachment_name = file.name;
    }
    if (r.thumbnail) state.data.thumbnail = r.thumbnail;
    applyImport({ html: r.insertHtml, title: r.title, description: r.description }, asNewArticle);
    toast("PDF added. Read it through: headings and paragraphs may need small fixes.", { type: "success", timeout: 7000 });
  }
}

function applyImport({ html, title, description }, asNewArticle) {
  if (asNewArticle) {
    if (title && !state.data.title) state.data.title = title;
    if (description && !state.data.description) state.data.description = description;
    if (html) currentEditor.commands.setContent(html);
  } else if (html) {
    currentEditor.chain().focus().insertContent(html).run();
  }
  fillFields();
  markDirty();
}

// ---------- Preview ----------
function togglePreview() {
  const on = !els.shell.classList.contains("is-preview");
  els.shell.classList.toggle("is-preview", on);
  els.previewBtn.classList.toggle("is-on", on);
  els.previewBtn.querySelector("span").textContent = on ? "Back to editing" : "Preview";
  currentEditor.setEditable(!on);
  els.title.readOnly = on;
  els.lead.readOnly = on;
}

// ---------- Status, autosave backup ----------
let backupTimer;
function markDirty() {
  state.dirty = true;
  updateStatus();
  clearTimeout(backupTimer);
  backupTimer = setTimeout(writeBackup, 1500);
  if (els.kicker) { els.kicker.textContent = state.data.category || ""; els.kicker.hidden = !state.data.category; }
  updateChecks();
}

function updateStatus() {
  if (!els.status) return;
  const isNew = !state.path;
  const draft = state.data.draft;
  els.status.textContent = state.saving ? "Saving…" : state.dirty ? "Unsaved changes" : isNew ? "Not saved yet" : draft ? "Draft saved" : "Published";
  els.status.className = "st-status" + (state.dirty ? " is-dirty" : "");
  if (currentEditor) {
    const w = wordCount(currentEditor.getHTML());
    els.words.textContent = `${w} words · ${Math.max(1, Math.round(w / 220))} min read`;
  }
  els.publishBtn.replaceChildren(icon(isNew || draft ? "paper-plane" : "rotate"), h("span", {}, isNew || draft ? "Publish" : "Update"));
  els.draftBtn.replaceChildren(icon("floppy-disk"), h("span", {}, isNew || draft ? "Save draft" : "Save as draft"));
  els.draftBtn.hidden = !isNew && !draft;
}

const backupKey = () => `viko-studio-backup:${state.slug || "new"}`;
function writeBackup() {
  if (!currentEditor || !state.dirty) return;
  try { localStorage.setItem(backupKey(), JSON.stringify({ at: Date.now(), data: state.data, html: currentEditor.getHTML() })); } catch {}
}
function readBackup() {
  try { return JSON.parse(localStorage.getItem(backupKey()) || "null"); } catch { return null; }
}
function clearBackup() {
  try { localStorage.removeItem(backupKey()); localStorage.removeItem("viko-studio-backup:new"); } catch {}
}

window.addEventListener("beforeunload", (e) => {
  if (state && state.dirty && currentEditor) { writeBackup(); e.preventDefault(); e.returnValue = ""; }
});
window.addEventListener("keydown", (e) => {
  if (!currentEditor) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    save(state.path && !state.data.draft ? "publish" : "draft");
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && currentEditor.isFocused) { e.preventDefault(); editLink(); }
});

// ---------- Save / publish / delete ----------
async function save(action) {
  if (state.saving) return;
  const d = state.data;
  if (!d.title || !d.title.trim()) { toast("Give the article a title first.", { type: "error" }); els.title.focus(); return; }
  const isNew = !state.path;
  let slug = state.slug;
  if (isNew) {
    slug = state.newSlug || slugify(d.title);
    if (!slug) return toast("The web address can't be empty.", { type: "error" });
    const existing = await gh.fileSha(`${POSTS_DIR}/${slug}.md`);
    if (existing) {
      toast(`An article already uses the address /insights/${slug}/. Change the web address in the settings panel.`, { type: "error", timeout: 8000 });
      els.shell.classList.remove("no-side");
      return;
    }
  }
  if (action === "publish") {
    const missing = [];
    if (!d.description) missing.push("a description");
    if (!d.thumbnail) missing.push("a thumbnail");
    if (missing.length && !(await confirmBox({ title: "Publish anyway?", okLabel: "Publish",
      message: `This article has no ${missing.join(" or ")}. It will still look fine, but articles with both get more clicks.` }))) return;
  }

  state.saving = true;
  updateStatus();
  const b = busy("Saving…");
  try {
    const wasDraft = !!d.draft;
    const data = { ...d };
    if (action === "publish") {
      data.draft = false;
      if (state.wasPublished && data.date !== today()) data.updated = today();
    } else data.draft = true;
    if (!data.author) delete data.author;

    let html = currentEditor.getHTML();
    const plan = await planUploads(slug, [html, data.thumbnail, data.attachment]);
    html = plan.replace(html);
    data.thumbnail = plan.replace(data.thumbnail);
    if (data.attachment) data.attachment = plan.replace(data.attachment);
    const path = `${POSTS_DIR}/${slug}.md`;
    const text = serializeArticle(data, html);
    const verb = isNew ? "Add" : action === "publish" && wasDraft ? "Publish" : action === "unpublish" ? "Unpublish" : "Update";
    await gh.commit({
      files: [...plan.files, { path, base64: utf8ToBase64(text) }],
      message: `${verb} article: ${data.title}`,
      onProgress: (m) => b.update(m),
    });

    forget(plan.map);
    clearBackup();
    state.slug = slug;
    state.path = path;
    state.data = data;
    state.wasPublished = !data.draft;
    if (plan.map.size) {
      currentEditor.commands.setContent(html, { emitUpdate: false });
    }
    state.dirty = false;
    listCache = null;
    if (location.hash !== `#/edit/${encodeURIComponent(slug)}`) history.replaceState(null, "", `#/edit/${encodeURIComponent(slug)}`);
    buildSide();
    fillFields();
    state.dirty = false;
    updateStatus();
    if (data.draft) toast("Draft saved. It's not on the site until you publish it.", { type: "success" });
    else toast(`${verb === "Update" ? "Updated" : "Published"}! It will be live in about 2 minutes.`, { type: "success", timeout: 9000,
      action: { label: "Open article", href: `/insights/${slug}/`, target: "_blank" } });
  } catch (e) {
    toast(e.message, { type: "error", timeout: 10000 });
  } finally {
    b.done();
    state.saving = false;
    updateStatus();
  }
}

async function deleteArticle() {
  const ok = await confirmBox({ title: "Delete this article?", danger: true, okLabel: "Delete", typeToConfirm: "DELETE",
    message: `"${state.data.title}" and the images uploaded for it will be removed from the site. This can't be undone here (your developer can recover it from GitHub's history).` });
  if (!ok) return;
  const b = busy("Deleting…");
  try {
    const media = (await gh.listDir(`${UPLOADS_DIR}/${state.slug}`)).filter((f) => f.type === "file").map((f) => f.path);
    await gh.commit({ deletes: [state.path, ...media], message: `Delete article: ${state.data.title}`, onProgress: (m) => b.update(m) });
    clearBackup();
    state.dirty = false;
    listCache = null;
    toast("Article deleted.", { type: "success" });
    location.hash = "#/";
  } catch (e) {
    toast(e.message, { type: "error" });
  } finally { b.done(); }
}

start();
