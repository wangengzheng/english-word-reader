/**
 * md.js — 轻量 Markdown 渲染器（无依赖，浏览器 / Node 通用）
 *
 * 支持：标题、段落、换行、有序/无序/嵌套列表、任务列表、表格（含对齐）、
 *       引用块、代码块/行内代码、分割线、链接（.md 内链会标记为 md-link）、
 *       图片（相对路径自动走 /dict-asset/）、加粗/斜体/删除线、反斜杠转义。
 * 所有输出先做 HTML 转义，杜绝注入。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.MD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* 音标点击跳转的发音查询站（s= 音标原样、非 ASCII 转百分号编码） */
  var IPA_URL_BASE = 'https://englishsymbol.bizhoucun.com/english_voice?s=';

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------------- 行内语法 ---------------- */

  function inline(src) {
    let s = escapeHtml(src);

    // 反斜杠转义：\* \_ \[ 等 → 字面量
    s = s.replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, function (m, c) {
      return '&#' + c.charCodeAt(0) + ';';
    });

    var stash = [];
    function keep(html) {
      stash.push(html);
      return '\u0000' + (stash.length - 1) + '\u0000';
    }

    // 行内代码（先处理，内部不再二次解析）
    s = s.replace(/`([^`]+)`/g, function (m, c) {
      return keep('<code class="ic">' + c.trim() + '</code>');
    });

    // 图片
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (m, alt, rest) {
      var url = rest.trim().split(/\s+/)[0];
      var src = /^(https?:|data:)/i.test(url) ? url : '/dict-asset/' + encodeURI(url);
      return keep('<img class="md-img" src="' + src + '" alt="' + alt + '" loading="lazy">');
    });

    // 链接：xxx.md 视为词库内链
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, text, rest) {
      var url = rest.trim().split(/\s+/)[0];
      if (/\.md$/i.test(url)) {
        var slug = url.slice(0, -3).toLowerCase();
        return keep('<a href="#" class="md-link" data-slug="' + slug + '">' + text + '</a>');
      }
      return keep('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>');
    });

    // 强调
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\w])__([^_]+)__(?![\w])/g, '$1<strong>$2</strong>');
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    s = s.replace(/(^|[^\w])_([^_\n]+)_(?![\w])/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 音标：/kæn/ /həˈloʊ/ → 新标签页打开发音查询
    // 约束：内容仅限字母 + IPA 字符（含 IPA Extensions、修饰符号、组合变音符号、
    //       希腊字母 θ 等；排除中文/数字），且斜线不能紧贴在字母数字后，
    //       这样 "a/b/c"、"and/or"、"24/7"、"BrE/AmE" 都不会误伤。
    s = s.replace(/(^|[^A-Za-z0-9])(\/[a-zA-Z\u00C0-\u02FF\u0300-\u036F\u0370-\u03FF\u1AB0-\u1DFF]{1,40}\/)/g,
      function (m, pre, phon) {
        var href = IPA_URL_BASE + encodeURI(phon);
        return pre + keep('<a class="ipa" href="' + href + '" target="_blank" rel="noopener noreferrer" title="查看音标发音 ↗">' + phon + '</a>');
      });

    s = s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return stash[+i]; });
    return s;
  }

  /* ---------------- 块级判断 ---------------- */

  function isBlank(l) { return /^\s*$/.test(l); }
  function fenceOf(l) { var m = l.match(/^\s{0,3}(`{3,}|~{3,})/); return m ? m[1] : null; }
  function isHr(l) { return /^\s{0,3}((-\s*){3,}|(\*\s*){3,}|(_\s*){3,})$/.test(l); }
  function headingOf(l) { return l.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/); }
  function listMarker(l) { return l.match(/^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/); }
  function quoteOf(l) { return l.match(/^\s{0,3}>\s?(.*)$/); }
  function isRow(l) { return l.indexOf('|') >= 0 && l.trim().indexOf('|') >= 0; }
  function isSep(l) { return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(l); }
  function cells(l) { return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|'); }

  /* ---------------- 列表（支持嵌套） ---------------- */

  function buildList(items, pos, indent) {
    var ordered = items[pos].ordered;
    var html = ordered ? '<ol>' : '<ul>';
    var k = pos;
    var openLi = false;
    while (k < items.length) {
      var it = items[k];
      if (it.indent < indent) break;
      if (it.indent > indent) { // 意外的更深层级：作为子列表挂到上一项
        var sub0 = buildList(items, k, it.indent);
        if (openLi) html = html.replace(/<\/li>$/, sub0.html + '</li>');
        else html += '<li>' + sub0.html + '</li>';
        openLi = false;
        k = sub0.next;
        continue;
      }
      html += '<li>' + inline(it.text);
      openLi = true;
      if (k + 1 < items.length && items[k + 1].indent > indent) {
        var sub = buildList(items, k + 1, items[k + 1].indent);
        html += sub.html;
        k = sub.next;
      } else {
        k += 1;
      }
      html += '</li>';
      openLi = false;
    }
    html += ordered ? '</ol>' : '</ul>';
    return { html: html, next: k };
  }

  /* ---------------- 主渲染 ---------------- */

  function mdToHtml(src) {
    src = String(src == null ? '' : src).replace(/\r\n?/g, '\n');

    // 去掉 YAML front matter
    if (/^---\s*\n/.test(src)) {
      var close = src.indexOf('\n---', 4);
      if (close !== -1 && close < 400) {
        var nl = src.indexOf('\n', close + 1);
        if (nl !== -1) src = src.slice(nl + 1);
      }
    }

    var lines = src.split('\n');
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      if (isBlank(line)) { i++; continue; }

      // 代码块
      var fence = fenceOf(line);
      if (fence) {
        var ch = fence.charAt(0);
        var n = fence.length;
        var buf = [];
        i++;
        var endRe = new RegExp('^\\s{0,3}' + ch + '{' + n + ',}\\s*$');
        while (i < lines.length && !endRe.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre class="code"><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // 标题
      var hm = headingOf(line);
      if (hm) {
        var lv = hm[1].length;
        out.push('<h' + lv + '>' + inline(hm[2]) + '</h' + lv + '>');
        i++;
        continue;
      }

      // 分割线
      if (isHr(line)) { out.push('<hr>'); i++; continue; }

      // 引用
      var qm = quoteOf(line);
      if (qm) {
        var qb = [];
        while (i < lines.length && (qm = quoteOf(lines[i]))) { qb.push(qm[1]); i++; }
        out.push('<blockquote>' + mdToHtml(qb.join('\n')) + '</blockquote>');
        continue;
      }

      // 表格
      if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
        var head = cells(line);
        var align = cells(lines[i + 1]).map(function (c) {
          var t = c.trim();
          var l = t.charAt(0) === ':';
          var r = t.charAt(t.length - 1) === ':';
          return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
        });
        i += 2;
        var t = '<div class="tbl"><table><thead><tr>';
        head.forEach(function (c, x) {
          t += '<th' + (align[x] ? ' style="text-align:' + align[x] + '"' : '') + '>' + inline(c.trim()) + '</th>';
        });
        t += '</tr></thead><tbody>';
        while (i < lines.length && isRow(lines[i]) && !isBlank(lines[i]) && !isSep(lines[i])) {
          var row = cells(lines[i]);
          t += '<tr>';
          head.forEach(function (_, x) {
            t += '<td' + (align[x] ? ' style="text-align:' + align[x] + '"' : '') + '>' + inline((row[x] || '').trim()) + '</td>';
          });
          t += '</tr>';
          i++;
        }
        t += '</tbody></table></div>';
        out.push(t);
        continue;
      }

      // 列表
      if (listMarker(line)) {
        var items = [];
        while (i < lines.length) {
          var lm = listMarker(lines[i]);
          if (lm) {
            var indent = lm[1].replace(/\t/g, '  ').length;
            items.push({
              indent: indent,
              ordered: /\d/.test(lm[2]),
              text: lm[3].replace(/^\[([ xX])\]\s*/, function (m, c) { return c.trim() ? '☑ ' : '☐ '; }),
            });
            i++;
          } else if (!isBlank(lines[i]) && items.length && /^\s{2,}\S/.test(lines[i])) {
            items[items.length - 1].text += ' ' + lines[i].trim(); // 续行
            i++;
          } else break;
        }
        if (items.length) {
          out.push(buildList(items, 0, items[0].indent).html);
          continue;
        }
      }

      // 段落
      var pb = [line];
      i++;
      while (i < lines.length) {
        var l2 = lines[i];
        if (isBlank(l2) || fenceOf(l2) || headingOf(l2) || isHr(l2) || listMarker(l2) || quoteOf(l2)) break;
        if (isRow(l2) && i + 1 < lines.length && isSep(lines[i + 1])) break;
        pb.push(l2);
        i++;
      }
      out.push('<p>' + pb.map(inline).join('<br>') + '</p>');
    }

    return out.join('\n');
  }

  return { mdToHtml: mdToHtml, escapeHtml: escapeHtml };
});
