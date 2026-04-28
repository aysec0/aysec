(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  // Path is /assessments/<slug> or /assessments/<slug>/take/<attemptId>
  const parts = location.pathname.replace(/\/+$/, '').split('/');
  const slug = parts[2];
  const isTake = parts[3] === 'take';
  const attemptId = isTake ? Number(parts[4]) : null;

  function fmtTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  // ----- Intro page (/assessments/<slug>) -----
  async function renderIntro() {
    const r = await window.api.get(`/api/assessments/${slug}`);
    const a = r.assessment;
    document.title = a.title + ' — aysec';
    $('aSlug').textContent = a.slug;
    $('aEyebrow').textContent = '// /assessments/' + a.slug;
    $('aTitle').textContent = a.title;
    $('aDesc').textContent = a.description || '';

    $('aBody').innerHTML = `
      <div class="card" style="padding:1.5rem; max-width:780px; margin: 0 auto;">
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:1rem;">
          ${a.cert_code ? `<span class="tag">${a.cert_code}</span>` : ''}
          ${a.difficulty ? `<span class="tag" data-difficulty="${a.difficulty}">${a.difficulty}</span>` : ''}
          <span class="tag">${a.time_limit_minutes} min limit</span>
          <span class="tag">${a.passing_points} pts to pass</span>
          <span class="tag">${r.machines.length} machines</span>
        </div>
        <h2 style="margin-top:0;">What you’ll do</h2>
        <p>You have <strong>${a.time_limit_minutes} minutes</strong> from the moment you click <strong>Start</strong>.
           Compromise each machine and submit the flag you find. Reach <strong>${a.passing_points} points</strong> to pass.</p>
        <h3>Machines</h3>
        <ul style="font-family:var(--font-mono); font-size:0.88rem;">
          ${r.machines.map((m) => `<li><strong>${escapeHtml(m.name)}</strong> ${m.ip ? `<span class="dim">— ${escapeHtml(m.ip)}</span>` : ''} ${m.role ? `<span class="dim">· ${escapeHtml(m.role)}</span>` : ''} <span class="dim">· ${m.points} pts</span></li>`).join('')}
        </ul>

        <button class="btn btn-primary" id="startBtn" style="margin-top:1rem;">Start the timer →</button>
        ${r.attempts.length ? `<details style="margin-top:1rem;"><summary class="dim">past attempts</summary><ul style="font-size:0.85rem; margin-top:0.5rem;">${r.attempts.map((at) => `<li>${at.started_at} — ${at.points_earned} pts ${at.passed ? '<span style="color: var(--terminal,#39ff7a);">PASSED</span>' : at.ended_at ? '<span style="color: var(--hard,#ff6b6b);">failed</span>' : '<em>in progress</em>'}</li>`).join('')}</ul></details>` : ''}
      </div>`;
    $('startBtn').addEventListener('click', async () => {
      try {
        const sr = await window.api.post(`/api/assessments/${slug}/start`, {});
        location.href = `/assessments/${slug}/take/${sr.attempt.id}`;
      } catch (e) { alert(e.message); }
    });
  }

  // ----- Exam page (/assessments/<slug>/take/<attemptId>) -----
  let timerInt = null;
  async function renderExam() {
    const r = await window.api.get(`/api/assessments/${slug}/attempt/${attemptId}`);
    const a = r.assessment;
    document.title = a.title + ' — aysec';
    $('aSlug').textContent = a.slug;
    $('aEyebrow').textContent = `// /assessments/${a.slug} · attempt ${attemptId}`;
    $('aTitle').textContent = a.title;
    $('aDesc').textContent = `Solve every machine, submit the flag. Pass at ${a.passing_points} pts.`;

    const ended = r.attempt.ended_at;
    $('aBody').innerHTML = `
      <div style="display:grid; gap:1.5rem; grid-template-columns: minmax(0, 1fr) minmax(0, 320px);">
        <div>
          ${ended ? `<div class="alert info"><div>Attempt ended at ${ended} — final ${r.attempt.points_earned} pts ${r.attempt.passed ? '· <strong style="color:var(--terminal,#39ff7a);">PASSED</strong>' : '· <strong style="color:var(--hard,#ff6b6b);">failed</strong>'}</div></div>` : ''}
          <div id="machinesList" class="grid grid-cols-1" style="gap:0.7rem;"></div>
          ${!ended ? `<button class="btn btn-ghost" id="finishBtn" style="margin-top:1rem;">End attempt early</button>` : `<a class="btn btn-ghost" href="/assessments">← all assessments</a>`}
        </div>
        <aside style="display:flex; flex-direction:column; gap:1rem;">
          <div class="card" style="padding:1.1rem 1.2rem;">
            <div class="tool-out-label">Time remaining</div>
            <div class="mono" id="timer" style="font-size:1.5rem; font-weight:700; color: var(--accent); margin-top:0.3rem;">—</div>
          </div>
          <div class="card" style="padding:1.1rem 1.2rem;">
            <div class="tool-out-label">Score</div>
            <div id="score" style="font-size:1.5rem; font-weight:700; margin-top:0.3rem;">${r.attempt.points_earned} / ${a.passing_points}</div>
          </div>
        </aside>
      </div>`;

    function renderMachines(machines) {
      $('machinesList').innerHTML = machines.map((m) => `
        <div class="card" style="padding:1rem 1.2rem; border-left: 3px solid ${m.solved ? 'var(--terminal,#39ff7a)' : 'var(--border)'};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="font-weight:600;">${escapeHtml(m.name)} <span class="dim mono" style="font-size:0.78rem;">${escapeHtml(m.ip || '')}</span></div>
              <div class="dim" style="font-size:0.78rem; margin-top:0.15rem;">${escapeHtml(m.role || '')} · ${m.points} pts</div>
            </div>
            ${m.solved ? '<span class="tag" style="background: color-mix(in srgb, var(--terminal,#39ff7a) 18%, transparent); color: var(--terminal,#39ff7a);">solved</span>' : ''}
          </div>
          ${!ended && !m.solved ? `
            <form class="m-form" data-mid="${m.id}" style="margin-top:0.6rem; display:flex; gap:0.4rem;">
              <input class="input mono" name="flag" placeholder="aysec{...}" style="flex:1;" required />
              <button class="btn btn-primary" type="submit">Submit</button>
            </form>
            <div class="m-feedback dim" style="font-size:0.8rem; margin-top:0.3rem;"></div>
            ${m.hint ? `<details class="dim" style="font-size:0.8rem; margin-top:0.4rem;"><summary>hint</summary><div style="margin-top:0.3rem;">${escapeHtml(m.hint)}</div></details>` : ''}
          ` : ''}
        </div>
      `).join('');
      document.querySelectorAll('.m-form').forEach((f) => {
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fb = f.parentElement.querySelector('.m-feedback');
          try {
            const sr = await window.api.post(`/api/assessments/${slug}/attempt/${attemptId}/submit`, {
              machine_id: Number(f.dataset.mid),
              flag: f.elements.flag.value.trim(),
            });
            if (sr.correct) { fb.textContent = '✓ correct'; fb.style.color = 'var(--terminal,#39ff7a)'; await refresh(); }
            else { fb.textContent = '✗ incorrect'; fb.style.color = 'var(--hard,#ff6b6b)'; }
          } catch (err) { fb.textContent = err.message; fb.style.color = 'var(--hard,#ff6b6b)'; }
        });
      });
    }
    renderMachines(r.machines);

    if (!ended) {
      $('finishBtn').addEventListener('click', async () => {
        if (!confirm('End attempt now?')) return;
        await window.api.post(`/api/assessments/${slug}/attempt/${attemptId}/finish`, {});
        await refresh();
      });
    }

    let remaining = r.remaining_seconds;
    const tick = () => {
      if (remaining <= 0) { $('timer').textContent = '00:00:00'; clearInterval(timerInt); refresh(); return; }
      $('timer').textContent = fmtTime(remaining);
      remaining--;
    };
    clearInterval(timerInt);
    if (!ended) { tick(); timerInt = setInterval(tick, 1000); }
    else $('timer').textContent = 'ended';
  }

  async function refresh() { isTake ? await renderExam() : await renderIntro(); }
  document.addEventListener('DOMContentLoaded', refresh);
})();
