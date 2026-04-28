-- Users
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,
  bio           TEXT,
  role          TEXT NOT NULL DEFAULT 'user',  -- user | admin
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Courses
CREATE TABLE IF NOT EXISTS courses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  description     TEXT,
  thumbnail_url   TEXT,
  difficulty      TEXT,                          -- beginner | intermediate | advanced
  is_paid         INTEGER NOT NULL DEFAULT 0,    -- 0 free, 1 paid
  price_cents     INTEGER NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  stripe_price_id TEXT,
  published       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);

-- Lessons (within a course)
CREATE TABLE IF NOT EXISTS lessons (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id         INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  slug              TEXT NOT NULL,
  title             TEXT NOT NULL,
  content_md        TEXT,
  video_url         TEXT,
  position          INTEGER NOT NULL DEFAULT 0,
  is_preview        INTEGER NOT NULL DEFAULT 0,  -- free preview lesson?
  estimated_minutes INTEGER NOT NULL DEFAULT 10, -- approx reading/lab time
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(course_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, position);

-- Course access (free enrollments + paid purchases)
CREATE TABLE IF NOT EXISTS course_access (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,                          -- free | stripe | manual
  stripe_session_id TEXT,
  granted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, course_id)
);

-- Lesson progress
CREATE TABLE IF NOT EXISTS lesson_progress (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  lesson_id    INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, lesson_id)
);

-- CTF challenges
CREATE TABLE IF NOT EXISTS challenges (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL,                         -- web | crypto | pwn | rev | forensics | misc
  difficulty   TEXT NOT NULL,                         -- easy | medium | hard | insane
  points       INTEGER NOT NULL DEFAULT 100,
  description  TEXT,
  attachment_url TEXT,
  remote_url   TEXT,                                  -- e.g., target host:port
  flag_hash    TEXT NOT NULL,                         -- sha256(flag)
  hints        TEXT,                                  -- JSON array of strings (progressive hints)
  author       TEXT,
  published    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_challenges_category ON challenges(category);

-- Flag submissions (one row per attempt; keep for rate-limiting + auditing)
CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  challenge_id  INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  submitted_flag TEXT NOT NULL,
  is_correct    INTEGER NOT NULL,
  ip_address    TEXT,
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_user      ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_challenge ON submissions(challenge_id);

-- Solves (deduped successful submissions; powers leaderboard)
CREATE TABLE IF NOT EXISTS solves (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  solved_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, challenge_id)
);

-- Blog posts / writeups
CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  excerpt      TEXT,
  content_md   TEXT,
  cover_url    TEXT,
  tags         TEXT,                                  -- comma-separated
  kind         TEXT NOT NULL DEFAULT 'post',          -- post | writeup
  published    INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published, published_at DESC);

-- Newsletter
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  source          TEXT,                                 -- footer | landing | pricing | course
  confirmed       INTEGER NOT NULL DEFAULT 1,           -- single opt-in for now
  subscribed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at TEXT
);

-- Course completion certificates
CREATE TABLE IF NOT EXISTS certificates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  issued_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);

-- Testimonials (per-course or generic)
CREATE TABLE IF NOT EXISTS testimonials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id     INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  author_name   TEXT NOT NULL,
  author_title  TEXT,
  author_company TEXT,
  quote         TEXT NOT NULL,
  rating        INTEGER,                                -- 1..5
  position      INTEGER NOT NULL DEFAULT 0,
  published     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_testimonials_course ON testimonials(course_id, published, position);

-- FAQs (per-course or generic / pricing)
CREATE TABLE IF NOT EXISTS faqs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  scope       TEXT NOT NULL DEFAULT 'general',          -- general | course | pricing | hire
  course_id   INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_faqs_scope ON faqs(scope, position);

-- Talks (speaking history)
CREATE TABLE IF NOT EXISTS talks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  venue       TEXT NOT NULL,
  date        TEXT NOT NULL,                            -- YYYY-MM-DD
  url         TEXT,
  description TEXT,
  kind        TEXT NOT NULL DEFAULT 'talk',             -- talk | keynote | workshop | podcast
  position    INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_talks_date ON talks(date DESC);

