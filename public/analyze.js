(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var WORD_RE = /[A-Za-z][A-Za-z0-9]*(?:['’][A-Za-z0-9]+)?/g;
  var normKey = function (w) { return String(w).toLowerCase().replace(/[’‘]/g, "'"); };
  var CAM_URL_BASE = 'https://dictionary.cambridge.org/us/dictionary/english-chinese-simplified/';

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
    camLink: $('#camLink'),
    loading: $('#loading'),
    md: $('#mdContent'),
    mdError: $('#mdError'),
    closeBtn: $('#closeBtn'),
    footClose: $('#footClose'),
    backBtn: $('#backBtn'),
    shareBtn: $('#shareBtn'),
    shareModal: $('#shareModal'),
    shareClose: $('#shareClose'),
    shortRow: $('#shortRow'),
    shortUrl: $('#shortUrl'),
    copyShort: $('#copyShort'),
    openShort: $('#openShort'),
    shareErr: $('#shareErr'),
    nativeShare: $('#nativeShare'),
    toast: $('#toast'),
  };

  var state = { matches: {}, stack: [], open: false, text: '', shareOpen: false };

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
    // 剑桥词典：把当前词条（词库标准形）传过去
    var slugForCam = String(top.slug || '').toLowerCase().replace(/\s+/g, '-');
    el.camLink.href = CAM_URL_BASE + encodeURIComponent(slugForCam);
    el.camLink.title = '在剑桥词典查看「' + (top.label || top.slug) + '」↗';
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
     分享：短链接（服务端存储） + 自包含链接（压缩全文进 hash）
     ================================================================== */

  var toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('on'); }, 1800);
  }

  function legacyCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    showToast(ok ? '已复制 ✓' : '复制失败，请手动选择文本复制');
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { showToast('已复制 ✓'); }, function () { legacyCopy(t); });
    } else {
      legacyCopy(t);
    }
  }

  function showShareModal(on) {
    state.shareOpen = on;
    el.shareModal.classList.toggle('on', on);
    el.shareModal.setAttribute('aria-hidden', String(!on));
    if (on) el.copyShort.focus({ preventScroll: true });
  }

  function openShare() {
    if (!state.text.trim()) { showToast('没有可分享的内容'); return; }
    showShareModal(true);
    el.shortUrl.value = '';
    el.shareErr.classList.add('hidden');
    el.shortRow.classList.remove('hidden');

    // 分享时才处理：内容交给服务端 → id = 内容 MD5 → /s/<id>
    fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: state.text }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (d) {
        el.shortUrl.value = location.origin + '/s/' + d.id;
        // 地址栏同步变成短链接，直接复制地址栏也可以分享
        history.replaceState(null, '', '/s/' + d.id);
      })
      .catch(function () {
        el.shareErr.classList.remove('hidden');
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

  el.shareBtn.addEventListener('click', openShare);
  el.shareClose.addEventListener('click', function () { showShareModal(false); });
  el.shareModal.addEventListener('click', function (e) {
    if (e.target === el.shareModal) showShareModal(false); // 点击遮罩关闭
  });
  el.copyShort.addEventListener('click', function () {
    if (el.shortUrl.value) copyText(el.shortUrl.value);
  });
  el.openShort.addEventListener('click', function () {
    if (el.shortUrl.value) window.open(el.shortUrl.value, '_blank');
  });
  if (navigator.share) {
    el.nativeShare.classList.remove('hidden');
    el.nativeShare.addEventListener('click', function () {
      navigator.share({ title: '英文点读', url: el.shortUrl.value }).catch(function () { /* 用户取消 */ });
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (state.shareOpen) showShareModal(false);
    else if (state.open) closeDrawer();
  });

  el.hintClose.addEventListener('click', function () {
    el.hint.classList.add('hidden');
    localStorage.setItem('ewr:hint', 'off');
  });

  /* ==================================================================
     初始化
     ================================================================== */

  function renderText(text) {
    state.text = text;
    sessionStorage.setItem('ewr:text', text); // 刷新 / 返回时仍可用
    buildArticle(text);
    var keys = collectKeys(el.article);
    lookup(keys).then(function (matches) {
      state.matches = matches;
      wrapWords(el.article, matches);
      var hits = keys.filter(function (k) { return matches[k]; }).length;
      el.stat.innerHTML = '命中 <b>' + hits + '</b> / ' + keys.length + ' 词';
    });
  }

  function showEmpty(brokenShare) {
    el.article.classList.add('hidden');
    el.hint.classList.add('hidden');
    el.empty.classList.remove('hidden');
    if (brokenShare) {
      var p = el.empty.querySelector('p');
      if (p) p.textContent = '分享内容不存在或已过期';
    }
  }

  async function init() {
    if (localStorage.getItem('ewr:hint') === 'off') el.hint.classList.add('hidden');

    // 短链接 id：支持 /s/<id>（路径）与 /analyze?s=<id>（兼容旧查询串）
    var qid = (location.pathname.match(/^\/s\/([A-Za-z0-9]{3,32})$/) || [])[1]
      || new URLSearchParams(location.search).get('s');
    var text = '';

    // 1) 短链接 → 从服务端取内容；取不到直接提示失效（不再回退本地内容）
    if (qid) {
      try {
        var r = await fetch('/api/share/' + encodeURIComponent(qid));
        if (r.ok) {
          var d = await r.json();
          text = (d && d.text) || '';
        }
      } catch (e) { text = ''; }
      if (!text.trim()) { showEmpty(true); return; }
    }

    // 2) 旧版自包含链接 #t=<payload>（兼容此前分享出去的链接）→ 本地解压
    if (!text) {
      var m = location.hash.match(/^#t=([A-Za-z0-9_-]+)$/);
      if (m) {
        try { text = await ShareCodec.decode(m[1]); } catch (e) { text = ''; }
      }
    }

    // 3) 本 tab 输入的内容
    if (!text) text = sessionStorage.getItem('ewr:text') || '';

    if (!text.trim()) {
      showEmpty(!!qid);
      return;
    }

    renderText(text);
  }

  init();
})();
