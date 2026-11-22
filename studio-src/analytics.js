// Analytics tab: visitors and enquiry actions from Google Analytics.
// Data comes from the hourly "Refresh analytics" GitHub Action, which stores an
// encrypted summary on the analytics-data branch. The password stays in this browser.
import { h, icon, toast } from "./ui.js";
import PACKAGES from "../src/_data/packages.json";

const DATA_BRANCH = "analytics-data";
const DATA_PATH = "analytics/summary.enc.json";
const WORKFLOW = "analytics.yml";
const PASS_KEY = "viko-analytics-pass";
const ACCENT = "#c4421f";

const EVENT_LABELS = {
  generate_lead: "Enquiries (forms + calls)",
  whatsapp_click: "WhatsApp clicks",
  book_call_click: "Book-a-call clicks",
  select_package: "\"Book this package\" clicks",
  upwork_click: "Upwork profile clicks",
  email_click: "Email clicks",
};
const LOCATION_LABELS = { header: "Top menu", mobile_bar: "Phone bottom bar", footer: "Footer", article: "Inside an article", page: "Page body" };
const nf = new Intl.NumberFormat("en-US");
const fmt = (n) => nf.format(Math.round(n || 0));

let cache = null; // decrypted summary

export async function showAnalytics({ gh, app, topBar, tabs }) {
  document.title = "Analytics — Viko Studio";
  const body = h("div", { class: "st-an" }, h("p", { class: "st-muted" }, "Loading analytics…"));
  app.replaceChildren(topBar(), h("main", { class: "st-list" }, tabs("analytics"),
    h("div", { class: "st-list-head" },
      h("div", {}, h("h1", {}, "Analytics"),
        h("p", { class: "st-muted" }, "Visitors and the clicks that lead to enquiries. Refreshed every hour from Google Analytics."))),
    body));

  let file;
  try {
    file = JSON.parse((await gh.getFile(DATA_PATH, DATA_BRANCH)).text);
  } catch (e) {
    if (e.status === 404) return body.replaceChildren(setupCard(gh));
    return body.replaceChildren(h("p", { class: "st-error" }, e.message));
  }

  const unlock = async (pass, remember) => {
    try {
      cache = await decrypt(file, pass);
      if (remember) { try { localStorage.setItem(PASS_KEY, pass); } catch {} }
      render(body, cache, gh, file);
    } catch {
      try { localStorage.removeItem(PASS_KEY); } catch {}
      body.replaceChildren(passwordCard(unlock, "That password didn't work. Use the ANALYTICS_PASSWORD you saved in GitHub."));
    }
  };
  let saved = null;
  try { saved = localStorage.getItem(PASS_KEY); } catch {}
  if (saved) unlock(saved, false); else body.replaceChildren(passwordCard(unlock));
}

// ---------- Crypto (matches lib/ga-report.mjs) ----------
async function decrypt(file, password) {
  const b = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b(file.salt), iterations: 200000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b(file.iv) }, key, b(file.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

function passwordCard(unlock, error) {
  const input = h("input", { type: "password", placeholder: "Analytics password", autocomplete: "off" });
  const remember = h("input", { type: "checkbox", checked: true });
  return h("form", { class: "st-an-card st-an-gate", onsubmit: (e) => { e.preventDefault(); if (input.value) unlock(input.value, remember.checked); } },
    h("h2", {}, icon("lock"), " Enter your analytics password"),
    h("p", { class: "st-muted" }, "Your website code is public on GitHub, so the numbers are stored locked. This is the ANALYTICS_PASSWORD you added in GitHub's secrets."),
    error ? h("p", { class: "st-error" }, error) : null,
    input,
    h("label", { class: "st-check" }, remember, h("span", {}, "Remember on this computer")),
    h("button", { class: "st-btn st-btn--primary", type: "submit" }, "Show analytics"));
}

function setupCard(gh) {
  return h("div", { class: "st-an-card" },
    h("h2", {}, "Connect Google Analytics"),
    h("p", {}, "The Analytics tab fills in once the hourly refresh job has run for the first time. It needs one secret in GitHub (Settings → Secrets and variables → Actions):"),
    h("ul", {}, h("li", {}, h("strong", {}, "ANALYTICS_PASSWORD"), ": any password you choose. You'll type it here once.")),
    h("p", {}, "Then run the job once: GitHub → Actions → Refresh analytics → Run workflow. After that it refreshes every hour by itself."),
    runButton(gh));
}

function runButton(gh, label = "Refresh now") {
  return h("button", { class: "st-btn", onclick: async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await gh.runWorkflow(WORKFLOW);
      toast("Refresh started. New numbers appear in about 2 minutes; reload this page then.", { type: "success" });
    } catch (err) {
      toast(err.status === 403 || err.status === 404
        ? "Your Studio token can't start the refresh. It still runs every hour by itself, or start it in GitHub → Actions → Refresh analytics."
        : err.message, { type: "error", timeout: 9000 });
    } finally { btn.disabled = false; }
  } }, icon("rotate"), " " + label);
}

