(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const slug = location.pathname.replace(/\/+$/, '').split('/').pop();

  function renderHeader(lab) {
    document.title = lab.title + ' — aysec';
    $('lSlug').textContent = lab.slug;
    $('lEyebrow').textContent = '// /pro-labs/' + lab.slug;
    $('lTitle').textContent = lab.title;
    $('lDesc').textContent = lab.scenario || lab.description || '';
    if (lab.network_diagram) {
      $('lDiagram').innerHTML = `<div class="card" style="padding:1rem 1.2rem; margin-bottom:1rem;"><div class="tool-out-label">network diagram</div><pre class="mono" style="font-size:0.78rem; margin:0.4rem 0 0; white-space:pre-wrap;">${escapeHtml(lab.network_diagram)}</pre></div>`;
    }
  }

  function machineCard(m, solvedSet) {
    const userSolved = solvedSet.has(`${m.id}:user`);
    const rootSolved = solvedSet.has(`${m.id}:root`);
    return `
      <div class="card" style="padding:1rem 1.2rem; border-left: 3px solid ${userSolved && rootSolved ? 'var(--terminal,#39ff7a)' : userSolved || rootSolved ? '#ffb74d' : 'var(--border)'};">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-weight:600;">${escapeHtml(m.name)} <span class="dim mono" style="font-size:0.78rem;">${escapeHtml(m.ip || '')}</span></div>
            <div class="dim" style="font-size:0.78rem; margin-top:0.15rem;">${escapeHtml(m.role || '')}</div>
          </div>
          <div style="display:flex; gap:0.3rem;">
            ${userSolved ? `<span class="tag" style="background: color-mix(in srgb, var(--terminal,#39ff7a) 18%, transparent); color: var(--terminal,#39ff7a);">user ✓</span>` : `<span class="tag dim">user ${m.user_points}</span>`}
            ${rootSolved ? `<span class="tag" style="background: color-mix(in srgb, var(--terminal,#39ff7a) 18%, transparent); color: var(--terminal,#39ff7a);">root ✓</span>` : `<span class="tag dim">root ${m.root_points}</span>`}
          </div>
        </div>
        <div style="display:grid; gap:0.5rem; margin-top:0.7rem; grid-template-columns: 1fr 1fr;">
          ${userSolved ? '' : `
            <form class="m-form" data-mid="${m.id}" data-kind="user" style="display:flex; gap:0.4rem;">
              <input class="input mono" name="flag" placeholder="user flag" style="flex:1;" required />
              <button class="btn btn-ghost" type="submit">user</button>
            </form>`}
          ${rootSolved ? '' : `
            <form class="m-form" data-mid="${m.id}" data-kind="root" style="display:flex; gap:0.4rem;">
              <input class="input mono" name="flag" placeholder="root flag" style="flex:1;" required />
              <button class="btn btn-primary" type="submit">root</button>
            </form>`}
        </div>
        ${m.hint ? `<details class="dim" style="font-size:0.8rem; margin-top:0.5rem;"><summary>hint</summary><div style="margin-top:0.3rem;">${escapeHtml(m.hint)}</div></details>` : ''}
        <div class="m-feedback dim" style="font-size:0.8rem; margin-top:0.3rem;"></div>
      </div>`;
  }

  async function load() {
    try {
      const r = await window.api.get(`/api/pro-labs/${slug}`);
      renderHeader(r.lab);
      const solvedSet = new Set((r.solved || []).map((s) => `${s.machine_id}:${s.flag_kind}`));
      $('lMachines').innerHTML = r.machines.map((m) => machineCard(m, solvedSet)).join('');
      $('lTermLink').innerHTML = `<a class="btn btn-ghost" href="/lab-term/${slug}">Open simulated lab terminal →</a>`;
      $('lBoard').innerHTML = r.board.length
        ? r.board.map((u, i) => `<li style="margin-bottom:0.25rem;"><span>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''} ${escapeHtml(u.display_name || u.username)}</span> <span class="dim mono" style="float:right;">${u.score} · ${u.flags} flags</span></li>`).join('')
        : '<li class="dim">no solves yet — be first</li>';
      document.querySelectorAll('.m-form').forEach((f) => {
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fb = f.parentElement.parentElement.querySelector('.m-feedback');
          try {
            const sr = await window.api.post(`/api/pro-labs/${slug}/submit`, {
              machine_id: Number(f.dataset.mid),
              flag_kind: f.dataset.kind,
              flag: f.elements.flag.value.trim(),
            });
            if (sr.correct) { fb.textContent = '✓ correct +' + sr.points; fb.style.color = 'var(--terminal,#39ff7a)'; await load(); }
            else { fb.textContent = '✗ incorrect'; fb.style.color = 'var(--hard,#ff6b6b)'; }
          } catch (err) { fb.textContent = err.message; fb.style.color = 'var(--hard,#ff6b6b)'; }
        });
      });
    } catch (e) {
      $('lTitle').textContent = 'Lab not found';
      $('lDesc').textContent = e.message;
    }
  }
  document.addEventListener('DOMContentLoaded', load);
})();
