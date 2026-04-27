/* Discord webhook helper. Sends embed-style announcements to a configured
 * channel. Idempotent and silent if no webhook URL is configured.
 *
 * Set DISCORD_WEBHOOK_URL in .env to enable. Get a webhook URL from:
 *   Discord → channel → Edit Channel → Integrations → Webhooks → New Webhook
 */

const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

// Discord embed color palette (decimal RGB)
const COLOR = {
  default:  0x4d9aff,
  success:  0x3fb950,
  bounty:   0xffb84d,
  warning:  0xd29922,
  blood:    0xf25555,
  ai:       0xa47bff,
  cert:     0x3fb950,
};

/**
 * Send a single embed message to the configured Discord webhook.
 * Silent no-op if no webhook URL is set or the request fails — we never want
 * Discord to block a user request.
 */
export async function send(embed, { username = 'aysec', avatarURL } = {}) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { skipped: true, reason: 'DISCORD_WEBHOOK_URL not set' };
  try {
    const body = JSON.stringify({
      username,
      avatar_url: avatarURL,
      embeds: [Array.isArray(embed) ? null : embed].filter(Boolean),
    });
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return { ok: r.ok, status: r.status };
  } catch (err) {
    // Never crash a user request because of Discord.
    return { ok: false, error: err.message };
  }
}

// ---- Convenience event helpers ----

export function announceFirstBlood({ userDisplay, userUsername, challengeTitle, challengeSlug, points }) {
  return send({
    title: '🩸 First blood!',
    description: `**${userDisplay || userUsername}** is the first to solve **${challengeTitle}**.`,
    url: `${SITE_URL}/challenges/${challengeSlug}`,
    color: COLOR.blood,
    fields: [
      { name: 'points', value: `+${points}`, inline: true },
      { name: 'player', value: `[${userDisplay || userUsername}](${SITE_URL}/u/${userUsername})`, inline: true },
    ],
    footer: { text: 'aysec — go take it from them' },
    timestamp: new Date().toISOString(),
  });
}

export function announceLevelUp({ userDisplay, userUsername, levelIdx, levelName, tagline }) {
  // Only announce above-Lv-5 to avoid spam from new accounts
  if (levelIdx < 5) return Promise.resolve({ skipped: true, reason: 'level too low' });
  return send({
    title: `📈 ${userDisplay || userUsername} reached Lv ${levelIdx + 1} — ${levelName}`,
    description: `_"${tagline || ''}"_`,
    url: `${SITE_URL}/u/${userUsername}`,
    color: COLOR.default,
    timestamp: new Date().toISOString(),
  });
}

export function announceCertificate({ userDisplay, userUsername, courseTitle, certCode }) {
  return send({
    title: '🎓 New certificate earned',
    description: `**${userDisplay || userUsername}** completed **${courseTitle}**.`,
    url: `${SITE_URL}/cert/${certCode}`,
    color: COLOR.cert,
    fields: [
      { name: 'student', value: `[${userDisplay || userUsername}](${SITE_URL}/u/${userUsername})`, inline: true },
      { name: 'verify',  value: `[/cert/${certCode}](${SITE_URL}/cert/${certCode})`, inline: true },
    ],
    timestamp: new Date().toISOString(),
  });
}

export function announceNewPost({ title, slug, excerpt, kind }) {
  return send({
    title: kind === 'writeup' ? `📝 New writeup: ${title}` : `📰 New post: ${title}`,
    description: excerpt || '',
    url: `${SITE_URL}/blog/${slug}`,
    color: COLOR.default,
    timestamp: new Date().toISOString(),
  });
}

export function announceNewChallenge({ title, slug, category, difficulty, points }) {
  return send({
    title: `🚩 New CTF challenge: ${title}`,
    description: `Drop everything and try this one.`,
    url: `${SITE_URL}/challenges/${slug}`,
    color: COLOR.warning,
    fields: [
      { name: 'category',   value: category,   inline: true },
      { name: 'difficulty', value: difficulty, inline: true },
      { name: 'points',     value: String(points), inline: true },
    ],
  });
}

export function announceWelcome({ userDisplay, userUsername }) {
  return send({
    title: '👋 New aysec member',
    description: `Welcome **${userDisplay || userUsername}** to the platform.`,
    url: `${SITE_URL}/u/${userUsername}`,
    color: COLOR.default,
  });
}