// ---------- Dashboard ----------
function render(body, d, gh, file) {
  let days = "28";
  const rangeBtns = ["7", "28", "90"].map((r) => h("button", { type: "button", class: "st-chip" + (r === days ? " is-on" : ""),
    onclick: () => { days = r; rangeBtns.forEach((b) => b.classList.toggle("is-on", b.dataset.r === r)); draw(); }, "data-r": r }, `Last ${r} days`));
  const updated = new Date(file.generatedAt || d.generatedAt);
  const ago = Math.max(0, Math.round((Date.now() - updated) / 60000));
  const agoText = ago < 60 ? `${ago} min ago` : ago < 1440 ? `${Math.round(ago / 60)} h ago` : updated.toLocaleString();
  const content = h("div", { class: "st-an-content" });
  body.replaceChildren(
    h("div", { class: "st-an-bar" },
      h("div", { class: "st-chip-group", role: "group", "aria-label": "Time range" }, rangeBtns),
      h("div", { class: "st-an-bar-right" },
        h("span", { class: "st-muted st-small" }, `Updated ${agoText}`),
        runButton(gh),
        h("button", { class: "st-btn st-btn--ghost", title: "Forget the password on this computer",
          onclick: () => { try { localStorage.removeItem(PASS_KEY); } catch {} location.reload(); } }, icon("lock")))),
    content);

  function draw() {
    const r = d.ranges[days] || {};
    const since = isoDaysAgo(Number(days) - 1);
    const daily = fillDays(d.daily || [], Number(days)).map((x) => ({ ...x, users: x.users || 0 }));
    const evs = (d.dailyEvents || []).filter((e) => toIso(e.date) >= since);
    const total = (name) => evs.filter((e) => e.event === name).reduce((s, e) => s + e.count, 0);
    const actionsByDay = fillDays(Object.values(evs.filter((e) => e.event !== "generate_lead").reduce((m, e) => {
      (m[e.date] ||= { date: e.date, count: 0 }).count += e.count; return m;
    }, {})), Number(days), "count");
    const [users, sessions, views, avgDur] = r.totals || [0, 0, 0, 0];

    content.replaceChildren(
      h("div", { class: "st-an-tiles" },
        tile("Visitors", fmt(users), `${fmt(sessions)} visits · ${fmt(views)} page views`),
        tile("Enquiries", fmt(total("generate_lead")), "Forms sent and calls booked", true),
        tile("WhatsApp clicks", fmt(total("whatsapp_click"))),
        tile("Book-a-call clicks", fmt(total("book_call_click"))),
        tile("Package clicks", fmt(total("select_package"))),
        d.realtime ? tile("On the site now", fmt(d.realtime.activeUsers), "Last 30 minutes") : tile("Avg. visit", `${Math.round((avgDur || 0) / 60)}m ${Math.round((avgDur || 0) % 60)}s`)),
      h("div", { class: "st-an-grid" },
        panel("Visitors per day", lineChart(daily, "users", "visitors"), "wide"),
        panel("Enquiry actions", barList(d.events.map((e) => [EVENT_LABELS[e] || e, total(e)]), "clicks")),
        panel("Enquiry clicks per day", columnChart(actionsByDay, "count", "clicks"), null, "WhatsApp, call, package, Upwork and email clicks."),
        panel("Top pages", table(["Page", "Views", "Visitors"], (r.pages || []).map(([p, t, v, u]) => [pageCell(p, t), fmt(v), fmt(u)]))),
        panel("Pages where people clicked to get in touch", table(["Page", "Clicks"], (r.leadPages || []).map(([p, c]) => [pageCell(p), fmt(c)]))),
        panel("Where visitors came from", barList((r.sources || []).map(([s, n]) => [sourceName(s), n]), "visits")),
        panel("Countries", barList((r.countries || []).map(([c, n]) => [c || "Unknown", n]), "visitors")),
        panel("Packages people picked", r.packages ? barList(r.packages.map(([p, n]) => [p === "(not set)" ? "Not recorded" : (PACKAGES.find((k) => k.id === p) || {}).title || p, n]), "clicks")
          : needsDimension("package_id")),
        panel("Where on the page clicks happen", r.locations ? table(["Action", "Place", "Clicks"],
          r.locations.filter(([, l]) => l && l !== "(not set)").map(([e, l, n]) => [EVENT_LABELS[e] || e, LOCATION_LABELS[l] || l, fmt(n)]), 2)
          : needsDimension("location"))));
  }
  draw();
}

