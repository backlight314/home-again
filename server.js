// Home Again: serves the game and the family page, stores what the family
// uploads, and asks Gemini to turn it into a personalized game config.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ApiError } from '@google/genai';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, 'data');
const MEDIA = path.join(DATA, 'media');
const MATERIALS = path.join(DATA, 'materials.json');
const GAME = path.join(DATA, 'game.json');
const PORT = Number(process.env.PORT) || 8787;
// Flash works on the free tier; set GEMINI_MODEL=gemini-pro-latest on a paid key for better writing.
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const MAX_BODY = 30 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.wav': 'audio/wav'
};
const EXT_FOR = Object.fromEntries(Object.entries(TYPES).map(([ext, type]) => [type, ext]));

/* storage */
async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}
const emptyMaterials = () => ({ profile: {}, people: [], photos: [], voices: [], notes: [] });
const loadMaterials = () => readJSON(MATERIALS, emptyMaterials());

// Accepts a data: URL, writes the file under data/media, returns its public path.
async function saveMedia(dataUrl, prefix) {
  const m = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s.exec(dataUrl || '');
  if (!m) throw new Error('expected a base64 data URL');
  const type = m[1].split(';')[0];
  const ext = EXT_FOR[type];
  if (!ext) throw new Error('unsupported file type ' + type);
  const name = prefix + '-' + crypto.randomBytes(6).toString('hex') + ext;
  await fs.mkdir(MEDIA, { recursive: true });
  await fs.writeFile(path.join(MEDIA, name), Buffer.from(m[2], 'base64'));
  return '/media/' + name;
}
async function dropMedia(url) {
  if (url && url.startsWith('/media/')) await fs.rm(path.join(MEDIA, path.basename(url)), { force: true });
}
const newId = p => p + '_' + crypto.randomBytes(4).toString('hex');

/* the prompt */
const SYSTEM = `You help a family personalize "Home Again", a gentle reminiscence game for an older relative who may be living with memory loss. The family uploads photos, voice messages, notes about the person and the family. You turn that into the game's content.

The game is one evening in a family album. A paper bird brings a letter torn into four pieces. Each of four rooms holds one piece:
- Kitchen: family portraits sit around a table. The player taps the right face for each circled chair. A wrong tap gets a kind correction from the person tapped ("That is me, your sister. Look for Mei."). The right tap gets a hello.
- Radio room: the player turns a dial until one meaningful song comes in, then keeps it.
- Porch: one photo hangs on a swing; the player is invited to talk about it.
- Attic: three photos from the photo box are placed on a shelf from earlier to later. Every order is accepted; there are no wrong answers.
At the end the four pieces form a short letter from the family, read aloud, and a family member says hello.

How to write:
- Address the player the way the family does (for example "Mom" or "Grandpa Joe").
- Short, warm, concrete sentences. Plain words. No quizzing tone, no "do you remember".
- Use only facts the family gave you. Never invent names, places, dates or events. If something is missing, keep the line gentle and general, and ask the family about it in "questions".
- Respect anything the family says to avoid (people who have died, painful places, topics that cause distress).
- Letter pieces should sound like the named family member wrote them. If a voice message's transcript fits a room, use it (lightly trimmed) and attach its voice id so the player hears the real voice.
- Refer to photos and voices only by the ids listed in the materials. Use null when nothing fits.
- Portraits for the kitchen should be photos of a single family member; prefer each person's own portrait photo.

Also write "summary": two to four sentences to the family saying what you built and why. And "questions": up to five short, specific questions whose answers would make the game better (empty if none).`;

const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string' };

