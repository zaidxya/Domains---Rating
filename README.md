# Domains Rating Site (صفحة تقييم)

A bilingual (English / Arabic) website where people rate **Domains**, a non-profit project by Sankari holdings that aims to "ربط الحياة الجامعية بسوق العمل" (connect university life with the job market). Domains offers a study zone, free courses, and more.

- **Public:** a feedback form with a language toggle (EN / AR, with RTL layout for Arabic). It collects personal details (full name, phone, university...), star ratings and comments.
- **Private:** a password-protected dashboard at `/admin` where the team reads the ratings and comments.

## Stack

| Part | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Node.js + Express |
| Database | PostgreSQL hosted on **Neon** (via the `pg` library) |
| Hosting | **Render** (deployed from GitHub) |
| Spam protection | `express-rate-limit` + a honeypot field |

## Project structure

```
domains-rating/
├── server.js          Express server: form API, spam protection, protected /admin
├── package.json       Dependencies (express, pg, express-rate-limit) and start script
├── .gitignore         Keeps node_modules, .env and old SQLite files off GitHub
├── README.md          This file
├── public/            Public site, served at /
│   ├── index.html     The rating form
│   ├── style.css      Styling in the Domains brand colours (RTL-aware)
│   ├── logo-white.png Official Domains logo, white, transparent (header)
│   ├── logo-mark-blue.png  Official logo mark, blue (white backgrounds)
│   ├── favicon.png, apple-touch-icon.png  Browser-tab / phone icons
│   └── script.js      Translations, star widgets, language toggle, form submit
└── admin/             Dashboard, served at /admin (password protected)
    └── index.html     Stats cards, searchable table of all ratings
```

`public/` and `admin/` must sit next to `server.js`, exactly as shown.

## Visual identity

Colours were sampled from the Domains platform dashboard: header gradient `#815eea` (violet) to `#293c88` (navy), navy `#2d3f7c`, violet `#7d49e8`, blue `#4183cc`, page background `#f5f7fb`. They are defined as CSS variables at the top of `public/style.css` and the `<style>` block in `admin/index.html`.

The logo files in `public/` were cut out of the official Domains logo image (PNG, transparent background). If you get the official SVG files, swap them in by replacing `logo-white.png` and `logo-mark-blue.png` (and update the file names in `index.html` and `admin/index.html`).

## How it works

1. A visitor opens `/`, picks stars and optional text, and submits.
2. `script.js` sends `POST /api/ratings` with JSON.
3. `server.js` validates every field (name needs three words, phone must be 7-15 digits, stars must be whole numbers 1-5, dropdown values must be on the allowed list, consent must be ticked, text is trimmed and length-limited, `lang` can only be `en` or `ar`) and inserts a row into Neon with a parameterised query (no SQL injection).
4. The team opens `/admin`, logs in, and the page loads data from `/admin/api/ratings` and `/admin/api/stats`.

### Routes

| Route | Access | Purpose |
|---|---|---|
| `GET /` | public | Rating form |
| `POST /api/ratings` | public, rate limited | Save a rating |
| `GET /api/stats` | public | Count and averages (numbers only, no personal data) |
| `GET /admin/` | password | Dashboard page |
| `GET /admin/api/ratings` | password | All ratings (names, universities, comments) |
| `GET /admin/api/stats` | password | Count and averages |

### Database table `ratings`

`id`, `name` (full name, three names required), `phone` (required), `email` (optional), `university` (required), `major` (optional), `study_level` (required: `y1`..`y4`, `graduate`, `postgrad`, `other`), `heard_about` (optional), `overall` (1-5, required), `study_zone` (1-5, optional), `courses` (1-5, optional), `recommend` (`yes`/`maybe`/`no`, optional), `comment` (optional), `consent` (must be true), `lang` (`en`/`ar`), `created_at`.

The table is created automatically at startup. The newer columns (`phone` onward) are added to an existing table with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so the live Neon data is kept. Ratings submitted before this change show `-` in the new columns.

### Privacy note

The form now stores personal data (name, phone, email). Only people with the `/admin` password can read it; `/api/stats` stays public but returns numbers only. Keep `ADMIN_PASSWORD` strong, and delete rows on request via Neon's SQL Editor.

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string (`postgresql://...`). **Secret.** |
| `ADMIN_PASSWORD` | yes for /admin | Password for the dashboard. If unset, /admin is disabled. **Secret.** |
| `PORT` | no | Set by Render automatically; defaults to 3000 locally |