-- Learning paths / curated career tracks (bundles of courses)
CREATE TABLE IF NOT EXISTS tracks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  description     TEXT,
  bundle_price_cents INTEGER NOT NULL DEFAULT 0,      -- 0 = sum of individual courses
  position        INTEGER NOT NULL DEFAULT 0,
  published       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS track_courses (
  track_id   INTEGER NOT NULL REFERENCES tracks(id)   ON DELETE CASCADE,
  course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (track_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_track_courses ON track_courses(track_id, position);

-- Certification prep paths (exam-aligned curricula)
CREATE TABLE IF NOT EXISTS cert_prep (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  slug              TEXT NOT NULL UNIQUE,
  cert_name         TEXT NOT NULL,                          -- "OSCP", "OSEP" etc.
  cert_full_name    TEXT,                                   -- spelled out
  cert_issuer       TEXT NOT NULL,                          -- "Offensive Security"
  exam_cost_cents   INTEGER,                                -- typical fee at time of writing
  exam_currency     TEXT DEFAULT 'USD',
  exam_url          TEXT,                                   -- official cert page
  difficulty        TEXT,                                   -- entry | intermediate | advanced | expert
  duration_estimate TEXT,                                   -- e.g. "3-4 months"
  tagline           TEXT,                                   -- one-liner
  description       TEXT,                                   -- markdown OK
  what_covered      TEXT,                                   -- markdown OK
  what_not_covered  TEXT,                                   -- markdown OK
  exam_tips         TEXT,                                   -- markdown OK
  position          INTEGER NOT NULL DEFAULT 0,
  published         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cert_prep_courses (
  cert_id     INTEGER NOT NULL REFERENCES cert_prep(id) ON DELETE CASCADE,
  course_id   INTEGER NOT NULL REFERENCES courses(id)   ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  why_relevant TEXT,                                        -- why this course maps to this cert
  PRIMARY KEY (cert_id, course_id)
);

CREATE TABLE IF NOT EXISTS cert_prep_challenges (
  cert_id      INTEGER NOT NULL REFERENCES cert_prep(id)  ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cert_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_cert_prep_courses    ON cert_prep_courses(cert_id, position);
CREATE INDEX IF NOT EXISTS idx_cert_prep_challenges ON cert_prep_challenges(cert_id, position);

-- Cybersecurity events calendar (CTFs, conferences, bug-bounty live events)
CREATE TABLE IF NOT EXISTS events (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  kind                  TEXT NOT NULL,                -- ctf | conference | bugbounty | awareness | workshop
  format                TEXT,                         -- jeopardy | attack-defense | in-person | virtual | hybrid
  start_date            TEXT NOT NULL,                -- YYYY-MM-DD
  end_date              TEXT,
  registration_deadline TEXT,
  url                   TEXT,
  location              TEXT,                         -- 'online' | city/country
  region                TEXT,                         -- global | mena | us | eu | apac
  prize_pool            TEXT,
  difficulty            TEXT,                         -- beginner | intermediate | advanced | mixed
  description           TEXT,
  organizer             TEXT,
  position              INTEGER NOT NULL DEFAULT 0,
  published             INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, start_date);

-- Cheatsheet hub
CREATE TABLE IF NOT EXISTS cheatsheets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,                          -- "nmap"
  subtitle     TEXT,
  category     TEXT,                                   -- recon | exploitation | post-ex | crypto | reversing | forensics | cloud | web | tools
  tool_url     TEXT,                                   -- official tool URL
  content_md   TEXT NOT NULL,                          -- markdown body
  position     INTEGER NOT NULL DEFAULT 0,
  published    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cheatsheets_category ON cheatsheets(category, position);

-- Notifications (in-platform bell)
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                          -- achievement | level_up | cert | first_blood | welcome | tip
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,                                   -- internal URL the bell links to
  icon        TEXT,                                   -- key from a known set (medal/crown/cert/sparkle/...)
  payload     TEXT,                                   -- optional JSON
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at);

-- Bookmarks (save course/challenge/post for later)
CREATE TABLE IF NOT EXISTS bookmarks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_kind   TEXT NOT NULL,                          -- course | challenge | post | cheatsheet | event
  item_id     INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, item_kind, item_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, created_at DESC);

-- ============================================================
-- Daily Challenge — one rotating challenge per day, fastest-time
-- leaderboard, persistent streak per user.
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_challenges (
  date          TEXT PRIMARY KEY,                          -- YYYY-MM-DD
  challenge_id  INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  bonus_points  INTEGER NOT NULL DEFAULT 50,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_solves (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          TEXT    NOT NULL,
  time_seconds  INTEGER NOT NULL,
  solved_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_solves_date ON daily_solves(date, time_seconds);

CREATE TABLE IF NOT EXISTS daily_streaks (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current       INTEGER NOT NULL DEFAULT 0,
  longest       INTEGER NOT NULL DEFAULT 0,
  last_date     TEXT
);

-- ============================================================
-- Live CTF events — scheduled, time-bounded, with their own
-- challenge set + scoreboard separate from the global one.
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT,
  starts_at   TEXT NOT NULL,                              -- ISO datetime UTC
  ends_at     TEXT NOT NULL,
  banner_url  TEXT,
  prize       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ctf_events_starts ON ctf_events(starts_at);

CREATE TABLE IF NOT EXISTS ctf_event_challenges (
  event_id     INTEGER NOT NULL REFERENCES ctf_events(id) ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  points       INTEGER,                                   -- override; null = use challenge default
  position     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS ctf_event_participants (
  event_id     INTEGER NOT NULL REFERENCES ctf_events(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  joined_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS ctf_event_solves (
  event_id     INTEGER NOT NULL REFERENCES ctf_events(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  solved_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_ctf_event_solves_event ON ctf_event_solves(event_id, solved_at);

-- ============================================================
-- Skill assessments — proctored multi-machine cert-prep exams.
-- ============================================================
CREATE TABLE IF NOT EXISTS assessments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  slug               TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  cert_code          TEXT,                                -- e.g. OSCP, eJPT
  difficulty         TEXT,                                -- easy | medium | hard | insane
  time_limit_minutes INTEGER NOT NULL DEFAULT 1440,
  passing_points     INTEGER NOT NULL DEFAULT 70,
  description        TEXT,
  published          INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assessment_machines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  name          TEXT NOT NULL,                            -- "DC01", "WEB01"
  ip            TEXT,                                     -- decorative, e.g. 10.10.10.5
  role          TEXT,                                     -- "domain controller", "web app"
  points        INTEGER NOT NULL DEFAULT 20,
  flag_hash     TEXT NOT NULL,                            -- sha256(flag)
  hint          TEXT
);

CREATE INDEX IF NOT EXISTS idx_assessment_machines ON assessment_machines(assessment_id, position);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id)  ON DELETE CASCADE,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT,
  points_earned INTEGER NOT NULL DEFAULT 0,
  passed        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_assessment_attempts_user ON assessment_attempts(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS assessment_machine_solves (
  attempt_id INTEGER NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  machine_id INTEGER NOT NULL REFERENCES assessment_machines(id) ON DELETE CASCADE,
  solved_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (attempt_id, machine_id)
);

-- ============================================================
-- Pro Labs — chained, multi-machine "enterprise" scenarios.
-- ============================================================
CREATE TABLE IF NOT EXISTS pro_labs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  difficulty    TEXT,                                    -- easy | medium | hard | insane
  scenario      TEXT,                                    -- short markdown narrative
  description   TEXT,
  network_diagram TEXT,                                  -- ASCII / markdown of the network
  published     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pro_lab_machines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  lab_id        INTEGER NOT NULL REFERENCES pro_labs(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  name          TEXT NOT NULL,
  ip            TEXT,
  role          TEXT,
  user_flag_hash TEXT,                                   -- sha256(flag)
  root_flag_hash TEXT,
  user_points   INTEGER NOT NULL DEFAULT 10,
  root_points   INTEGER NOT NULL DEFAULT 20,
  hint          TEXT
);

CREATE INDEX IF NOT EXISTS idx_pro_lab_machines ON pro_lab_machines(lab_id, position);

CREATE TABLE IF NOT EXISTS pro_lab_solves (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
  lab_id    INTEGER NOT NULL REFERENCES pro_labs(id)         ON DELETE CASCADE,
  machine_id INTEGER NOT NULL REFERENCES pro_lab_machines(id) ON DELETE CASCADE,
  flag_kind TEXT NOT NULL,                              -- 'user' | 'root'
  solved_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, machine_id, flag_kind)
);

-- ============================================================
-- Teams — multi-seat plans for org subscriptions.
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                     TEXT NOT NULL UNIQUE,
  name                     TEXT NOT NULL,
  owner_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seats                    INTEGER NOT NULL DEFAULT 5,
  plan                     TEXT NOT NULL DEFAULT 'team-monthly', -- team-monthly | team-annual
  stripe_subscription_id   TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id   INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',       -- owner | admin | member
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (team_id, user_id)
);

-- ============================================================
-- Reddit-style community forum
-- Categories ("subs"), posts (text or link), nested comments,
-- per-user up/down votes on both. score is denormalised so list
-- queries don't need a SUM().
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT,                                       -- hex / css
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS forum_posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   INTEGER NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body_md       TEXT NOT NULL DEFAULT '',
  url           TEXT,                                      -- optional link post
  score         INTEGER NOT NULL DEFAULT 1,
  comment_count INTEGER NOT NULL DEFAULT 0,
  pinned        INTEGER NOT NULL DEFAULT 0,
  locked        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_forum_posts_cat   ON forum_posts(category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_score ON forum_posts(score DESC);

CREATE TABLE IF NOT EXISTS forum_post_votes (
  post_id  INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote     INTEGER NOT NULL,                              -- +1 / -1
  voted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS forum_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES forum_comments(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body_md    TEXT NOT NULL,
  score      INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_forum_comments_post ON forum_comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS forum_comment_votes (
  comment_id INTEGER NOT NULL REFERENCES forum_comments(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote       INTEGER NOT NULL,
  voted_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, user_id)
);

-- ============================================================
-- Site settings (key/value) — editable via /admin → Site
-- Used to populate hero / footer / about copy without re-deploying.
-- ============================================================
CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_invites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT
);

-- ============================================================
-- The Vault — meta-CTF where flags are hidden across the platform
-- itself. Solves recorded separately from regular CTF solves.
-- ============================================================
CREATE TABLE IF NOT EXISTS vault_solves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vault_id   TEXT NOT NULL,
  solved_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, vault_id)
);

CREATE INDEX IF NOT EXISTS idx_vault_user ON vault_solves(user_id, solved_at DESC);
