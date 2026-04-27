# Discord setup guide

This is a from-scratch playbook for setting up the **aysec Discord** so it
syncs cleanly with the website. Time required: 30-45 min the first time.

---

## 1. Create the server (5 min)

1. Open Discord → `+` icon (left rail) → **Create My Own** → **For me and my friends**.
2. **Server name:** `aysec` (lowercase, matches the brand).
3. **Server icon:** use `/public/img/favicon.svg` exported to PNG at 512×512.
4. **Banner** (optional, requires server boost or you can skip): a dark hex-grid background with the `~$ aysec` wordmark.
5. **Verification level:** *Medium* (verified email required) — keeps spam out.

## 2. Channel structure (10 min)

Recommended channels, organized into categories:

```
📢 ANNOUNCEMENTS
  #welcome           — pinned: rules, link to /community page
  #announcements     — auto-pinged by the website (new courses, CTF drops)
  #first-bloods      — auto-pinged by the website on first solves

💬 GENERAL
  #general           — open chat
  #introduce-yourself
  #showcase          — share what you've built / certs you earned

🆘 HELP
  #help-web
  #help-binex
  #help-ai
  #help-cloud
  #help-other

📝 LEARNING
  #writeups          — share writeups for retired challenges
  #resources         — links, papers, tools
  #book-club         — monthly book / paper discussion

💼 PROFESSIONAL
  #jobs-board        — hiring + looking-for-work
  #engagements       — public-only consulting questions

🔊 VOICE
  Voice Lounge       — body-double work sessions
  Office Hours       — used for monthly live Q&A
```

For each channel: set the topic to a one-line purpose so members know what
belongs where.

## 3. Roles (10 min)

Create these in **Server Settings → Roles**, ordered top-to-bottom by power:

| Role          | Color   | Purpose                                  |
|---------------|---------|------------------------------------------|
| `@aysec`      | green   | You. Pinned at top. Admin perms.         |
| `@mod`        | blue    | Trusted helpers. Moderate channels.      |
| `@pro`        | gold    | Pro Monthly subscribers. Office-hours scheduling priority. |
| `@all-access` | purple  | All-Access bundle owners.                |
| `@verified`   | grey    | Has linked their aysec account (future). |
| `@bot`        | dark    | For webhooks + bots.                     |

**Permissions tip:** create one base role (`@verified`) that's required to
talk in `#general`. Otherwise spammers can join via the invite and post in
seconds. Use Discord's **Membership Screening** + **Verification rules** to
require an action before posting.

## 4. Webhooks: let the website post automatically (5 min)

The website can announce events into a Discord channel without any bot.

1. In Discord: `#announcements` channel → **gear icon** → **Integrations** → **Webhooks** → **New Webhook**.
2. Name it `aysec-bot`. Use your favicon as the avatar.
3. **Copy Webhook URL** (treat it like a secret — never commit it).
4. On the server (your `.env`): set `DISCORD_WEBHOOK_URL=<paste>`.
5. Restart the server.

After this, these events auto-post to that channel:
- 🩸 **First-blood** on any CTF challenge
- 🎓 **New certificate** earned by any user
- 📈 **Level-up** to Lv 5+ (lower levels are filtered out to avoid spam)
- 📰 **New blog post** published *(when admin tooling lands)*
- 🚩 **New CTF challenge** published *(when admin tooling lands)*

The webhook posts beautiful Discord embeds (color-coded, with the user's
profile link, points, and a deep link back to the site).

If you want **multiple channels** (e.g., one for first-bloods, one for
everything else): repeat the webhook step per channel and tweak
`lib/discord.js` to use different URLs per event. Right now it routes all
events to a single channel.

## 5. Server widget: show live "online now" counts on the website (3 min)

1. In Discord: **Server Settings** → **Widget** → toggle **Enable Server Widget**.
2. **Copy Server ID** from the same screen.
3. On the server (your `.env`): set `DISCORD_SERVER_ID=<paste>`.
4. Restart.

The `/community` page now shows the live online member count + the avatars
of up to 12 currently-online members.

The widget API is **read-only and public** — Discord designed it for this
exact use case. No bot token required.

## 6. Invite link (2 min)

1. Right-click your server icon → **Invite People** → **Edit invite link**.
2. **Expire after:** *Never*.
3. **Max number of uses:** *No limit*.
4. **Copy** the URL (looks like `https://discord.gg/abc123`).
5. On the server: set `DISCORD_INVITE_URL=<paste>`. Restart.

The invite link is now used everywhere on the site that has a "Join Discord"
CTA — landing page, footer, dashboard, hire page, course details.

## 7. Bots worth installing (optional but recommended)

| Bot         | Purpose                                                    |
|-------------|------------------------------------------------------------|
| **MEE6**    | Welcome messages, auto-roles, leveling, moderation logging |
| **Carl-bot**| Reaction roles, advanced moderation, embed builder         |
| **Statbot** | Member growth, channel activity, retention metrics         |
| **Sesh**    | Schedule monthly office hours, RSVP tracking               |
| **Wick**    | Anti-raid, anti-spam (turn this on early)                  |

For our context the must-haves are **MEE6** (welcome + auto-role) and
**Wick** (anti-raid). The rest are nice-to-haves.

## 8. Membership screening + welcome (5 min)

1. **Server Settings** → **Membership Screening** → **Set Up**.
2. Add a rule like: *"I have read the rules and won't post flags publicly."*
3. New members can't post until they accept.

Then in `#welcome`, pin a single message:

```
welcome to aysec.

rules: https://aysec.me/community#rules
website: https://aysec.me
got stuck? help-* channels are your friend.

start here:
- /tracks → Path Finder quiz (90s)
- /lab    → security toolbox (bookmark this)
- /events → CTFs & cons calendar
```

## 9. Verification flow (advanced — future work)

For the `@verified` role (linking a Discord user to their aysec account):
- Add a `discord_user_id` column to the `users` table
- Implement Discord OAuth: `/api/auth/discord/start` → redirect to Discord → `/api/auth/discord/callback` populates the column
- A Discord bot (or webhook) reads which users are linked and assigns the role

This isn't built yet — see the roadmap. For now, manually assign the
`@verified` role when someone DMs you their aysec username.

## 10. Linked roles (further future)

Discord supports **linked roles** that auto-assign based on data exposed
by an OAuth-connected service. For us:
- "Lv 5+" role (Pentester or higher)
- "OSCP-prepping" role
- "First-blood holder" role

Setup requires:
1. Discord application with OAuth + Linked Roles configured
2. `aysec` exposes `/discord/linked-roles/metadata` (Discord polls it)
3. Users authorize → Discord auto-assigns the role

Out of scope for v1, but the foundation (level/xp data) is already there.

---

## Tracking checklist

- [ ] Server created, name = `aysec`, icon set
- [ ] Channels created (announcements, help-*, writeups, jobs-board, voice)
- [ ] Roles created (`@aysec`, `@mod`, `@pro`, `@all-access`, `@verified`, `@bot`)
- [ ] Membership screening enabled
- [ ] Anti-raid bot (Wick) installed and configured
- [ ] **Webhook URL** set in `.env` → first-blood / cert / level-up events fire
- [ ] **Server ID** set in `.env` → live online counts on `/community`
- [ ] **Invite URL** set in `.env` → "Join Discord" CTAs link to your real server
- [ ] `#welcome` has a pinned message linking back to the site
