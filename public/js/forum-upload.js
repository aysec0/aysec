/* Shared image-upload behavior for forum textareas.
 *
 * Usage:
 *   setupForumUpload(textareaEl, { attachBtn: someButton, hint: someEl })
 *
 * Wires up:
 *   - Drag-and-drop of images directly onto the textarea
 *   - Paste of an image from the clipboard
 *   - Optional [Attach] button that opens a file picker
 *
 * On a successful upload, inserts `![filename](/uploads/...)` markdown
 * at the textarea's caret. Errors surface via window.toast.
 */
(function () {
  if (window.setupForumUpload) return;

  function insertAtCursor(ta, text) {
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    const cursor = start + text.length;
    ta.selectionStart = ta.selectionEnd = cursor;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }

  async function uploadFile(file) {
    if (!file) throw new Error('No file');
    if (!/^image\//.test(file.type)) throw new Error('Only image files');
    if (file.size > 4 * 1024 * 1024) throw new Error('Image must be under 4 MB');
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/uploads', { method: 'POST', credentials: 'include', body: fd });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const err = new Error(j.error || `Upload failed (${r.status})`);
      err.status = r.status;
      throw err;
    }
    return r.json();
  }

  function setupForumUpload(textarea, opts = {}) {
    if (!textarea || textarea.dataset.uploadWired === '1') return;
    textarea.dataset.uploadWired = '1';

    async function handleFile(file) {
      const placeholder = `![uploading…](#)`;
      insertAtCursor(textarea, placeholder);
      try {
        const r = await uploadFile(file);
        const alt = (file.name || 'image').replace(/[\[\]\(\)]/g, '');
        const markdown = `![${alt}](${r.url})`;
        textarea.value = textarea.value.replace(placeholder, markdown);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (err) {
        textarea.value = textarea.value.replace(placeholder, '');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        if (err.status === 401 && !opts.skipAuthRedirect) {
          location.href = '/login?next=' + encodeURIComponent(location.pathname);
        } else {
          window.toast?.(err.message || 'Upload failed', 'error');
        }
      }
    }

    // Drag-drop directly onto the textarea
    textarea.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        textarea.classList.add('forum-textarea-dropping');
      }
    });
    textarea.addEventListener('dragleave', () => textarea.classList.remove('forum-textarea-dropping'));
    textarea.addEventListener('drop', (e) => {
      textarea.classList.remove('forum-textarea-dropping');
      const file = e.dataTransfer?.files?.[0];
      if (!file || !/^image\//.test(file.type)) return;
      e.preventDefault();
      handleFile(file);
    });

    // Paste an image from clipboard
    textarea.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items || [];
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            return;
          }
        }
      }
    });

    // [Attach] button
    if (opts.attachBtn) {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      textarea.parentElement.appendChild(fileInput);
      opts.attachBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
      });
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) handleFile(file);
        fileInput.value = '';
      });
    }
  }

  window.setupForumUpload = setupForumUpload;
})();
