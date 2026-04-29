/* ============================================================
   /community — live Discord-style chat.

   Three columns:
     LEFT   — rooms list (#general, #web, #crypto, ...)
     CENTER — message stream + composer
     RIGHT  — online members (uses the existing presence service)

   Real-time via SSE on /api/community/chat/stream/:slug.
   Each room maintains its own EventSource connection — switching
   rooms tears the old one down and opens a new one.
   ============================================================ */
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // marked.js is loaded from CDN in the HTML
  const md = (text) => {
    if (!text) return '';
    if (window.marked?.parse) {
      // Restrict marked to inline + paragraphs + code blocks. No headings/HTML.
      return window.marked.parse(String(text), { gfm: true, breaks: true, mangle: false, headerIds: false });
    }
    return escapeHtml(String(text)).replace(/\n/g, '<br>');
  };
  // DOMPurify mini-shim — we don't render arbitrary HTML, marked.parse output
  // already escapes. Just strip script tags as belt-and-braces.
  function safe(html) {
    return String(html).replace(/<script[\s\S]*?<\/script>/gi, '');
  }

  // ---- State ----------------------------------------------------------
  let viewer = null;
  let rooms = [];
  let currentRoom = null;     // room object
  let currentMessages = [];   // ordered oldest → newest
  let lastMessageBy = null;   // for grouping consecutive messages from same author
  let es = null;              // active EventSource for the current room
  let replyTo = null;         // message we're replying to
  let stickToBottom = true;
  let unread = {};            // { slug: count }

  // ---- Boot ----------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    viewer = (await window.api.get('/api/auth/me').catch(() => null))?.user || null;
    await loadRooms();
    // Pick room from URL hash, or fall back to first
    const wanted = location.hash.replace('#', '') || (rooms[0]?.slug);
    selectRoom(wanted);

    wireComposer();
    wireScroll();
    wireToggleMembers();
    window.addEventListener('hashchange', () => {
      const slug = location.hash.replace('#', '');
      if (slug && slug !== currentRoom?.slug) selectRoom(slug);
    });
  });

  // ---- Rooms sidebar -------------------------------------------------
  async function loadRooms() {
    try {
      const r = await window.api.get('/api/community/chat/rooms');
      rooms = r.rooms || [];
      renderRoomList();
    } catch (e) {
      $('#roomsList').innerHTML = `<li class="alert error">${escapeHtml(e.message)}</li>`;
    }
  }

  function renderRoomList() {
    $('#roomsList').innerHTML = rooms.map((r) => `
      <li>
        <button type="button" class="chat-room-btn ${currentRoom?.slug === r.slug ? 'is-active' : ''}"
                data-slug="${escapeHtml(r.slug)}" style="--rc:${r.color || '#888'};">
          <span class="chat-room-icon">${r.icon || '#'}</span>
          <span class="chat-room-name">${escapeHtml(r.name)}</span>
          ${unread[r.slug] ? `<span class="chat-room-unread">${unread[r.slug]}</span>` : ''}
        </button>
      </li>`).join('');
    $$('.chat-room-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const slug = b.dataset.slug;
        location.hash = slug;
        selectRoom(slug);
      });
    });
  }

  function selectRoom(slug) {
    const room = rooms.find((r) => r.slug === slug) || rooms[0];
    if (!room) return;
    currentRoom = room;
    unread[room.slug] = 0;
    renderRoomList();

    // Header
    $('#roomIcon').textContent = room.icon || '#';
    $('#roomName').textContent = '#' + room.name;
    $('#roomDesc').textContent = room.description || '';
    $('#chatInput').placeholder = `Message #${room.name}`;

    // Presence widget — re-bind to new room (so the live count comes from this scope)
    const pres = $('#roomPresence');
    pres.dataset.presenceScope = 'community-post';
    pres.dataset.presenceId = `chat:${room.slug}`;
    pres.removeAttribute('data-presence-mounted');
    pres.innerHTML = '';

    // Reset state
    currentMessages = [];
    lastMessageBy = null;
    replyTo = null;
    cancelReply();
    stickToBottom = true;
    $('#chatStream').innerHTML = `<div class="chat-stream-skeleton"><div class="skeleton" style="height:48px;width:60%"></div><div class="skeleton" style="height:48px;width:75%"></div></div>`;

    loadMessages();
    openStream();
  }

  // ---- Messages ------------------------------------------------------
  async function loadMessages() {
    try {
      const r = await window.api.get(`/api/community/chat/rooms/${currentRoom.slug}/messages?limit=80`);
      currentMessages = r.messages || [];
      lastMessageBy = null;
      renderStream();
      scrollToBottom(true);
    } catch (e) {
      $('#chatStream').innerHTML = `<div class="alert error" style="margin:1rem;">${escapeHtml(e.message)}</div>`;
    }
  }

  function renderStream() {
    const container = $('#chatStream');
    if (!currentMessages.length) {
      container.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-icon">${currentRoom.icon || '💬'}</div>
          <h2>Welcome to <span style="color:${currentRoom.color || 'var(--accent)'};">#${escapeHtml(currentRoom.name)}</span></h2>
          <p class="muted">${escapeHtml(currentRoom.description || '')}</p>
          <p class="dim">${viewer ? "You're the first one in. Say hi." : 'Sign in to send messages.'}</p>
        </div>`;
      return;
    }
    let html = '';
    let lastUser = null;
    let lastTime = 0;
    for (const m of currentMessages) {
      const t = new Date((m.created_at || '').replace(' ', 'T') + 'Z').getTime();
      const sameAuthor = lastUser === m.user.id && t - lastTime < 5 * 60_000 && !m.reply_to;
      html += renderMessage(m, sameAuthor);
      lastUser = m.user.id;
      lastTime = t;
    }
    container.innerHTML = html;
    wireMessageActions();
  }

  function appendMessage(m) {
    // Stream a new message in
    const lastM = currentMessages[currentMessages.length - 1];
    const sameAuthor = lastM
      && lastM.user.id === m.user.id
      && (new Date(m.created_at.replace(' ', 'T') + 'Z') - new Date(lastM.created_at.replace(' ', 'T') + 'Z')) < 5 * 60_000
      && !m.reply_to;

    currentMessages.push(m);
    const stream = $('#chatStream');
    if (stream.querySelector('.chat-empty') || stream.querySelector('.chat-stream-skeleton')) {
      renderStream();
      return scrollToBottom(true);
    }
    stream.insertAdjacentHTML('beforeend', renderMessage(m, sameAuthor));
    wireMessageActions(stream.lastElementChild);
    if (stickToBottom) scrollToBottom();
  }

  function renderMessage(m, grouped) {
    const t = new Date((m.created_at || '').replace(' ', 'T') + 'Z');
    const time = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const fullTs = t.toLocaleString();
    const isOwn = viewer && m.user.id === viewer.id;
    const av = m.user.avatar_url
      ? `<img class="chat-msg-avatar" src="${escapeHtml(m.user.avatar_url)}" alt="" loading="lazy" />`
      : `<div class="chat-msg-avatar chat-msg-avatar-letter">${escapeHtml((m.user.display_name || m.user.username || '?').slice(0, 1).toUpperCase())}</div>`;
    const reactionsHTML = (m.reactions || []).map((r) => {
      const mine = viewer && r.user_ids.includes(viewer.id);
      return `<button type="button" class="chat-reaction ${mine ? 'is-mine' : ''}" data-emoji="${escapeHtml(r.emoji)}" data-msg="${m.id}">
        ${escapeHtml(r.emoji)} <span>${r.count}</span>
      </button>`;
    }).join('');
    const replyHTML = m.reply_context ? `
      <div class="chat-msg-reply">
        <span class="dim mono">↩ ${escapeHtml(m.reply_context.display_name || m.reply_context.username)}:</span>
        <span class="chat-msg-reply-snippet">${escapeHtml(m.reply_context.body || '')}</span>
      </div>` : '';
    const bodyHTML = m.deleted
      ? `<em class="dim">[deleted]</em>`
      : safe(md(m.body || ''));

    return `
      <article class="chat-msg ${grouped ? 'is-grouped' : ''} ${m.deleted ? 'is-deleted' : ''}" data-id="${m.id}">
        <div class="chat-msg-gutter">
          ${grouped ? `<span class="chat-msg-time-side">${escapeHtml(time)}</span>` : av}
        </div>
        <div class="chat-msg-body">
          ${replyHTML}
          ${grouped ? '' : `
            <div class="chat-msg-head">
              <a href="/u/${escapeHtml(m.user.username)}" class="chat-msg-name">${escapeHtml(m.user.display_name || m.user.username)}</a>
              <span class="chat-msg-time" title="${escapeHtml(fullTs)}">${escapeHtml(time)}</span>
              ${m.edited ? '<span class="chat-msg-edited dim">(edited)</span>' : ''}
            </div>`}
          <div class="chat-msg-text">${bodyHTML}</div>
          ${reactionsHTML ? `<div class="chat-reactions">${reactionsHTML}</div>` : ''}
        </div>
        <div class="chat-msg-actions" role="toolbar">
          <button type="button" class="chat-msg-action chat-msg-react" data-msg="${m.id}" title="React">😊</button>
          <button type="button" class="chat-msg-action chat-msg-reply" data-msg="${m.id}" title="Reply">↩</button>
          ${isOwn || viewer?.role === 'admin' ? `<button type="button" class="chat-msg-action chat-msg-del" data-msg="${m.id}" title="Delete">🗑</button>` : ''}
        </div>
      </article>`;
  }

  function wireMessageActions(scope) {
    const root = scope || $('#chatStream');
    root.querySelectorAll('.chat-msg-react').forEach((b) => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', (e) => openReactPicker(e.currentTarget, b.dataset.msg));
    });
    root.querySelectorAll('.chat-msg-reply').forEach((b) => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', () => startReply(Number(b.dataset.msg)));
    });
    root.querySelectorAll('.chat-msg-del').forEach((b) => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', async () => {
        if (!confirm('Delete this message?')) return;
        try { await window.api.del(`/api/community/chat/messages/${b.dataset.msg}`); }
        catch (e) { window.toast?.(e.message || 'delete failed', 'error'); }
      });
    });
    root.querySelectorAll('.chat-reaction').forEach((b) => {
      if (b.dataset.wired) return; b.dataset.wired = '1';
      b.addEventListener('click', () => toggleReaction(Number(b.dataset.msg), b.dataset.emoji));
    });
  }

  // ---- Reactions ------------------------------------------------------
  const QUICK_EMOJI = ['👍', '❤️', '🔥', '😂', '😮', '🎉', '🤔', '🙏'];
  let reactPicker = null;
  function openReactPicker(anchor, msgId) {
    closeReactPicker();
    const el = document.createElement('div');
    el.className = 'chat-react-picker';
    el.innerHTML = QUICK_EMOJI.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('');
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    el.style.top = (window.scrollY + r.top - 44) + 'px';
    el.style.left = (window.scrollX + r.left - 200) + 'px';
    el.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        toggleReaction(Number(msgId), b.dataset.e);
        closeReactPicker();
      });
    });
    reactPicker = el;
    setTimeout(() => document.addEventListener('click', closeReactPickerOutside, { once: true }), 0);
  }
  function closeReactPickerOutside(e) {
    if (reactPicker && !reactPicker.contains(e.target)) closeReactPicker();
    else if (reactPicker) document.addEventListener('click', closeReactPickerOutside, { once: true });
  }
  function closeReactPicker() {
    if (reactPicker) { reactPicker.remove(); reactPicker = null; }
  }

  async function toggleReaction(msgId, emoji) {
    if (!viewer) return alertSignIn();
    try { await window.api.post(`/api/community/chat/messages/${msgId}/reactions`, { emoji }); }
    catch (e) { window.toast?.(e.message || 'reaction failed', 'error'); }
  }

  // ---- Reply state ----------------------------------------------------
  function startReply(msgId) {
    const m = currentMessages.find((x) => x.id === msgId);
    if (!m) return;
    replyTo = m;
    $('#chatReplyName').textContent = m.user.display_name || m.user.username;
    $('#chatReplySnippet').textContent = (m.body || '').slice(0, 140);
    $('#chatReplyBar').hidden = false;
    $('#chatInput').focus();
  }
  function cancelReply() {
    replyTo = null;
    $('#chatReplyBar').hidden = true;
  }

  // ---- Composer -------------------------------------------------------
  function wireComposer() {
    const form = $('#chatForm');
    const input = $('#chatInput');
    const send  = $('#chatSend');

    // Auto-grow textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    });

    // Enter sends, Shift+Enter newline
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!viewer) return alertSignIn();
      const body = input.value.trim();
      if (!body) return;
      send.disabled = true;
      try {
        await window.api.post(`/api/community/chat/rooms/${currentRoom.slug}/messages`, {
          body, reply_to: replyTo?.id || null,
        });
        input.value = '';
        input.style.height = 'auto';
        cancelReply();
      } catch (err) {
        window.toast?.(err.message || 'send failed', 'error');
      } finally {
        send.disabled = false;
        input.focus();
      }
    });

    $('#chatReplyCancel').addEventListener('click', cancelReply);
    $('#emojiBtn').addEventListener('click', () => {
      // Drop a smiley at cursor as a tiny convenience
      const i = input;
      const pos = i.selectionStart || i.value.length;
      i.value = i.value.slice(0, pos) + ' :) ' + i.value.slice(pos);
      i.focus();
    });
  }

  function alertSignIn() {
    window.toast?.('Sign in to chat.', 'info');
    setTimeout(() => { location.href = '/login?next=/community'; }, 800);
  }

  // ---- Auto-scroll ----------------------------------------------------
  function wireScroll() {
    const stream = $('#chatStream');
    stream.addEventListener('scroll', () => {
      const nearBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
      stickToBottom = nearBottom;
    });
  }
  function scrollToBottom(force) {
    const stream = $('#chatStream');
    stream.scrollTop = stream.scrollHeight;
    if (force) stickToBottom = true;
  }

  // ---- SSE stream -----------------------------------------------------
  function openStream() {
    if (es) { es.close(); es = null; }
    if (!currentRoom) return;
    es = new EventSource(`/api/community/chat/stream/${currentRoom.slug}`);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'message') {
          // If we're not viewing this room, increment unread; else append
          if (ev.message.room_slug === currentRoom.slug) {
            appendMessage(ev.message);
          } else {
            unread[ev.message.room_slug] = (unread[ev.message.room_slug] || 0) + 1;
            renderRoomList();
          }
        } else if (ev.type === 'reactions') {
          const m = currentMessages.find((x) => x.id === ev.id);
          if (m) {
            m.reactions = ev.reactions;
            // Re-render the reactions row in place
            const card = $(`#chatStream .chat-msg[data-id="${ev.id}"]`);
            if (card) {
              const old = card.querySelector('.chat-reactions');
              const html = ev.reactions.map((r) => {
                const mine = viewer && r.user_ids.includes(viewer.id);
                return `<button type="button" class="chat-reaction ${mine ? 'is-mine' : ''}" data-emoji="${escapeHtml(r.emoji)}" data-msg="${ev.id}">${escapeHtml(r.emoji)} <span>${r.count}</span></button>`;
              }).join('');
              if (old) old.outerHTML = html ? `<div class="chat-reactions">${html}</div>` : '';
              else if (html) card.querySelector('.chat-msg-body').insertAdjacentHTML('beforeend', `<div class="chat-reactions">${html}</div>`);
              wireMessageActions(card);
            }
          }
        } else if (ev.type === 'delete') {
          const m = currentMessages.find((x) => x.id === ev.id);
          if (m) {
            m.deleted = true; m.body = null;
            const card = $(`#chatStream .chat-msg[data-id="${ev.id}"]`);
            if (card) {
              card.classList.add('is-deleted');
              card.querySelector('.chat-msg-text').innerHTML = '<em class="dim">[deleted]</em>';
              card.querySelectorAll('.chat-reactions').forEach((n) => n.remove());
            }
          }
        }
      } catch {}
    };
    es.onerror = () => {
      // The browser will auto-reconnect; nothing to do.
    };
  }

  // ---- Members -------------------------------------------------------
  // Right rail uses the existing presence service. We poll its endpoint
  // for the current room every 8s and render the member list.
  let memberPoll = null;
  async function refreshMembers() {
    if (!currentRoom) return;
    try {
      const r = await fetch(`/api/presence?scope=community-post&scope_id=chat:${currentRoom.slug}`);
      const data = await r.json();
      $('#memberCount').textContent = data.total ? `(${data.total})` : '';
      const visible = data.visible || [];
      $('#membersList').innerHTML = visible.length
        ? visible.map((u) => `
          <li class="chat-member">
            ${u.avatar_url
              ? `<img class="chat-member-av" src="${escapeHtml(u.avatar_url)}" alt="" loading="lazy" />`
              : `<div class="chat-member-av chat-member-av-letter">${escapeHtml((u.display_name || u.username || '?').slice(0,1).toUpperCase())}</div>`}
            <span class="chat-member-name">${escapeHtml(u.display_name || u.username)}</span>
            <span class="chat-member-status presence-dot is-live"></span>
          </li>`).join('')
        : `<li class="dim mono" style="font-size:0.78rem;">no one in here yet</li>`;
    } catch {}
  }
  // Poll every 8s
  setInterval(refreshMembers, 8000);
  setTimeout(refreshMembers, 1500);

  // ---- Members panel toggle (mobile) ---------------------------------
  function wireToggleMembers() {
    $('#toggleMembers').addEventListener('click', () => {
      $('#chatMembers').classList.toggle('is-open');
    });
  }
})();
