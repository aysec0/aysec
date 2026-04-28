(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  async function load() {
    const me = await window.api.get('/api/auth/me').catch(() => null);
    const plansR = await window.api.get('/api/teams/plans');
    if (!me?.user) {
      $('teamsBody').innerHTML = `
        <div class="card" style="padding:1.5rem; max-width:560px; margin:0 auto;">
          <h2 style="margin-top:0;">Sign in to manage teams</h2>
          <p>Teams give you 5+ seats, a shared roster, and one bill.</p>
          <a class="btn btn-primary" href="/login?next=${encodeURIComponent('/teams')}">Sign in</a>
        </div>
        ${plansHtml(plansR.plans)}`;
      return;
    }
    const r = await window.api.get('/api/teams/me');
    let html = '';
    if (r.teams.length) {
      html += `<h2>Your teams</h2>
        <div class="grid grid-cols-2" style="gap:0.7rem;">
          ${r.teams.map((t) => `
            <a class="tools-index-card" href="/teams/${t.slug}">
              <div class="tools-index-card-head">
                <span class="tools-index-card-tag">${t.role}</span>
                <span class="tools-index-card-tag">${t.member_count}/${t.seats} seats</span>
              </div>
              <h3 class="tools-index-card-title">${escapeHtml(t.name)}</h3>
              <p class="tools-index-card-desc">${escapeHtml(t.plan)} · /${escapeHtml(t.slug)}</p>
            </a>`).join('')}
        </div>
        <hr style="margin: 2rem 0; border: 0; border-top: 1px solid var(--border);">`;
    }
    html += `
      <h2>Create a team</h2>
      <form id="newTeamForm" class="card" style="padding:1.5rem; max-width: 560px; display:flex; flex-direction:column; gap:0.7rem;">
        <label><span class="tool-out-label">Team name</span><input class="input" name="name" required placeholder="ACME SOC" /></label>
        <label><span class="tool-out-label">Plan</span>
          <select class="input" name="plan">
            ${Object.entries(plansR.plans).map(([k, p]) => `<option value="${k}">${p.label} — $${p.price}/${p.interval} · ${p.seats} seats</option>`).join('')}
          </select>
        </label>
        <button class="btn btn-primary" type="submit">Create team</button>
        <div class="dim" style="font-size:0.78rem;">Stripe checkout isn’t wired up yet — for now this creates the team in trial mode.</div>
      </form>
      ${plansHtml(plansR.plans)}`;
    $('teamsBody').innerHTML = html;
    $('newTeamForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const cr = await window.api.post('/api/teams', {
          name: fd.get('name'),
          plan: fd.get('plan'),
        });
        location.href = `/teams/${cr.slug}`;
      } catch (err) { alert(err.message); }
    });
  }

  function plansHtml(plans) {
    return `
      <h2 style="margin-top: 2rem;">What you get</h2>
      <ul style="font-size:0.95rem;">
        <li>One bill for everyone — no per-user accounting</li>
        <li>Internal team scoreboard</li>
        <li>Group enrolment in courses, certs, and assessments</li>
        <li>Owner / admin / member roles</li>
        <li>Email-invite flow with a join link (SMTP not wired yet — copy the link)</li>
      </ul>
      <h2 style="margin-top:1.5rem;">Plans</h2>
      <div class="grid grid-cols-2" style="gap:0.7rem;">
        ${Object.entries(plans).map(([k, p]) => `
          <div class="tools-index-card">
            <h3 class="tools-index-card-title">${p.label}</h3>
            <p class="tools-index-card-desc">$${p.price} / ${p.interval} · ${p.seats} seats included</p>
          </div>`).join('')}
      </div>`;
  }

  document.addEventListener('DOMContentLoaded', load);
})();
