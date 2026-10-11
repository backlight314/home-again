# Home Again: Album concept and screen flow

Supersedes the "letter in four pieces" idea in the GDD. Decisions so far: family-facing LLM only, Vercel hosting, the key lives on the server, Family chapter is the polished one.

## 1. The photo album replaces the letter

The thing the player builds is a **family photo album**. Every chapter activity earns one **photo page**.

A photo page has:
1. A real family photo, which develops slowly from sepia to colour (about 600 ms, no flashing).
2. A recorded line from the family member who is in it or who took it, with captions on.
3. A short handwritten caption (the old "letter line" text).

The player taps **PUT IT IN THE ALBUM** and the photo settles into its slot. The four strips in the top-right corner become four small photo mounts: faint outline when empty, the photo when filled. There are no scores. Empty means "not yet", never "missing".

The Today chapter is the finished album. It opens as a spread, each page is read aloud by its writer, and there is a **SAY HELLO** button at the end. Family replies add new pages, so the album keeps growing.

Pillars check: nothing to fail (empty mounts are neutral), reunion before recognition (the page shows the photo, name and voice together), their life not a generic one (real photos are the reward).

## 2. Screen map (Player mode)

| # | Screen | Primary button | Goes to | Always visible |
| --- | --- | --- | --- | --- |
| 1 | Welcome (closed album cover) | COME IN | 2 | Corner long-press, then PIN, opens Family mode |
| 2 | Life map (open spread, 5 chapter tabs) | tap a chapter | 3 | REST, album strip |
| 3 | Chapter cover (full photo, ambient sound) | tap anywhere | 4 | REST, skip |
| 4 | Scene (2 to 3 glowing objects) | tap an object | 5 | REST, skip |
| 5 | Activity (one prompt, at most 3 choices) | the choice | 6 when done | REST, skip |
| 6 | Photo page | PUT IT IN THE ALBUM | 2 | REST |
| 7 | Rest overlay | KEEP PLAYING / BACK TO THE HOUSE | back / 2 | none |
| 8 | Session end | CLOSE THE ALBUM | 1 | none |
| 9 | Album complete (Today) | HEAR THE ALBUM, SAY HELLO | 8 | REST |

From the Life map the player can open any chapter, open Today (shows the album with whatever pages exist, empty mounts stay blank), or close the album (8).

Skip this one always returns to the Life map, and leaving mid-chapter loses nothing.

## 3. Screen map (Family mode)

Entry: long-press the album corner, enter the 4-digit PIN. Tab bar across the top.

| Tab | Purpose | Main actions |
| --- | --- | --- |
| Setup | Five-step wizard | Player, people, chapter photos, recorded lines, songs |
| People | Faces and greetings | Edit, re-record, "has passed away" toggle |
| Journal | After each session | Play story, read transcript and summary, notes, **REPLY** |
| Reply | Record or type | Optional AI-suggested openers; saves as a new album page |
| Settings | Fit to the person | Choices per screen, text size, hints, session length, PIN |

BACK TO THE ALBUM returns to Welcome. Nothing from Family mode shows in Player mode.

## 4. Demo path for the hackathon

Welcome, Life map, Family chapter (Sunday table reunion, Porch story), photo page with a real recorded voice, then the Journal showing the story, then a reply. Four pages come from the Family chapter (two scenes, two activities). The other chapters are illustrated covers marked "coming soon".

## 5. Mapping the current prototype to the plan

| Prototype room | Becomes |
| --- | --- |
| Hub (house with lit windows) | Life map |
| Kitchen | Family chapter: Sunday table |
| Porch | Family chapter: Porch stories |
| Radio room | School chapter: Radio (stretch) |
| Attic | Childhood chapter (cover only for the demo) |
| Ending (the letter) | Album complete |
| Slip overlay | Photo page |

## 6. Update: album page replaces the house hub (built)

- Cover, COME IN, then the **album page**: a paper sheet on a warm desk with five empty photo slots (one per chapter, faint corners and dashed outline) and five paper slips pinned around it with the chapter names. Family is the only open slip and nudges gently; the others answer with "This page is waiting for photos from your family."
- Family chapter: Sunday table (kitchen), then Porch story, then **KEEP THIS MEMORY**.
- The memory card develops from sepia to colour, plays the family voice line, and **PUT IT IN THE ALBUM** flies the photo into the Family slot while the player watches. The slip gets a sage dot. Tapping a placed photo reopens its memory.
- The radio, attic, letter strips and letter ending are gone from the flow.
- Visual reference: *As Long As You're Here* (top-down desk, scattered photos, handwritten labels), kept 2D and tap-only.

## 7. Update: five albums on a shelf (built)

Supersedes section 6's single album page.

- Cover, COME IN, then the **albums screen**: five books lie on the desk with Childhood, School & young adult, Work, Family and Today on their covers. Each shows "n of m memories"; a finished book gets a gold ribbon and reads "complete".
- Tap a book: it zooms to full screen, the cover swings open, and you land on **that book's album page** (paper sheet, one empty slot per memory, pinned slips naming each memory).
- Each pinned slip is one memory. Family has two playable ones: **Sunday table** (kitchen) and **Porch stories**. Slips in the other books say "coming soon" for now.
- Finish a memory, watch its photo fly into its slot. When every slot is filled the book is complete ("This album is full of memories.") and the cover on the shelf gets its ribbon.
- **close the book** returns to the shelf; **close the albums** returns to the cover.
- Data: `chapters[].memories[]` in `js/data.js`; layout of slots by memory count is in `js/app.js`.

## 8. Update: three places, one per book (built)

- **This week** is the house. Its five rooms are Sunday (kitchen), Tuesday (radio), Wednesday (the walk: look around the lane and tap what you remember), the garden and the photos. The old "Today" room is gone from the house.
- **Childhood** opens to a storybook yard (`js/place3d.js`, kind `childhood`): a treehouse with the toy box, and Grandma's little cottage kitchen where the apple cake is made.
- **Today** opens to a morning room (kind `today`): a table with the letter, and a desk with the journal ("What did you do today?"). The clock shows the real time and the calendar the real date.
- Each place works like the house: the camera glides into a spot and back, the album page's back button returns to that book's place, and finishing both Childhood spots (or the Today letter) completes the book.
- Content defaults live in `childDefaults` in `js/play.js`; `pack.rooms.toybox`, `recipe` and `walk` override them.
