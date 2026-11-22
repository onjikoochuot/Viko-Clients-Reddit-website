# Viko design system

The visual contract for vikoredditexperts.com. Read it before changing global styles, and update it when you do.

## Brand overview

Viko is a small Reddit marketing agency run by Elvis Ochuot from Nakuru, Kenya. It sells Reddit Ads management, an official brand-account service, organic community work, audits and monitoring to SaaS, app and travel brands, mostly in the US, UK and EU.

Buyers are founders and marketing leads who are wary of Reddit: they have heard about bans, fake accounts and backlash. In the first seconds on the site they should feel **this is careful, honest work with real numbers behind it**.

## Design thesis

An editorial notebook of real results: warm paper, confident serif headlines, and evidence (numbers, screenshots, named proof) doing the selling instead of adjectives.

## Core feelings and what they mean in design

| Feeling | Design consequence |
| --- | --- |
| Trustworthy | Verified proof near the top (Upwork rating, job count); real screenshots, never stock photos |
| Calm, not salesy | Generous whitespace, one primary action per section, no countdowns or flashing badges |
| Expert | Editorial serif headlines, tight leading, data shown large and plainly |
| Transparent | Plain-language package pages with prices, and a "what we won't do" list |

## Colors

| Name | Value | Token | Role |
| --- | --- | --- | --- |
| Paper | `#f6f4ef` | `--paper` | Page background |
| Paper deep | `#eeeae2` | `--paper-deep` | Alternate section and panel background |
| Card | `#fffefa` | `--viko-card` | Raised surfaces |
| Ink | `#1d1b17` | `--ink` | Headlines, body text, the dark proof band |
| Ink soft | `#232019` | `--ink-soft` | Long-form body text |
| Muted | `#403c33` | `--muted` | Meta text, labels (10:1 on paper) |
| Line | `#d9d4ca` | `--line` | Hairline dividers |
| Line strong | `#bdb6aa` | `--line-strong` | Card borders, table rules |
| Accent | `#c4421f` | `--accent` | Primary buttons, key numbers, links (4.6:1 on paper, 5.1:1 under white text) |
| Accent dark | `#b93b20` | `--accent-dark` | Hover state, small accent text |
| WhatsApp green | `#1f8f4e` | n/a | WhatsApp buttons only |

The accent is punctuation: buttons, headline numbers, one word in a headline. It is never a large background, except the single primary button per section.

On the ink band, numbers use `#ff8a66` (7.6:1 on ink) instead of the accent, which fails on dark backgrounds.

## Typography

| Role | Family | Weight | Size | Line height | Letter spacing |
| --- | --- | --- | --- | --- | --- |
| Display (h1) | Newsreader, Georgia, serif | 500 | clamp(44px, 6.4vw, 92px) | 0.98 | -0.045em |
| Section heading (h2) | Newsreader | 500 | clamp(32px, 3.6vw, 50px) | 1.05 | -0.035em |
| Card heading (h3) | Newsreader | 500 | 22 to 26px | 1.2 | -0.02em |
| Big numbers | Newsreader | 500 | 40 to 64px | 1 | -0.03em |
| Body | Inter, Arial, sans-serif | 400 | 17px (16px mobile) | 1.6 | 0 |
| Lead paragraph | Inter | 400 | 19 to 21px | 1.55 | 0 |
| Label / meta | Inter | 600 | 14px, sentence case | 1.3 | 0 |

- Sentence case for every heading, button and label. No tracked capitals anywhere.
- No italics in headings.
- Body measure 55 to 75 characters. Headings use `text-wrap: balance`, body uses `text-wrap: pretty`.
- Fonts load from Google Fonts with `display=swap`. Fallbacks stay in the same class (serif to Georgia, sans to Arial).

## Spacing and composition

- Content max-width 1200px (`.container` is 1320px with padding), articles 800px.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 72, 104px. Sections are separated by 72px (desktop) or 48px (mobile).
- Border radius: 0 for cards and images (editorial, paper-like); 999px only for small pills.
- No drop shadows on cards. Depth comes from borders and the paper/card contrast. Hover lifts by 2px and switches the border to the accent.
- Images always have a fixed aspect-ratio slot (16:9 for cards) with `object-fit: cover` from the top.

## Components

- **Primary button**: accent fill, white 15px semibold text, 12px by 22px padding, square corners. One per section.
- **Secondary action**: an underlined text link with an arrow, not a second filled button.
- **WhatsApp button**: green outline or text, always opens in a new tab.
- **Proof strip**: inline list of verified facts separated by dots, linked to the source (Upwork).
- **Result card**: screenshot in a 16:10 slot, one big number, one line of context, a link to the case study.
- **Package card**: name, price with period, one-line purpose, 4 to 6 inclusions, one action. The recommended package carries a "Most complete" label (switch to "Most popular" only when sales show it) and an accent top border.
- **Step**: big serif number, short heading, two lines of text.
- **Insight card / case card**: thumbnail, category label, title, meta.
- **FAQ**: `<details>` items with a plus/minus marker; answers are honest and specific.
- **Header**: logo, four links (Case studies, Pricing, Insights, About), WhatsApp and Book call.
- **Sticky contact bar (phones)**: WhatsApp and Book a free call, fixed to the bottom of every page under 760px.
- **Book this package**: links to `/?package=<id>#booking`, which pre-fills the form and the WhatsApp message. **Footer**: brand line, explore links, contact, legal.
- **Inputs**: floating labels, 1px border, accent focus ring.

## Dos and don'ts

Do:
- Lead with verified numbers and link to where they can be checked.
- Show real screenshots from campaigns.
- State prices. Say what is not included (ad spend).
- Answer the risky questions (bans, bots, disclosure) directly.

Don't:
- Use "aged accounts", "high-karma accounts", "promotional comments" or anything that suggests fake users or vote manipulation.
- Claim results that can't be checked, or quote best-case results as typical.
- Add decorative eyebrow labels above every heading. Use a label only when it carries information.
- Use stock photos, gradients, floating shapes or confetti.
- Put the accent colour on text smaller than 18px except links and labels in accent-dark.

## Motion

Quiet and quick. Hover transitions of 150 to 200ms on colour, border and a 2px lift. No scroll-jacking, parallax or auto-playing carousels. Everything respects `prefers-reduced-motion: reduce` (transitions off).
