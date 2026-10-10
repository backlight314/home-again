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

1. On `/family`, relatives add details about the player, family members with portraits, photos with captions and years, voice messages (recorded in the browser or uploaded), and notes.
2. **Build the game** sends everything to Gemini, photos included. It uses `gemini-flash-latest` by default, which works on the free tier. Set `GEMINI_MODEL=gemini-pro-latest` in `.env` if your key has billing enabled. The model returns JSON that matches a fixed schema: who sits at the kitchen table and what they say, the radio song, the porch photo and prompt, three attic photos in order, the four letter pieces, and follow-up questions for the family.
3. Answers to those questions are saved as notes, and the game is built again.
4. The game loads `/api/game` and falls back to the placeholders when nothing has been built yet.

Gemini reads only the transcript of each voice message. The player hears the real recording wherever a letter piece uses it.

Uploads and the built game are stored in `data/`, which is git-ignored so family photos and voices are never committed. `.env` is git-ignored too.
