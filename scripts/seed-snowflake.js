// Loads made-up play history into Snowflake so the insights page has weeks to show in
// a demo. Every row is marked sample = true and the page says so; real play adds to it.
//
//   npm run seed-snowflake             add 6 weeks of sample history before this week
//   npm run seed-snowflake -- --clear  remove all sample rows for FAMILY_ID
import { loadDoc, storage, FAMILY_ID } from '../store.js';
import { insertSample, clearSample, snowflakeOn } from '../snowflake.js';

const done = async (code = 0) => { await storage.docs.close?.(); process.exit(code); };
if (!snowflakeOn) { console.error('Set SNOWFLAKE_ACCOUNT and SNOWFLAKE_TOKEN in .env first.'); await done(1); }

if (process.argv.includes('--clear')) {
  await clearSample();
  console.log(`Removed sample rows for family "${FAMILY_ID}".`);
  await done();
}

// the family's own names when a game has been built, otherwise the demo family
const pack = await loadDoc('pack', null).catch(() => null);
const names = (pack?.people || []).map(p => p.name).filter(Boolean);
while (names.length < 3) names.push(['Mei', 'Daniel', 'Aunt Rose'][names.length]);
const [first, second, third] = names;

// seeded random numbers, so every run tells the same story
let s = 7;
const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const around = (sec, spread) => Math.round((sec + (rand() - .5) * spread) * 1000);

// The story: first and third are found quickly every week. second takes a little longer
// each week and is mixed up with first now and then, mostly in evening sessions.
const WEEKS = 6, rows = [];
const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
for (let w = WEEKS; w >= 1; w--) {
  const k = (WEEKS - w) / (WEEKS - 1);                 // 0 in the oldest week, 1 in last week
  for (const [day, hour] of [[0, 10], [2, 19], [4, 11], [5, 19]]) {
    const at = new Date(monday); at.setDate(at.getDate() - w * 7 + day); at.setHours(hour, 15);
    const session = `sample-${w}-${day}`, evening = hour >= 17;
    let t = at.getTime();
    const ev = (event, room, extra = {}) => {
      t += 20_000 + rand() * 40_000;
      rows.push({ session, ts: new Date(t).toISOString(), room, event, person: null, chosen: null, correct: null, ms: null, detail: { hour }, ...extra });
    };
    ev('session_start', 'intro');
    ev('room_enter', 'kitchen');
    ev('face_tap', 'kitchen', { person: first, chosen: first, correct: true, ms: around(3.2, 1.5) });
    if (evening && rand() < .25 + k * .6) ev('face_tap', 'kitchen', { person: second, chosen: first, correct: false, ms: around(4 + k * 3, 2) });
    ev('face_tap', 'kitchen', { person: second, chosen: second, correct: true, ms: around(4 + k * 5 + (evening ? 1.5 : 0), 2) });
    ev('memory_kept', 'kitchen');
    ev('room_enter', 'porch');
    ev('story_told', 'porch', { ms: around(40 - k * 12, 16), detail: { hour, words: Math.round(55 - k * 15 + rand() * 20) } });
    ev('memory_kept', 'porch');
    if (rand() < .4) {
      ev('room_enter', 'today');
      for (const person of [first, second, third]) ev('picture_straightened', 'today', { person, ms: around(4, 3) });
      ev('memory_kept', 'today');
    }
    if (evening && rand() < .3 + k * .3) ev('rest', 'hub');
  }
}

await insertSample(rows);
console.log(`Added ${rows.length} sample events over ${WEEKS} weeks for ${first}, ${second} and ${third} (family "${FAMILY_ID}").`);
console.log('Remove them any time with: npm run seed-snowflake -- --clear');
await done();
