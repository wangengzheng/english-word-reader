/**
 * theme.js — 深色 / 浅色主题（跟随系统，可手动切换并记住）
 */
(function () {
  'use strict';
  var KEY = 'ewr:theme';
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  function stored() { return localStorage.getItem(KEY) || ''; }
  function effective() { return stored() || (mq.matches ? 'dark' : 'light'); }

  function apply() {
    if (effective() === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    var dark = effective() === 'dark';
    document.querySelectorAll('.theme-toggle').forEach(function (b) {
      b.textContent = dark ? '☀️' : '🌙';
      b.title = dark ? '切换到浅色' : '切换到深色';
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.theme-toggle')) return;
    localStorage.setItem(KEY, effective() === 'dark' ? 'light' : 'dark');
    apply();
  });

  if (mq.addEventListener) mq.addEventListener('change', function () { if (!stored()) apply(); });
  apply();
})();
