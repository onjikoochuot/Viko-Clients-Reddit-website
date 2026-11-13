// Custom blocks for the article editor. Each one saves to the same HTML the
// site's article page understands (see lib/enhance-article.js and article.css).
import { Node, mergeAttributes } from "@tiptap/core";
import { h, icon } from "./ui.js";

// Images already on the site are shown from GitHub, so newly uploaded ones
// appear immediately, before the site has finished rebuilding.
let rawBase = "";
export function setRawBase(base) { rawBase = base; }
export function displaySrc(src) {
  if (src && src.startsWith("/media/") && rawBase) return rawBase + "/src" + src;
  return src;
}

// Hooks the main app provides (crop, replace, choose as thumbnail).
export const hooks = { onCrop: null, onUseAsThumbnail: null, onReplace: null };

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

// Shared bits for node views with form fields inside them.
function blockView(node, getPos, editor, build) {
  const dom = h("div", { class: "st-block", contenteditable: "false", draggable: "true", "data-drag-handle": "" });
  let current = node;
  const api = {
    attrs: () => current.attrs,
    set: (attrs) => {
      const pos = getPos();
      if (typeof pos !== "number") return;
      editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }); return true; }).run();
    },
    remove: () => {
      const pos = getPos();
      if (typeof pos !== "number") return;
      editor.chain().focus().command(({ tr }) => { tr.delete(pos, pos + current.nodeSize); return true; }).run();
    },
  };
  const render = build(dom, api);
  render(node);
  return {
    dom,
    update(n) {
      if (n.type !== current.type) return false;
      current = n;
      render(n);
      return true;
    },
    selectNode() { dom.classList.add("is-selected"); },
    deselectNode() { dom.classList.remove("is-selected"); },
    stopEvent(e) {
      const t = e.target;
      return !!(t && t.closest && t.closest("input, textarea, select, button, .st-block-tools"));
    },
    ignoreMutation() { return true; },
  };
}

function toolButton(label, iconName, onClick, extra = {}) {
  return h("button", { type: "button", class: "st-chip", title: label, onmousedown: (e) => e.preventDefault(), onclick: onClick, ...extra },
    icon(iconName), h("span", {}, label));
}

// ---------- Figure: image + caption, three widths ----------
export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      caption: { default: "" },
      size: { default: "normal" }, // small | normal | wide
    };
  },
  parseHTML() {
    return [
      {
        tag: "figure",
        priority: 1100,
        getAttrs: (el) => {
          const img = el.querySelector("img");
          if (!img) return false;
          const cls = el.getAttribute("class") || "";
          return {
            src: img.getAttribute("src") || "",
            alt: img.getAttribute("alt") || "",
            caption: (el.querySelector("figcaption") || {}).textContent || "",
            size: cls.includes("fig--wide") ? "wide" : cls.includes("fig--small") ? "small" : "normal",
          };
        },
      },
      {
        tag: "img[src]",
        getAttrs: (el) => (el.closest && el.closest("a.link-card") ? false : { src: el.getAttribute("src"), alt: el.getAttribute("alt") || "", caption: el.getAttribute("title") || "" }),
      },
    ];
  },
  renderHTML({ node }) {
    const { src, alt, caption, size } = node.attrs;
    const cls = size === "wide" ? "fig--wide" : size === "small" ? "fig--small" : null;
    const kids = [["img", { src, alt }]];
    if (caption) kids.push(["figcaption", {}, caption]);
    return ["figure", cls ? { class: cls } : {}, ...kids];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => blockView(node, getPos, editor, (dom, api) => {
      dom.classList.add("st-figure");
      const img = h("img", { alt: "" });
      const caption = h("input", { class: "st-caption", type: "text", placeholder: "Add a caption (optional)" });
      const alt = h("input", { class: "st-alt", type: "text", placeholder: "Describe the image for Google and screen readers" });
      caption.addEventListener("input", () => api.set({ caption: caption.value }));
      alt.addEventListener("input", () => api.set({ alt: alt.value }));
      const sizes = ["small", "normal", "wide"].map((s) => toolButton(s === "normal" ? "Normal" : s === "wide" ? "Wide" : "Small",
        s === "wide" ? "arrows-left-right" : s === "small" ? "compress" : "image", () => api.set({ size: s }), { "data-size": s }));
      const tools = h("div", { class: "st-block-tools" },
        h("div", { class: "st-chip-group" }, sizes),
        toolButton("Crop", "crop", () => hooks.onCrop && hooks.onCrop(api.attrs().src, (newSrc) => api.set({ src: newSrc }))),
        toolButton("Replace", "arrow-right-arrow-left", () => hooks.onReplace && hooks.onReplace((newSrc) => api.set({ src: newSrc }))),
        toolButton("Use as thumbnail", "star", () => hooks.onUseAsThumbnail && hooks.onUseAsThumbnail(api.attrs().src, api.attrs().alt)),
        toolButton("Remove", "trash-can", () => api.remove(), { class: "st-chip st-chip--danger" }));
      dom.append(tools, h("div", { class: "st-figure-frame" }, img), caption, alt);
      return (n) => {
        const a = n.attrs;
        dom.dataset.size = a.size;
        const shown = displaySrc(a.src);
        if (img.getAttribute("src") !== shown) img.setAttribute("src", shown);
        if (document.activeElement !== caption) caption.value = a.caption || "";
        if (document.activeElement !== alt) alt.value = a.alt || "";
        sizes.forEach((b) => b.classList.toggle("is-on", b.dataset.size === a.size));
      };
    });
  },
});

