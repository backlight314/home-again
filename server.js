import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chat, loadChat, resetChat } from './guide.js';
import { buildGame } from './build.js';
import { addPhoto, updatePhoto, addBack, addPortrait, addVoice, updateVoice, scanPhoto, nameFace, confirmFaces, setFaceRecognition } from './album.js';
import { ROOT, TYPES, loadDoc, readMedia, storage, loadMaterials, withMaterials, removeMaterial, progress } from './store.js';
import { upgradeMatching } from './faces.js';

const PORT = Number(process.env.PORT) || 8787;
const MAX_BODY = 40 * 1024 * 1024;
const FACE_API = path.join(ROOT, 'node_modules', '@vladmandic', 'face-api');

const EXTRA_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.js': 'text/javascript; charset=utf-8'
};

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('That upload is too large.'), { status: 413 });
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function typeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return EXTRA_TYPES[ext] || TYPES[ext] || 'application/octet-stream';
}

async function serveFile(res, file) {
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': typeFor(file) });
    res.end(data);
  } catch {
    send(res, 404, 'not found', 'text/plain');
  }
}

function safeJoin(root, urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(root, clean);
  if (!file.startsWith(root)) return null;
  return file;
}

const isBuilt = async () => !!(await loadDoc('game', null));

const routes = {
  'GET /api/chat': async () => {
    const mat = await loadMaterials();
    return { transcript: (await loadChat()).transcript, progress: progress(mat, await isBuilt()), materials: mat };
  },
  'POST /api/chat': (body) => chat(body),
  'POST /api/chat/reset': async () => {
    await resetChat();
    return { ok: true };
  },
  'POST /api/build': () => buildGame(),
  'GET /api/album': async () => {
    const mat = await loadMaterials();
    return { materials: mat, progress: progress(mat, await isBuilt()) };
  },
  'POST /api/photos': (body) => addPhoto(body),
  'POST /api/voices': (body) => addVoice(body),
  'POST /api/faces': (body) => setFaceRecognition(body),
  'GET /api/pack': async () => {
    const pack = await loadDoc('pack', null);
    if (!pack) throw Object.assign(new Error('The album is not built yet.'), { status: 404 });
    return pack;
  },
  'GET /api/game': async () => {
    const cfg = await loadDoc('game', null);
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
        const mat = await withMaterials(async (m) => {
          await removeMaterial(m, del[1]);
          return m;
        });
        return send(res, 200, { progress: progress(mat, await isBuilt()), materials: mat });
      }
      const face = /^\/api\/photos\/([\w-]+)\/faces\/([\w-]+)$/.exec(url.pathname);
      if (face && req.method === 'POST') return send(res, 200, await nameFace(face[1], face[2], await readBody(req)));
      const item = /^\/api\/(photos|voices)\/([\w-]+)(?:\/(back|portrait|faces|confirm-faces))?$/.exec(url.pathname);
      if (item) {
        const [, kind, id, sub] = item;
        const body = await readBody(req);
        const act =
          kind === 'voices'
            ? req.method === 'PATCH' && !sub
              ? updateVoice
              : null
            : req.method === 'PATCH' && !sub
              ? updatePhoto
              : req.method === 'POST' && sub === 'back'
                ? addBack
                : req.method === 'POST' && sub === 'portrait'
                  ? addPortrait
                  : req.method === 'POST' && sub === 'faces'
                    ? scanPhoto
                    : req.method === 'POST' && sub === 'confirm-faces'
                      ? confirmFaces
                      : null;
        if (!act) return send(res, 404, { error: 'not found' });
        return send(res, 200, await act(id, body));
      }
      const handler = routes[req.method + ' ' + url.pathname];
      if (!handler) return send(res, 404, { error: 'not found' });
      return send(res, 200, await handler(req.method === 'GET' ? {} : await readBody(req)));
    }
    // family photos and voices, from the local folder or the bucket; never cached by shared caches
    if (url.pathname.startsWith('/media/')) {
      try {
        const { bytes, type } = await readMedia(url.pathname);
        res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=3600' });
        return res.end(bytes);
      } catch { return send(res, 404, 'not found', 'text/plain'); }
    }
    if (url.pathname === '/vendor/face-api.js') return serveFile(res, path.join(FACE_API, 'dist', 'face-api.js'));
    if (url.pathname.startsWith('/vendor/face-models/')) {
      return serveFile(res, path.join(FACE_API, 'model', path.basename(url.pathname)));
    }
    if (['/family', '/family.html', '/share'].includes(url.pathname)) {
      return serveFile(res, path.join(ROOT, 'family.html'));
    }
    const rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = safeJoin(ROOT, rel);
    if (!file) return send(res, 404, 'not found', 'text/plain');
    return serveFile(res, file);
  } catch (err) {
    const status = err.status && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error(err);
    send(res, status, { error: status === 500 ? 'Something went wrong on the server.' : err.message });
  }
}).listen(PORT, () => {
  console.log(`Home Again on http://localhost:${PORT}  (family: /family)`);
  console.log(`Album stored in ${storage.documents}; photos and voices in ${storage.files}`);
});

// re-check existing face guesses whenever the matching rules change
withMaterials(mat => { if (upgradeMatching(mat)) console.log('Face guesses re-checked with the current matching rules.'); });
