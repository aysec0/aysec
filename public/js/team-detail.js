(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const slug = location.pathname.replace(/\/+$/, '').split('/').pop();

  async function load() {
    try {
      const r = await window.api.get(`/api/teams/${slug}`);
      const t = r.team;
      document.title = t.name + ' — aysec';
      $('tSlug').textContent = t.slug;
      $('tEyebrow').textContent = '// /teams/' + t.slug;
      $('tTitle').textContent = t.name;
      $('tDesc').textContent = `${r.plan.label} · ${r.members.length}/${t.seats} seats · you are ${r.my_role}`;
      const isLead = r.my_role === 'owner' || r.my_role === 'admin';
      $('tBody').innerHTML = `
        <div style="display:grid; gap:1.5rem; grid-template-columns: minmax(0, 1fr) minmax(0, 320px);">
          <div>
            <h2 style="margin-top:0;">Members</h2>
            <div class="grid grid-cols-1" style="gap:0.5rem;">
              ${r.members.map((m) => `
                <div class="card" style="padding:0.7rem 1rem; display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <a href="/u/${escapeHtml(m.username)}" style="font-weight:600;">${escapeHtml(m.display_name || m.username)}</a>
                    <span class="dim mono" style="font-size:0.78rem;"> @${escapeHtml(m.username)}</span>
                    <span class="dim" style="font-size:0.78rem;"> · ${m.role}</span>
                  </div>
                  <div class="dim mono" style="font-size:0.85rem;">${m.solves} solves</div>
                </div>`).join('')}
            </div>
            ${isLead ? `
              <h2 style="margin-top:1.5rem;">Invite a teammate</h2>
              <form id="inviteForm" class="card" style="padding:1rem 1.2rem; display:flex; gap:0.4rem;">
                <input class="input" type="email" name="email" placeholder="teammate@company.com" required style="flex:1;" />
                <button class="btn btn-primary" type="submit" ${r.members.length >= t.seats ? 'disabled' : ''}>Invite</button>
              </form>
              <div id="inviteResult" style="font-size:0.85rem; margin-top:0.4rem;"></div>
              ${r.invites.length ? `
                <h3 style="margin-top:1rem;">Pending invites</h3>
                <ul style="font-size:0.85rem;">
                  ${r.invites.map((i) => `<li>${escapeHtml(i.email)} <span class="dim">— invited ${i.created_at}</span></li>`).join('')}
                </ul>` : ''}
            ` : ''}
          </div>
          <aside>
            <div class="card" style="padding:1.1rem 1.2rem;">
              <div class="tool-out-label">Team scoreboard</div>
              <ol style="margin-top:0.5rem; padding-left:1.1rem; font-size:0.9rem;">
                ${[...r.members].sort((a, b) => b.solves - a.solves).map((m, i) => `<li style="margin-bottom:0.25rem;"><span>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''} ${escapeHtml(m.display_name || m.username)}</span> <span class="dim mono" style="float:right;">${m.solves}</span></li>`).join('')}
              </ol>
            </div>
          </aside>
        </div>`;
      const f = $('inviteForm');
      if (f) f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const out = $('inviteResult');
        try {
          const ir = await window.api.post(`/api/teams/${slug}/invites`, {
            email: f.elements.email.value.trim(),
          });
          out.innerHTML = `Send this link: <code>${location.origin}${ir.joinUrl}</code>`;
          out.style.color = 'var(--terminal,#39ff7a)';
          f.reset();
        } catch (err) { out.textContent = err.message; out.style.color = 'var(--hard,#ff6b6b)'; }
      });
    } catch (e) {
      $('tTitle').textContent = 'Team not found';
      $('tDesc').textContent = e.message;
    }
  }
  document.addEventListener('DOMContentLoaded', load);
})();
