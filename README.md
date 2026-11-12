# Viko website

The client-facing website for Viko Reddit Experts (vikoredditexperts.com).

Every article and case study is its own page with its own address, so Google and AI search engines can read them. You manage them from a visual editor, not by editing code.

## Writing and editing articles

1. Open `/admin/` on the live site (for example `https://vikoredditexperts.com/admin/`).
2. Choose **Sign in with Token** and follow the on-screen steps the first time. The browser remembers you afterwards.
3. Pick **Insights articles**, then:
   - **New article** to write one. Add a title, short description, date, category and thumbnail, then write the article. The toolbar adds headings, bold text, links, lists and images.
   - Click an existing article to **edit** it.
   - Open an article and use the menu next to Save to **delete** it.
   - Turn on **Draft** to save an article without showing it on the site.
4. Press **Save**. The site rebuilds and the change is live in about two minutes.

Case studies work the same way under **Case studies**. Turn on **Show on homepage** to feature one on the homepage.

Notes:

- The newest article (by publish date) appears as the large card at the top of the Insights page, and the three newest appear on the homepage.
- An article with no thumbnail gets a branded placeholder showing its category.
- To add a caption under an image, put a line in *italics* directly below it.
- Uploaded images are stored in `src/media/uploads/`. Keep them under about 500 KB each so pages stay fast.

## Where things live

| What | Where |
| --- | --- |
| Articles | `src/insights/posts/` (one file each) |
| Case studies | `src/case-studies/items/` (one file each) |
| Packages and prices on the package pages | `src/_data/packages.json` |
| Contact details, WhatsApp number, Calendly link | `src/_data/site.json` |
| Homepage | `src/index.njk` |
| Header and footer (shared by every page) | `src/_includes/` |
| Design | `src/assets/css/styles.css` and `src/assets/css/site.css` |
| Editor settings | `src/admin/config.yml` |

Package names and prices also appear in the homepage text (`src/index.njk`), so update both places when a price changes.

## Publishing

Every change to the `main` branch is built and published automatically by GitHub Actions (`.github/workflows/deploy.yml`).

One-time setup: in the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.

Links from the old site (`blog-post.html?id=...`, `case-study.html?id=...`, `package.html?id=...`) redirect to the new pages.

## Working on the site locally (developers)

```bash
npm install
npm start      # preview at http://localhost:8080
npm run build  # output in _site/
```

Built with [Eleventy](https://www.11ty.dev/). The editor is [Sveltia CMS](https://github.com/sveltia/sveltia-cms).
