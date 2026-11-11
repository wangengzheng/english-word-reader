(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };

  var ta = $('#text');
  var go = $('#go');
  var stats = $('#stats');
  var dictInfo = $('#dictInfo');

  var EXAMPLE =
    'Hello everyone. Today I want to talk about communication.\n\n' +
    'Communication means talking, listening, reading, and writing. We use communication every day. ' +
    'We talk to family, friends, teachers, and other people. We use words, body language, and pictures ' +
    'to share ideas. Communication is everywhere. It is in every conversation, every message, and every smile.';

  /* 恢复草稿 */
  ta.value = localStorage.getItem('ewr:draft') || '';
  update();

  ta.addEventListener('input', function () {
    update();
    clearTimeout(ta._t);
    ta._t = setTimeout(function () { localStorage.setItem('ewr:draft', ta.value); }, 300);
  });

  function update() {
    var words = (ta.value.match(/[A-Za-z][A-Za-z0-9]*(?:['’][A-Za-z0-9]+)?/g) || []).length;
    var paras = ta.value.split(/\n\s*\n+/).filter(function (s) { return s.trim(); }).length;
    stats.textContent = words + ' 个单词 · ' + paras + ' 个段落';
    go.disabled = words === 0;
  }

  $('#example').addEventListener('click', function () {
    ta.value = EXAMPLE;
    update();
    ta.focus();
    localStorage.setItem('ewr:draft', EXAMPLE);
  });

  $('#clear').addEventListener('click', function () {
    ta.value = '';
    update();
    ta.focus();
    localStorage.removeItem('ewr:draft');
  });

  go.addEventListener('click', submit);
  ta.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
  });

  function submit() {
    if (!ta.value.trim()) return;
    sessionStorage.setItem('ewr:text', ta.value);
    location.href = '/analyze';
  }

  fetch('/api/health')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.ok) {
        var short = String(d.dictDir).replace(/^\/Users\/[^/]+/, '~');
        dictInfo.textContent = d.entries.toLocaleString() + ' 个词条 · ' + short;
      } else {
        dictInfo.textContent = '词库目录不可读：' + ((d && d.error) || '未知错误');
      }
    })
    .catch(function () { dictInfo.textContent = '词库服务未连接'; });
})();
