// Face recognition, server side. The browser finds faces and turns each one into
// a 128-number descriptor (face-api); here those descriptors are matched against
// the faces each family member has been confirmed with.
//
// photo.faces: [{ id, box: {x,y,w,h} in the stored image's pixels, descriptor,
//                 personId, status: 'confirmed' | 'auto' | 'suggested' | 'unknown' | 'notface' }]
// person.faces: [descriptor, ...]  confirmed samples, newest last
import { newId } from './store.js';

// face-api distances: the same person is usually well under 0.5. Auto-tag only
// when clearly closest; near misses become suggestions the family confirms.
const AUTO = 0.45, SUGGEST = 0.55, MARGIN = 0.06, MAX_SAMPLES = 20;

const distance = (a, b) => Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
const round = d => d.map(v => Math.round(v * 1e4) / 1e4);
export const enabled = mat => mat.settings?.faces !== false;

function bestMatch(descriptor, people) {
  const scored = people
    .filter(f => f.faces?.length)
    .map(f => ({ id: f.id, d: Math.min(...f.faces.map(s => distance(s, descriptor))) }))
    .sort((a, b) => a.d - b.d);
  const [best, next] = scored;
  if (!best || best.d > SUGGEST) return { personId: null, status: 'unknown' };
  const clear = best.d <= AUTO && (!next || next.d - best.d >= MARGIN);
  return { personId: best.id, status: clear ? 'auto' : 'suggested', distance: Math.round(best.d * 1000) / 1000 };
}

function addSample(person, descriptor) {
  person.faces = [...(person.faces || []), descriptor].slice(-MAX_SAMPLES);
}

// "who" follows the face tags unless someone typed it by hand.
export function syncWho(photo, mat) {
  if (photo.whoSource === 'manual' && photo.who) return;
  const names = (photo.faces || [])
    .filter(f => f.personId && (f.status === 'confirmed' || f.status === 'auto'))
    .map(f => mat.people.find(p => p.id === f.personId)?.name)
    .filter(Boolean);
  photo.who = [...new Set(names)].join(', ');
  photo.whoSource = 'faces';
}

// After someone's samples change, look at every face not settled by a person.
export function rematchAll(mat) {
  for (const ph of mat.photos) {
    let changed = false;
    for (const face of ph.faces || []) {
      if (face.status === 'confirmed' || face.status === 'notface') continue;
      Object.assign(face, { distance: undefined }, bestMatch(face.descriptor, mat.people));
      changed = true;
    }
    if (changed) syncWho(ph, mat);
  }
}

function confirm(mat, face, person) {
  face.personId = person.id;
  face.status = 'confirmed';
  delete face.distance;
  addSample(person, face.descriptor);
}

// Stores freshly detected faces on a photo and matches them.
export function ingestFaces(mat, photo, faces) {
  photo.scanned = true;
  if (!enabled(mat) || !Array.isArray(faces)) return;
  photo.faces = faces
    .filter(f => Array.isArray(f.descriptor) && f.descriptor.length === 128 && f.box)
    .map(f => ({ id: newId('face'), box: f.box, descriptor: round(f.descriptor), ...bestMatch(f.descriptor, mat.people) }));
  // a portrait of one person with one face teaches us that person's face
  const owner = mat.people.find(p => p.photoId === photo.id);
  if (owner && photo.faces.length === 1) { confirm(mat, photo.faces[0], owner); rematchAll(mat); }
  syncWho(photo, mat);
}

// body: { person, relation } names the face; { notFace: true } dismisses it; { clear: true } removes the name
export function tagFace(mat, photo, faceId, body) {
  const face = (photo.faces || []).find(f => f.id === faceId);
  if (!face) throw Object.assign(new Error('That face is no longer on this photo.'), { status: 404 });
  if (body.notFace) Object.assign(face, { personId: null, status: 'notface' });
  else if (body.clear) Object.assign(face, { personId: null, status: 'unknown' });
  else {
    const name = (body.person || '').trim();
    if (!name) throw Object.assign(new Error('Write whose face this is.'), { status: 400 });
    let person = mat.people.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (!person) mat.people.push(person = { id: newId('f'), name, relation: (body.relation || '').trim(), note: '', photoId: null });
    confirm(mat, face, person);
  }
  if (photo.whoSource === 'manual' && !body.keepWho) photo.whoSource = 'faces';
  syncWho(photo, mat);
  rematchAll(mat);
  return face;
}

// "Looks right": accept every guess on the photo.
export function confirmGuesses(mat, photo) {
  for (const face of photo.faces || []) {
    const person = face.personId && mat.people.find(p => p.id === face.personId);
    if (person && (face.status === 'auto' || face.status === 'suggested')) confirm(mat, face, person);
  }
  syncWho(photo, mat);
  rematchAll(mat);
}

// A photo just became someone's portrait: if it shows exactly one face, that face is theirs.
export function learnPortrait(mat, photo, person) {
  const faces = (photo.faces || []).filter(f => f.status !== 'notface');
  if (faces.length !== 1 || faces[0].status === 'confirmed') return;
  confirm(mat, faces[0], person);
  rematchAll(mat);
}

export function forgetAll(mat) {
  for (const p of mat.people) delete p.faces;
  for (const ph of mat.photos) { delete ph.faces; delete ph.scanned; if (ph.whoSource === 'faces') ph.whoSource = 'manual'; }
  mat.settings = { ...mat.settings, faces: false };
}

// One line for the guide and the game builder.
export function describeFaces(mat, photo) {
  const faces = (photo.faces || []).filter(f => f.status !== 'notface');
  if (!faces.length) return null;
  const name = f => mat.people.find(p => p.id === f.personId)?.name;
  const parts = faces.map(f =>
    f.status === 'confirmed' && name(f) ? name(f)
      : (f.status === 'auto' || f.status === 'suggested') && name(f) ? `${name(f)} (the album's guess, not confirmed)`
        : 'an unknown face');
  return 'faces: ' + parts.join(', ');
}
