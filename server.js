// Home Again: serves the game and the family page. The family talks with the
// guide (guide.js), which gathers material and builds the game (build.js).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chat, loadChat, resetChat } from './guide.js';
import { buildGame } from './build.js';
import { ROOT, MEDIA, TYPES, FILES, readJSON, loadMaterials, saveMaterials, removeMaterial, progress } from './store.js';

const PORT = Number(process.env.PORT) || 8787;
const MAX_BODY = 40 * 1024 * 1024;

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('That upload is too large.'), { status: 413 });
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}
async function serveFile(res, file) {
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch { send(res, 404, 'not found', 'text/plain'); }
}
const isBuilt = async () => !!(await readJSON(FILES.game, null));

const routes = {
  // the conversation so far, for redrawing the page
  'GET /api/chat': async () => {
    const mat = await loadMaterials();
    return { transcript: (await loadChat()).transcript, progress: progress(mat, await isBuilt()), materials: mat };
  },
  'POST /api/chat': body => chat(body),
  // a fresh conversation, e.g. for another family member; saved material stays
  'POST /api/chat/reset': async () => { await resetChat(); return { ok: true }; },
  'POST /api/build': () => buildGame(),
  'GET /api/game': async () => {
    const cfg = await readJSON(FILES.game, null);
    if (!cfg) throw Object.assign(new Error('no game built yet'), { status: 404 });
    return cfg;
  }
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const del = /^\/api\/materials\/([\w-]+)$/.exec(url.pathname);
      if (req.method === 'DELETE' && del) {
        const mat = await loadMaterials();
        await removeMaterial(mat, del[1]);
        await saveMaterials(mat);
        return send(res, 200, { progress: progress(mat, await isBuilt()), materials: mat });
      }
      const handler = routes[req.method + ' ' + url.pathname];
      if (!handler) return send(res, 404, { error: 'not found' });
      return send(res, 200, await handler(req.method === 'GET' ? {} : await readBody(req)));
    }
    if (url.pathname.startsWith('/media/')) return serveFile(res, path.join(MEDIA, path.basename(url.pathname)));
    if (url.pathname === '/' || url.pathname === '/index.html') return serveFile(res, path.join(ROOT, 'index.html'));
    if (url.pathname === '/family' || url.pathname === '/family.html') return serveFile(res, path.join(ROOT, 'family.html'));
    send(res, 404, 'not found', 'text/plain');
  } catch (err) {
    const status = err.status && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error(err);
    send(res, status, { error: status === 500 ? 'Something went wrong on the server.' : err.message });
  }
}).listen(PORT, () => console.log(`Home Again on http://localhost:${PORT}  (family page: /family)`));
