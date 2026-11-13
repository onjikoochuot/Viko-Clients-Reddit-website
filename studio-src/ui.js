// Small UI helpers: element builder, modals, toasts, confirm/ask dialogs.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function icon(name, extra = "") {
  return h("i", { class: `fas fa-${name} ${extra}`.trim(), "aria-hidden": "true" });
}

// ---------- Modal ----------
export function modal({ title, body, actions = [], wide = false, onClose, className = "" }) {
  const backdrop = h("div", { class: "st-modal-backdrop" });
  const box = h("div", { class: `st-modal ${wide ? "st-modal--wide" : ""} ${className}`, role: "dialog", "aria-modal": "true", "aria-label": title });
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const head = h("div", { class: "st-modal-head" }, h("h2", {}, title), h("button", { class: "st-icon-btn", type: "button", "aria-label": "Close", onclick: close }, icon("xmark")));
  const content = h("div", { class: "st-modal-body" }, body);
  const foot = actions.length ? h("div", { class: "st-modal-foot" }, actions.map((a) =>
    h("button", { type: "button", class: `st-btn ${a.primary ? "st-btn--primary" : ""} ${a.danger ? "st-btn--danger" : ""}`, onclick: () => a.onClick(close) }, a.label))) : null;
  box.append(head, content);
  if (foot) box.append(foot);
  backdrop.append(box);
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", onKey);
  document.body.append(backdrop);
  const first = box.querySelector("input, textarea, select");
  if (first) setTimeout(() => first.focus(), 30);
  return { close, box, content };
}

// Ask for one or more values. Resolves to an object, or null when cancelled.
export function ask({ title, fields, okLabel = "OK", intro }) {
  return new Promise((resolve) => {
    let done = false;
    const inputs = {};
    const body = h("form", { class: "st-form", onsubmit: (e) => { e.preventDefault(); submit(); } },
      intro ? h("p", { class: "st-muted" }, intro) : null,
      fields.map((f) => {
        let input;
        if (f.type === "select") {
          input = h("select", { name: f.name }, f.options.map((o) => h("option", { value: o.value, selected: o.value === f.value }, o.label)));
        } else if (f.type === "textarea") {
          input = h("textarea", { name: f.name, rows: 3, placeholder: f.placeholder || "" });
          input.value = f.value || "";
        } else {
          input = h("input", { name: f.name, type: f.type || "text", placeholder: f.placeholder || "", required: f.required });
          input.value = f.value || "";
        }
        inputs[f.name] = input;
        return h("label", { class: "st-field" }, h("span", {}, f.label), input, f.hint ? h("small", {}, f.hint) : null);
      }),
      h("button", { type: "submit", hidden: true }));
    const m = modal({
      title,
      body,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: "Cancel", onClick: (close) => close() },
        { label: okLabel, primary: true, onClick: () => submit() },
      ],
    });
    function submit() {
      const out = {};
      for (const [k, el] of Object.entries(inputs)) out[k] = el.value.trim();
      const missing = fields.find((f) => f.required && !out[f.name]);
      if (missing) { inputs[missing.name].focus(); inputs[missing.name].reportValidity && inputs[missing.name].reportValidity(); return; }
      done = true;
      m.close();
      resolve(out);
    }
  });
}

export function confirmBox({ title, message, okLabel = "Continue", danger = false, typeToConfirm }) {
  return new Promise((resolve) => {
    let done = false;
    const input = typeToConfirm ? h("input", { type: "text", placeholder: typeToConfirm, autocomplete: "off" }) : null;
    const m = modal({
      title,
      body: h("div", { class: "st-form" }, h("p", {}, message),
        input ? h("label", { class: "st-field" }, h("span", {}, `Type ${typeToConfirm} to confirm`), input) : null),
      onClose: () => { if (!done) resolve(false); },
      actions: [
        { label: "Cancel", onClick: (close) => close() },
        { label: okLabel, primary: !danger, danger, onClick: (close) => {
          if (input && input.value.trim().toUpperCase() !== typeToConfirm) { input.focus(); return; }
          done = true; close(); resolve(true);
        } },
      ],
    });
  });
}

// ---------- Toasts ----------
let toastHost;
export function toast(message, { type = "info", timeout = 4500, action } = {}) {
  if (!toastHost) { toastHost = h("div", { class: "st-toasts", role: "status", "aria-live": "polite" }); document.body.append(toastHost); }
  const t = h("div", { class: `st-toast st-toast--${type}` }, h("span", { html: message }),
    action ? h("a", { href: action.href, target: action.target || "_self", class: "st-toast-action" }, action.label) : null,
    h("button", { type: "button", class: "st-icon-btn", "aria-label": "Dismiss", onclick: () => t.remove() }, icon("xmark")));
  toastHost.append(t);
  if (timeout) setTimeout(() => t.remove(), timeout);
  return t;
}

export function busy(message) {
  const el = h("div", { class: "st-busy" }, h("div", { class: "st-busy-box" }, h("span", { class: "st-spinner" }), h("span", { class: "st-busy-text" }, message)));
  document.body.append(el);
  return {
    update: (msg) => { el.querySelector(".st-busy-text").textContent = msg; },
    done: () => el.remove(),
  };
}

export function formatDate(d) {
  if (!d) return "";
  const date = new Date(d + (String(d).length === 10 ? "T00:00:00Z" : ""));
  if (isNaN(date)) return String(d);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function slugify(text) {
  return String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70).replace(/-$/, "");
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