const GAME_SCHEMA = obj({
  player: obj({ callName: str }),
  people: {
    type: 'array',
    description: 'Family members who appear in the game, up to 5. The first three appear at the kitchen table.',
    items: obj({
      name: str,
      relation: { type: 'string', description: 'Relation to the player, e.g. "your daughter".' },
      photoId: nullable(str),
      selfIntro: { type: 'string', description: 'What they say if tapped by mistake, before pointing to the right person. e.g. "That is me, your sister."' },
      hello: { type: 'string', description: 'What they say when correctly placed. e.g. "Hi Mom, I brought the bread."' }
    })
  },
  kitchen: obj({
    seats: { type: 'array', items: str, description: 'One or two people names, in the order their chairs are circled.' },
    place: { type: 'string', description: 'Short caption, e.g. "KITCHEN, SUNDAY".' }
  }),
  radio: obj({
    song: obj({ title: str, artist: str, year: nullable(str) }),
    question: { type: 'string', description: 'One short, gentle question asked once the song comes in, ending with a question mark, e.g. "Where did you hear this one?"' }
  }),
  porch: obj({
    photoId: nullable(str),
    photoLabel: { type: 'string', description: 'Handwritten label under the photo, lowercase, e.g. "the lake, summer".' },
    prompt: { type: 'string', description: 'Invitation to talk, e.g. "Tell me about this day at the lake".' },
    followUp: { type: 'string', description: 'e.g. "Then what happened?"' },
    sampleStory: { type: 'string', description: 'A one-sentence example of what the player might say, used only in the demo transcript. Base it on the family\'s account of the photo.' }
  }),
  attic: obj({
    photoIds: { type: 'array', items: str, description: 'Exactly three photo ids, earliest first.' }
  }),
  letter: {
    type: 'array',
    description: 'Exactly four pieces, in room order: Kitchen, Radio room, Porch, Attic.',
    items: obj({ line: str, by: str, voiceId: nullable(str) })
  },
  ending: obj({ caller: { type: 'string', description: 'Name of the family member who says hello at the end.' } }),
  summary: str,
  questions: { type: 'array', items: str }
});

// Builds the request parts: all text materials as one block, then each photo labelled by id.
async function materialsToContent(mat) {
  const lines = [];
  const p = mat.profile || {};
  lines.push('## The player');
  for (const [k, label] of [['name', 'Name'], ['callName', 'The family calls them'], ['hometown', 'Places that matter'], ['music', 'Music they love'], ['loves', 'Things they love'], ['avoid', 'Please avoid']])
    if (p[k]) lines.push(`${label}: ${p[k]}`);

  lines.push('', '## Family members');
  for (const f of mat.people) lines.push(`- ${f.name} (${f.relation || 'relation not given'})${f.photoId ? `, portrait photo id ${f.photoId}` : ''}${f.note ? `. ${f.note}` : ''}`);

  lines.push('', '## Voice messages (the player will hear the real recording; you only see the transcript)');
  for (const v of mat.voices) lines.push(`- id ${v.id}, from ${v.from || 'unknown'}: "${v.transcript || '(no transcript yet)'}"`);

  lines.push('', '## Notes and answers from the family');
  for (const n of mat.notes) lines.push(`- ${n.from ? n.from + ': ' : ''}${n.text}`);

  const parts = [{ text: lines.join('\n') }];
  if (mat.photos.length) parts.push({ text: '## Photos' });
  for (const ph of mat.photos) {
    const file = path.join(MEDIA, path.basename(ph.url));
    let data;
    try { data = (await fs.readFile(file)).toString('base64'); } catch { continue; }
    const type = TYPES[path.extname(file)];
    if (!type?.startsWith('image/')) continue;
    parts.push({ text: `Photo id ${ph.id}${ph.caption ? `. Family caption: ${ph.caption}` : ''}${ph.year ? `. Year: ${ph.year}` : ''}${ph.personName ? `. Portrait of ${ph.personName}` : ''}` });
    parts.push({ inlineData: { mimeType: type, data } });
  }
  parts.push({ text: 'Build the game content from these materials.' });
  return parts;
}

// Replaces ids with media URLs and drops anything the model referenced that does not exist.
function resolve(cfg, mat) {
  const photo = id => mat.photos.find(p => p.id === id)?.url || null;
  const voice = id => mat.voices.find(v => v.id === id)?.url || null;
  cfg.people = cfg.people.slice(0, 5).map(p => ({ ...p, photo: photo(p.photoId) }));
  const names = new Set(cfg.people.map(p => p.name));
  cfg.kitchen.seats = cfg.kitchen.seats.filter(n => names.has(n)).slice(0, 2);
  cfg.porch.photo = photo(cfg.porch.photoId);
  cfg.attic.photos = [...new Set(cfg.attic.photoIds.map(photo).filter(Boolean))].slice(0, 3);
  cfg.letter = cfg.letter.slice(0, 4).map(l => ({ ...l, voice: voice(l.voiceId) }));
  if (!names.has(cfg.ending.caller)) cfg.ending.caller = cfg.people[0]?.name || '';
  cfg.builtAt = new Date().toISOString();
  return cfg;
}

