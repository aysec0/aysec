# Personal site + cybersec training platform

Personal site with a cybersecurity training platform: free + paid courses, CTF
challenges with scoring/leaderboard, blog/writeups, user accounts, progress
tracking, and Stripe checkout.

**Stack:** vanilla HTML/CSS/JS frontend · Node.js + Express backend · SQLite
(via `better-sqlite3`) · Stripe for payments · JWT auth in HttpOnly cookies.

---

## Quick start

```bash
cp .env.example .env          # edit secrets
npm install
npm run db:init               # creates ./data/app.db + seeds sample data
npm run dev                   # → http://localhost:3000
```

Default admin (after seeding): `admin` / `changeme` — change immediately.

---

## Layout

```
.
├── server.js                 # Express entry, mounts routes + static
├── db/
│   ├── schema.sql            # Tables (users, courses, lessons, challenges, …)
│   ├── index.js              # better-sqlite3 connection + migrate()
│   └── init.js               # Run once: migrate + seed sample data
├── routes/
│   ├── auth.js               # /api/auth/{register,login,logout,me}
│   ├── courses.js            # /api/courses, /api/courses/:slug
│   ├── challenges.js         # /api/challenges/*, leaderboard, flag submit
│   ├── posts.js              # /api/posts, /api/posts/:slug
│   └── payments.js           # Stripe checkout + webhook
├── middleware/
│   └── auth.js               # JWT cookie helpers, requireAuth/requireAdmin
└── public/                   # Static frontend (vanilla)
    ├── index.html                # Landing
    ├── courses.html              # Course list (filters: free/paid/difficulty + search)
    ├── course-detail.html        # Detail + lesson viewer (served at /courses/:slug)
    ├── challenges.html           # CTF grid (filters: category + difficulty) + leaderboard
    ├── challenge-detail.html     # Challenge + flag submit form (served at /challenges/:slug)
    ├── blog.html                 # Posts + writeups (filters: kind + search)
    ├── post-detail.html          # Single post (served at /blog/:slug)
    ├── about.html
    ├── dashboard.html            # User stats, enrolled courses w/ progress, recent solves
    ├── login.html, signup.html
    ├── 404.html                  # Terminal-style not-found
    ├── css/styles.css            # Full design system in CSS variables
    ├── js/
    │   ├── theme.js              # Sets data-theme early to avoid FOUC
    │   ├── api.js                # fetch wrapper + escapeHtml/fmtPrice/fmtDate helpers
    │   ├── layout.js             # Injects navbar/footer + theme toggle + auth state
    │   ├── terminal.js           # Hero typewriter (landing only)
    │   ├── main.js               # Landing section loaders
    │   ├── auth.js               # Login + signup form handling
    │   ├── courses-list.js       # Course list page
    │   ├── course-detail.js      # Course detail + lesson viewer
    │   ├── challenges-list.js    # CTF list + leaderboard
    │   ├── challenge-detail.js   # Challenge detail + flag submission
    │   ├── blog-list.js          # Blog list
    │   ├── post-detail.js        # Post detail (markdown HTML from API)
    │   └── dashboard.js          # User dashboard
    └── img/favicon.svg
```

---

## API surface (current)

| Method | Path                               | Auth   | Notes                                  |
|--------|------------------------------------|--------|----------------------------------------|
| POST   | `/api/auth/register`               | —      | `{username, email, password}`          |
| POST   | `/api/auth/login`                  | —      | `{identifier, password}` (email or username) |
| POST   | `/api/auth/logout`                 | —      |                                        |
| GET    | `/api/auth/me`                     | user   | Returns the current user               |
| GET    | `/api/courses`                     | —      | Published courses                      |
| GET    | `/api/courses/:slug`               | —      | Course + lessons + access flag         |
| GET    | `/api/challenges`                  | —      | Published challenges (with solve count, your-solved flag) |
| GET    | `/api/challenges/:slug`            | —      | Challenge detail                       |
| POST   | `/api/challenges/:slug/submit`     | user   | `{flag}` — sha256-checked, rate-limited |
| GET    | `/api/challenges/leaderboard/top`  | —      | Top 50 scorers                         |
| GET    | `/api/posts`                       | —      | `?kind=writeup` to filter              |
| GET    | `/api/posts/:slug`                 | —      |                                        |
| POST   | `/api/payments/checkout`           | user   | `{courseSlug}` → Stripe checkout URL   |
| POST   | `/api/payments/webhook`            | Stripe | Grants access on `checkout.session.completed` |

---

## Deployment notes

- **Local + VPS:** works as-is. SQLite file lives in `./data/app.db`.
- **Vercel / Netlify:** the local SQLite file won't persist between cold starts.
  Swap to **[Turso](https://turso.tech)** (SQLite-compatible serverless DB):
  - Replace `better-sqlite3` with `@libsql/client`.
  - Set `TURSO_URL` + `TURSO_AUTH_TOKEN` in `.env`.
  - SQL stays identical.
- **Stripe webhook URL:** `https://your-site/api/payments/webhook`. Set
  `STRIPE_WEBHOOK_SECRET` to the signing secret from your Stripe dashboard.

---

## Roadmap

**Done**
- [x] Token-based theme (dark + light), shared navbar/footer via `layout.js`
- [x] Landing page (hero / about / courses / CTF / leaderboard / writeups / CTA)
- [x] DB schema + seed (3 courses, 9 lessons, 4 challenges, 3 posts)
- [x] Auth: register / login / logout / me / dashboard (JWT in HttpOnly cookie)
- [x] `/courses` + `/courses/:slug` with lesson viewer + progress tracking
- [x] Free-course self-enroll, paid-course Stripe checkout
- [x] Markdown rendering for lessons + posts (via `marked`)
- [x] `/challenges` + filters (category, difficulty) + `/challenges/:slug` with flag submission, sha256 verify, 5/min rate-limit, leaderboard
- [x] `/blog` + filters + `/blog/:slug` (reading time, tags, copy-link)
- [x] `/login`, `/signup` (validation, redirect-after-login via `?next=`)
- [x] `/about`, `/dashboard` (stats, in-progress courses, recent solves)
- [x] Custom 404 page

**Next**
- [ ] Admin panel (CRUD courses, lessons, challenges, posts)
- [ ] Email verification + password reset
- [ ] Comments on posts (or external Discord channel link)
- [ ] RSS feed for blog
- [ ] Switch DB layer to Turso/libsql for serverless deploys
- [ ] Syntax highlighting for prose code blocks (Prism / Shiki)
- [ ] HTML sanitization on rendered markdown (DOMPurify) once non-admin users can post

## Tests

```
npm start              # in one terminal
node _scripts/smoke.mjs  # 18 routes return 200
node _scripts/e2e.mjs    # signup → flag → dashboard → leaderboard
```

---

## Customizing

- **Brand / handle:** find `aysec` in `public/index.html`,
  `public/404.html`, `public/img/favicon.svg`, and `db/init.js`. Replace.
- **Colors:** all in `:root` and `[data-theme="light"]` at the top of
  `public/css/styles.css`. Swap accent / terminal / category colors there.
- **Hero terminal:** `public/js/terminal.js` — edit the `lines` array.

---

## License

Personal project. Pick a license before publishing.
