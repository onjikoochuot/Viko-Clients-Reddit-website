export default {
  layout: "case.njk",
  eleventyComputed: {
    permalink: (data) => (data.draft ? false : `/case-studies/${data.page.fileSlug}/`),
    description: (data) => data.lead || data.description || `${data.short_title}: ${data.summary}`,
  },
};
