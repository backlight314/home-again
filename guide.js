// The guide: a conversation with a family member that gathers what the game
// needs. Gemini talks, looks at photos, listens to voice messages, and saves
// what it learns through tools. The conversation is kept in data/chat.json.
import { generate, MODELS } from './gemini.js';
import { buildGame } from './build.js';
import {
  loadMaterials, saveMaterials, describeMaterials, progress, removeMaterial,
  saveMedia, mediaPart, readJSON, writeJSON, newId, FILES
} from './store.js';

const SYSTEM = `You are the guide on the family page of "Home Again", a gentle reminiscence game for an older relative who may be living with memory loss. You are talking with one of their family members. Your job is to learn enough about the person and the family to personalize the game, through a warm, natural conversation.

The conversation follows their life in order, like a gentle life-story interview:
1. Getting started, in this order: who the game is for (their name, what the family calls them); then the name of the person you are talking with and how they are related; then ask once, gently, whether there is anything you should be careful not to bring up, so the rest of the conversation avoids painful ground.
If an answer doesn't fit the question you asked (they tell you their own name when you asked about something else), take it for what it clearly is, save it, and carry on naturally.
2. Where it began: when and where they were born, and the family they grew up in.
3. Childhood and growing up: the home and town they grew up in, school, friends, what they loved doing.
4. Young adulthood: work, moving out, meeting a partner, a wedding, the songs and music of those years.
5. Building a family and a home: children, the houses they lived in, holidays, traditions, trips.
6. Later years and today: who is close to them now, who visits, grandchildren, routines and things they still enjoy.
Move on to the next chapter when the current one feels covered or they have little more to say. Gather what the game needs along the way, where it fits naturally: ask for a photo from each chapter, ask about music around their young adult years, and ask about the family members close to them now, with a photo of each face. Near the end, invite family members to record short voice messages for them.
Never talk about the game's rooms or mechanics in your questions (no "kitchen table", "attic" or "porch"). Ask about their life, the way a friend would.

What the game needs (you get a live checklist with every message; it is not the order to ask in):
- Who the game is for: their name, and what the family calls them ("Mom", "Grandpa Joe").
- Two or three family members: name and how they are related. Each one sits at the kitchen table, so a clear photo of each face helps a lot.
- One song that means something to them.
- Three or more photos of places or moments, each with a short story and a rough year. One becomes the porch photo they are invited to talk about. Three are put in order from earlier to later in the attic.
- Short voice messages from family members. They become the four pieces of a letter, heard in the real voice.
- Anything to avoid: people who have died, painful places, topics that upset them.

How to talk:
- Sound like a warm, attentive person, not a form. Each reply is a short, friendly reaction to what they just said, then the question. Aim for about 15 to 30 words; a bit shorter when they answer in a word or two, a bit longer when they share something meaningful.
- Make the reaction specific to their answer: notice a detail, show interest, or connect it to what comes next ("Dublin in 1950, so she grew up just after the war."). Avoid generic filler like "Thank you so much for sharing" or "That's wonderful", and don't repeat their whole answer back.
- Ask exactly one short, plain question per message, about one thing. Never join two questions with "and" or "or". If you need two things, ask for the second one next time.
- Follow their lead. Ask about what they just told you before moving on. If they mention the lake house, ask whether there is a photo from there. If they mention a sister, ask her name and whether she would record a message.
- When they share a photo, look at it and react to what you actually see, then ask who is in it, what was happening, and roughly when. Never guess names or dates; ask. Only caption a photo with what they said about that specific photo.
- When they say who a photo of one person shows ("that's me", "here's Daniel"), save it as that person's portrait.
- When they share a voice message, listen to it, save a transcript, and thank them for what they said in it. If you cannot clearly hear speech in it, say so and ask them to type what they said. Never make up a transcript.
- Fit the questions to what they give you. Someone who writes long stories needs fewer questions; someone who answers in a few words needs easier, more specific ones.
- Caring for someone with memory loss can be hard. If they share something painful, acknowledge it in one plain, sincere sentence, and let them choose: ask gently whether they'd like to keep going or take a break. Never push for anything they don't want to share, and "skip" is always fine.
- Early on, find out the name of the person you are talking with, so notes and voice messages can be credited to them.
- When you ask for a photo or a recording, mention the photo or voice button in the same short question.
- Plain text only. No markdown, no lists, no emoji.

Saving:
- Save facts with the tools as soon as you learn them, before replying. Do not announce every save.
- Relations are always relative to the player, not to the person you are talking with. If Mei, the player's daughter, says "my brother Daniel", Daniel is the player's son.
- Use only what the family tells you or what is clearly visible. Never invent facts.
- Save every family member the moment they are named, even before there is a photo of them.
- Captions and years come only from the family's own words. Until they have said what a photo shows, do not describe it; ask. Write years exactly as they gave them ("around 1986" stays "1986").
- A message sent with a photo may be about something else. Don't assume the words describe the photo; ask if it is unclear. When a later message answers your question about a photo, save it to that photo's id.
- If they correct something, save the corrected version straight away.

Building:
- When the checklist says the game is ready, offer to build it. Build it when they agree, or when they ask. You can build again later as more comes in.
- After building, tell them in a sentence or two what you made, that they can open the game with the "Play the game" button, and then ask the most useful of the follow-up questions the build returned.`;

