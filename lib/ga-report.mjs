// Pulls a summary from Google Analytics (GA4 Data API) and writes it, encrypted,
// to analytics/summary.enc.json. Run hourly by .github/workflows/analytics.yml.
// The website repository is public, so the numbers are encrypted with
// ANALYTICS_PASSWORD; only Viko Studio (which asks for that password) can read them.
//
// Env: GA4_PROPERTY_ID, ANALYTICS_PASSWORD, OUT (optional), and either
//   GA4_ACCESS_TOKEN (keyless: GitHub Actions signs in through Workload Identity Federation), or
//   GA4_SERVICE_ACCOUNT (a service account JSON key, where key creation is allowed)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PROPERTY = (process.env.GA4_PROPERTY_ID || "").replace(/\D/g, "");
const PASSWORD = process.env.ANALYTICS_PASSWORD || "";
const OUT = process.env.OUT || "analytics/summary.enc.json";
const EVENTS = ["generate_lead", "sign_up", "whatsapp_click", "book_call_click", "select_package", "upwork_click", "email_click"];

function fail(msg) { console.error("✗ " + msg); process.exit(1); }
if (!PROPERTY) fail("GA4_PROPERTY_ID is missing. Add it as a repository secret (the number from Admin → Property details).");
if (!PASSWORD) fail("ANALYTICS_PASSWORD is missing. Add it as a repository secret.");
let key = null;
if (!process.env.GA4_ACCESS_TOKEN) {
  try { key = JSON.parse(process.env.GA4_SERVICE_ACCOUNT || ""); } catch { fail("Google sign-in isn't set up: add the GCP_WIF_PROVIDER and GCP_SERVICE_ACCOUNT secrets (keyless), or a GA4_SERVICE_ACCOUNT key."); }
}
const ACCOUNT = key ? key.client_email : process.env.GA4_ACCOUNT_EMAIL || "the service account";

// ---------- Google auth (service account, no dependencies) ----------
const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
async function accessToken() {
  if (process.env.GA4_ACCESS_TOKEN) return process.env.GA4_ACCESS_TOKEN;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: key.client_email, scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = b64url(crypto.createSign("RSA-SHA256").update(`${head}.${claim}`).sign(key.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }) });
  const j = await res.json();
  if (!res.ok) fail(`Google sign-in failed: ${j.error_description || j.error || res.status}`);
  return j.access_token;
}

let TOKEN;
async function call(method, body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:${method}`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) {
    const msg = j.error?.message || res.status;
    if (res.status === 403) fail(`No access to property ${PROPERTY}: ${msg}\nAdd ${ACCOUNT} as a Viewer in GA4 → Admin → Property access management.`);
    throw new Error(msg);
  }
  return (j.rows || []).map((r) => [...(r.dimensionValues || []).map((d) => d.value), ...(r.metricValues || []).map((m) => Number(m.value))]);
}
const report = (body) => call("runReport", body);
// Reports that need optional custom dimensions return [] instead of failing.
const optional = async (body) => { try { return await report(body); } catch (e) { console.warn("• skipped:", e.message.split("\n")[0]); return null; } };

const RANGES = { "7": "7daysAgo", "28": "28daysAgo", "90": "90daysAgo" };
const eventFilter = { filter: { fieldName: "eventName", inListFilter: { values: EVENTS } } };

async function main() {
  TOKEN = await accessToken();
  const out = { generatedAt: new Date().toISOString(), property: PROPERTY, events: EVENTS, ranges: {} };

  // Daily series for 90 days; the Studio slices them for 7 / 28 / 90 days.
  out.daily = (await report({ dateRanges: [{ startDate: "90daysAgo", endDate: "today" }], dimensions: [{ name: "date" }],
    metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 200 }))
    .map(([date, users, sessions, views]) => ({ date, users, sessions, views }));
  out.dailyEvents = (await report({ dateRanges: [{ startDate: "90daysAgo", endDate: "today" }], dimensions: [{ name: "date" }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }], dimensionFilter: eventFilter, limit: 2000 }))
    .map(([date, event, count]) => ({ date, event, count }));

  for (const [days, start] of Object.entries(RANGES)) {
    const dr = [{ startDate: start, endDate: "today" }];
    const r = {};
    r.totals = (await report({ dateRanges: dr, metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "averageSessionDuration" }] }))[0] || [0, 0, 0, 0];
    r.pages = await report({ dateRanges: dr, dimensions: [{ name: "pagePath" }, { name: "pageTitle" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 10 });
    r.sources = await report({ dateRanges: dr, dimensions: [{ name: "sessionSource" }], metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 8 });
    r.countries = await report({ dateRanges: dr, dimensions: [{ name: "country" }], metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 8 });
    r.leadPages = await report({ dateRanges: dr, dimensions: [{ name: "pagePath" }], metrics: [{ name: "eventCount" }], dimensionFilter: eventFilter,
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 8 });
    // These two need custom dimensions "package_id" and "location" (GA4 → Admin → Custom definitions).
    r.packages = await optional({ dateRanges: dr, dimensions: [{ name: "customEvent:package_id" }], metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "select_package" } } }, limit: 10 });
    r.locations = await optional({ dateRanges: dr, dimensions: [{ name: "eventName" }, { name: "customEvent:location" }], metrics: [{ name: "eventCount" }],
      dimensionFilter: eventFilter, limit: 50 });
    out.ranges[days] = r;
  }

  try {
    const rt = await call("runRealtimeReport", { metrics: [{ name: "activeUsers" }] });
    out.realtime = { activeUsers: rt[0] ? rt[0][0] : 0 };
  } catch { out.realtime = null; }

  // Encrypt: PBKDF2(password) → AES-256-GCM. Viko Studio decrypts with Web Crypto.
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const k = crypto.pbkdf2Sync(PASSWORD, salt, 200000, 32, "sha256");
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(out)), c.final(), c.getAuthTag()]);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ v: 1, generatedAt: out.generatedAt, salt: salt.toString("base64"), iv: iv.toString("base64"), data: enc.toString("base64") }) + "\n");
  console.log(`✓ Wrote ${OUT}: ${out.daily.length} days, ${out.dailyEvents.length} event rows, realtime ${out.realtime ? out.realtime.activeUsers : "n/a"}`);
}

main().catch((e) => fail(e.stack || e.message));
