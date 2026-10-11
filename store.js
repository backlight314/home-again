// Where everything the family shares is kept. Documents (the album, the guide
// conversation, the built game, the game pack) go to TigerData when DATABASE_URL
// is set, otherwise to JSON files in data/. Photos and voices go to an S3-style
// bucket when S3_BUCKET is set, otherwise to data/media. The rest of the code
// only uses the functions below and doesn't know which is in use.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describeFaces, syncWho } from './faces.js';
import { createTigerStore } from './tiger.js';
import { createLocalMedia, createBucketMedia } from './media.js';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.HOME_AGAIN_DATA || path.join(ROOT, 'data');
// one family per deployment for now; the id keeps their rows and files apart
export const FAMILY_ID = process.env.FAMILY_ID || 'default';

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.wav': 'audio/wav'
};
const EXT_FOR = Object.fromEntries(Object.entries(TYPES).map(([ext, type]) => [type, ext]));

/* documents */
async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}
function createFileStore(dir) {
  const file = name => path.join(dir, name + '.json');
  // one change at a time, each against a fresh copy
  let queue = Promise.resolve();
  return {
    kind: `local files (${dir})`,
    loadDoc: (name, fallback) => readJSON(file(name), fallback),
    saveDoc: (name, value) => writeJSON(file(name), value),
    withDoc(name, fallback, fn) {
      const run = queue.then(async () => {
        const doc = await readJSON(file(name), null) ?? fallback();
        const out = await fn(doc);
        await writeJSON(file(name), doc);
        return out;
      });
      queue = run.catch(() => {});
      return run;
    }
  };
}
const docs = process.env.DATABASE_URL
  ? createTigerStore({ url: process.env.DATABASE_URL, familyId: FAMILY_ID, root: ROOT })
  : createFileStore(DATA);
const media = process.env.S3_BUCKET ? createBucketMedia({ familyId: FAMILY_ID, types: TYPES }) : createLocalMedia(path.join(DATA, 'media'));
export const storage = { documents: docs.kind, files: media.kind, docs, media };

// chat, game and pack documents
export const loadDoc = (name, fallback) => docs.loadDoc(name, fallback);
export const saveDoc = (name, value) => docs.saveDoc(name, value);

const shape = mat => {
  for (const k of ['people', 'photos', 'voices', 'notes']) if (!Array.isArray(mat[k])) mat[k] = [];
  if (!mat.profile) mat.profile = {};
  return mat;
};
const emptyMaterials = () => ({ profile: {}, people: [], photos: [], voices: [], notes: [] });
export const loadMaterials = async () => shape(await docs.loadDoc('materials', null) ?? emptyMaterials());

// The album, the share link and the guide can all change materials at once, so
// every change runs one at a time against a fresh copy (a locked row in TigerData).
// Keep slow work (Gemini calls, uploads) outside fn.
export const withMaterials = fn => docs.withDoc('materials', emptyMaterials, mat => fn(shape(mat)));

export const newId = p => p + '_' + crypto.randomBytes(4).toString('hex');

/* photos and voices */
// Accepts a data: URL, stores the file, returns its public path.
export async function saveMedia(dataUrl, prefix) {
  const m = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error('expected a base64 data URL'), { status: 400 });
  const ext = EXT_FOR[m[1]];
  if (!ext) throw Object.assign(new Error('unsupported file type ' + m[1]), { status: 400 });
  const name = prefix + '-' + crypto.randomBytes(6).toString('hex') + ext;
  await media.put(name, Buffer.from(m[2], 'base64'));
  return '/media/' + name;
}
// A file stored under a name of the caller's choosing (spoken lines cached by their text),
// and whether one is already there.
export async function putNamedMedia(name, bytes) {
  await media.put(path.basename(name), bytes);
  return '/media/' + path.basename(name);
}
export async function hasMedia(name) {
  try { await media.get(path.basename(name)); return true; } catch { return false; }
}
export async function dropMedia(url) {
  if (url?.startsWith('/media/')) await media.remove(path.basename(url)).catch(err => console.warn('Could not delete', url, err.message));
}
// The file behind a /media/ path, for serving it.
export async function readMedia(name) {
  const base = path.basename(name);
  return { bytes: await media.get(base), type: TYPES[path.extname(base).toLowerCase()] || 'application/octet-stream' };
}
// Reads an uploaded file back as an inline part for Gemini.
export async function mediaPart(url) {
  const { bytes, type } = await readMedia(url);
  return { inlineData: { mimeType: type, data: bytes.toString('base64') } };
}

export async function removeMaterial(mat, id) {
  for (const list of ['people', 'photos', 'voices', 'notes']) {
    const item = mat[list].find(x => x.id === id);
    if (!item) continue;
    mat[list] = mat[list].filter(x => x.id !== id);
    if (item.url) await dropMedia(item.url);
    if (item.backUrl) await dropMedia(item.backUrl);
    if (list === 'photos') mat.people.forEach(f => { if (f.photoId === id) f.photoId = null; });
    if (list === 'voices') mat.photos.forEach(ph => { if (ph.voiceId === id) delete ph.voiceId; });
    if (list === 'people') for (const ph of mat.photos) {
      if (!ph.faces?.some(f => f.personId === id)) continue;
      ph.faces.forEach(f => { if (f.personId === id) Object.assign(f, { personId: null, status: 'unknown' }); });
      syncWho(ph, mat);
    }
    return item;
  }
  return null;
}

