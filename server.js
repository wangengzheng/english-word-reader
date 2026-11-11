#!/usr/bin/env node
'use strict';

/**
 * English Word Reader — 本地词库点读服务
 *
 * 环境变量：
 *   PORT      监听端口（默认 7610，被占用时自动 +1）
 *   HOST      监听地址（默认 127.0.0.1）
 *   DICT_DIR  词库目录（默认 /Users/james/Desktop/workday/002_english）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 7610;
const DICT_DIR = process.env.DICT_DIR || '/Users/james/Desktop/workday/002_english';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

/* ------------------------------------------------------------------ */
/* 词库索引                                                            */
/* ------------------------------------------------------------------ */

let index = new Map(); // 小写文件名(去 .md) -> 真实文件名
let indexAt = 0;
let indexError = null;
const INDEX_TTL = 15_000; // 15s 后在下一次查询时自动重建，便于词库热更新

function buildIndex(force = false) {
  if (!force && indexAt && Date.now() - indexAt < INDEX_TTL) return index;
  const next = new Map();
  try {
    for (const entry of fs.readdirSync(DICT_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith('.md')) continue;
      const key = entry.name.slice(0, -3).toLowerCase();
      if (!next.has(key)) next.set(key, entry.name);
    }
    index = next;
    indexError = null;
  } catch (err) {
    indexError = err.message;
  }
  indexAt = Date.now();
  return index;
}

/* ------------------------------------------------------------------ */
/* 单词解析：大小写不敏感 + 复数还原                                    */
/* ------------------------------------------------------------------ */

const IRREGULAR = {
  wolves: 'wolf', knives: 'knife', lives: 'life', leaves: 'leaf',
  halves: 'half', shelves: 'shelf', wives: 'wife', thieves: 'thief',
  loaves: 'loaf', calves: 'calf', elves: 'elf',
  feet: 'foot', teeth: 'tooth', geese: 'goose', men: 'man',
  women: 'woman', children: 'child', people: 'person',
  mice: 'mouse', lice: 'louse', oxen: 'ox',
};

function resolveWord(raw) {
  const idx = buildIndex();
  const w = String(raw == null ? '' : raw).trim().toLowerCase().replace(/[’‘]/g, "'");
  if (!w || !/[a-z]/.test(w)) return null;

  const tries = [];
  const push = (t) => { if (t && !tries.includes(t)) tries.push(t); };

  push(w); // 1. 精确（小写）
  if (w.endsWith("'s") && w.length > 3) push(w.slice(0, -2)); // 所有格 hello's -> hello
  const noApo = w.replace(/'/g, '');
  if (noApo !== w) {
    push(noApo); // don't -> dont
    if (noApo.endsWith('s') && noApo.length > 3) push(noApo.slice(0, -1)); // teachers' -> teacher
  }
  if (IRREGULAR[w]) push(IRREGULAR[w]); // 不规则复数
  if (w.endsWith('ies') && w.length > 4) push(w.slice(0, -3) + 'y'); // stories -> story
  if (w.endsWith('ves') && w.length > 4) { push(w.slice(0, -3) + 'f'); push(w.slice(0, -3) + 'fe'); }
  if (w.endsWith('oes') && w.length > 4) push(w.slice(0, -2)); // potatoes -> potato
  if (w.endsWith('es') && w.length > 4) push(w.slice(0, -2)); // boxes/classes/houses...
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) push(w.slice(0, -1)); // words -> word

  for (const t of tries) {
    const file = idx.get(t);
    if (file) return { slug: t, file };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* HTTP 工具                                                           */
/* ------------------------------------------------------------------ */

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

function json(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, buf) => {
    if (err) return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
    send(res, 200, buf, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const normKey = (raw) => String(raw).toLowerCase().replace(/[’‘]/g, "'");

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

const STATIC_ROUTES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/analyze': 'analyze.html',
  '/analyze.html': 'analyze.html',
  '/style.css': 'style.css',
  '/theme.js': 'theme.js',
  '/index.js': 'index.js',
  '/analyze.js': 'analyze.js',
  '/md.js': 'md.js',
};

const ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico']);

async function handler(req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = decodeURIComponent(url.pathname);

  const mapped = STATIC_ROUTES[p];
  if (req.method === 'GET' && mapped) return sendFile(res, path.join(PUBLIC_DIR, mapped));

  if (p === '/api/health' && req.method === 'GET') {
    const idx = buildIndex();
    return json(res, 200, { ok: !indexError, entries: idx.size, dictDir: DICT_DIR, error: indexError });
  }

  if (p === '/api/lookup') {
    let words = [];
    if (req.method === 'GET') {
      const w = url.searchParams.get('word');
      if (w) words = [w];
    } else {
      const body = await readJson(req);
      words = Array.isArray(body && body.words) ? body.words : [];
    }
    const matches = {};
    for (const raw of words.map(String).slice(0, 2000)) {
      const hit = resolveWord(raw);
      if (hit) matches[normKey(raw)] = hit.slug;
    }
    return json(res, 200, { matches });
  }

  if (p === '/api/md' && req.method === 'GET') {
    const slug = normKey(url.searchParams.get('slug') || '');
    const file = buildIndex().get(slug);
    if (!file) return json(res, 404, { error: '词库中没有这个单词', slug });
    try {
      const md = fs.readFileSync(path.join(DICT_DIR, file), 'utf8');
      return json(res, 200, { slug, file, md });
    } catch (err) {
      return json(res, 500, { error: '读取文件失败: ' + err.message, slug });
    }
  }

  if (p.startsWith('/dict-asset/') && req.method === 'GET') {
    const name = p.slice('/dict-asset/'.length);
    const ext = path.extname(name).toLowerCase();
    const full = path.resolve(DICT_DIR, name);
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(name) || name.includes('..') || !ASSET_EXT.has(ext)) {
      return json(res, 403, { error: 'not allowed' });
    }
    if (!full.startsWith(path.resolve(DICT_DIR) + path.sep)) return json(res, 403, { error: 'not allowed' });
    return sendFile(res, full);
  }

  if (p.startsWith('/api/')) return json(res, 404, { error: 'no such endpoint' });
  return send(res, 404, '404 — <a href="/">返回首页</a>', { 'Content-Type': 'text/html; charset=utf-8' });
}

/* ------------------------------------------------------------------ */
/* 启动（端口被占用时自动顺延）                                        */
/* ------------------------------------------------------------------ */

let port = PORT;
let attempt = 0;

function start() {
  const server = http.createServer((req, res) => {
    handler(req, res).catch((err) => {
      try { json(res, 500, { error: err.message }); } catch { /* ignore */ }
    });
  });
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 20) {
      attempt += 1;
      port += 1;
      start();
    } else {
      console.error('服务器启动失败:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, HOST, () => {
    const count = buildIndex().size;
    console.log('');
    console.log('  📖  English Word Reader');
    console.log(`  ➜  http://${HOST}:${port}`);
    console.log(`  📚  词库: ${DICT_DIR} (${count.toLocaleString()} 词条)`);
    if (indexError) console.log('  ⚠️  词库目录读取失败: ' + indexError);
    console.log('');
  });
}

start();
