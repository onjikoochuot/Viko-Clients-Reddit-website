// Authors: the people (or team) shown in article bylines.
// Stored in src/_data/authors.json; photos in src/media/team/.
import bundled from "../src/_data/authors.json";
import { h, icon, modal, confirmBox, toast, busy } from "./ui.js";
import { utf8ToBase64, bytesToBase64 } from "./github.js";
import { parseArticle, serializeArticle, POSTS_DIR } from "./content.js";
import { canvasToBlob, cleanName } from "./media.js";
import { cropImage, pickFile } from "./tools.js";
import { displaySrc } from "./nodes.js";

export const AUTHORS_PATH = "src/_data/authors.json";
const PHOTO_DIR = "src/media/team";
const PHOTO_SIZE = 400;

let authors = bundled.map((a) => ({ ...a }));
let loaded = false;

export const getAuthors = () => authors;
export const findAuthor = (name) => authors.find((a) => a.name === name);

export async function loadAuthors(gh, force = false) {
  if (loaded && !force) return authors;
  try {
    const f = await gh.getFile(AUTHORS_PATH);
    const list = JSON.parse(f.text);
    if (Array.isArray(list)) authors = list;
  } catch {}
  loaded = true;
  return authors;
}

export const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "V";

export function avatar(a, name, size = 44) {
  return h("span", { class: "byline-avatar", style: { width: size + "px", height: size + "px" }, "aria-hidden": "true" },
    a && a.photo ? h("img", { src: displaySrc(a.photo), alt: "" }) : initials(name || (a && a.name)));
}

