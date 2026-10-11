# Home Again

A gentle reminiscence game for an older relative living with memory loss, built from their own family's photos, songs and voices. There are no scores and nothing to fail.

A family member sets it up by chatting with an AI guide. The player then explores a cozy house where every room holds one kind of remembering, and each room they keep adds a page to their album.

## How it plays

| Room | What happens |
| --- | --- |
| **Kitchen** | Seat family members around the table by their faces. A wrong tap gets a kind hello from the person tapped, not an error. |
| **Radio** | Turn the dial until their song comes in. |
| **Porch** | Talk about a photo; the story is recorded for the family. |
| **Attic** | Lay three photos out from earlier to later. Every order is accepted. |
| **Today** | A family letter read aloud in real voices, and a short journal of the day. |

Safety rules the whole app follows:
- The AI works for the family, ahead of time. It never talks to the player live.
- Everything the player hears is stored content with a fallback.
- No scoring and no cognitive assessment.
- The family says up front what to avoid.

## Pages

- `/` is the game, for the player.
- `/family` is for the family, with three tabs:
  - **Talk with the guide:** a conversation that gathers the life story, photos, songs and voice messages.
  - **Album:** everything saved, editable.
  - **Insights:** weekly play trends with a plain-language summary.
- `/share` is a link relatives can use to add photos and voices.

## Built with

- **Gemini** runs the guide conversation. It looks at photos, transcribes voice messages and saves what it learns through tool calls. It then builds the game's content using a fixed JSON schema (`guide.js`, `build.js`, `gemini.js`).
- **ElevenLabs** made the pre-generated narrator and family voice clips in `audio/voices/`. Real family recordings take priority, with browser speech as the fallback.
- **TigerData** (hosted Postgres) stores the album, conversation, game and journal as JSON, one row per family. Album changes run in row-locked transactions, so several people can edit at once (`tiger.js`).
- **Snowflake** stores play events and works out weekly trends. **Snowflake Cortex** writes the family's summary (`snowflake.js`).
- **three.js** draws the dollhouse home screen, and **face-api** runs face detection and matching in the browser.
- **Node.js:** a small server with no framework, plus vanilla HTML, CSS and JS. There is no build step.

## Run it locally

You need Node 22 or newer.

```sh
npm install
cp .env.example .env    # add GEMINI_API_KEY at minimum
npm start               # http://localhost:8787
```

Only `GEMINI_API_KEY` is required. Every cloud service is optional and falls back to local files in `data/` (git-ignored), so the app runs fully on one laptop.

| Setting | Turns on | Without it |
| --- | --- | --- |
| `GEMINI_API_KEY` | The guide and the game builder | Required |
| `DATABASE_URL` | TigerData storage | JSON files in `data/` |
| `S3_BUCKET` (+ endpoint and keys) | Photos and voices in an S3-compatible bucket (R2, S3, ...) | Saved in `data/media/` |
| `SNOWFLAKE_ACCOUNT` + `SNOWFLAKE_TOKEN` | Play events, insights and the Cortex summary | Events kept in `data/events.jsonl` |

See `.env.example` for every option.

### Scripts

```sh
npm run migrate                       # copy a local data/ folder into TigerData (and the bucket)
npm run migrate -- --force            # overwrite that family's existing TigerData data
npm run seed-snowflake                # add 6 weeks of sample play history for demos
npm run seed-snowflake -- --clear     # remove the sample rows
```

## Deploying

Host it anywhere that runs a long-lived Node server, such as Render, Railway or Fly.io. Use `npm ci` to build and `npm start` to run, and set the variables above.

The server's own disk is usually wiped on each deploy, so set `DATABASE_URL` and `S3_BUCKET` in production. Mic recording needs HTTPS, which these hosts provide.

TigerData signs its servers with its own certificate authority. `certs/timescale-ca.pem` is trusted explicitly and verification stays on. It expires in October 2027; see `certs/README.md` to refresh it.

## Project layout

```
server.js          HTTP server and API routes
guide.js           the Gemini guide conversation
build.js           turns the family's materials into the game
gemini.js          Gemini client and model choice
album.js, faces.js photos, voices and face matching
store.js           storage switch: TigerData or local files, bucket or local media
tiger.js           TigerData (Postgres) document store
media.js           S3-compatible or local media storage
snowflake.js       play events, insights, Cortex summary
journal.js         the player's journal for Today
index.html, js/    the game (js/play.js, js/hub3d.js, js/voice.js, ...)
family.html        the family page
docs/              design notes
PACK.md            the game pack schema
```
