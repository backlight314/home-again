// Turns everything the family shared into the game's content, using a fixed JSON schema.
import { generate, MODELS } from './gemini.js';
import { loadMaterials, describeMaterials, mediaPart, writeJSON, FILES } from './store.js';

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
- Spread the letter pieces across family members. A piece may only be credited to someone if it is their own recorded words or clearly in their voice; otherwise credit it to "the family".

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

export async function buildGame() {
  const mat = await loadMaterials();
  const parts = [{ text: describeMaterials(mat) }];
  for (const ph of mat.photos) {
    parts.push({ text: `Photo id ${ph.id}${ph.caption ? `: ${ph.caption}` : ''}${ph.year ? ` (${ph.year})` : ''}` });
    try { parts.push(await mediaPart(ph.url)); } catch { parts.pop(); }
  }
  parts.push({ text: 'Build the game content from these materials.' });
  const res = await generate(MODELS.build, {
    contents: [{ role: 'user', parts }],
    config: { systemInstruction: SYSTEM, responseMimeType: 'application/json', responseJsonSchema: GAME_SCHEMA, thinkingConfig: { thinkingLevel: 'HIGH' } }
  });
  if (!res.text) throw Object.assign(new Error('Gemini returned no game. Try again.'), { status: 502 });
  const cfg = resolve(JSON.parse(res.text), mat);
  await writeJSON(FILES.game, cfg);
  return cfg;
}