const s = { type: 'string' };
const TOOLS = [{
  functionDeclarations: [
    {
      name: 'save_player_details',
      description: 'Save details about the person the game is for. Send only the fields you learned; each one replaces the old value, so include earlier details you still want kept.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          name: { ...s, description: 'Their full name.' },
          born: { ...s, description: 'When and where they were born, e.g. "March 1948, Taipei".' },
          callName: { ...s, description: 'What the family calls them, e.g. "Mom".' },
          places: { ...s, description: 'Places that matter to them.' },
          music: { ...s, description: 'Songs or music they love.' },
          loves: { ...s, description: 'Things they love doing or talking about.' },
          avoid: { ...s, description: 'Things to avoid, or "nothing in particular".' }
        }
      }
    },
    {
      name: 'save_family_member',
      description: 'Add a family member or update one with the same name.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          name: s,
          relation: { ...s, description: 'How they are related to the player (not to the person typing), e.g. "daughter".' },
          note: { ...s, description: 'Something about them, e.g. "brings bread on Sundays".' },
          portraitPhotoId: { ...s, description: 'Id of a shared photo that shows just this person\'s face.' }
        },
        required: ['name']
      }
    },
    {
      name: 'describe_photo',
      description: 'Save what a shared photo shows, from what the family said.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          photoId: s,
          caption: { ...s, description: 'Short description in the family\'s words: who, where, what was happening.' },
          year: { ...s, description: 'Rough year or decade, e.g. "1986" or "1970s".' }
        },
        required: ['photoId', 'caption']
      }
    },
    {
      name: 'describe_voice_message',
      description: 'Save who recorded a voice message and what they said.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          voiceId: s,
          from: { ...s, description: 'Name of the person speaking.' },
          transcript: { ...s, description: 'What they said, word for word.' }
        },
        required: ['voiceId', 'transcript']
      }
    },
    {
      name: 'save_note',
      description: 'Save a story, routine, or detail from their life that does not fit the other tools. Start the text with the chapter or rough years it belongs to, e.g. "Childhood (1950s): ...".',
      parametersJsonSchema: {
        type: 'object',
        properties: { text: s, from: { ...s, description: 'Who shared it.' } },
        required: ['text']
      }
    },
    {
      name: 'remove_item',
      description: 'Remove a saved photo, voice message, family member, or note when the family asks.',
      parametersJsonSchema: { type: 'object', properties: { id: s }, required: ['id'] }
    },
    {
      name: 'build_game',
      description: 'Build the personalized game from everything saved. Returns a summary and follow-up questions.',
      parametersJsonSchema: { type: 'object', properties: {} }
    }
  ]
}];

async function runTool(name, args, mat) {
  const find = (list, id) => mat[list].find(x => x.id === id);
  switch (name) {
    case 'save_player_details':
      mat.profile = { ...mat.profile, ...Object.fromEntries(Object.entries(args).filter(([, v]) => v)) };
      return { saved: true };
    case 'save_family_member': {
      let f = mat.people.find(x => x.name.toLowerCase() === args.name.trim().toLowerCase());
      if (!f) mat.people.push(f = { id: newId('f'), name: args.name.trim(), relation: '', note: '', photoId: null });
      if (args.relation) f.relation = args.relation;
      if (args.note) f.note = args.note;
      if (args.portraitPhotoId) {
        if (!find('photos', args.portraitPhotoId)) return { error: 'no photo with that id' };
        f.photoId = args.portraitPhotoId;
      }
      return { saved: true, id: f.id };
    }
    case 'describe_photo': {
      const ph = find('photos', args.photoId);
      if (!ph) return { error: 'no photo with that id' };
      ph.caption = args.caption;
      if (args.year) ph.year = args.year;
      return { saved: true };
    }
    case 'describe_voice_message': {
      const v = find('voices', args.voiceId);
      if (!v) return { error: 'no voice message with that id' };
      v.transcript = args.transcript;
      if (args.from) v.from = args.from;
      return { saved: true };
    }
    case 'save_note':
      mat.notes.push({ id: newId('n'), text: args.text, from: args.from || '' });
      return { saved: true };
    case 'remove_item':
      return (await removeMaterial(mat, args.id)) ? { removed: true } : { error: 'nothing with that id' };
    case 'build_game': {
      await saveMaterials(mat);
      const g = await buildGame();
      return { built: true, summary: g.summary, followUpQuestions: g.questions };
    }
    default:
      return { error: 'unknown tool ' + name };
  }
}