// ---------- The Authors page ----------
export async function showAuthors({ gh, app, topBar, tabs, listArticles }) {
  document.title = "Authors — Viko Studio";
  const grid = h("div", { class: "st-authors" }, h("p", { class: "st-muted" }, "Loading authors…"));
  app.replaceChildren(
    topBar(),
    h("main", { class: "st-list" },
      tabs("authors"),
      h("div", { class: "st-list-head" },
        h("div", {}, h("h1", {}, "Authors"),
          h("p", { class: "st-muted" }, "The people shown under article titles. Clicking an author's name takes readers to their link.")),
        h("div", { class: "st-list-actions" },
          h("button", { class: "st-btn st-btn--primary", onclick: () => edit(null) }, icon("user-plus"), " Add author"))),
      grid));

  const render = async () => {
    let counts = {};
    try {
      for (const it of await listArticles()) {
        const n = it.data.author || "";
        counts[n] = (counts[n] || 0) + 1;
      }
    } catch {}
    grid.replaceChildren(...authors.map((a, i) => h("div", { class: "st-author-card" },
      avatar(a, a.name, 64),
      h("div", { class: "st-author-body" },
        h("h3", {}, a.name, a.team ? h("span", { class: "st-badge" }, "Team") : null),
        a.title ? h("p", {}, a.title) : h("p", { class: "st-muted" }, "No title"),
        h("p", { class: "st-small st-muted st-author-link" }, icon("link"), " ", a.link ? a.link.replace(/^https?:\/\/(www\.)?/, "") : "No link"),
        h("p", { class: "st-small st-muted" }, `${counts[a.name] || 0} article${counts[a.name] === 1 ? "" : "s"}`)),
      h("div", { class: "st-author-actions" },
        h("button", { class: "st-btn", onclick: () => edit(i) }, icon("pen"), " Edit"),
        h("button", { class: "st-btn st-btn--danger-ghost", onclick: () => remove(i, counts[a.name] || 0), title: `Remove ${a.name}` }, icon("trash-can"))))));
    if (!authors.length) grid.replaceChildren(h("p", { class: "st-muted" }, "No authors yet."));
  };

  await loadAuthors(gh, true);
  render();

  async function edit(index) {
    const old = index === null ? null : authors[index];
    const result = await authorForm(old);
    if (!result) return;
    const { data, photoBlob } = result;
    if (authors.some((a, i) => i !== index && a.name.toLowerCase() === data.name.toLowerCase()))
      return toast(`There's already an author called ${data.name}.`, { type: "error" });

    const files = [];
    const deletes = [];
    if (photoBlob) {
      const ext = photoBlob.type.includes("webp") ? "webp" : "jpg";
      const path = `${PHOTO_DIR}/${cleanName(data.name)}-${Date.now().toString(36).slice(-5)}.${ext}`;
      files.push({ path, base64: bytesToBase64(new Uint8Array(await photoBlob.arrayBuffer())) });
      data.photo = path.replace(/^src/, "");
      if (old && old.photo && ownedPhoto(old.photo)) deletes.push("src" + old.photo);
    } else if (old && old.photo && !data.photo && ownedPhoto(old.photo)) {
      deletes.push("src" + old.photo);
    }

    const next = authors.slice();
    if (index === null) next.push(data); else next[index] = data;

    // Renaming: move that author's articles to the new name so their bylines keep working.
    let renamed = 0;
    const b = busy("Saving…");
    try {
      if (old && old.name !== data.name) {
        for (const it of await listArticles()) {
          if ((it.data.author || "") !== old.name) continue;
          const f = await gh.getFile(`${POSTS_DIR}/${it.slug}.md`);
          const parsed = parseArticle(f.text);
          parsed.data.author = data.name;
          files.push({ path: `${POSTS_DIR}/${it.slug}.md`, base64: utf8ToBase64(serializeArticle(parsed.data, parsed.html)) });
          renamed++;
        }
      }
      files.push({ path: AUTHORS_PATH, base64: utf8ToBase64(JSON.stringify(next, null, 2) + "\n") });
      await gh.commit({ files, deletes, message: `${old ? "Update" : "Add"} author: ${data.name}`, onProgress: (m) => b.update && b.update(m) });
      authors = next;
      b.done();
      toast(`${data.name} saved.${renamed ? ` ${renamed} article${renamed === 1 ? "" : "s"} updated to the new name.` : ""} The site updates in a minute or two.`, { type: "success" });
      render();
    } catch (e) {
      b.done();
      toast(e.message, { type: "error" });
    }
  }

  async function remove(index, used) {
    const a = authors[index];
    const ok = await confirmBox({
      title: `Remove ${a.name}?`,
      message: used
        ? `${used} article${used === 1 ? " is" : "s are"} by ${a.name}. They'll keep the name but lose the photo and link until you choose another author for them.`
        : `${a.name} won't appear in the author list any more.`,
      okLabel: "Remove author", danger: true });
    if (!ok) return;
    const next = authors.filter((_, i) => i !== index);
    const b = busy("Removing…");
    try {
      await gh.commit({
        files: [{ path: AUTHORS_PATH, base64: utf8ToBase64(JSON.stringify(next, null, 2) + "\n") }],
        deletes: a.photo && ownedPhoto(a.photo) ? ["src" + a.photo] : [],
        message: `Remove author: ${a.name}` });
      authors = next;
      b.done();
      toast(`${a.name} removed.`, { type: "success" });
      render();
    } catch (e) {
      b.done();
      toast(e.message, { type: "error" });
    }
  }
}

// Photos added from the Studio can be replaced or deleted; the original
// founder photos (used elsewhere on the site) are never deleted.
const ownedPhoto = (p) => /^\/media\/team\//.test(p) && !/elvis-ochuot-(1200|600|360)\.webp$/.test(p);