function tile(label, value, sub, hero) {
  return h("div", { class: "st-an-tile" + (hero ? " is-hero" : "") }, h("div", { class: "st-an-tile-label" }, label),
    h("div", { class: "st-an-tile-value" }, value), sub ? h("div", { class: "st-an-tile-sub" }, sub) : null);
}
function panel(title, content, size, note) {
  return h("section", { class: "st-an-panel" + (size === "wide" ? " is-wide" : "") }, h("h3", {}, title), note ? h("p", { class: "st-muted st-small" }, note) : null, content);
}
function needsDimension(name) {
  return h("p", { class: "st-muted st-small" }, `To see this, add a custom dimension in Google Analytics: Admin → Custom definitions → Create custom dimension, scope "Event", event parameter "${name}". It fills in from then on.`);
}
function pageCell(path, title) {
  return h("span", { class: "st-an-page" }, title ? h("strong", {}, title.replace(/\s+[—|-]\s+Viko.*$/, "")) : null, h("span", { class: "st-muted" }, path));
}
function sourceName(s) {
  const map = { "(direct)": "Direct (typed or bookmarked)", google: "Google", bing: "Bing", "chatgpt.com": "ChatGPT", "perplexity.ai": "Perplexity",
    "reddit.com": "Reddit", "www.reddit.com": "Reddit", "linkedin.com": "LinkedIn", "lnkd.in": "LinkedIn", "upwork.com": "Upwork", "www.upwork.com": "Upwork" };
  return map[s] || s;
}

function table(head, rows, textCols = 1) {
  if (!rows.length) return h("p", { class: "st-muted st-small" }, "No data yet for this period.");
  const cls = (i) => (i >= textCols ? "num" : "");
  return h("table", { class: "st-an-table" }, h("thead", {}, h("tr", {}, head.map((x, i) => h("th", { class: cls(i) }, x)))),
    h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c, i) => h("td", { class: cls(i) }, c))))));
}

function barList(items, unit) {
  const rows = items.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return h("p", { class: "st-muted st-small" }, "No data yet for this period.");
  const max = Math.max(...rows.map(([, n]) => n));
  return h("div", { class: "st-an-bars" }, rows.map(([label, n]) => h("div", { class: "st-an-barrow", title: `${label}: ${fmt(n)} ${unit}` },
    h("span", { class: "st-an-barlabel" }, label),
    h("span", { class: "st-an-bartrack" }, h("span", { class: "st-an-barfill", style: { width: `${Math.max(2, (n / max) * 100)}%` } })),
    h("span", { class: "st-an-barval" }, fmt(n)))));
}

// ---------- SVG charts ----------
const SVGNS = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };

function frame(points, key, W = 760) {
  const H = W > 900 ? 260 : 240, L = 40, R = 28, T = 12, B = 28;
  const max = niceMax(Math.max(1, ...points.map((p) => p[key])));
  const x = (i) => L + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - L - R));
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "st-an-svg", role: "img" });
  for (const t of [0, 0.5, 1]) {
    const v = max * t;
    svg.append(s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "st-an-grid" }), s("text", { x: L - 8, y: y(v) + 4, class: "st-an-axis", "text-anchor": "end" }, fmt(v)));
  }
  const step = Math.ceil(points.length / 6);
  points.forEach((p, i) => {
    const last = i === points.length - 1;
    if ((i % step === 0 && points.length - 1 - i >= step / 2) || last)
      svg.append(s("text", { x: x(i), y: H - 8, class: "st-an-axis", "text-anchor": last ? "end" : i === 0 ? "start" : "middle" }, shortDate(p.date)));
  });
  return { svg, x, y, W, H, L, R, T, B };
}

