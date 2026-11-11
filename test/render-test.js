/* Markdown 渲染器单元测试：node test/render-test.js */
'use strict';

const path = require('path');
const fs = require('fs');
const MD = require(path.join(__dirname, '..', 'public', 'md.js'));

let fail = 0;
function check(name, ok, extra) {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok || extra == null ? '' : ' → ' + extra));
  if (!ok) fail++;
}

/* 1. 真实词库文件 hello.md */
const hello = fs.readFileSync('/Users/james/Desktop/workday/002_english/hello.md', 'utf8');
const html = MD.mdToHtml(hello);

console.log('hello.md 渲染:');
check('表格', html.includes('<table>') && html.includes('<th'), html.slice(0, 200));
check('三级标题', html.includes('<h3>'));
check('加粗', html.includes('<strong>'));
check('斜体', html.includes('<em>'));
check('列表', html.includes('<ul>') && html.includes('<li>'));
check('嵌套列表', /<\/strong><ul>/.test(html), html.slice(html.indexOf('<ul>'), html.indexOf('<ul>') + 100));
check('分割线', html.includes('<hr>'));
check('无残留 **', !html.includes('**'));
check('无残留 ```', !html.includes('```'));
check('音标原样保留', html.includes('/həˈləʊ/'));
check('反斜杠转义 \\* → 字面量', html.includes('&#42;hal-') && !html.includes('\\*'), html.slice(html.indexOf('hal-') - 20, html.indexOf('hal-') + 10));

/* 2. XSS / 原始 HTML 转义 */
const evil = MD.mdToHtml('hi <img src=x onerror="alert(1)"> and <script>bad()</script>');
check('原始 HTML 被转义', !evil.includes('<img') && !evil.includes('<script'), evil);

/* 3. 代码块 */
const fence = MD.mdToHtml('```js\nconst a = "<b>";\n```');
check('代码块 + 内部转义', fence.includes('<pre') && fence.includes('&lt;b&gt;'), fence);

/* 4. front matter */
const fm = MD.mdToHtml('---\ntitle: x\n---\n\n# Title\n');
check('front matter 被剥离', fm.includes('<h1>Title</h1>'), fm);

/* 5. 嵌套列表 */
const nl = MD.mdToHtml('* a\n    * b\n        * c\n* d');
check('三级嵌套列表', nl.includes('<li>a') && nl.includes('<li>b') && nl.includes('<li>c</li></ul></li></ul></li>'), nl);

/* 6. 有序列表 + 任务列表 */
const ol = MD.mdToHtml('1. one\n2. two\n- [x] done\n- [ ] todo');
check('有序列表', ol.includes('<ol>'));
check('任务列表', ol.includes('☑') && ol.includes('☐'), ol);

/* 7. 表格对齐 */
const tbl = MD.mdToHtml('| a | b |\n|---|:--:|\n| 1 | 2 |');
check('表格对齐', tbl.includes('text-align:center'), tbl);

/* 8. .md 内链 */
const link = MD.mdToHtml('see [word](word.md) and [site](https://a.com)');
check('词库内链标记', link.includes('class="md-link"') && link.includes('data-slug="word"'), link);
check('外链', link.includes('https://a.com'), link);

/* 9. 段内换行 */
const para = MD.mdToHtml('line one\nline two');
check('段内换行 <br>', para === '<p>line one<br>line two</p>', para);

console.log(fail ? '\nFAIL: ' + fail + ' 项未通过' : '\nALL PASS');
process.exit(fail ? 1 : 0);
