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

### The album

The **Album** tab is where photos and voice messages live, however they arrive:

- Drag in as many photos as you like. iPhone (HEIC) photos are converted in the browser, and near-duplicates are skipped.
- Each photo can have who is in it, roughly when, and its story. Photos missing details show a "tell us more" badge.
- Open a photo to add the back of the print (often dated or named in handwriting) or to crop one face out of a group photo as someone's portrait.
- Voice messages recorded in the album are transcribed automatically and can be corrected.
- **Copy link for relatives** gives a `/share` link that opens only the album, for relatives who just want to add photos and voices. While the server runs on your computer, that link only works on your computer (or your network, using your computer's address); it needs hosting to reach relatives elsewhere.

### Face recognition

The album recognizes family members it has been taught, so photos don't need sorting by hand.

- Faces are found and described (a list of 128 numbers per face) **in the browser**, using [`@vladmandic/face-api`](https://github.com/vladmandic/face-api) served from this server. Photos are never sent to an outside face service; only those numbers are stored, in `data/`.
- Teach it a person by naming a detected face (click the box on a photo) or by making a portrait. A portrait with one face teaches that face automatically.
- New photos are matched against everyone it knows (`faces.js`). Clear matches are filled in as guesses (yellow, "check names"), near misses show as "Bob?", and unknown faces as "Who is this?". Nothing counts as confirmed until a person clicks "Names look right" or names the face, and each confirmation teaches it more.
- Clicking "Save as their portrait too" on a face crops it into that person's portrait in one step.
- Photos added before this, or while it was off, are checked in the background when the album opens.
- "Face recognition is on · turn off" forgets every face it has learned. Names already on photos stay.
- The guide sees which names are guesses, and only saves names the family confirms in conversation; it can't confirm face guesses itself.

Recognition works well across a few years but poorly across decades (a childhood photo against an adult portrait), and on small, faded or black-and-white faces. Those usually come up as unknown, not wrong. Face descriptors are biometric data in some places (GDPR, some US states), so get family members' okay.

The guide sees a text list of the whole album, and pulls up one photo at a time (`show_photo`) when it would help the conversation, reading the back of the print if there is one. Only the current exchange is sent to Gemini with real images, so a large album stays fast.

"new conversation" starts a fresh chat, for example for another family member. Everything already shared stays saved.

Voice messages are converted to WAV in the browser, because Gemini can't hear the WebM that browsers record. The player hears the real recording wherever a letter piece uses it.

### Models and free-tier limits

On the free tier, Gemini Flash allows only a few requests a day, while Flash-Lite allows many more. The conversation makes several calls per message, so it uses `gemini-flash-lite-latest`. The game build tries `gemini-flash-latest` first and falls back to Flash-Lite. With a paid key, set `GEMINI_GUIDE_MODEL` and `GEMINI_MODEL` in `.env` (for example `gemini-pro-latest`) for more careful conversation and better writing.

Uploads, the conversation and the built game are stored in `data/`, which is git-ignored so family photos and voices are never committed. `.env` is git-ignored too.