Never commit these values to GitHub. Set them in Render's **Environment** tab (or in your terminal locally).

## Run locally

```bash
npm install

# Mac / Linux / Git Bash
DATABASE_URL="postgresql://..." ADMIN_PASSWORD="choose-one" npm start

# Windows PowerShell
$env:DATABASE_URL="postgresql://..."; $env:ADMIN_PASSWORD="choose-one"; npm start
```

Open http://localhost:3000 (form) and http://localhost:3000/admin (dashboard; any username, your password).

Always use port 3000. Do **not** open the HTML files with VS Code Live Server (port 5500): it can't handle the API calls and shows a 405 error.

Note: running locally with the Neon string uses the live database, so test ratings end up in real data.

## Deploy

1. Push the project to GitHub (`node_modules`, `.env` are ignored by `.gitignore`).
2. **Neon:** create a free project at neon.com and copy its connection string.
3. **Render:** create a Web Service from the GitHub repo (build command `npm install`, start command `npm start`).
4. In Render, open **Environment** and add `DATABASE_URL` and `ADMIN_PASSWORD`.
5. Visit `https://<your-app>.onrender.com` and `/admin`.

### Why Neon and not a file database?

The project started on SQLite (a file). On Render's free tier the filesystem is wiped on every redeploy/restart, so ratings would be lost. Data now lives on Neon's servers; the app only holds the connection string. Restarting Render no longer affects the data.

## Spam protection

- **Rating limit:** max 10 ratings per IP per hour (429 error, friendly message shown in the user's language). Set to 10 so shared campus IPs aren't blocked.
- **Admin brute-force limit:** max 10 *failed* logins per IP per 15 minutes.
- **Honeypot:** hidden form field `website`; if filled (bots do this), the server pretends success and saves nothing.
- `app.set('trust proxy', 1)` is required on Render so the real visitor IP is used.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Something went wrong" on submit | Check the browser console / Network tab for the real status code |
| 405 on `/api/ratings` | Page opened via Live Server (port 5500); use localhost:3000 |
| "Cannot GET /" | `public/` missing or `index.html` not inside it |
| "Cannot GET /admin" | `admin/` folder or updated `server.js` not deployed |
| 503 "Admin disabled" | `ADMIN_PASSWORD` not set in Render |
| Login popup keeps returning | Wrong password (check for stray spaces) |
| App won't start: `DATABASE_URL is not set` | Add the variable in Render's Environment tab |
| `Could not start: ...` in Render logs | Wrong/mistyped connection string or Neon unreachable; the message says why |
| First page load is slow | Render free tier wakes from sleep; Neon free tier also sleeps when idle |

To verify the database: Neon console → SQL Editor → `SELECT * FROM ratings ORDER BY id DESC;`

## Known limitations

- Rate-limit counters are in memory and reset when the app restarts.
- Someone using many different IPs can still bypass the limit (next step would be CAPTCHA, e.g. Cloudflare Turnstile).
- Dashboard login uses HTTP Basic Auth (fine over Render's HTTPS; no logout, no per-user accounts).
- No CSV export yet, no way to delete ratings from the dashboard (use Neon's SQL Editor).
- Old ratings from the earlier SQLite version were not migrated.

## Ideas for next steps

1. CSV export button on the dashboard (for Excel / Google Sheets).
2. Better form questions (e.g. "Would you recommend Domains?", which course was taken).
3. Charts on the dashboard (ratings over time, by university).
4. A delete/hide button for spam or test ratings.
5. CAPTCHA if abuse becomes a problem.
6. Back up the Neon data now and then.

## Context for a new chat

Paste this to continue: *"I'm building a bilingual (EN/AR) rating website for Domains by Sankari holdings (a non-profit linking university life to the job market). Stack: HTML/CSS/vanilla JS, Node + Express, Postgres on Neon (`pg`), deployed from GitHub to Render. It has a public rating form, a password-protected `/admin` dashboard (Basic Auth, `ADMIN_PASSWORD` env var), rate limiting and a honeypot. The README in the attached project describes everything. Next I want to: ..."*
