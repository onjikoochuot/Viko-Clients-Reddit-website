# Viko website

The client-facing website for Viko Reddit Experts (vikoredditexperts.com).

Every article and case study is its own page with its own address, so Google and AI search engines can read them. You manage them from a visual editor, not by editing code.

## Writing and editing articles and case studies: Viko Studio

Open **`/admin/`** on the live site (https://vikoredditexperts.com/admin/) and sign in with your GitHub access token. The token is stored in that browser only.

**Your articles.** Every article is listed as a card showing its thumbnail and whether it's published or a draft. Search or filter the list, click a card to edit it, or use **New article**, **Import Word** or **Import PDF**.

**Writing.** The page looks like the published article. Type the title and the short description at the top, add a thumbnail, then write. The toolbar has:
- text styles (heading, subheading, small heading)
- bold, italic, underline, strikethrough and highlight
- links (Ctrl+K)
- bulleted and numbered lists, and quotes
- left, centre and right alignment

**Insert menu.**
- images, which you can also paste or drag in; they are resized automatically
- tables
- callout boxes (tip, key point, warning)
- link previews
- YouTube videos and Reddit posts
- a call-to-action button
- a downloadable file
- a divider
- content from a Word document or PDF, inserted at the cursor

**Images.** Each image has a caption, a description for Google, three widths (small, normal, wide), crop, replace, and **Use as thumbnail**.

**Links.** Paste a link on its own empty line and it becomes a preview card. The title, description and picture are filled in from the page when the site publishes. YouTube links become a video player, and Reddit post links become the embedded post. Press Ctrl+Z to keep a link as plain text.

**Word import (.docx).** Brings in the title, subtitle (used as the description), headings, bold and italic text, lists, tables, links, quotes, images and their captions. You're then asked to pick a thumbnail from the document's images. You can also crop one.

**PDF import.**
- Shows every page. Click a page to drag a box over any part of it: a chart, a table or a quote. Use that part as the thumbnail or add it to the article.
- Lists the pictures found inside the PDF.
- Rebuilds the text as paragraphs, headings and lists.
- Can attach the original PDF as a download at the end of the article.

Scanned PDFs have no text to extract, but you can still use their pages as images.

**Before publishing**, the right-hand panel checks the title, description, thumbnail, category, length and image descriptions. **Preview** hides every editing control and the phone button shows a phone-width view.

**Saving.**
- **Save draft** keeps the article off the site.
- **Publish** or **Update** puts it live in about 2 minutes. The article and its images are saved together.
- Ctrl+S saves.
- If the browser closes before saving, the editor offers to restore your text next time.

**Deleting.** The settings panel has **Delete article**, which also removes its uploaded images. You type DELETE to confirm. **Unpublish** turns a live article back into a draft.

**Case studies** have their own tab in the Studio, at the top of the list. They use the same editor, Word and PDF import, and image tools. Each case study also has:
- **Headline results** under the title. Type something like `61K Views` and press Enter. Numbers show as big figures on the page, and words like `Finance` show as tags. Drag them to reorder.
- **Card title** and **Card summary**: what the Case studies page and the homepage show.
- **Icon**, **Show on homepage** (the first three by position appear there) and **Position** (1 shows first).

### Good to know

- The web address (`/insights/your-title/`) comes from the title and is fixed after the first save, so links to the article keep working.
- Images from another website (pasted from Google Docs, for example) stay hosted on that site. Download and upload important images instead.
- Each image or file must be under 25 MB.

## Where things live

| What | Where |
| --- | --- |
| Articles | `src/insights/posts/` (one file each) |
| Case studies | `src/case-studies/items/` (one file each; images in `src/media/uploads/case-studies/`) |
| Packages and prices on the package pages | `src/_data/packages.json` |
| Contact details, WhatsApp number, Calendly link | `src/_data/site.json` |
| Homepage | `src/index.njk` |
| Header and footer (shared by every page) | `src/_includes/` |
| Design | `src/assets/css/styles.css` and `src/assets/css/site.css` |
| Viko Studio (article editor) source | `studio-src/` (bundled into `src/admin/studio/` on every build) |
| Article page design | `src/_includes/post.njk`, `src/assets/css/article.css`, `src/assets/js/article.js`, `lib/enhance-article.js` |

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

Built with [Eleventy](https://www.11ty.dev/). Viko Studio uses [Tiptap](https://tiptap.dev/), [mammoth.js](https://github.com/mwilliamson/mammoth.js), [PDF.js](https://mozilla.github.io/pdf.js/) and [Cropper.js](https://github.com/fengyuan-chen/cropperjs).

Set `SKIP_LINK_PREVIEWS=1` to build without fetching link-card previews.
