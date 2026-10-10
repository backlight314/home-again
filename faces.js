// Face recognition, server side. The browser finds faces and turns each one into
// a 128-number descriptor (face-api); here those descriptors are matched against
// the faces each family member has been confirmed with.
//
// photo.faces: [{ id, box: {x,y,w,h} in the stored image's pixels, score, descriptor,
//                 personId, status: 'confirmed' | 'auto' | 'suggested' | 'unknown' | 'notface',
//                 rejected: [personId] }]
// person.faces:    [{ faceId, descriptor, size }]  confirmed samples, newest last
// person.notFaces: [{ faceId, descriptor }]  faces the family said are NOT this person
import { newId } from './store.js';

// Cutoffs come from measuring face-api on 38 photos of 9 different Asian women:
// different women came as close as 0.433 apart, while the same woman's photos
// had a median of 0.388. Replaying the album on those photos, these settings
// gave no wrong names and no wrong "Bob?" questions (the old ones gave both).
// It is far worse to show the wrong name than no name, so:
//  - a name is filled in automatically only with strong, repeated evidence;
//  - anything weaker is at most a question ("Bob?") for the family to answer.
const AUTO = 0.40;          // best sample must be at least this close...
const AUTO_SUPPORT = 0.45;  // ...and a second sample of the same person this close
const SUGGEST = 0.42;       // beyond this, the face is simply unknown
const MARGIN = 0.08;        // best person must beat the next person by this much
const NOT_THEM = 0.40;      // this close to a face the family rejected for someone: not them
const AUTO_SIZE = 90, SUGGEST_SIZE = 50, AUTO_SCORE = 0.8;  // face width in px, detector confidence
const MAX_SAMPLES = 20;
export const MATCHING_VERSION = 2;

const distance = (a, b) => Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
const round = d => d.map(v => Math.round(v * 1e4) / 1e4);
const samples = list => (list || []).map(s => Array.isArray(s) ? { faceId: null, descriptor: s } : s);
export const enabled = mat => mat.settings?.faces !== false;

function bestMatch(face, people) {
  const size = face.box?.w || AUTO_SIZE;   // portraits cropped from a box have no box of their own
  if (size < SUGGEST_SIZE) return { personId: null, status: 'unknown' };
  const scored = people
    .filter(p => p.faces?.length && !(face.rejected || []).includes(p.id))
    .map(p => {
      const all = samples(p.faces).map(s => ({ d: distance(s.descriptor, face.descriptor), clear: (s.size ?? AUTO_SIZE) >= AUTO_SIZE })).sort((a, b) => a.d - b.d);
      // samples from small faces are noisy: they can raise a question, never fill in a name
      const clear = all.filter(s => s.clear);
      const not = Math.min(...samples(p.notFaces).map(s => distance(s.descriptor, face.descriptor)));
      return { id: p.id, d: all[0].d, autoD: clear[0]?.d ?? Infinity, support: clear[1]?.d ?? Infinity, not };
    })
    // closer to a face the family said isn't this person than to the person: skip
    .filter(s => !(s.not <= NOT_THEM && s.not < s.d))
    .sort((a, b) => a.d - b.d);
  const [best, next] = scored;
  if (!best || best.d > SUGGEST) return { personId: null, status: 'unknown' };
  const clearWinner = !next || next.d - best.d >= MARGIN;
  const strong = best.autoD <= AUTO && best.support <= AUTO_SUPPORT && size >= AUTO_SIZE && (face.score ?? 1) >= AUTO_SCORE;
  if (strong && clearWinner) return { personId: best.id, status: 'auto', distance: Math.round(best.d * 1000) / 1000 };
  if (!clearWinner && best.d > AUTO) return { personId: null, status: 'unknown' };
  return { personId: best.id, status: 'suggested', distance: Math.round(best.d * 1000) / 1000 };
}

// "who" follows the face tags unless someone typed it by hand. Questions ("Bob?") don't count.
export function syncWho(photo, mat) {
  if (photo.whoSource === 'manual' && photo.who) return;
  const names = (photo.faces || [])
    .filter(f => f.personId && (f.status === 'confirmed' || f.status === 'auto'))
    .map(f => mat.people.find(p => p.id === f.personId)?.name)
    .filter(Boolean);
  photo.who = [...new Set(names)].join(', ');
  photo.whoSource = 'faces';
}

// After anyone's samples change, look again at every face a person hasn't settled.
export function rematchAll(mat) {
  for (const ph of mat.photos) {
    let changed = false;
    for (const face of ph.faces || []) {
      if (face.status === 'confirmed' || face.status === 'notface') continue;
      delete face.distance;
      Object.assign(face, bestMatch(face, mat.people));
      changed = true;
    }
    if (changed) syncWho(ph, mat);
  }
}

// Older albums: convert samples to the current shape and re-check every guess with today's rules.
export function upgradeMatching(mat) {
  if ((mat.settings?.faceMatching || 1) >= MATCHING_VERSION) return false;
  for (const p of mat.people) {
    // rebuild samples from the faces confirmed as this person, which know their size
    const confirmed = mat.photos.flatMap(ph => (ph.faces || []).filter(f => f.status === 'confirmed' && f.personId === p.id));
    if (confirmed.length) p.faces = confirmed.map(f => ({ faceId: f.id, descriptor: f.descriptor, size: f.box?.w || AUTO_SIZE })).slice(-MAX_SAMPLES);
    else if (p.faces) p.faces = samples(p.faces);
    if (p.notFaces) p.notFaces = samples(p.notFaces);
  }
  rematchAll(mat);
  mat.settings = { ...mat.settings, faceMatching: MATCHING_VERSION };
  return true;
}