// Stored history keeps uploads as {mediaRef: url} so chat.json stays small;
// they are read back into inline data for each request.
const hydrate = contents => Promise.all(contents.map(async c => ({
  ...c,
  parts: await Promise.all(c.parts.map(p => p.mediaRef ? mediaPart(p.mediaRef).catch(() => ({ text: '(file no longer available)' })) : p))
})));

function contextPart(mat, built) {
  const prog = progress(mat, built);
  const todo = prog.items.filter(i => !i.done).map(i => `- ${i.need}`).join('\n') || '- nothing; everything is covered';
  return {
    text: `[Context for the guide; the family member does not see this.]\nSaved so far:\n${describeMaterials(mat)}\n\nStill needed:\n${todo}\n` +
      (prog.built ? 'The game has been built at least once.' : prog.ready ? 'The game is ready to build.' : 'Not ready to build yet.')
  };
}

export const loadChat = () => readJSON(FILES.chat, { contents: [], transcript: [] });
export const resetChat = () => writeJSON(FILES.chat, { contents: [], transcript: [] });

// body: { text, photos: [dataURL], voice: dataURL | null, start: bool }
export async function chat(body) {
  const chatState = await loadChat();
  const mat = await loadMaterials();
  let built = !!(await readJSON(FILES.game, null));

  // save uploads first so the guide can refer to them by id
  const userParts = [], shown = [];
  for (const dataUrl of body.photos || []) {
    const ph = { id: newId('p'), url: await saveMedia(dataUrl, 'photo'), caption: '', year: '' };
    mat.photos.push(ph);
    userParts.push({ text: `[They shared a photo, id ${ph.id}]` }, { mediaRef: ph.url });
    shown.push({ kind: 'photo', url: ph.url });
  }
  if (body.voice) {
    const v = { id: newId('v'), url: await saveMedia(body.voice, 'voice'), from: '', transcript: '' };
    mat.voices.push(v);
    userParts.push({ text: `[They recorded a voice message, id ${v.id}]` }, { mediaRef: v.url });
    shown.push({ kind: 'voice', url: v.url });
  }
  const text = (body.text || '').trim();
  if (body.start) userParts.push({ text: chatState.contents.length ? '[They came back to the page.]' : '[They just opened the page and have not said anything yet. Greet them and begin.]' });
  else userParts.push({ text: text || '[No message, just the attachment.]' });
  await saveMaterials(mat);

  // the checklist rides along with this turn only; it is not stored in history
  const turn = { role: 'user', parts: [contextPart(mat, built), ...userParts] };
  const pending = [];
  let reply = '', failure = null;
  try {
    for (let step = 0; step < 8; step++) {
      const res = await generate(MODELS.guide, {
        contents: await hydrate([...chatState.contents, turn, ...pending]),
        config: { systemInstruction: SYSTEM, tools: TOOLS, thinkingConfig: { thinkingLevel: 'HIGH' } }
      });
      const content = res.candidates?.[0]?.content;
      if (!content) throw Object.assign(new Error('The guide did not answer. Try again.'), { status: 502 });
      pending.push(content);
      const calls = res.functionCalls || [];
      if (!calls.length) { reply = res.text || ''; break; }
      const responses = [];
      for (const call of calls) {
        let result;
        try { result = await runTool(call.name, call.args || {}, mat); }
        catch (err) { result = { error: err.message }; }
        if (call.name === 'build_game' && result.built) built = true;
        responses.push({ functionResponse: { id: call.id, name: call.name, response: result } });
      }
      await saveMaterials(mat);
      pending.push({ role: 'user', parts: responses });
    }
  } catch (err) { failure = err; }

  // Keep the turn even when Gemini failed partway, so the uploads and anything
  // already saved stay part of the conversation and the family can carry on.
  if (failure) reply = '';
  else if (!reply) reply = 'Sorry, I lost my train of thought there. Could you say that again?';
  if (pending.at(-1)?.role !== 'model' || !reply) pending.push({ role: 'model', parts: [{ text: reply || '(I could not answer that message because of a connection problem.)' }] });
  chatState.contents.push({ role: 'user', parts: userParts }, ...pending);
  if (!body.start) chatState.transcript.push({ role: 'family', text, attachments: shown });
  if (reply) chatState.transcript.push({ role: 'guide', text: reply });
  await writeJSON(FILES.chat, chatState);
  if (failure) throw failure;
  return { reply, progress: progress(mat, built), materials: mat };
}
