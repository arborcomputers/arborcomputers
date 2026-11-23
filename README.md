# arborcomputers.com

The Arbor Computers website, served by Vercel (project `arborcomputers`).

## How this repo is put together

The original source repo (`arborcomputers/arborcomputer`) was lost in November 2026. This repo was rebuilt
from the live site: `public/` holds the site exactly as the last production build served it.

| Path | What it is |
|---|---|
| `public/<page>/index.html` | One file per page (65 pages, see `public/sitemap.xml`) |
| `public/assets/` | Images, logos, videos |
| `public/_next/static/` | The site's original CSS and JavaScript (sliders, forms, cookie banner, menus). Don't edit. |
| `api/forms.mjs` | Handles the contact, consultation and service-page forms and emails them |
| `vercel.json` | Hosting settings: security headers, image resizing, trailing slashes |
| `scripts/` | Helpers for previewing and for edits |

## Editing a page

Each page holds its content twice: the visible HTML, and a data copy inside
`<script>self.__next_f.push(...)</script>` that the page's JavaScript loads on start-up.
**Text changes must be made in both places**, or the page shows the old text after it loads.
For new sections, follow `scripts/add-team-section.py`, which edits both copies together.

## Preview locally

```bash
npm run dev
```

Then open http://localhost:3000. Forms are not sent from the local preview.

## Deploying

Pushing to `main` deploys to production. Any other branch gets a Vercel preview link.

Form email settings (`FORM_*`, `TURNSTILE_SECRET_KEY`) are environment variables on the Vercel project.
