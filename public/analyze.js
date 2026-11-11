(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var WORD_RE = /[A-Za-z][A-Za-z0-9]*(?:['’][A-Za-z0-9]+)?/g;
  var normKey = function (w) { return String(w).toLowerCase().replace(/[’‘]/g, "'"); };

  var el = {
    article: $('#article'),
    empty: $('#empty'),
    hint: $('#hint'),
    hintClose: $('#hintClose'),
    stat: $('#stat'),
    drawer: $('#drawer'),
    scrim: $('#scrim'),
    drawerBody: $('#drawerBody'),
    wordTitle: $('#wordTitle'),
    fileChip: $('#fileChip'),
    loading: $('#loading'),
    md: $('#mdContent'),
    mdError: $('#mdError'),
    closeBtn: $('#closeBtn'),
    footClose: $('#footClose'),
    backBtn: $('#backBtn'),
  };

  var state = { matches: {}, stack: [], open: false };

  /* ==================================================================
     文章渲染
     ================================================================== */

  function buildArticle(text) {
    el.article.textContent = '';
    var paras = text.split(/\n\s*\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    paras.forEach(function (para) {
      var p = document.createElement('p');
      para.split('\n').forEach(function (line, i) {
        if (i) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(line));
      });
      el.article.appendChild(p);
    });
  }

  function collectKeys(root) {
    var set = new Set();
    var text = root.textContent || '';
    var m;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text))) set.add(normKey(m[0]));
    return Array.from(set);
  }

  function lookup(words) {
    if (!words.length) return Promise.resolve({});
    return fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: words.slice(0, 1500) }),
    })
      .then(function (r) { return r.ok ? r.json() : { matches: {} }; })
      .then(function (d) { return d.matches || {}; })
      .catch(function () { return {}; });
  }

  /* ==================================================================
     单词包裹：把命中的文本节点变成可点击按钮
     ================================================================== */

  function wrapWords(root, matches) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var v = node.nodeValue;
        if (!v || !/[A-Za-z]/.test(v)) return NodeFilter.FILTER_REJECT;
        var p = node.parentElement;
        if (!p || p.closest('a, code, pre, button, .no-wrap')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(function (node) {
      var text = node.nodeValue;
      var frag = document.createDocumentFragment();
      var last = 0;
      var changed = false;
      var m;
      WORD_RE.lastIndex = 0;
      while ((m = WORD_RE.exec(text))) {
        var key = normKey(m[0]);
        var slug = matches[key];
        if (!slug) continue;
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'w';
        b.dataset.slug = slug;
        b.dataset.w = key;
        b.textContent = m[0];
        frag.appendChild(b);
        last = m.index + m[0].length;
        changed = true;
      }
      if (changed) {
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
      }
    });
  }

  /* ==================================================================
     单词卡片（抽屉）
     ================================================================== */

  function showDrawer(on) {
    state.open = on;
    el.drawer.classList.toggle('on', on);
    el.scrim.classList.toggle('on', on);
    el.drawer.setAttribute('aria-hidden', String(!on));
    document.body.classList.toggle('locked', on);
    if (on) el.closeBtn.focus({ preventScroll: true });
  }

  function renderHead() {
    var top = state.stack[state.stack.length - 1];
    el.wordTitle.textContent = top.label || top.slug;
    el.fileChip.textContent = '…';
    el.backBtn.classList.toggle('hidden', state.stack.length <= 1);
    el.backBtn.title = state.stack.length > 1
      ? '返回 ' + state.stack[state.stack.length - 2].label
      : '返回';
  }

  function openCard(slug, label, srcEl) {
    if (srcEl) srcEl.classList.add('read');
    state.stack.push({ slug: slug, label: (label || slug).trim() });
    renderHead();
    showDrawer(true);
    loadMd(slug);
  }

  function closeDrawer() {
    showDrawer(false);
    state.stack = [];
    el.md.textContent = '';
    el.md.classList.add('hidden');
    el.mdError.classList.add('hidden');
  }

  function goBack() {
    if (state.stack.length <= 1) return;
    state.stack.pop();
    renderHead();
    var top = state.stack[state.stack.length - 1];
    loadMd(top.slug);
  }

  function loadMd(slug) {
    el.loading.classList.remove('hidden');
    el.md.classList.add('hidden');
    el.mdError.classList.add('hidden');
    fetch('/api/md?slug=' + encodeURIComponent(slug))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
          return d;
        });
      })
      .then(function (data) {
        el.fileChip.textContent = data.file;
        el.md.innerHTML = MD.mdToHtml(data.md);
        el.loading.classList.add('hidden');
        el.md.classList.remove('hidden');
        el.drawerBody.scrollTop = 0;
        enrichMdWords(el.md);
      })
      .catch(function (err) {
        el.loading.classList.add('hidden');
        el.md.classList.add('hidden');
        el.mdError.textContent = '⚠️ ' + err.message;
        el.mdError.classList.remove('hidden');
      });
  }

  /* 卡片内的英文单词也变成可点击（共享同一份命中缓存） */
  function enrichMdWords(container) {
    var fresh = collectKeys(container)
      .filter(function (k) { return !state.matches[k]; });
    lookup(fresh).then(function (got) {
      Object.assign(state.matches, got);
      wrapWords(container, state.matches);
    });
  }

  /* ==================================================================
     事件
     ================================================================== */

  document.addEventListener('click', function (e) {
    var w = e.target.closest('.w');
    if (w) {
      e.preventDefault();
      openCard(w.dataset.slug, w.textContent, w);
      return;
    }
    var link = e.target.closest('a.md-link');
    if (link) {
      e.preventDefault();
      openCard(link.dataset.slug, link.textContent, null);
    }
  });

  el.closeBtn.addEventListener('click', closeDrawer);
  el.footClose.addEventListener('click', closeDrawer);
  el.scrim.addEventListener('click', closeDrawer);
  el.backBtn.addEventListener('click', goBack);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.open) closeDrawer();
  });

  el.hintClose.addEventListener('click', function () {
    el.hint.classList.add('hidden');
    localStorage.setItem('ewr:hint', 'off');
  });

  /* ==================================================================
     初始化
     ================================================================== */

  function init() {
    if (localStorage.getItem('ewr:hint') === 'off') el.hint.classList.add('hidden');

    var text = sessionStorage.getItem('ewr:text') || '';
    if (!text.trim()) {
      el.article.classList.add('hidden');
      el.hint.classList.add('hidden');
      el.empty.classList.remove('hidden');
      return;
    }

    buildArticle(text);
    var keys = collectKeys(el.article);
    lookup(keys).then(function (matches) {
      state.matches = matches;
      wrapWords(el.article, matches);
      var hits = keys.filter(function (k) { return matches[k]; }).length;
      el.stat.innerHTML = '命中 <b>' + hits + '</b> / ' + keys.length + ' 词';
    });
  }

  init();
})();
