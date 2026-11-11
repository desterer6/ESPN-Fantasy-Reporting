// Light/dark theme. Loaded as a classic (blocking) script in <head> so the right theme is set
// before the first paint (no flash). Choice is remembered on this device; with no choice saved,
// the site follows the device's light/dark setting.
(function () {
  var KEY = 'league-theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function system() { return media && media.matches ? 'light' : 'dark'; }
  function apply(theme) {
    root.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f2f4f7' : '#0b111a');
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      var next = theme === 'light' ? 'dark' : 'light';
      btn.setAttribute('aria-label', 'Switch to ' + next + ' mode');
      btn.setAttribute('title', 'Switch to ' + next + ' mode');
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    }
    document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  }
  apply(saved() || system());
  if (media && media.addEventListener) media.addEventListener('change', function () { if (!saved()) apply(system()); });
  window.toggleTheme = function () {
    var theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    apply(theme);
  };
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (btn) { btn.addEventListener('click', window.toggleTheme); apply(root.dataset.theme); }
  });
})();
