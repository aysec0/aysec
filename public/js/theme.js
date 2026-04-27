(() => {
  const STORAGE_KEY = 'theme';
  const root = document.documentElement;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    root.setAttribute('data-theme', stored);
  } else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    root.setAttribute('data-theme', 'light');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_KEY, next);
    });
  });
})();
