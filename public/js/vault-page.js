(() => {
  function $(id) { return document.getElementById(id); }

  function render(data) {
    const { entries, progress, stats, show_location } = data;
    const pct = progress.total ? Math.round((progress.solved / progress.total) * 100) : 0;

    $('vaultProgress').innerHTML = `
      <div class="vault-progress-card">
        <div class="vault-progress-head">
          <div>
            <div class="vault-progress-eyebrow">// your progress</div>
            <div class="vault-progress-num"><strong>${progress.solved}</strong> of <strong>${progress.total}</strong> flags found</div>
          </div>
          <div class="vault-progress-pct">${pct}%</div>
        </div>
        <div class="vault-progress-bar"><div class="vault-progress-fill" style="width:${pct}%;"></div></div>
        <div class="vault-progress-foot">
          <span><strong>${stats.hunters}</strong> hunter${stats.hunters === 1 ? '' : 's'} active</span>
          <span><strong>${stats.full_crackers}</strong> Vault Cracker${stats.full_crackers === 1 ? '' : 's'}</span>
          ${!show_location && progress.solved < 2 ? `<span class="muted">solve 2 to unlock location hints</span>` : ''}
        </div>
      </div>`;

    $('vaultList').innerHTML = entries.map((e, i) => {
      const idx = String(i + 1).padStart(2, '0');
      return `
        <div class="vault-card ${e.solved ? 'is-solved' : ''}">
          <div class="vault-card-num">V${idx}</div>
          <div class="vault-card-body">
            <h3 class="vault-card-title">${escapeHtml(e.title)}</h3>
            <div class="vault-card-hint"><strong>hint:</strong> ${escapeHtml(e.hint)}</div>
            ${e.location ? `<div class="vault-card-loc"><strong>location:</strong> ${escapeHtml(e.location)}</div>` : `<div class="vault-card-loc muted">location unlocks after 2 solves</div>`}
          </div>
          <div class="vault-card-meta">
            <div class="vault-card-points">+${e.points} XP</div>
            ${e.solved ? `<div class="vault-card-status">✓ found</div>` : `<div class="vault-card-status pending">unfound</div>`}
          </div>
        </div>`;
    }).join('');
  }

  async function load() {
    try {
      const data = await window.api.get('/api/vault');
      render(data);
    } catch (err) {
      $('vaultList').innerHTML = `<div class="empty"><h3>Could not load vault</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  async function loadLeaderboard() {
    try {
      const data = await window.api.get('/api/vault/leaderboard');
      const lb = $('vaultLb');
      const rows = data.leaderboard || [];
      if (!rows.length) {
        lb.innerHTML = `<div class="empty"><p>No one has cracked any flags yet. Be the first.</p></div>`;
        return;
      }
      lb.innerHTML = `
        <div class="leaderboard">
          <div class="lb-row head">
            <div>#</div><div>Hunter</div>
            <div style="text-align:right">Found</div>
            <div style="text-align:right">Last</div>
          </div>
          ${rows.map((r, i) => `
            <div class="lb-row">
              <div class="lb-rank">${String(i + 1).padStart(2, '0')}</div>
              <div class="lb-user"><a href="/u/${escapeHtml(r.username)}" style="color:var(--text); font-weight:500;">${escapeHtml(r.display_name || r.username)}</a></div>
              <div class="lb-solves">${r.solves}/${data.total}</div>
              <div class="lb-score dim">${escapeHtml(window.fmtRelative(r.last))}</div>
            </div>
          `).join('')}
        </div>`;
    } catch {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    load();
    loadLeaderboard();

    const form = $('vaultForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const flag = $('vaultFlagInput').value.trim();
      const alertEl = $('vaultAlert');
      alertEl.hidden = true;
      if (!flag) return;
      const btn = $('vaultSubmit');
      btn.disabled = true;
      const idle = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        const res = await window.api.post('/api/vault/submit', { flag });
        if (res.correct) {
          alertEl.hidden = false;
          alertEl.className = 'alert ok';
          if (res.already_had_it) {
            alertEl.textContent = `✓ ${res.title} — you already had this one.`;
          } else {
            alertEl.textContent = `✓ ${res.title} — +${res.points} XP. ${res.vault_id} added to your vault.`;
          }
          $('vaultFlagInput').value = '';
          await load();
          await loadLeaderboard();
        } else {
          alertEl.hidden = false;
          alertEl.className = 'alert warn';
          alertEl.textContent = 'Not a vault flag. Try again.';
        }
      } catch (err) {
        alertEl.hidden = false;
        alertEl.className = 'alert error';
        alertEl.textContent = err.status === 401
          ? 'Sign in to record vault progress.'
          : (err.message || 'Submit failed');
      } finally {
        btn.disabled = false;
        btn.textContent = idle;
      }
    });
  });
})();
