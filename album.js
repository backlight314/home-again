// The shared album: photos and voice messages added directly, by anyone with the
// link, without going through the guide. The guide reads the same materials.
import { generate, MODELS } from './gemini.js';
import { withMaterials, saveMedia, dropMedia, mediaPart, findDuplicate, newId } from './store.js';
import { ingestFaces, tagFace, confirmGuesses, learnPortrait, syncWho, forgetAll, enabled } from './faces.js';

const clean = v => (typeof v === 'string' ? v.trim().slice(0, 500) : '');
const gone = what => Object.assign(new Error(`That ${what} is no longer in the album.`), { status: 404 });
const findPhoto = (mat, id) => mat.photos.find(p => p.id === id) || (() => { throw gone('photo'); })();

// body: { photo: dataURL, hash, uploadedBy, who?, caption?, year?, faces?: [{ box, descriptor }] }
export async function addPhoto(body) {
  const url = await saveMedia(body.photo, 'photo');
  const result = await withMaterials(mat => {
    const dup = findDuplicate(mat, body.hash);
    if (dup) return { duplicateOf: dup.id };
    const ph = { id: newId('p'), url, hash: body.hash || '', who: clean(body.who), whoSource: body.who ? 'manual' : 'faces', caption: clean(body.caption), year: clean(body.year), uploadedBy: clean(body.uploadedBy) };
    mat.photos.push(ph);
    if (body.faces) ingestFaces(mat, ph, body.faces);
    return { photo: ph };
  });
  if (result.duplicateOf) await dropMedia(url);
  return result;
}

// body: any of { who, caption, year, theme }
const THEMES = ['work', 'childhood', 'family', 'week', 'other'];
export const updatePhoto = (id, body) => withMaterials(mat => {
  const ph = findPhoto(mat, id);
  for (const k of ['who', 'caption', 'year']) if (k in body) ph[k] = clean(body[k]);
  if ('theme' in body) ph.theme = THEMES.includes(body.theme) ? body.theme : ''; // what the photo is about, so each book can use it
  // typing names by hand wins over face tags; clearing the field hands it back to them
  if ('who' in body) { ph.whoSource = ph.who ? 'manual' : 'faces'; syncWho(ph, mat); }
  return { photo: ph };
});

// Faces found in a photo that was added before face recognition (or with it off).
// body: { faces: [{ box, descriptor }] }
export const scanPhoto = (id, body) => withMaterials(mat => {
  const ph = findPhoto(mat, id);
  if (!ph.scanned) ingestFaces(mat, ph, body.faces);
  return { photo: ph };
});

// body: { person, relation } | { notFace: true } | { clear: true }
export const nameFace = (id, faceId, body) => withMaterials(mat => {
  const ph = findPhoto(mat, id);
  return { face: tagFace(mat, ph, faceId, body), photo: ph };
});

export const confirmFaces = id => withMaterials(mat => {
  const ph = findPhoto(mat, id);
  confirmGuesses(mat, ph);
  return { photo: ph };
});

// body: { on: boolean }. Turning it off forgets every stored face.
export const setFaceRecognition = body => withMaterials(mat => {
  if (body.on) mat.settings = { ...mat.settings, faces: true };
  else forgetAll(mat);
  return { on: enabled(mat) };
});

// body: { photo: dataURL } of the back of the print, often with a date or names written on it
export async function addBack(id, body) {
  const url = await saveMedia(body.photo, 'back');
  let old = null;
  const result = await withMaterials(mat => {
    const ph = findPhoto(mat, id);
    old = ph.backUrl;
    ph.backUrl = url;
    return { photo: ph };
  }).catch(async err => { await dropMedia(url); throw err; });
  if (old) await dropMedia(old);
  return result;
}

// body: { photo: dataURL of the cropped face, person, relation?, faceId?, descriptor? }
// Saves the crop as its own photo and makes it that person's portrait. faceId is the
// detected face it was cut from; descriptor is that face's, so the album learns it.
export async function addPortrait(id, body) {
  const name = clean(body.person);
  if (!name) throw Object.assign(new Error('Say whose face this is.'), { status: 400 });
  const url = await saveMedia(body.photo, 'portrait');
  return withMaterials(mat => {
    const from = findPhoto(mat, id);
    const ph = { id: newId('p'), url, hash: '', who: name, whoSource: 'manual', caption: `Portrait of ${name}, cropped from another photo`, year: from.year, uploadedBy: from.uploadedBy, croppedFrom: from.id };
    mat.photos.push(ph);
    let f = mat.people.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!f) mat.people.push(f = { id: newId('f'), name, relation: clean(body.relation), note: '', photoId: null });
    f.photoId = ph.id;
    if (enabled(mat)) {
      if (body.faceId && from.faces?.some(x => x.id === body.faceId)) tagFace(mat, from, body.faceId, { person: f.name, keepWho: true });
      const descriptor = body.descriptor || from.faces?.find(x => x.id === body.faceId)?.descriptor;
      if (descriptor) { ingestFaces(mat, ph, [{ box: { x: 0, y: 0, w: 0, h: 0 }, descriptor }]); learnPortrait(mat, ph, f); }
      else ph.scanned = true;
    }
    return { photo: ph, person: f };
  });
}

async function transcribe(url) {
  try {
    const res = await generate(MODELS.guide, {
      contents: [{ role: 'user', parts: [await mediaPart(url), { text: 'Transcribe this voice message word for word. If there is no clear speech, reply with nothing.' }] }]
    });
    return (res.text || '').trim();
  } catch (err) {
    console.warn('Could not transcribe voice message:', err.message);
    return '';
  }
}

// body: { audio: dataURL (WAV), from }
export async function addVoice(body) {
  const url = await saveMedia(body.audio, 'voice');
  const v = { id: newId('v'), url, from: clean(body.from), transcript: await transcribe(url) };
  return withMaterials(mat => { mat.voices.push(v); return { voice: v }; });
}

// body: any of { from, transcript }
export const updateVoice = (id, body) => withMaterials(mat => {
  const v = mat.voices.find(x => x.id === id) || (() => { throw gone('voice message'); })();
  for (const k of ['from', 'transcript']) if (k in body) v[k] = clean(body[k]);
  return { voice: v };
});