// ---------- Add / edit form ----------
function authorForm(old) {
  return new Promise((resolve) => {
    let done = false;
    let photoBlob = null;
    let photoUrl = old && old.photo ? displaySrc(old.photo) : "";
    let keepPhoto = !!(old && old.photo);

    const name = h("input", { type: "text", required: true, placeholder: "e.g. Jane Wanjiru" });
    const title = h("input", { type: "text", placeholder: "e.g. Head of Content, Viko" });
    const link = h("input", { type: "text", placeholder: "/about/ or https://…" });
    const team = h("input", { type: "checkbox" });
    name.value = old ? old.name : "";
    title.value = old ? old.title || "" : "";
    link.value = old ? old.link || "" : "/about/";
    team.checked = !!(old && old.team);

    const preview = h("div", { class: "article-byline st-author-preview" });
    const photoBox = h("div", { class: "st-author-photo" });
    const drawPreview = () => {
      const n = name.value.trim() || "Author name";
      preview.replaceChildren(
        h("span", { class: "byline-avatar", "aria-hidden": "true" }, photoUrl ? h("img", { src: photoUrl, alt: "" }) : initials(n)),
        h("span", { class: "byline-text" },
          h("span", { class: "byline-name" }, h("strong", {}, n), title.value.trim() ? h("span", { class: "byline-role" }, " · " + title.value.trim()) : null),
          h("span", {}, "November 22, 2026 · 5 min read")));
      photoBox.replaceChildren(
        h("span", { class: "byline-avatar st-author-photo-big" }, photoUrl ? h("img", { src: photoUrl, alt: "" }) : initials(n)),
        h("div", { class: "st-author-photo-btns" },
          h("button", { type: "button", class: "st-btn", onclick: choosePhoto }, icon("camera"), photoUrl ? " Change photo" : " Upload photo"),
          photoUrl ? h("button", { type: "button", class: "st-chip st-chip--danger", onclick: () => { photoUrl = ""; photoBlob = null; keepPhoto = false; drawPreview(); } }, icon("trash-can"), " Remove") : null,
          h("small", { class: "st-muted" }, "A square, well-lit face photo works best. You can crop it after choosing.")));
    };
    [name, title].forEach((el) => el.addEventListener("input", drawPreview));

    async function choosePhoto() {
      const file = await pickFile("image/*");
      if (!file) return;
      const local = URL.createObjectURL(file);
      const cropped = await cropImage(local, { title: "Crop the photo", aspect: 1 });
      URL.revokeObjectURL(local);
      if (!cropped) return;
      const blob = await (await fetch(cropped.src)).blob();
      photoBlob = await squareWebp(blob);
      photoUrl = URL.createObjectURL(photoBlob);
      keepPhoto = false;
      drawPreview();
    }

    const field = (label, input, hint) => h("label", { class: "st-field" }, h("span", {}, label), input, hint ? h("small", {}, hint) : null);
    const body = h("form", { class: "st-form", onsubmit: (e) => { e.preventDefault(); submit(); } },
      photoBox,
      field("Full name", name),
      field("Title", title, "Shown next to the name, e.g. \"Founder, Viko\" or \"Guest writer\"."),
      field("Link", link, "Where the name goes when clicked: /about/, their website, or their LinkedIn. Leave empty for no link."),
      h("label", { class: "st-check" }, team, h("span", {}, h("strong", {}, "This is a team or company, not a person"), h("br"), h("small", { class: "st-muted" }, "Tells Google the article is by an organisation."))),
      h("div", { class: "st-field" }, h("span", {}, "How it looks under an article"), preview),
      h("button", { type: "submit", hidden: true }));
    drawPreview();

    const m = modal({
      title: old ? `Edit ${old.name}` : "Add an author",
      body,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: "Cancel", onClick: (close) => close() },
        { label: old ? "Save changes" : "Add author", primary: true, onClick: () => submit() },
      ],
    });

    function submit() {
      const n = name.value.trim();
      if (!n) { name.focus(); name.reportValidity(); return; }
      let l = link.value.trim();
      if (l && !l.startsWith("/") && !/^https?:\/\//i.test(l)) l = "https://" + l;
      const data = { name: n, title: title.value.trim(), photo: keepPhoto && old ? old.photo : "", link: l, team: team.checked };
      done = true;
      m.close();
      resolve({ data, photoBlob });
    }
  });
}

async function squareWebp(blob) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = Math.min(PHOTO_SIZE, s);
  c.getContext("2d").drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, c.width, c.height);
  return canvasToBlob(c, 0.86);
}
