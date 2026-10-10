// Everything the family has shared lives in data/: materials.json, the built
// game, the guide conversation, and uploaded files under data/media.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.HOME_AGAIN_DATA || path.join(ROOT, 'data');
export const MEDIA = path.join(DATA, 'media');
export const FILES = {
  materials: path.join(DATA, 'materials.json'),
  game: path.join(DATA, 'game.json'),
  chat: path.join(DATA, 'chat.json')
};

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.wav': 'audio/wav'
};
const EXT_FOR = Object.fromEntries(Object.entries(TYPES).map(([ext, type]) => [type, ext]));

export async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
export async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}
const emptyMaterials = () => ({ profile: {}, people: [], photos: [], voices: [], notes: [] });
export const loadMaterials = () => readJSON(FILES.materials, emptyMaterials());
export const saveMaterials = mat => writeJSON(FILES.materials, mat);
export const newId = p => p + '_' + crypto.randomBytes(4).toString('hex');

// Accepts a data: URL, writes the file under data/media, returns its public path.
export async function saveMedia(dataUrl, prefix) {
  const m = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error('expected a base64 data URL'), { status: 400 });
  const ext = EXT_FOR[m[1]];
  if (!ext) throw Object.assign(new Error('unsupported file type ' + m[1]), { status: 400 });
  const name = prefix + '-' + crypto.randomBytes(6).toString('hex') + ext;
  await fs.mkdir(MEDIA, { recursive: true });
  await fs.writeFile(path.join(MEDIA, name), Buffer.from(m[2], 'base64'));
  return '/media/' + name;
}
export async function dropMedia(url) {
  if (url?.startsWith('/media/')) await fs.rm(path.join(MEDIA, path.basename(url)), { force: true });
}
// Reads an uploaded file back as an inline part for Gemini.
export async function mediaPart(url) {
  const file = path.join(MEDIA, path.basename(url));
  return { inlineData: { mimeType: TYPES[path.extname(file)], data: (await fs.readFile(file)).toString('base64') } };
}

export async function removeMaterial(mat, id) {
  for (const list of ['people', 'photos', 'voices', 'notes']) {
    const item = mat[list].find(x => x.id === id);
    if (!item) continue;
    mat[list] = mat[list].filter(x => x.id !== id);
    if (item.url) await dropMedia(item.url);
    if (list === 'photos') mat.people.forEach(f => { if (f.photoId === id) f.photoId = null; });
    return item;
  }
  return null;
}

// Plain-text account of everything saved, shared by the guide and the game builder.
export function describeMaterials(mat) {
  const lines = [];
  const p = mat.profile || {};
  lines.push('## The player');
  for (const [k, label] of [['name', 'Name'], ['callName', 'The family calls them'], ['born', 'Born'], ['places', 'Places that matter'], ['music', 'Music they love'], ['loves', 'Things they love'], ['avoid', 'Please avoid']])
    if (p[k]) lines.push(`${label}: ${p[k]}`);

  lines.push('', '## Family members');
  for (const f of mat.people) lines.push(`- ${f.name} (${f.relation || 'relation not given'})${f.photoId ? `, portrait photo id ${f.photoId}` : ', no portrait yet'}${f.note ? `. ${f.note}` : ''}`);

  lines.push('', '## Photos');
  for (const ph of mat.photos) lines.push(`- photo id ${ph.id}: ${ph.caption || 'not described yet'}${ph.year ? ` (${ph.year})` : ''}`);

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
  const items = [
    { key: 'player', label: 'Who it is for', done: !!p.callName, need: 'their name and what the family calls them' },
    { key: 'story', label: 'Their life story', done: !!p.born && mat.notes.length >= 3, need: 'where and when they were born, and stories from their childhood, young adulthood and family life' },
    { key: 'family', label: 'Family members', done: mat.people.length >= 3, count: `${Math.min(mat.people.length, 3)}/3`, need: 'two or three family members, with how each is related' },
    { key: 'portraits', label: 'Portraits', done: portraits.size >= 2, count: `${Math.min(portraits.size, 3)}/3`, need: 'a clear photo of each family member\'s face, for the kitchen table' },
    { key: 'song', label: 'A song', done: !!p.music, need: 'a song that means something to them' },
    { key: 'photos', label: 'Photos with stories', done: scenes.filter(ph => ph.caption && ph.year).length >= 3, count: `${Math.min(scenes.filter(ph => ph.caption && ph.year).length, 3)}/3`, need: 'three or more photos of places or moments, each with a short story and a rough year' },
    { key: 'voices', label: 'Voice messages', done: mat.voices.length >= 2, count: `${Math.min(mat.voices.length, 4)}/4`, need: 'short recorded messages from family members, used as pieces of the letter' },
    { key: 'avoid', label: 'Things to avoid', done: !!p.avoid, need: 'anything that might upset them, or a clear "nothing"' }
  ];
  const done = key => items.find(i => i.key === key).done;
  return { items, ready: items.filter(i => i.done).length >= 5 && done('player') && done('family'), built };
}
