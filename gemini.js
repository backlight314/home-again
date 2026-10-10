// One place to call Gemini and turn its failures into messages the family can act on.
import { GoogleGenAI, ApiError } from '@google/genai';

// On the free tier, Flash allows only a handful of requests a day, while Flash-Lite
// allows many more. The conversation makes several calls per message, so it uses
// Flash-Lite; the one-off game build tries Flash first and falls back to Flash-Lite.
// On a paid key, set GEMINI_GUIDE_MODEL / GEMINI_MODEL (e.g. gemini-pro-latest).
export const MODELS = {
  guide: process.env.GEMINI_GUIDE_MODEL ? [process.env.GEMINI_GUIDE_MODEL] : ['gemini-flash-lite-latest'],
  build: process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-flash-latest', 'gemini-flash-lite-latest']
};
let ai = null;
const wait = ms => new Promise(r => setTimeout(r, ms));

// Tries each model in turn. Short waits are retried; a used-up daily quota or a
// model that stays overloaded moves on to the next model.
export async function generate(models, params) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set. Add it to .env and restart the server.');
  ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let res, lastErr;
  models: for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await ai.models.generateContent({ model, ...params });
        break models;
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        if (err.status === 401 || err.status === 403) throw Object.assign(new Error('Gemini rejected the API key. Check GEMINI_API_KEY in .env.'), { status: 502 });
        if (err.status === 429) {
          const secs = Number((/retry in ([\d.]+)s/i.exec(err.message) || /"retryDelay":\s*"([\d.]+)s"/.exec(err.message))?.[1] ?? 10);
          console.warn(`Gemini rate limit on ${model}; retry in ${Math.round(secs)}s`);
          lastErr = Object.assign(new Error(secs > 3600
            ? 'Gemini\'s free allowance for today is used up. It resets within a day, or use a key with billing enabled.'
            : 'Gemini is busy with too many requests right now. Wait a minute and try again.'), { status: 429 });
          if (secs <= 45 && attempt < 2) { await wait((secs + 1) * 1000); continue; }
          continue models;
        }
        if (err.status >= 500) {
          console.warn(`Gemini ${err.status} on ${model}`);
          lastErr = Object.assign(new Error('Gemini is overloaded right now. Try again in a moment.'), { status: 503 });
          if (attempt < 2) { await wait(2000 * (attempt + 1)); continue; }
          continue models;
        }
        throw Object.assign(new Error('Gemini error ' + err.status + '. Try again.'), { status: 502, cause: err });
      }
    }
  }
  if (!res) throw lastErr;
  if (res.promptFeedback?.blockReason) throw Object.assign(new Error('Gemini declined this request (' + res.promptFeedback.blockReason + ').'), { status: 502 });
  if (res.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw Object.assign(new Error('The reply was cut off. Try again.'), { status: 502 });
  return res;
}
