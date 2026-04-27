/* /community — pulls live Discord widget data from /api/community/discord. */
(() => {
  function $(id) { return document.getElementById(id); }
  function initials(s) { return String(s || '?').slice(0, 2).toUpperCase(); }

  document.addEventListener('DOMContentLoaded', async () => {
    let info = null;
    try {
      info = await window.api.get('/api/community/discord');
    } catch {}

    const inviteUrl = info?.invite_url || '';
    const hasInvite = !!inviteUrl;
    const widgetEnabled = !!info?.enabled;

    // CTA button
    if (hasInvite) {
      $('discordCTA').innerHTML = `
        <a class="discord-cta" href="${inviteUrl}" target="_blank" rel="noopener">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.078.037 13.7 13.7 0 0 0-.61 1.249 18.27 18.27 0 0 0-5.487 0 12.65 12.65 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.099.245.198.372.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
          Open Discord invite
        </a>`;
    } else {
      $('discordCTA').innerHTML = `
        <span class="discord-cta-disabled">
          // invite link coming soon — set DISCORD_INVITE_URL to enable
        </span>`;
    }

    // Stats: members online + total
    if (widgetEnabled && info.presence_count != null) {
      $('discordStats').innerHTML = `
        <div class="discord-stats">
          <span class="discord-stat-online">
            <strong>${Number(info.presence_count).toLocaleString()}</strong>&nbsp;online now
          </span>
          ${info.name ? `<span style="opacity:0.8;">in <strong>${escapeHtml(info.name)}</strong></span>` : ''}
        </div>`;
    } else if (hasInvite) {
      $('discordStats').innerHTML = `
        <div class="discord-stats">
          <span style="opacity:0.85;">enable widget in Discord settings to show live counts here</span>
        </div>`;
    }

    // Online avatars (if widget enabled)
    if (widgetEnabled && info.online_users?.length) {
      $('discordOnline').innerHTML = info.online_users.slice(0, 12).map((u) => `
        <span class="discord-online-avatar" title="${escapeHtml(u.username)}">
          ${u.avatar_url ? `<img src="${escapeHtml(u.avatar_url)}" alt="${escapeHtml(u.username)}" loading="lazy" />` : escapeHtml(initials(u.username))}
        </span>
      `).join('');
    }
  });
})();
