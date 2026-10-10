# Home Again

A gentle reminiscence game in a family album, plus a family page where relatives add photos, voice messages and stories that Gemini turns into the game's content.

## Run

```sh
npm install
echo 'GEMINI_API_KEY=your-key' > .env   # from https://aistudio.google.com/apikey
npm start
```

- Game: http://localhost:8787/
- Family page: http://localhost:8787/family

Opening `index.html` directly still works and shows the placeholder family.

## How personalization works

The family page is a conversation with a guide (Gemini), not a form.

1. The guide asks one question at a time and follows what the family member shares. When a photo comes in, it looks at it and asks who is in it and when. When a voice message is recorded, it listens and saves what was said. It is told never to guess names, dates or what someone said.
2. As it learns things, it saves them with tools (`guide.js`): the player's details, family members and their portraits, photo captions and years, voice transcripts, notes. The checklist beside the chat shows what the game still needs.
3. When enough is gathered, the guide offers to build the game (`build.js`). The model returns JSON that matches a fixed schema: who sits at the kitchen table and what they say, the radio song, the porch photo and prompt, three attic photos in order, the four letter pieces. The guide then asks about anything that would make it better.
4. The game loads `/api/game` and falls back to the placeholders when nothing has been built yet.

"new conversation" starts a fresh chat, for example for another family member. Everything already shared stays saved.

Voice messages are converted to WAV in the browser, because Gemini can't hear the WebM that browsers record. The player hears the real recording wherever a letter piece uses it.

### Models and free-tier limits

On the free tier, Gemini Flash allows only a few requests a day, while Flash-Lite allows many more. The conversation makes several calls per message, so it uses `gemini-flash-lite-latest`. The game build tries `gemini-flash-latest` first and falls back to Flash-Lite. With a paid key, set `GEMINI_GUIDE_MODEL` and `GEMINI_MODEL` in `.env` (for example `gemini-pro-latest`) for more careful conversation and better writing.

Uploads, the conversation and the built game are stored in `data/`, which is git-ignored so family photos and voices are never committed. `.env` is git-ignored too.
