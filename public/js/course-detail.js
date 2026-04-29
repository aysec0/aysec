(() => {
  let course = null;
  let lessons = [];
  let progressSet = new Set();
  let hasAccess = false;
  let currentLessonSlug = null;
  let user = null;
  let studentCount = 0;
  let testimonials = [];
  let faqs = [];
  let certificate = null;

  const slug = location.pathname.split('/').filter(Boolean)[1];
  const titleEl = document.getElementById('detailHead');
  const crumbEl = document.getElementById('crumbSlug');
  const listEl = document.getElementById('lessonList');
  const contentEl = document.getElementById('lessonContent');
  const progressLine = document.getElementById('progressLine');

  function renderHead() {
    if (!course) return;
    document.title = `${course.title} — aysec`;
    crumbEl.textContent = course.slug;

    const priceHtml = course.is_paid
      ? `<div class="detail-price"><span class="currency">$</span>${(course.price_cents / 100).toFixed(0)}</div>`
      : `<div class="detail-price"><span class="free">Free</span></div>`;

    let accessHtml;
    if (certificate) {
      accessHtml = `
        <a href="/cert/${escapeHtml(certificate.code)}" class="btn btn-primary btn-block">
          🏆 View your certificate
        </a>
        <div class="alert ok" style="margin-top:0.5rem;">
          <svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <div>Course completed — earned ${escapeHtml(window.fmtDate(certificate.issued_at))}.</div>
        </div>`;
    } else if (hasAccess) {
      accessHtml = `<div class="alert ok"><svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><div>You have full access.</div></div>`;
    } else if (course.is_paid) {
      accessHtml = `<button class="btn btn-primary btn-block" id="buyBtn">Buy course</button>`;
    } else {
      accessHtml = `<button class="btn btn-primary btn-block" id="enrollBtn">Enroll for free</button>`;
    }

    const studentLine = studentCount >= 5
      ? `<span class="card-meta-item">${studentCount.toLocaleString()} students</span>`
      : '';

    titleEl.innerHTML = `
      <div class="detail-head">
        <div>
          <div class="detail-meta">
            <span class="badge ${course.difficulty || 'easy'}">${escapeHtml(course.difficulty || '')}</span>
            <span class="badge ${course.is_paid ? 'paid' : 'free'}">${course.is_paid ? 'Paid' : 'Free'}</span>
            <span class="card-meta-item">${lessons.length} lessons</span>
            ${studentLine}
          </div>
          <h1 class="detail-title">${escapeHtml(course.title)}</h1>
          <p class="detail-subtitle">${escapeHtml(course.subtitle || '')}</p>
          <p class="muted" style="max-width:640px">${escapeHtml(course.description || '')}</p>
          <div style="margin-top:0.85rem;">
            <button type="button" data-bookmark-kind="course" data-bookmark-slug="${escapeHtml(course.slug)}">Save</button>
          </div>
        </div>
        <aside class="detail-side">
          ${priceHtml}
          ${accessHtml}
          <div class="detail-features">
            <div class="detail-feature"><span class="check">✓</span> ${lessons.length} lessons, lab-driven</div>
            <div class="detail-feature"><span class="check">✓</span> Progress tracking + completion certificate</div>
            <div class="detail-feature"><span class="check">✓</span> Lifetime access &amp; updates</div>
            <div class="detail-feature"><span class="check">✓</span> 30-day money-back guarantee</div>
            <div class="detail-feature"><span class="check">✓</span> Direct feedback channel</div>
          </div>
        </aside>
      </div>`;

    document.getElementById('buyBtn')?.addEventListener('click', onBuy);
    document.getElementById('enrollBtn')?.addEventListener('click', onEnroll);
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  }

  function renderTestimonialsAndFaq() {
    const wrap = document.getElementById('socialProofSection');
    if (!wrap) return;
    let html = '';
    if (testimonials && testimonials.length) {
      html += `
        <div class="section-head" style="margin-bottom:1.25rem;">
          <span class="section-eyebrow">// students say</span>
          <h2 class="section-title" style="font-size:1.6rem;">What people who've taken this say</h2>
        </div>
        <div class="grid grid-cols-${Math.min(testimonials.length, 3)}" style="margin-bottom:3rem;">
          ${testimonials.map((t) => `
            <div class="testimonial">
              <div class="stars" data-rating="${t.rating || 5}">${'★'.repeat(t.rating || 5)}${'☆'.repeat(5 - (t.rating || 5))}</div>
              <p class="testimonial-quote">"${escapeHtml(t.quote)}"</p>
              <div class="testimonial-author">
                <span class="testimonial-avatar">${escapeHtml(initials(t.author_name))}</span>
                <div>
                  <div class="testimonial-name">${escapeHtml(t.author_name)}</div>
                  <div class="testimonial-meta">${escapeHtml([t.author_title, t.author_company].filter(Boolean).join(' · '))}</div>
                </div>
              </div>
            </div>`).join('')}
        </div>`;
    }
    if (faqs && faqs.length) {
      html += `
        <div class="section-head" style="margin-bottom:1.25rem;">
          <span class="section-eyebrow">// faq</span>
          <h2 class="section-title" style="font-size:1.6rem;">Common questions</h2>
        </div>
        <div class="faq" style="max-width:760px;">
          ${faqs.map((f) => `
            <details>
              <summary>${escapeHtml(f.question)}</summary>
              <div class="faq-answer">${escapeHtml(f.answer)}</div>
            </details>`).join('')}
        </div>`;
    }
    wrap.innerHTML = html;
  }

  function renderLessonList() {
    const done = lessons.filter((l) => progressSet.has(l.id)).length;
    progressLine.textContent = `${done} / ${lessons.length} done`;

    listEl.innerHTML = lessons.map((l) => {
      const locked = course.is_paid && !hasAccess && !l.is_preview;
      const completed = progressSet.has(l.id);
      const active = currentLessonSlug === l.slug;
      const cls = ['lesson-item',
        locked ? 'locked' : '',
        completed ? 'done' : '',
        active ? 'active' : '',
      ].filter(Boolean).join(' ');
      const minLabel = l.estimated_minutes ? `${l.estimated_minutes}m` : '';
      return `
        <li>
          <a class="${cls}" href="#${escapeHtml(l.slug)}" data-slug="${escapeHtml(l.slug)}" ${locked ? 'aria-disabled="true"' : ''}>
            <span class="num">${String(l.position).padStart(2, '0')}</span>
            <span style="flex:1">${escapeHtml(l.title)}</span>
            ${minLabel ? `<span class="min">${minLabel}</span>` : ''}
            ${completed ? '<span class="check">✓</span>' : (locked ? '<span class="check" style="color:var(--medium)">$</span>' : '')}
          </a>
        </li>`;
    }).join('');

    listEl.querySelectorAll('a[data-slug]').forEach((a) => {
      a.addEventListener('click', (e) => {
        if (a.classList.contains('locked')) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        const ls = a.dataset.slug;
        currentLessonSlug = ls;
        history.replaceState(null, '', `#${ls}`);
        loadLesson(ls);
        renderLessonList();
      });
    });
  }

  async function loadLesson(lessonSlug) {
    contentEl.innerHTML = `
      <div class="skeleton" style="height:24px;width:50%;margin-bottom:1rem"></div>
      <div class="skeleton" style="height:14px;width:100%;margin-bottom:0.5rem"></div>
      <div class="skeleton" style="height:14px;width:90%;margin-bottom:0.5rem"></div>
      <div class="skeleton" style="height:14px;width:80%"></div>`;
    try {
      const data = await window.api.get(`/api/courses/${course.slug}/lessons/${lessonSlug}`);
      const { lesson, completed, prev, next } = data;
      const safeHtml = window.DOMPurify
        ? window.DOMPurify.sanitize(lesson.content_html || '')
        : (lesson.content_html || '');
      contentEl.innerHTML = `
        <div class="prose">${safeHtml || '<p class="muted">No content yet.</p>'}</div>
        <div class="lesson-nav">
          ${prev ? `<a class="lesson-nav-btn" href="#${escapeHtml(prev.slug)}" data-go="${escapeHtml(prev.slug)}">
            <span class="lesson-nav-label">← Previous</span><span>${escapeHtml(prev.title)}</span>
          </a>` : '<span></span>'}
          <button class="btn ${completed ? 'btn-ghost' : 'btn-primary'}" id="completeBtn" ${completed ? 'disabled' : ''}>
            ${completed ? '✓ Completed' : 'Mark as complete'}
          </button>
          ${next ? `<a class="lesson-nav-btn next" href="#${escapeHtml(next.slug)}" data-go="${escapeHtml(next.slug)}">
            <span class="lesson-nav-label">Next →</span><span>${escapeHtml(next.title)}</span>
          </a>` : '<span></span>'}
        </div>`;

      // Drop a "copy" button on every <pre> block — half the value of a
      // pentest lesson is the commands; you shouldn't have to triple-click.
      contentEl.querySelectorAll('.prose pre').forEach((pre) => {
        if (pre.querySelector('.lesson-copy-btn')) return; // idempotent
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lesson-copy-btn';
        btn.title = 'Copy';
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        pre.style.position = 'relative';
        pre.appendChild(btn);
        btn.addEventListener('click', async () => {
          const text = pre.querySelector('code')?.textContent ?? pre.textContent;
          try {
            await navigator.clipboard.writeText(text);
            btn.classList.add('is-copied');
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(() => {
              btn.classList.remove('is-copied');
              btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            }, 1400);
          } catch {}
        });
      });

      contentEl.querySelectorAll('a[data-go]').forEach((a) => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          currentLessonSlug = a.dataset.go;
          history.replaceState(null, '', `#${currentLessonSlug}`);
          loadLesson(currentLessonSlug);
          renderLessonList();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });

      document.getElementById('completeBtn')?.addEventListener('click', async () => {
        if (!user) {
          location.href = `/login?next=${encodeURIComponent(location.pathname + location.hash)}`;
          return;
        }
        try {
          const res = await window.api.post(`/api/courses/${course.slug}/lessons/${lessonSlug}/complete`);
          progressSet.add(lesson.id);
          if (res?.certificate && !certificate) {
            certificate = res.certificate;
            renderHead();
            // Celebratory toast/alert
            const banner = document.createElement('div');
            banner.className = 'alert ok';
            banner.style.cssText = 'margin:1.25rem 0; font-size:1rem;';
            banner.innerHTML = `<svg class="alert-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <div>🏆 <strong>Course complete!</strong> Your certificate is ready —
              <a href="/cert/${escapeHtml(res.certificate.code)}" style="text-decoration:underline;">view &amp; share it</a>.</div>`;
            contentEl.prepend(banner);
          }
          renderLessonList();
          await loadLesson(lessonSlug);
        } catch (err) {
          alert(err.message || 'Could not save progress');
        }
      });

    } catch (err) {
      if (err.status === 402) {
        contentEl.innerHTML = `
          <div class="empty">
            <h3>Locked lesson</h3>
            <p>${course.is_paid ? `Buy <strong>${escapeHtml(course.title)}</strong> to access this lesson.` : 'Sign in to view this lesson.'}</p>
            ${course.is_paid
              ? `<button class="btn btn-primary" id="lockedBuyBtn">Buy course</button>`
              : `<a class="btn btn-primary" href="/login">Sign in</a>`}
          </div>`;
        document.getElementById('lockedBuyBtn')?.addEventListener('click', onBuy);
      } else if (err.status === 401) {
        location.href = `/login?next=${encodeURIComponent(location.pathname + location.hash)}`;
      } else {
        contentEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
      }
    }
  }

  async function onEnroll() {
    if (!user) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      return;
    }
    try {
      await window.api.post(`/api/courses/${course.slug}/enroll`);
      location.reload();
    } catch (err) {
      alert(err.message || 'Could not enroll');
    }
  }

  async function onBuy() {
    if (!user) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      return;
    }
    try {
      const { url } = await window.api.post('/api/payments/checkout', { courseSlug: course.slug });
      location.href = url;
    } catch (err) {
      alert(err.message || 'Could not start checkout');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      user = (await window.api.get('/api/auth/me').catch(() => null))?.user || null;
      const data = await window.api.get(`/api/courses/${slug}`);
      course = data.course;
      lessons = data.lessons || [];
      hasAccess = data.hasAccess;
      progressSet = new Set(data.progress || []);
      studentCount = data.studentCount || 0;
      testimonials = data.testimonials || [];
      faqs = data.faqs || [];
      certificate = data.certificate || null;

      renderHead();
      renderLessonList();
      renderTestimonialsAndFaq();

      const hashSlug = location.hash.replace('#', '');
      const initial = hashSlug && lessons.find((l) => l.slug === hashSlug)
        ? hashSlug
        : (lessons[0]?.slug || null);
      if (initial) {
        currentLessonSlug = initial;
        loadLesson(initial);
        renderLessonList();
      }

      // Stripe redirect feedback
      const params = new URLSearchParams(location.search);
      if (params.get('purchased') === '1') {
        alert('Payment received — your access will appear shortly. Refresh in a few seconds.');
      }
    } catch (err) {
      titleEl.innerHTML = `<div class="alert error">${escapeHtml(err.message || 'Course not found')}</div>`;
    }
  });
})();