function withTooltip(wrap, svg, points, key, unit, xAt, onMove, W = 760) {
  const tip = h("div", { class: "st-an-tip", hidden: true });
  wrap.append(tip);
  const hit = s("rect", { x: 0, y: 0, width: "100%", height: "100%", fill: "transparent" });
  svg.append(hit);
  const move = (e) => {
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let i = 0, best = Infinity;
    points.forEach((_, j) => { const dx = Math.abs(xAt(j) - px); if (dx < best) { best = dx; i = j; } });
    onMove(i);
    tip.hidden = false;
    tip.replaceChildren(h("strong", {}, fmt(points[i][key])), ` ${unit}`, h("br"), h("span", {}, longDate(points[i].date)));
    const left = (xAt(i) / W) * box.width;
    tip.style.left = `${Math.min(box.width - 140, Math.max(0, left - 60))}px`;
  };
  svg.addEventListener("mousemove", move);
  svg.addEventListener("mouseleave", () => { tip.hidden = true; onMove(-1); });
}

function lineChart(points, key, unit) {
  if (!points.some((p) => p[key])) return h("p", { class: "st-muted st-small" }, "No visitors recorded yet for this period.");
  const W = 1160;
  const { svg, x, y, H, T, B } = frame(points, key, W);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  svg.append(s("path", { d: `${d}L${x(points.length - 1)},${H - B}L${x(0)},${H - B}Z`, fill: ACCENT, "fill-opacity": "0.08" }),
    s("path", { d, fill: "none", stroke: ACCENT, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  const cross = s("line", { y1: T, y2: H - B, class: "st-an-cross", visibility: "hidden" });
  const dot = s("circle", { r: 4.5, fill: ACCENT, stroke: "#fff", "stroke-width": 2, visibility: "hidden" });
  svg.append(cross, dot);
  const wrap = h("div", { class: "st-an-chart" }, svg);
  withTooltip(wrap, svg, points, key, unit, x, (i) => {
    const vis = i < 0 ? "hidden" : "visible";
    cross.setAttribute("visibility", vis); dot.setAttribute("visibility", vis);
    if (i >= 0) { cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(points[i][key])); }
  }, W);
  return wrap;
}

function columnChart(points, key, unit) {
  if (!points.some((p) => p[key])) return h("p", { class: "st-muted st-small" }, "No clicks recorded yet for this period.");
  const { svg, x, y, W, L, R, H, B } = frame(points, key, 560);
  const bw = Math.max(2, Math.min(22, ((W - L - R) / points.length) - 2));
  const bars = points.map((p, i) => {
    const top = y(p[key]), hgt = Math.max(0, H - B - top);
    const r = Math.min(4, bw / 2, hgt);
    // Rounded top, square base.
    const x0 = x(i) - bw / 2;
    const path = hgt <= 0 ? "" : `M${x0},${H - B}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${H - B}Z`;
    const el = s("path", { d: path, fill: ACCENT });
    svg.append(el);
    return el;
  });
  const wrap = h("div", { class: "st-an-chart" }, svg);
  withTooltip(wrap, svg, points, key, unit, x, (i) => bars.forEach((b, j) => b.setAttribute("fill-opacity", i < 0 || i === j ? "1" : "0.35")), W);
  return wrap;
}

// ---------- Dates ----------
function niceMax(v) { const p = 10 ** Math.floor(Math.log10(v)); for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p; return 10 * p; }
const toIso = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
function isoDaysAgo(n) { const t = new Date(); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); }
function fillDays(rows, days, key = "users") {
  const by = Object.fromEntries(rows.map((r) => [r.date, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = isoDaysAgo(i), k = iso.replace(/-/g, "");
    out.push(by[k] ? { ...by[k], date: k } : { date: k, [key]: 0 });
  }
  return out;
}
const shortDate = (d) => new Date(toIso(d) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = (d) => new Date(toIso(d) + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
