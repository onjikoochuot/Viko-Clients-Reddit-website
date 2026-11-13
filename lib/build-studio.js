// Bundles Viko Studio (studio-src/) into src/admin/studio/ before each build.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as esbuild from "esbuild";

const require = createRequire(import.meta.url);
const OUT = "src/admin/studio";

export async function buildStudio() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  await esbuild.build({
    entryPoints: ["studio-src/main.js"],
    bundle: true,
    format: "esm",
    splitting: true, // Word and PDF tools load only when used
    target: "es2022",
    minify: process.env.NODE_ENV !== "development",
    sourcemap: false,
    outdir: OUT,
    entryNames: "[name]",
    chunkNames: "chunks/[name]-[hash]",
    logLevel: "warning",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  fs.copyFileSync("studio-src/studio.css", path.join(OUT, "studio.css"));
  fs.copyFileSync(require.resolve("cropperjs/dist/cropper.min.css"), path.join(OUT, "cropper.css"));
  fs.copyFileSync(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"), path.join(OUT, "pdf.worker.min.mjs"));
}
