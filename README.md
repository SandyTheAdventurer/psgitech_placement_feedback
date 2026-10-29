# Placement Preparation Guides

Student portal + admin dashboard for collective interview experiences.
One folder per company, one PDF per year. Admin changes are live for students immediately.

## Run locally

```bash
npm install
npm start          # http://localhost:3000
npm run demo       # optional: adds two sample companies
```

On first start an admin account is created from `ADMIN_LOGIN` / `ADMIN_PASSWORD` in `.env`
(copy `.env.example`). If `ADMIN_PASSWORD` is empty, a random one is printed once in the console.

## How it works

| Role | Sign in | Can do |
|---|---|---|
| Student | **Student** tab → *Continue with Google* (only `@psgitech.ac.in` accounts) | Search/filter companies, quick‑find (Ctrl/⌘ + K), read PDFs in the built‑in viewer (read-only, with a highlighter), save favourites, light/dark theme |
| Admin | **Admin** tab → username + password | Add/edit/delete companies, upload/replace/delete the PDF for each year, disable student accounts, see usage |

* **Student accounts are created automatically** at first Google sign‑in. The server verifies the Google ID token, requires a verified email ending in `@psgitech.ac.in` *and* Google's `hd` (hosted domain) claim to match. Admin → Students lets you disable or remove accounts.
* A company appears to students only after it has at least one PDF.
* The admin can preview exactly what students see via **Student view**.

## Set up Google sign‑in (one time)

1. Go to <https://console.cloud.google.com/> → create/select a project → **APIs & Services → OAuth consent screen**. Choose **Internal** if the project belongs to the psgitech.ac.in Google Workspace (recommended: Google itself then blocks every other account).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Add **Authorised JavaScript origins**: your site URL (e.g. `https://placement.psgitech.ac.in`) and `http://localhost:3000` for testing. No redirect URI is needed.
4. Copy the Client ID into `GOOGLE_CLIENT_ID` (see `.env.example`) and restart.

Until `GOOGLE_CLIENT_ID` is set, the student tab shows "Google sign‑in is not set up yet".

## Deploy

Any host that runs Node 20+ and has a **persistent disk** works (Render, Railway, Fly.io, a VPS…).
All data (SQLite database + uploaded PDFs) lives in `DATA_DIR`, so mount a volume there and back it up.

Environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `NODE_ENV=production` | enables secure cookies / caching |
| `ADMIN_LOGIN`, `ADMIN_PASSWORD` | first‑run admin account |
| `DATA_DIR` | folder on the persistent disk, e.g. `/data` |
| `TRUST_PROXY=1` | set when behind an HTTPS proxy (almost all hosts) |
| `GOOGLE_CLIENT_ID` | OAuth client ID for student sign‑in (required for students) |
| `ALLOWED_DOMAIN` | default `psgitech.ac.in` |
| `COLLEGE_NAME` | shown in the header (default `PSG iTech`) |
| `JWT_SECRET` | optional; auto‑generated and stored in `DATA_DIR` otherwise |
| `MAX_PDF_MB` | upload limit, default 30 |

Docker: `docker build -t guides . && docker run -p 3000:3000 -v guides-data:/data --env-file .env guides`

Always serve over HTTPS in production.

## Security notes

* Students never have passwords; admin password is hashed with bcrypt; sessions are HTTP‑only SameSite cookies; login is rate‑limited.
* PDFs are **not** public files — they are streamed only to signed‑in users, and uploads are verified as real PDFs.
* State‑changing requests require an `X-Requested-With` header (CSRF defence). All dynamic content is rendered as text (no HTML injection).
* The viewer renders pages on canvas (no text layer) and there is no download button, but a determined student can still screenshot what they can read, so the "do not share" notice matters.

## Project layout

```
server/   Express API, SQLite (better-sqlite3), uploads
public/   Front end (vanilla ES modules, no build step except the 3D bundle)
src/      three.js scene source  → `npm run build` → public/js/scene.js
```
