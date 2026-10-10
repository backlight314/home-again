# Home Again — GamePack schema (v1)

Frontend stores packs in `localStorage` under `homeAgain.pack`. Export as JSON from Family → **Export JSON**. A future backend can accept and return the same shape; Play already reads this contract.

## Top-level

| Field | Type | Notes |
|-------|------|--------|
| `version` | `1` | Bump when fields change |
| `profile` | object | Who the game is for |
| `people` | array | Faces for Kitchen (and ending call) |
| `memories` | array | Source stories for letter + Porch/Attic |
| `songs` | array | Radio clear station titles |
| `letter` | array (4) | Lines shown as letter pieces |
| `rooms` | object | Per-level prompts and interaction data |
| `ending` | object | Closing call-out |
| `voice` | object | Family recording used to seed memories |

## `profile`

```json
{
  "preferredName": "Mom",
  "addressAs": "Mom",
  "eras": ["thisWeek"]
}
```

Demo pack uses recent days (`thisWeek`). Other values the backend may send: `childhood`, `youngAdulthood`, `familyLife`.

## `people[]`

```json
{
  "id": "p_mei",
  "name": "Mei",
  "relation": "daughter",
  "photoDataUrl": null,
  "palette": "--bg:#c5d9ec;--skin:#d9b394;--cloth:#4f6f8f;--hair:#3b3240"
}
```

- `photoDataUrl`: optional `data:` URL (frontend today). Backend may swap for HTTPS URLs later; Play should treat any image URL the same.
- `palette`: CSS variables for the SVG silhouette when no photo is set.

## `memories[]`

```json
{
  "id": "m1",
  "title": "The lake",
  "placeYear": "summer 1968",
  "text": "Dad let me steer the boat…",
  "photoDataUrl": null
}
```

## `songs[]`

```json
{ "id": "s1", "title": "a song from 1974" }
```

## `letter[]` (length 4)

```json
{ "room": "Kitchen", "line": "Dear Mom, …", "by": "Mei" }
```

Room labels used by Play hub: `Kitchen`, `Radio room`, `Porch`, `Attic`.

## `rooms`

### `kitchen`

```json
{
  "prompt": "Who sits in the circled chair?",
  "rounds": [
    {
      "seat": "seatC",
      "who": "Mei",
      "hello": "Mei: \"Hi Mom, it is me.\"",
      "hints": { "Daniel": "Daniel: \"That is me…\"" }
    }
  ]
}
```

`seat` values: `seatL` | `seatC` | `seatR`.

### `radio`

```json
{
  "prompt": "Turn the dial until a song comes in",
  "bands": [
    { "t": "static", "clear": false },
    { "t": "a song from 1974", "clear": true }
  ]
}
```

### `porch`

```json
{
  "prompt": "Tell me about the lake",
  "storyText": "Dad let me steer…",
  "photoDataUrl": null,
  "svgId": "sc-lake"
}
```

Use `photoDataUrl` **or** built-in `svgId` (`sc-lake`, `sc-garden`, `sc-snow`).

### `attic`

```json
{
  "prompt": "Which one came first?",
  "photos": [
    { "id": "a1", "label": "garden", "svgId": "sc-garden", "photoDataUrl": null }
  ]
}
```

Play expects three photos for the timeline / box.

## `voice`

Family records in the browser (`MediaRecorder`). Transcript is filled by Web Speech API when available, and is always editable.

```json
{
  "transcript": "Sundays she still sits at the kitchen table…",
  "audioDataUrl": "data:audio/webm;base64,…",
  "durationMs": 24000
}
```

`audioDataUrl` may be omitted if localStorage quota is exceeded; Play still uses `transcript`.

## `ending`

```json
{ "callName": "Mei" }
```

## Generation (frontend mock)

`HomeAgainPack.generateFromFamily(draft)` maps a short Family flow (name, voice, optional faces) → full `GamePack` with no AI. Sentences in `voice.transcript` become `memories` and letter lines. Names after “my daughter / son / …” become `people`. Backend can replace this with an LLM pipeline that returns the same `rooms` + `letter` structure.

## Demo fallback

If nothing is saved, Play uses `HomeAgainPack.demoPack()`.
