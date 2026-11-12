/* 分享编解码器测试：node test/share-test.js */
'use strict';

const path = require('path');
const zlib = require('zlib');
const ShareCodec = require(path.join(__dirname, '..', 'public', 'share-codec.js'));

let fail = 0;
function check(name, ok, extra) {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok || extra == null ? '' : ' → ' + extra));
  if (!ok) fail++;
}

const EXAMPLE =
  'Hello everyone. Today I want to talk about communication.\n\n' +
  'Communication means talking, listening, reading, and writing. We use communication every day. ' +
  'We talk to family, friends, teachers, and other people. We use words, body language, and pictures ' +
  'to share ideas. Communication is everywhere. It is in every conversation, every message, and every smile.';

(async () => {
  console.log('ShareCodec 编解码:');

  /* 1. 回环一致 */
  const payload = await ShareCodec.encode(EXAMPLE);
  const decoded = await ShareCodec.decode(payload);
  check('deflate 回环一致', decoded === EXAMPLE);
  check('使用压缩模式 d', payload.startsWith('d'), payload.slice(0, 12));

  /* 2. 与 Node zlib 交叉验证（证明任何标准 deflate-raw 都能解） */
  const raw = Buffer.from(ShareCodec.bytesFromB64url(payload.slice(1)));
  const inflated = zlib.inflateRawSync(raw).toString('utf8');
  check('Node zlib.inflateRawSync 可解码', inflated === EXAMPLE);

  /* 3. 链接长度 */
  const url = 'https://vocab.proxy.ideaaedi.com/analyze#t=' + payload;
  console.log('    示例文章(' + EXAMPLE.length + ' 字符) → 链接 ' + url.length + ' 字符');
  check('示例链接 < 600 字符', url.length < 600);

  /* 4. 特殊字符 */
  const tricky = '中文 /ɪˈmoʊʃn/ 音标\n换行\t制表 🌙 "引号" <标签> & 符号 emoji 😀';
  const t2 = await ShareCodec.decode(await ShareCodec.encode(tricky));
  check('中文/音标/emoji/特殊字符 回环', t2 === tricky);

  /* 5. 'r' 兜底模式 */
  const u8 = new TextEncoder().encode(EXAMPLE);
  const rPayload = 'r' + ShareCodec.b64urlFromBytes(u8);
  const r2 = await ShareCodec.decode(rPayload);
  check('r 模式(未压缩)回环', r2 === EXAMPLE);

  /* 6. base64url 字符集安全（可直接放 URL） */
  check('payload 仅含 URL 安全字符', /^[A-Za-z0-9_-]+$/.test(payload));

  /* 7. 长文本 */
  const long = Array.from({ length: 300 }, (_, i) =>
    'Sentence number ' + i + ' talks about communication, words, and ideas that people share every day.'
  ).join('\n\n');
  const lp = await ShareCodec.encode(long);
  const ld = await ShareCodec.decode(lp);
  check('长文本(' + long.length + ' 字符) 回环', ld === long);
  console.log('    长文本 → 链接 ' + (60 + lp.length) + ' 字符');

  console.log(fail ? '\nFAIL: ' + fail + ' 项未通过' : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})();
