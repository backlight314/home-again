// Turns everything the family shared into the game's content, using a fixed JSON schema.
import { generate, MODELS } from './gemini.js';
import { loadMaterials, describeMaterials, mediaPart, saveDoc } from './store.js';

const SYSTEM = `You help a family personalize "Home Again", a gentle reminiscence game for an older relative who may be living with memory loss. The family uploads photos, voice messages, notes about the person and the family. You turn that into the game's content.

The game is one evening in a family album. A paper bird brings a letter torn into four pieces. Each of four rooms holds one piece:
- Kitchen: family portraits sit around a table. The player taps the right face for each circled chair. A wrong tap gets a kind correction from the person tapped ("That is me, your sister. Look for Mei."). The right tap gets a hello.
- Radio room: the player turns a dial until one meaningful song comes in, then keeps it.
- Porch: one photo hangs on a swing; the player is invited to talk about it.
- Attic: three photos from the photo box are placed on a shelf from earlier to later. Every order is accepted; there are no wrong answers.
At the end the four pieces form a short letter from the family, read aloud, and a family member says hello.

The game has more books than this one, and each should be built from the family's own life:
- Work (an office with four rooms): Desk, Phone, Break room, Files. Write one piece for each, in that order. Use the workplace photos (the ones the family saved with the theme "work"), one per room, and the workplace and job the family gave. If the family gave little, keep a piece gentle and general instead of inventing details.
- Childhood: a toy box with exactly three toys (the first is the family's favourite toy; the other two are common toys of the era, with short general lines), and a recipe for the family's dish with exactly six typical ingredients, each with one short, gentle line. Attach a childhood photo and the speaker's voice message where they fit.
Every voice message that has clear words should be used once as a piece (a letter piece, a work piece or a childhood piece). The line is its transcript word for word (trim only for length, never paraphrase or add), credited to the speaker, with the voice id attached, so the player hears the real recording in the real voice.

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
  work: obj({
    place: { type: 'string', description: 'Where they worked, e.g. "Harbor Street Library". Empty if the family has not said.' },
    pieces: {
      type: 'array',
      description: 'Exactly four pieces, in room order: Desk, Phone, Break room, Files.',
      items: obj({ line: str, by: str, photoId: nullable(str), voiceId: nullable(str) })
    }
  }),
  childhood: obj({
    toys: {
      type: 'array',
      description: 'Exactly three toys for the toy box. The first is the family\'s favourite toy.',
      items: obj({ label: { type: 'string', description: 'Lowercase, e.g. "wooden train".' }, line: { type: 'string', description: 'One short, gentle line about the toy.' } })
    },
    toyBy: { type: 'string', description: 'Who tells the toy stories: a family member\'s name, or "the family".' },
    toyCaption: { type: 'string', description: 'Short album caption, e.g. "The toy box, long ago".' },
    toyLine: { type: 'string', description: 'The line kept with the toy box album page.' },
    toyPhotoId: nullable(str),
    toyVoiceId: nullable(str),
    dish: { type: 'string', description: 'The dish, e.g. "Grandma\'s apple cake".' },
    ingredients: {
      type: 'array',
      description: 'Exactly six typical ingredients of the dish.',
      items: obj({ label: { type: 'string', description: 'Lowercase, e.g. "apples".' }, line: { type: 'string', description: 'One short, gentle line.' } })
    },
    dishBy: { type: 'string', description: 'Who tells the recipe stories: a family member\'s name, or "the family".' },
    dishCaption: { type: 'string', description: 'Short album caption.' },
    dishLine: { type: 'string', description: 'The line kept with the recipe album page.' },
    dishPhotoId: nullable(str),
    dishVoiceId: nullable(str)
  }),
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
  cfg.work.pieces = (cfg.work.pieces || []).slice(0, 4).map(w => ({ ...w, photo: photo(w.photoId), voice: voice(w.voiceId) }));
  const c = cfg.childhood;
  c.toys = (c.toys || []).slice(0, 3);
  c.ingredients = (c.ingredients || []).slice(0, 6);
  c.toyPhoto = photo(c.toyPhotoId); c.toyVoice = voice(c.toyVoiceId);
  c.dishPhoto = photo(c.dishPhotoId); c.dishVoice = voice(c.dishVoiceId);
  if (!names.has(cfg.ending.caller)) cfg.ending.caller = cfg.people[0]?.name || '';
  cfg.builtAt = new Date().toISOString();
  return cfg;
}

export async function buildGame() {
  const mat = await loadMaterials();
  const parts = [{ text: describeMaterials(mat) }];
  // Only portraits and described photos can be used, so only those are sent as images;
  // a large album of undescribed photos would just slow the build down.
  const portraits = new Set(mat.people.map(f => f.photoId).filter(Boolean));
  const usable = mat.photos.filter(ph => portraits.has(ph.id) || ph.caption).slice(-40);
  for (const ph of usable) {
    parts.push({ text: `Photo id ${ph.id}${ph.who ? `, shows ${ph.who}` : ''}${ph.caption ? `: ${ph.caption}` : ''}${ph.year ? ` (${ph.year})` : ''}` });
    try { parts.push(await mediaPart(ph.url)); } catch { parts.pop(); }
  }
  parts.push({ text: 'Build the game content from these materials.' });
  const res = await generate(MODELS.build, {
    contents: [{ role: 'user', parts }],
    config: { systemInstruction: SYSTEM, responseMimeType: 'application/json', responseJsonSchema: GAME_SCHEMA, thinkingConfig: { thinkingLevel: 'HIGH' } }
  }, { timeout: 120_000 });
  if (!res.text) throw Object.assign(new Error('Gemini returned no game. Try again.'), { status: 502 });
  const cfg = resolve(JSON.parse(res.text), mat);
  const pack = toHomeAgainPack(cfg, mat);
  await saveDoc('game', cfg);
  await saveDoc('pack', pack);
  return { ...cfg, pack };
}

function radioBands(cfg) {
  const hit = (cfg.radio?.song?.title || '').trim() || 'One More Dance';
  return [
    { t: 'Happy Times', clip: 'audio/radio/happy-times.mp3', clear: false },
    { t: hit, clip: 'audio/radio/one-more-dance.mp3', clear: true },
    { t: 'Midnight Funk', clip: 'audio/radio/midnight-funk.mp3', clear: false },
    { t: 'Heartbeat', clip: 'audio/radio/heartbeat.mp3', clear: false }
  ];
}

function toHomeAgainPack(cfg, mat) {
  const call = (cfg.player && cfg.player.callName) || (mat.profile && mat.profile.callName) || 'Mom';
  const people = (cfg.people || []).map((p, i) => ({
    id: 'p_' + i,
    name: p.name,
    relation: p.relation || '',
    photoDataUrl: p.photo || null
  }));
  const letter = (cfg.letter || []).slice(0, 4).map((l, i) => ({
    room: ['Sunday kitchen', 'Tuesday car', 'Garden', 'Photographs'][i] || 'This week',
    line: l.line,
    by: l.by || 'Family',
    voice: l.voice || null
  }));
  while (letter.length < 4) {
    letter.push({ room: 'This week', line: 'We love you.', by: people[0]?.name || 'Family' });
  }
  const seats = ['seatC', 'seatL'];
  const named = cfg.kitchen?.seats?.length ? cfg.kitchen.seats : people.slice(0, 2).map((p) => p.name);
  const rounds = named.slice(0, 2).map((who, i) => {
    const p = (cfg.people || []).find((x) => x.name === who) || {};
    const hints = {};
    (cfg.people || []).forEach((o) => {
      if (o.name !== who) hints[o.name] = `${o.name}: "${o.selfIntro || 'That is me.'} Look for ${who}."`;
    });
    return {
      seat: seats[i] || 'seatR',
      who,
      hello: `${who}: "${p.hello || 'Hi ' + call + '.'}"`,
      hints
    };
  });
  const memories = letter.map((l, i) => ({
    id: 'm' + (i + 1),
    title: l.room,
    placeYear: 'this week',
    text: l.line,
    photoDataUrl: i === 2 ? cfg.porch?.photo || null : (cfg.attic?.photos || [])[i] || null
  }));
  const voices = mat.voices || [];
  const firstVoice = voices.find((v) => v.url) || voices[0];
  // Work: four office rooms, each with its own photo of the workplace and its own piece
  const workNames = ['Your desk', 'The phone', 'Break room', 'The files'];
  const workKeys = ['desk', 'phone', 'break', 'files'];
  const workPieces = (cfg.work?.pieces || []).filter((w) => w.line);
  const workLetter = workPieces.map((w, i) => ({ room: workNames[i], line: w.line, by: w.by || 'the family', voice: w.voice || null }));
  const workRooms = {};
  workPieces.forEach((w, i) => {
    workRooms[workKeys[i]] = { photoDataUrl: w.photo || null, caption: (cfg.work.place ? cfg.work.place + ', ' : '') + workNames[i].toLowerCase(), line: w.line, by: w.by || 'the family', voice: w.voice || null };
  });
  // Childhood: the toy box and the family recipe
  const ch = cfg.childhood || {};
  const childRooms = {};
  if ((ch.toys || []).length) {
    childRooms.toybox = {
      toys: ch.toys.map((x, i) => ({ id: ['train', 'bear', 'top'][i] || 'ball', label: x.label, line: x.line })),
      by: ch.toyBy || 'the family', caption: ch.toyCaption || 'The toy box, long ago', line: ch.toyLine || ch.toys[0].line,
      photoDataUrl: ch.toyPhoto || null, voice: ch.toyVoice || null
    };
  }
  if ((ch.ingredients || []).length && ch.dish) {
    childRooms.recipe = {
      prompt: `What goes into ${ch.dish}?`,
      ingredients: ch.ingredients.map((x) => ({ id: x.label.toLowerCase().replace(/[^a-z]/g, ''), label: x.label, line: x.line })),
      by: ch.dishBy || 'the family', caption: ch.dishCaption || ch.dish, line: ch.dishLine || ch.ingredients[0].line,
      photoDataUrl: ch.dishPhoto || null, voice: ch.dishVoice || null
    };
  }
  return {
    version: 1,
    profile: { preferredName: call, addressAs: call, eras: ['thisWeek'], workplace: cfg.work?.place || (mat.profile && mat.profile.workplace) || '', job: (mat.profile && mat.profile.job) || '' },
    voices: voices.filter((v) => v.url).map((v) => ({ id: v.id, from: v.from || '', url: v.url, transcript: v.transcript || '' })),
    people,
    memories,
    songs: [{ id: 's1', title: (cfg.radio?.song && cfg.radio.song.title) || 'One More Dance' }],
    letter,
    ...(workLetter.length ? { workLetter } : {}),
    rooms: {
      ...workRooms,
      ...childRooms,
      kitchen: {
        prompt: cfg.kitchen?.place ? `Who sat with you at ${cfg.kitchen.place}?` : 'Who sat with you at lunch last Sunday?',
        rounds
      },
      radio: {
        prompt: cfg.radio?.question || 'Find the song from the car on Tuesday',
        bands: radioBands(cfg)
      },
      porch: {
        prompt: cfg.porch?.prompt || 'Tell me about this day',
        storyText: cfg.porch?.sampleStory || '',
        photoDataUrl: cfg.porch?.photo || null,
        svgId: cfg.porch?.photo ? null : 'sc-garden'
      },
      today: {
        prompt: 'From this morning',
        caption: 'Today',
        by: people[0]?.name || 'the family',
        lines: [
          `Hi ${call}.`,
          'This morning you were already in your chair. The light was on your hands.',
          'You let the tea sit until it was kind. You always wait like that.',
          people[1] ? `${people[1].name.split(' ')[0]} rang. You asked after them, the way you always do.` : 'Someone from the family rang. You asked after them.',
          people[2] ? `${people[2].name.split(' ')[0]} left this week’s pictures on the table, in case you want them.` : 'This week’s pictures are on the table, in case you want them.',
          'Nothing loud happened. You were gentle with us anyway.',
          'That kindness is yours. It is still in the room.',
          'I am glad this day found you. I am glad I did too.'
        ]
      },
      attic: {
        prompt: 'Which photo came first this week?',
        photos: (cfg.attic?.photos || []).slice(0, 3).map((url, i) => ({
          id: 'a' + (i + 1),
          label: memories[i]?.title || 'this week',
          photoDataUrl: url
        }))
      }
    },
    voice: {
      transcript: firstVoice?.transcript || (mat.notes || []).map((n) => n.text).join(' '),
      audioDataUrl: firstVoice?.url || null
    },
    ending: { callName: cfg.ending?.caller || people[0]?.name || call }
  };
}
