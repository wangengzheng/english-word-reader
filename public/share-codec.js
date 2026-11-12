/**
 * share-codec.js — 分享链接的编解码器（浏览器 / Node 通用）
 *
 * encode(text) → payload 字符串：
 *   'd' + base64url(deflate-raw(text))   支持 CompressionStream 时（首选，更短）
 *   'r' + base64url(utf8(text))          兜底（不支持压缩的环境）
 * decode(payload) → 原文
 *
 * base64url：+ → - ，/ → _ ，去掉 padding，可直接放进 URL。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.ShareCodec = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function b64urlFromBytes(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function bytesFromB64url(str) {
    var t = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var bin = atob(t);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  async function encode(text) {
    var bytes = new TextEncoder().encode(String(text));
    if (typeof CompressionStream === 'function') {
      try {
        var cs = new CompressionStream('deflate-raw');
        var buf = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
        return 'd' + b64urlFromBytes(new Uint8Array(buf));
      } catch (e) { /* 压缩不可用时兜底 */ }
    }
    return 'r' + b64urlFromBytes(bytes);
  }

  async function decode(payload) {
    var mode = String(payload).charAt(0);
    var u8 = bytesFromB64url(String(payload).slice(1));
    if (mode === 'r') return new TextDecoder().decode(u8);
    var ds = new DecompressionStream('deflate-raw');
    var buf = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
    return new TextDecoder().decode(buf);
  }

  return { encode: encode, decode: decode, b64urlFromBytes: b64urlFromBytes, bytesFromB64url: bytesFromB64url };
});
