// Spoken lines for the game in an ElevenLabs voice, for any caption or letter line that has
// no family recording. The key stays on the server (ELEVENLABS_API_KEY in .env). Each line
// is made once and kept with the album's media, so it is never paid for twice.
import crypto from 'node:crypto';
import { putNamedMedia, hasMedia } from './store.js';

const KEY = process.env.ELEVENLABS_API_KEY || '';
const VOICE = process.env.ELEVENLABS_VOICE_ID || 'XrExE9yKIg1WjnnlVkGX'; // Matilda: warm and calm, and a default voice, so it works on the free plan
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

export const ttsReady = () => !!KEY;

// body: { text } -> { url } of an mp3, or a 503 when ElevenLabs is not set up or not answering
export async function speakLine(body) {
  const text = String(body.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!text) throw Object.assign(new Error('Nothing to say.'), { status: 400 });
  if (!KEY) throw Object.assign(new Error('ElevenLabs is not set up.'), { status: 503, quiet: true }); // expected; the game uses the browser voice
  const name = 'tts-' + crypto.createHash('sha256').update(VOICE + '|' + MODEL + '|' + text).digest('hex').slice(0, 20) + '.mp3';
  if (await hasMedia(name)) return { url: '/media/' + name };
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.6, similarity_boost: 0.8 } }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok) {
    console.warn('ElevenLabs could not speak a line:', res.status, (await res.text().catch(() => '')).slice(0, 200));
    throw Object.assign(new Error('The voice could not be made right now.'), { status: 503 });
  }
  return { url: await putNamedMedia(name, Buffer.from(await res.arrayBuffer())) };
}
