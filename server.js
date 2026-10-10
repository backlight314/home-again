// Home Again: serves the game and the family page. The family talks with the
// guide (guide.js), which gathers material and builds the game (build.js).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chat, loadChat, resetChat } from './guide.js';
import { buildGame } from './build.js';
import { addPhoto, updatePhoto, addBack, addPortrait, addVoice, updateVoice, scanPhoto, nameFace, confirmFaces, setFaceRecognition } from './album.js';
import { ROOT, MEDIA, TYPES, FILES, readJSON, loadMaterials, withMaterials, removeMaterial, progress } from './store.js';

const PORT = Number(process.env.PORT) || 8787;
const MAX_BODY = 40 * 1024 * 1024;
const FACE_API = path.join(ROOT, 'node_modules', '@vladmandic', 'face-api');

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
  'GET /api/album': async () => {
    const mat = await loadMaterials();
    return { materials: mat, progress: progress(mat, await isBuilt()) };
  },
  'POST /api/photos': body => addPhoto(body),
  'POST /api/voices': body => addVoice(body),
  'POST /api/faces': body => setFaceRecognition(body),
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
        const mat = await withMaterials(async mat => { await removeMaterial(mat, del[1]); return mat; });
        return send(res, 200, { progress: progress(mat, await isBuilt()), materials: mat });
      }
      // naming a detected face: /api/photos/:id/faces/:faceId
      const face = /^\/api\/photos\/([\w-]+)\/faces\/([\w-]+)$/.exec(url.pathname);
      if (face && req.method === 'POST') return send(res, 200, await nameFace(face[1], face[2], await readBody(req)));
      // /api/photos/:id, /api/photos/:id/{back,portrait,faces,confirm-faces}, /api/voices/:id
      const item = /^\/api\/(photos|voices)\/([\w-]+)(?:\/(back|portrait|faces|confirm-faces))?$/.exec(url.pathname);
      if (item) {
        const [, kind, id, sub] = item;
        const body = await readBody(req);
        const act = kind === 'voices' ? (req.method === 'PATCH' && !sub ? updateVoice : null)
          : req.method === 'PATCH' && !sub ? updatePhoto
          : req.method === 'POST' && sub === 'back' ? addBack
          : req.method === 'POST' && sub === 'portrait' ? addPortrait
          : req.method === 'POST' && sub === 'faces' ? scanPhoto
          : req.method === 'POST' && sub === 'confirm-faces' ? confirmFaces : null;
        if (!act) return send(res, 404, { error: 'not found' });
        return send(res, 200, await act(id, body));
      }
      const handler = routes[req.method + ' ' + url.pathname];
      if (!handler) return send(res, 404, { error: 'not found' });
      return send(res, 200, await handler(req.method === 'GET' ? {} : await readBody(req)));
    }
    if (url.pathname.startsWith('/media/')) return serveFile(res, path.join(MEDIA, path.basename(url.pathname)));
    // face recognition runs in the browser, with the library and models served from here
    if (url.pathname === '/vendor/face-api.js') return serveFile(res, path.join(FACE_API, 'dist', 'face-api.js'));
    if (url.pathname.startsWith('/vendor/face-models/')) return serveFile(res, path.join(FACE_API, 'model', path.basename(url.pathname)));
    if (url.pathname === '/' || url.pathname === '/index.html') return serveFile(res, path.join(ROOT, 'index.html'));
    // /share is the same page opened on the album only, for relatives who just want to add photos and voices
    if (['/family', '/family.html', '/share'].includes(url.pathname)) return serveFile(res, path.join(ROOT, 'family.html'));
    send(res, 404, 'not found', 'text/plain');
  } catch (err) {
    const status = err.status && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error(err);
    send(res, status, { error: status === 500 ? 'Something went wrong on the server.' : err.message });
  }
}).listen(PORT, () => console.log(`Home Again on http://localhost:${PORT}  (family page: /family)`));