// A photo is "described" once the family has said what it shows and roughly when.
export const needsDetails = ph => !ph.caption || !ph.year;

// Photos are fingerprinted in the browser (a 64-bit difference hash, as hex);
// near-identical fingerprints mean the same picture uploaded twice.
export function findDuplicate(mat, hash) {
  if (!/^[0-9a-f]{16}$/.test(hash || '')) return null;
  const bits = h => BigInt('0x' + h);
  const distance = (a, b) => { let x = bits(a) ^ bits(b), n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };
  return mat.photos.find(ph => ph.hash && distance(ph.hash, hash) <= 4) || null;
}

// Plain-text account of everything saved, shared by the guide and the game builder.
export function describeMaterials(mat) {
  const lines = [];
  const p = mat.profile || {};
  lines.push('## The player');
  for (const [k, label] of [['name', 'Name'], ['callName', 'The family calls them'], ['born', 'Born'], ['places', 'Places that matter'], ['music', 'Music they love'], ['loves', 'Things they love'], ['workplace', 'Where they worked'], ['job', 'What they did there'], ['toy', 'A favourite childhood toy'], ['dish', 'A dish from the family kitchen'], ['avoid', 'Please avoid']])
    if (p[k]) lines.push(`${label}: ${p[k]}`);

  lines.push('', '## Family members');
  for (const f of mat.people) lines.push(`- ${f.name} (${f.relation || 'relation not given'})${f.photoId ? `, portrait photo id ${f.photoId}` : ', no portrait yet'}${f.note ? `. ${f.note}` : ''}`);

  lines.push('', '## Photos in the album');
  const portraitOf = Object.fromEntries(mat.people.filter(f => f.photoId).map(f => [f.photoId, f.name]));
  for (const ph of mat.photos) {
    const bits = [
      portraitOf[ph.id] ? `portrait of ${portraitOf[ph.id]}` : null,
      describeFaces(mat, ph),
      ph.who && (ph.whoSource !== 'faces' || !describeFaces(mat, ph)) ? `the family says it shows ${ph.who}` : null,
      ph.theme ? `about: ${ph.theme}` : null,
      ph.caption || 'no story yet',
      ph.year ? `(${ph.year})` : 'no year yet',
      ph.backUrl ? 'has the back of the print too' : null,
      ph.uploadedBy ? `added by ${ph.uploadedBy}` : null
    ].filter(Boolean);
    lines.push(`- photo id ${ph.id}: ${bits.join('; ')}`);
  }

  lines.push('', '## Voice messages (the player hears the real recording)');
  for (const v of mat.voices) lines.push(`- voice id ${v.id}, from ${v.from || 'unknown'}: "${v.transcript || 'not transcribed yet'}"`);

  lines.push('', '## Their life story and notes from the family');
  for (const n of mat.notes) lines.push(`- ${n.from ? n.from + ': ' : ''}${n.text}`);
  return lines.join('\n');
}

// What the game still needs. Drives both the guide's questions and the progress panel.
export function progress(mat, built) {
  const p = mat.profile || {};
  const portraits = new Set(mat.people.map(f => f.photoId).filter(Boolean));
  const scenes = mat.photos.filter(ph => !portraits.has(ph.id));
  const themed = (theme) => scenes.filter(ph => ph.theme === theme);
  const items = [
    { key: 'player', label: 'Who it is for', done: !!p.callName, need: 'their name and what the family calls them' },
    { key: 'story', label: 'Their life story', done: !!p.born && mat.notes.length >= 3, need: 'where and when they were born, and stories from their childhood, young adulthood and family life' },
    { key: 'family', label: 'Family members', done: mat.people.length >= 3, count: `${Math.min(mat.people.length, 3)}/3`, need: 'two or three family members, with how each is related' },
    { key: 'portraits', label: 'Portraits', done: portraits.size >= 2, count: `${Math.min(portraits.size, 3)}/3`, need: 'a clear photo of each family member\'s face, for the kitchen table' },
    { key: 'song', label: 'A song', done: !!p.music, need: 'a song that means something to them' },
    { key: 'photos', label: 'Photos with stories', done: scenes.filter(ph => ph.caption && ph.year).length >= 3, count: `${Math.min(scenes.filter(ph => ph.caption && ph.year).length, 3)}/3`, need: 'three or more photos of places or moments, each with a short story and a rough year' },
    { key: 'work', label: 'Where they worked', done: !!p.workplace && themed('work').length >= 4, count: `${Math.min(themed('work').length, 4)}/4`, need: 'where they worked and what they did there, plus four photos of that workplace (the building, their desk, colleagues, a favourite spot), each saved with the theme "work"' },
    { key: 'childhood', label: 'Childhood', done: !!p.toy && !!p.dish && themed('childhood').length >= 1, count: `${Math.min(themed('childhood').length, 2)}/2`, need: 'a favourite childhood toy, a dish from the family kitchen, and a photo or two from childhood, each photo saved with the theme "childhood"' },
    { key: 'voices', label: 'Voice messages', done: mat.voices.length >= 2, count: `${Math.min(mat.voices.length, 4)}/4`, need: 'short recorded messages from family members, used as pieces of the letter' },
    { key: 'avoid', label: 'Things to avoid', done: !!p.avoid, need: 'anything that might upset them, or a clear "nothing"' }
  ];
  const done = key => items.find(i => i.key === key).done;
  return { items, ready: items.filter(i => i.done).length >= 5 && done('player') && done('family'), built };
}
