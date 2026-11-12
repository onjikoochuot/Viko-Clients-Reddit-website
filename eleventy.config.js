import { HtmlBasePlugin } from "@11ty/eleventy";
import markdownIt from "markdown-it";

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);

  // Files copied to the site as-is
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/media");

  // Markdown: allow HTML, lazy-load images, open external links in a new tab
  const md = markdownIt({ html: true, linkify: true, typographer: true });
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet("loading", "lazy");
    tokens[idx].attrSet("decoding", "async");
    return defaultImage(tokens, idx, options, env, self);
  };
  const defaultLink = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet("href") || "";
    if (/^https?:\/\//.test(href)) {
      tokens[idx].attrSet("target", "_blank");
      tokens[idx].attrSet("rel", "noopener noreferrer");
    }
    return defaultLink(tokens, idx, options, env, self);
  };
  eleventyConfig.setLibrary("md", md);

  // Collections
  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByGlob("src/insights/posts/*.md")
      .filter((p) => !p.data.draft)
      .sort((a, b) => b.date - a.date));
  eleventyConfig.addCollection("cases", (api) =>
    api.getFilteredByGlob("src/case-studies/items/*.md")
      .sort((a, b) => (a.data.order || 99) - (b.data.order || 99)));

  eleventyConfig.addCollection("featuredCases", (api) => {
    const all = api.getFilteredByGlob("src/case-studies/items/*.md")
      .sort((a, b) => (a.data.order || 99) - (b.data.order || 99));
    const picked = all.filter((c) => c.data.featured);
    return picked.length ? picked : all;
  });

  // The editor lives at /admin
  eleventyConfig.addPassthroughCopy("src/admin");

  // Filters
  eleventyConfig.addFilter("readableDate", (d) =>
    new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }));
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString().slice(0, 10));
  eleventyConfig.addFilter("readingTime", (html) => {
    const words = String(html || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    const minutes = Math.round(words / 220);
    return minutes >= 2 ? minutes + " min read" : ""; // very short pieces show no reading time
  });
  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));
  eleventyConfig.addFilter("exclude", (arr, url) => (arr || []).filter((i) => i.url !== url));
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v));
  eleventyConfig.addFilter("absolute", (path, base) => new URL(path, base).href);

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    pathPrefix: process.env.PATH_PREFIX || "/",
    markdownTemplateEngine: false, // articles are plain Markdown: no template code can break the build
    htmlTemplateEngine: false,
  };
}
