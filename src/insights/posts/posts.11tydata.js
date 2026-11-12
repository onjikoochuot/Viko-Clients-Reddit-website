export default {
  layout: "post.njk",
  eleventyComputed: {
    permalink: (data) => (data.draft ? false : `/insights/${data.page.fileSlug}/`),
  },
};
