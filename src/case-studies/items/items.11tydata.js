export default {
  layout: "case.njk",
  eleventyComputed: {
    permalink: (data) => `/case-studies/${data.page.fileSlug}/`,
    description: (data) => data.description || `${data.short_title}: ${data.summary}`,
  },
};