function forget(person, faceId) {
  if (person) person.faces = samples(person.faces).filter(s => s.faceId !== faceId);
}

function confirm(mat, face, person) {
  face.personId = person.id;
  face.status = 'confirmed';
  face.rejected = (face.rejected || []).filter(id => id !== person.id);
  delete face.distance;
  person.faces = [...samples(person.faces).filter(s => s.faceId !== face.id), { faceId: face.id, descriptor: face.descriptor, size: face.box?.w || AUTO_SIZE }].slice(-MAX_SAMPLES);
  person.notFaces = samples(person.notFaces).filter(s => s.faceId !== face.id);
}

// "Not Bob": never suggest Bob for this face again, and treat lookalikes as not Bob either.
function reject(mat, face) {
  const person = mat.people.find(p => p.id === face.personId);
  if (person) {
    forget(person, face.id);   // undo a wrong confirmation's sample
    person.notFaces = [...samples(person.notFaces), { faceId: face.id, descriptor: face.descriptor }].slice(-MAX_SAMPLES);
    face.rejected = [...new Set([...(face.rejected || []), person.id])];
  }
  Object.assign(face, { personId: null, status: 'unknown' });
  delete face.distance;
}

// Stores freshly detected faces on a photo and matches them. When a photo is
// scanned again, names a person already settled are carried over by position.
export function ingestFaces(mat, photo, faces) {
  photo.scanned = true;
  if (!enabled(mat) || !Array.isArray(faces)) return;
  const before = photo.faces || [];
  const overlap = (a, b) => {
    const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return (x * y) / (a.w * a.h + b.w * b.h - x * y || 1);
  };
  photo.faces = faces
    .filter(f => Array.isArray(f.descriptor) && f.descriptor.length === 128 && f.box)
    .map(f => {
      const face = { id: newId('face'), box: f.box, score: typeof f.score === 'number' ? Math.round(f.score * 100) / 100 : undefined, descriptor: round(f.descriptor) };
      const old = before.find(o => o.box?.w && overlap(o.box, f.box) > 0.5);
      if (old) Object.assign(face, { id: old.id, rejected: old.rejected });
      if (old?.status === 'confirmed' || old?.status === 'notface') return { ...face, personId: old.personId, status: old.status };
      return { ...face, ...bestMatch(face, mat.people) };
    });
  // refresh samples for faces that were confirmed before the rescan
  for (const face of photo.faces.filter(f => f.status === 'confirmed')) {
    const person = mat.people.find(p => p.id === face.personId);
    if (person) confirm(mat, face, person);
  }
  // a portrait of one person with one face teaches us that person's face
  const owner = mat.people.find(p => p.photoId === photo.id);
  if (owner && photo.faces.length === 1 && photo.faces[0].status !== 'confirmed') confirm(mat, photo.faces[0], owner);
  rematchAll(mat);
  syncWho(photo, mat);
}

// body: { person, relation } names the face; { reject: true } says the guess is wrong;
// { notFace: true } dismisses it
export function tagFace(mat, photo, faceId, body) {
  const face = (photo.faces || []).find(f => f.id === faceId);
  if (!face) throw Object.assign(new Error('That face is no longer on this photo.'), { status: 404 });
  if (body.notFace) { if (face.status === 'confirmed') forget(mat.people.find(p => p.id === face.personId), face.id); Object.assign(face, { personId: null, status: 'notface' }); }
  else if (body.reject || body.clear) reject(mat, face);
  else {
    const name = (body.person || '').trim();
    if (!name) throw Object.assign(new Error('Write whose face this is.'), { status: 400 });
    let person = mat.people.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (!person) mat.people.push(person = { id: newId('f'), name, relation: (body.relation || '').trim(), note: '', photoId: null });
    // renaming a face away from someone else means it wasn't them
    if (face.personId && face.personId !== person.id) reject(mat, face);
    confirm(mat, face, person);
  }
  if (photo.whoSource === 'manual' && !body.keepWho) photo.whoSource = 'faces';
  rematchAll(mat);
  syncWho(photo, mat);
  return face;
}

// "Names look right": accept the names shown on the photo (not the "Bob?" questions).
export function confirmGuesses(mat, photo, { includeQuestions = false } = {}) {
  for (const face of photo.faces || []) {
    const person = face.personId && mat.people.find(p => p.id === face.personId);
    if (person && (face.status === 'auto' || (includeQuestions && face.status === 'suggested'))) confirm(mat, face, person);
  }
  rematchAll(mat);
  syncWho(photo, mat);
}

// A photo just became someone's portrait: if it shows exactly one face, that face is theirs.
export function learnPortrait(mat, photo, person) {
  const faces = (photo.faces || []).filter(f => f.status !== 'notface');
  if (faces.length !== 1 || faces[0].status === 'confirmed') return;
  confirm(mat, faces[0], person);
  rematchAll(mat);
}

export function forgetAll(mat) {
  for (const p of mat.people) { delete p.faces; delete p.notFaces; }
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