async function buildGame() {
  const mat = await loadMaterials();
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set. Add it to .env and restart the server.');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let res;
  try {
    res = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: await materialsToContent(mat) }],
      config: { systemInstruction: SYSTEM, responseMimeType: 'application/json', responseJsonSchema: GAME_SCHEMA }
    });
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    if (err.status === 429) throw Object.assign(new Error(`Gemini's usage limit for ${MODEL} is used up. Wait a bit, or use a key with billing enabled.`), { status: 429 });
    if (err.status === 401 || err.status === 403) throw Object.assign(new Error('Gemini rejected the API key. Check GEMINI_API_KEY in .env.'), { status: 502 });
    throw Object.assign(new Error('Gemini error ' + err.status + '. Try again.'), { status: 502, cause: err });
  }
  if (res.promptFeedback?.blockReason) throw new Error('Gemini declined this request (' + res.promptFeedback.blockReason + ').');
  const finish = res.candidates?.[0]?.finishReason;
  if (finish === 'MAX_TOKENS') throw new Error('The response was cut off; try again.');
  const text = res.text;
  if (!text) throw new Error('Gemini returned no content' + (finish ? ' (' + finish + ')' : '') + '. Try again.');
  const cfg = resolve(JSON.parse(text), mat);
  await writeJSON(GAME, cfg);
  return cfg;
}

/* http */
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('upload too large'), { status: 413 });
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

const routes = {
  'GET /api/materials': async () => loadMaterials(),

  'PUT /api/profile': async body => {
    const mat = await loadMaterials();
    mat.profile = body;
    await writeJSON(MATERIALS, mat);
    return mat;
  },

  // body: { name, relation, note, photo?: dataURL }
  'POST /api/people': async body => {
    const mat = await loadMaterials();
    const person = { id: newId('f'), name: body.name, relation: body.relation, note: body.note || '', photoId: null };
    if (body.photo) {
      const ph = { id: newId('p'), url: await saveMedia(body.photo, 'portrait'), caption: '', year: '', personName: body.name };
      mat.photos.push(ph);
      person.photoId = ph.id;
    }
    mat.people.push(person);
    await writeJSON(MATERIALS, mat);
    return mat;
  },

  // body: { photo: dataURL, caption, year }
  'POST /api/photos': async body => {
    const mat = await loadMaterials();
    mat.photos.push({ id: newId('p'), url: await saveMedia(body.photo, 'photo'), caption: body.caption || '', year: body.year || '', personName: '' });
    await writeJSON(MATERIALS, mat);
    return mat;
  },

  // body: { audio: dataURL, from, transcript }
  'POST /api/voices': async body => {
    const mat = await loadMaterials();
    mat.voices.push({ id: newId('v'), url: await saveMedia(body.audio, 'voice'), from: body.from || '', transcript: body.transcript || '' });
    await writeJSON(MATERIALS, mat);
    return mat;
  },

  // body: { text, from }
  'POST /api/notes': async body => {
    const mat = await loadMaterials();
    mat.notes.push({ id: newId('n'), text: body.text, from: body.from || '' });
    await writeJSON(MATERIALS, mat);
    return mat;
  },

  'POST /api/build': async () => buildGame(),

  'GET /api/game': async () => {
    const cfg = await readJSON(GAME, null);
    if (!cfg) throw Object.assign(new Error('no game built yet'), { status: 404 });
    return cfg;
  }
};

async function deleteMaterial(id) {
  const mat = await loadMaterials();
  for (const list of ['people', 'photos', 'voices', 'notes']) {
    const item = mat[list].find(x => x.id === id);
    if (!item) continue;
    mat[list] = mat[list].filter(x => x.id !== id);
    if (item.url) await dropMedia(item.url);
    if (list === 'people' && item.photoId) {
      const ph = mat.photos.find(p => p.id === item.photoId);
      mat.photos = mat.photos.filter(p => p.id !== item.photoId);
      if (ph) await dropMedia(ph.url);
    }
  }
  await writeJSON(MATERIALS, mat);
  return mat;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const del = /^\/api\/materials\/([\w-]+)$/.exec(url.pathname);
      if (req.method === 'DELETE' && del) return send(res, 200, await deleteMaterial(del[1]));
      const handler = routes[req.method + ' ' + url.pathname];
      if (!handler) return send(res, 404, { error: 'not found' });
      return send(res, 200, await handler(req.method === 'GET' ? {} : await readBody(req)));
    }
    if (url.pathname.startsWith('/media/')) return serveFile(res, path.join(MEDIA, path.basename(url.pathname)));
    if (url.pathname === '/' || url.pathname === '/index.html') return serveFile(res, path.join(here, 'index.html'));
    if (url.pathname === '/family' || url.pathname === '/family.html') return serveFile(res, path.join(here, 'family.html'));
    send(res, 404, 'not found', 'text/plain');
  } catch (err) {
    const status = err.status && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error(err);
    send(res, status, { error: err.message });
  }
}).listen(PORT, () => console.log(`Home Again on http://localhost:${PORT}  (family page: /family)`));
