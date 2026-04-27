/* Universal avatar renderer.
 * window.renderAvatar(target, user) — paints the user's avatar into `target`.
 * window.avatarHTML(user, opts)     — returns HTML string for inline use.
 * Source of truth for: emoji vs URL vs initials fallback.
 */
(() => {
  function isUrl(s) { return typeof s === 'string' && /^https?:\/\//.test(s); }
  function isEmoji(s) { return typeof s === 'string' && s.length > 0 && s.length <= 8 && !isUrl(s); }
  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
      .map((s) => s[0]).join('').toUpperCase();
  }

  function avatarHTML(user, opts = {}) {
    const av = user?.avatar_url;
    const cls = opts.className || 'dash-avatar';
    if (isUrl(av)) {
      return `<div class="${cls}" style="overflow:hidden;"><img src="${escapeHtml(av)}" alt="" style="width:100%;height:100%;object-fit:cover;" loading="lazy"/></div>`;
    }
    if (isEmoji(av)) {
      return `<div class="${cls} has-emoji" aria-hidden="true">${escapeHtml(av)}</div>`;
    }
    const name = user?.display_name || user?.username || '?';
    return `<div class="${cls}" aria-hidden="true">${escapeHtml(initials(name))}</div>`;
  }

  function renderAvatar(target, user, opts) {
    if (!target) return;
    target.outerHTML = avatarHTML(user, opts);
  }

  window.avatarHTML   = avatarHTML;
  window.renderAvatar = renderAvatar;
  window.avatarKind   = (av) => isUrl(av) ? 'url' : (isEmoji(av) ? 'emoji' : 'initials');
})();
