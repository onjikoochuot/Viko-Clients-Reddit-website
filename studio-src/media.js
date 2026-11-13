// Images and files waiting to be uploaded. Until an article is saved,
// new images live in the browser as blob: URLs; on save they are uploaded
// next to the article and the URLs are swapped for their final paths.
import { bytesToBase64 } from "./github.js";
import { UPLOADS_DIR } from "./content.js";

const pending = new Map(); // blobUrl -> { blob, name, ext }

export const MAX_IMAGE_WIDTH = 1800;

export function trackBlob(blob, name = "image", ext) {
  const url = URL.createObjectURL(blob);
  pending.set(url, { blob, name, ext: ext || extFromType(blob.type) });
  return url;
}

export function isPending(url) {
  return pending.has(url);
}

function extFromType(type = "") {
  if (type.includes("webp")) return "webp";
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("gif")) return "gif";
  if (type.includes("svg")) return "svg";
  if (type.includes("pdf")) return "pdf";
  if (type.includes("wordprocessingml")) return "docx";
  return "bin";
}

// Resize and convert to WebP so pages stay fast. GIFs and SVGs are kept as they are.
export async function prepareImage(fileOrBlob, name) {
  const type = fileOrBlob.type || "";
  const base = cleanName(name || fileOrBlob.name || "image");
  if (/gif|svg/.test(type)) return trackBlob(fileOrBlob, base);
  const bitmap = await loadBitmap(fileOrBlob);
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas);
  return trackBlob(blob, base, blob.type.includes("webp") ? "webp" : "jpg");
}

export function canvasToBlob(canvas, quality = 0.84) {
  return new Promise((resolve) => canvas.toBlob((b) => {
    if (b && b.type === "image/webp") resolve(b);
    else canvas.toBlob((j) => resolve(j), "image/jpeg", quality); // older Safari has no WebP encoder
  }, "image/webp", quality));
}

async function loadBitmap(blob) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(blob); } catch {}
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function cleanName(name) {
  return String(name).replace(/\.[a-z0-9]+$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "image";
}

// Finds every pending blob URL in the strings, uploads plan for each, and
// returns { files, replace(str) } where replace swaps blob URLs for site paths.
export async function planUploads(slug, strings) {
  const found = new Set();
  for (const s of strings) for (const m of String(s || "").matchAll(/blob:[^"'\s)]+/g)) if (pending.has(m[0])) found.add(m[0]);
  const files = [];
  const map = new Map();
  const stamp = Date.now().toString(36).slice(-5);
  let i = 0;
  for (const url of found) {
    const item = pending.get(url);
    i++;
    const file = `${item.name}-${stamp}${i}.${item.ext}`;
    const repoPath = `${UPLOADS_DIR}/${slug}/${file}`;
    const sitePath = `/media/uploads/${slug}/${file}`;
    const bytes = new Uint8Array(await item.blob.arrayBuffer());
    files.push({ path: repoPath, base64: bytesToBase64(bytes), size: bytes.length });
    map.set(url, sitePath);
  }
  const replace = (s) => {
    let out = String(s || "");
    for (const [from, to] of map) out = out.split(from).join(to);
    return out;
  };
  return { files, replace, map };
}

export function forget(map) {
  for (const url of map.keys()) pending.delete(url);
}

export function pendingSize(url) {
  const p = pending.get(url);
  return p ? p.blob.size : 0;
}