// ---------- Callout box ----------
export const CALLOUT_KINDS = [
  { value: "info", label: "Tip", icon: "circle-info" },
  { value: "key", label: "Key point", icon: "star" },
  { value: "warning", label: "Warning", icon: "triangle-exclamation" },
];

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { kind: { default: "info" } };
  },
  parseHTML() {
    return [{
      tag: "div.callout",
      getAttrs: (el) => {
        const m = (el.getAttribute("class") || "").match(/callout--(\w+)/);
        return { kind: m ? m[1] : "info" };
      },
    }];
  },
  renderHTML({ node }) {
    return ["div", { class: `callout callout--${node.attrs.kind}` }, 0];
  },
  addCommands() {
    return {
      toggleCallout: (kind = "info") => ({ commands, editor }) => {
        if (editor.isActive("callout")) {
          if (editor.getAttributes("callout").kind !== kind) return commands.updateAttributes("callout", { kind });
          return commands.lift("callout");
        }
        return commands.wrapIn("callout", { kind });
      },
    };
  },
});

// ---------- Link card (preview filled in when the site builds) ----------
export const LinkCard = Node.create({
  name: "linkCard",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { url: { default: "" }, title: { default: "" }, description: { default: "" }, image: { default: "" } };
  },
  parseHTML() {
    const get = (el) => ({
      url: el.getAttribute("data-url") || el.getAttribute("href") || "",
      title: el.getAttribute("data-title") || "",
      description: el.getAttribute("data-description") || "",
      image: el.getAttribute("data-image") || "",
    });
    return [{ tag: "div.link-card[data-url]", getAttrs: get, priority: 1100 }, { tag: "a.link-card[data-url]", getAttrs: get, priority: 60 }];
  },
  renderHTML({ node }) {
    const { url, title, description, image } = node.attrs;
    const attrs = { class: "link-card", "data-url": url };
    if (title) attrs["data-title"] = title;
    if (description) attrs["data-description"] = description;
    if (image) attrs["data-image"] = image;
    return ["div", attrs, ["a", { href: url }, title || url]];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => blockView(node, getPos, editor, (dom, api) => {
      dom.classList.add("st-linkcard");
      const fav = h("img", { class: "st-fav", alt: "", width: 16, height: 16 });
      const host = h("span", { class: "st-linkcard-host" });
      const title = h("input", { type: "text", class: "st-linkcard-title", placeholder: "Title (filled in automatically when published)" });
      const desc = h("textarea", { rows: 2, class: "st-linkcard-desc", placeholder: "Description (filled in automatically when published)" });
      const url = h("a", { class: "st-linkcard-url", target: "_blank", rel: "noopener" });
      title.addEventListener("input", () => api.set({ title: title.value }));
      desc.addEventListener("input", () => api.set({ description: desc.value }));
      const tools = h("div", { class: "st-block-tools" },
        h("span", { class: "st-block-label" }, icon("link"), " Link preview"),
        toolButton("Make plain link", "font", () => {
          const pos = getPos();
          const { url: u, title: t } = api.attrs();
          editor.chain().focus().command(({ tr, state }) => {
            const p = state.schema.nodes.paragraph.create(null, state.schema.text(t || u, [state.schema.marks.link.create({ href: u })]));
            tr.replaceWith(pos, pos + node.nodeSize, p);
            return true;
          }).run();
        }),
        toolButton("Remove", "trash-can", () => api.remove(), { class: "st-chip st-chip--danger" }));
      dom.append(tools, h("div", { class: "st-linkcard-box" },
        h("div", { class: "st-linkcard-site" }, fav, host), title, desc, url));
      return (n) => {
        const a = n.attrs;
        const hn = hostOf(a.url);
        host.textContent = hn;
        fav.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hn)}&sz=32`;
        url.href = a.url;
        url.textContent = a.url;
        if (document.activeElement !== title) title.value = a.title || "";
        if (document.activeElement !== desc) desc.value = a.description || "";
      };
    });
  },
});

// ---------- Embedded Reddit post ----------
export const RedditEmbed = Node.create({
  name: "redditEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { url: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div.embed--reddit[data-url]", getAttrs: (el) => ({ url: el.getAttribute("data-url") }), priority: 1100 }];
  },
  renderHTML({ node }) {
    return ["div", { class: "embed embed--reddit", "data-url": node.attrs.url }, ["a", { href: node.attrs.url }, "View on Reddit"]];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => blockView(node, getPos, editor, (dom, api) => {
      dom.classList.add("st-embed");
      const link = h("a", { target: "_blank", rel: "noopener" });
      dom.append(
        h("div", { class: "st-block-tools" },
          h("span", { class: "st-block-label" }, h("i", { class: "fab fa-reddit-alien" }), " Reddit post"),
          toolButton("Show as link card", "link", () => {
            const pos = getPos();
            editor.chain().focus().command(({ tr, state }) => {
              tr.replaceWith(pos, pos + node.nodeSize, state.schema.nodes.linkCard.create({ url: api.attrs().url }));
              return true;
            }).run();
          }),
          toolButton("Remove", "trash-can", () => api.remove(), { class: "st-chip st-chip--danger" })),
        h("div", { class: "st-embed-box" }, h("i", { class: "fab fa-reddit-alien st-embed-logo" }),
          h("div", {}, h("strong", {}, "The full Reddit post appears here on the live article."), link)));
      return (n) => { link.href = n.attrs.url; link.textContent = n.attrs.url; };
    });
  },
});

// ---------- Downloadable file ----------
export const FileCard = Node.create({
  name: "fileCard",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { href: { default: "" }, name: { default: "" }, size: { default: "" } };
  },
  parseHTML() {
    return [{
      tag: "div.file-card[data-href]",
      priority: 1100,
      getAttrs: (el) => ({ href: el.getAttribute("data-href"), name: el.getAttribute("data-name") || "", size: el.getAttribute("data-size") || "" }),
    }];
  },
  renderHTML({ node }) {
    const { href, name, size } = node.attrs;
    return ["div", mergeAttributes({ class: "file-card", "data-href": href, "data-name": name }, size ? { "data-size": String(size) } : {}),
      ["a", { href }, name || "Download"]];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => blockView(node, getPos, editor, (dom, api) => {
      dom.classList.add("st-filecard");
      const ext = h("span", { class: "st-file-ext" });
      const name = h("input", { type: "text", placeholder: "File name shown to readers" });
      name.addEventListener("input", () => api.set({ name: name.value }));
      dom.append(
        h("div", { class: "st-block-tools" },
          h("span", { class: "st-block-label" }, icon("file-arrow-down"), " Download"),
          toolButton("Remove", "trash-can", () => api.remove(), { class: "st-chip st-chip--danger" })),
        h("div", { class: "st-file-box" }, ext, name));
      return (n) => {
        const href = n.attrs.href || "";
        ext.textContent = (n.attrs.name.split(".").pop() || href.split(".").pop() || "file").toUpperCase().slice(0, 4);
        if (document.activeElement !== name) name.value = n.attrs.name || "";
      };
    });
  },
});

// ---------- Call-to-action button ----------
export const CtaButton = Node.create({
  name: "ctaButton",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { href: { default: "/#booking" }, label: { default: "Book a strategy call" } };
  },
  parseHTML() {
    const get = (el) => {
      const a = el.querySelector("a");
      return a ? { href: a.getAttribute("href"), label: a.textContent.trim() } : false;
    };
    return [{ tag: "div.article-cta", getAttrs: get, priority: 1100 }, { tag: "p.article-cta", getAttrs: get, priority: 1100 }];
  },
  renderHTML({ node }) {
    return ["div", { class: "article-cta" }, ["a", { class: "btn btn-primary btn-lg", href: node.attrs.href }, node.attrs.label]];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => blockView(node, getPos, editor, (dom, api) => {
      dom.classList.add("st-cta");
      const label = h("input", { type: "text", placeholder: "Button text" });
      const href = h("input", { type: "text", placeholder: "Where it goes, e.g. /#booking or https://…" });
      label.addEventListener("input", () => api.set({ label: label.value }));
      href.addEventListener("input", () => api.set({ href: href.value }));
      dom.append(
        h("div", { class: "st-block-tools" },
          h("span", { class: "st-block-label" }, icon("hand-pointer"), " Button"),
          toolButton("Remove", "trash-can", () => api.remove(), { class: "st-chip st-chip--danger" })),
        h("div", { class: "st-cta-box" }, label, href));
      return (n) => {
        if (document.activeElement !== label) label.value = n.attrs.label;
        if (document.activeElement !== href) href.value = n.attrs.href;
      };
    });
  },
});
