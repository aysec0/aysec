import { Router } from 'express';

const router = Router();

/** Site-side proxy for Discord widget config + live data.
 *  Lets the public /community page show real member counts WITHOUT exposing
 *  any tokens, since the widget API is public when enabled in server settings.
 */
router.get('/discord', async (_req, res) => {
  const inviteUrl = process.env.DISCORD_INVITE_URL || '';
  const serverId  = process.env.DISCORD_SERVER_ID  || '';
  if (!serverId) {
    return res.json({ enabled: false, invite_url: inviteUrl, presence_count: null, online_users: [], name: null });
  }
  try {
    const r = await fetch(`https://discord.com/api/guilds/${encodeURIComponent(serverId)}/widget.json`);
    if (!r.ok) {
      return res.json({ enabled: false, invite_url: inviteUrl, presence_count: null, online_users: [], name: null });
    }
    const data = await r.json();
    res.json({
      enabled: true,
      invite_url: data.instant_invite || inviteUrl,
      presence_count: data.presence_count ?? null,
      online_users: (data.members || []).slice(0, 12).map((m) => ({
        id: m.id, username: m.username, avatar_url: m.avatar_url, status: m.status,
      })),
      name: data.name || null,
    });
  } catch {
    res.json({ enabled: false, invite_url: inviteUrl, presence_count: null, online_users: [], name: null });
  }
});

export default router;
