// Snowflake: where play events go, so the family can see how play is going over the
// weeks (how quickly each person is found at the table, who gets mixed up, when),
// with a short plain-language summary written by Snowflake Cortex.
//
// Talks to Snowflake's SQL REST API with a programmatic access token, so there is no
// driver to install. Used when SNOWFLAKE_ACCOUNT and SNOWFLAKE_TOKEN are set; without
// them events are kept in data/events.jsonl and the insights page says it is off.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, FAMILY_ID, loadMaterials } from './store.js';

const env = process.env;
const ACCOUNT = (env.SNOWFLAKE_ACCOUNT || '').trim();
const TOKEN = (env.SNOWFLAKE_TOKEN || '').trim();
const DB = env.SNOWFLAKE_DATABASE || 'HOME_AGAIN';
const SCHEMA = env.SNOWFLAKE_SCHEMA || 'PUBLIC';
const MODEL = env.SNOWFLAKE_CORTEX_MODEL || 'claude-sonnet-4-5';
const TABLE = `${DB}.${SCHEMA}.PLAY_EVENTS`;
const LOCAL = path.join(env.HOME_AGAIN_DATA || path.join(ROOT, 'data'), 'events.jsonl');

export const snowflakeOn = !!(ACCOUNT && TOKEN);

const ENDPOINT = ACCOUNT.startsWith('https://')
  ? ACCOUNT.replace(/\/+$/, '') + '/api/v2/statements'
  : `https://${ACCOUNT.toLowerCase().replace(/_/g, '-')}.snowflakecomputing.com/api/v2/statements`;

const fail = (msg, status = 502) => Object.assign(new Error(msg), { status });

// Runs one statement and returns its rows as objects with lowercase keys.
async function sql(statement, binds = []) {
  const headers = {
    authorization: 'Bearer ' + TOKEN,
    'x-snowflake-authorization-token-type': 'PROGRAMMATIC_ACCESS_TOKEN',
    'content-type': 'application/json',
    accept: 'application/json'
  };
  const body = {
    statement,
    timeout: 60,
    bindings: Object.fromEntries(binds.map((v, i) => [i + 1, { type: 'TEXT', value: v == null ? null : String(v) }]))
  };
  if (env.SNOWFLAKE_WAREHOUSE) body.warehouse = env.SNOWFLAKE_WAREHOUSE;
  if (env.SNOWFLAKE_ROLE) body.role = env.SNOWFLAKE_ROLE;

  let res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
  let out = await res.json().catch(() => ({}));
  // 202: still running; ask again until it finishes
  for (let i = 0; res.status === 202 && i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    res = await fetch(`${ENDPOINT}/${out.statementHandle}`, { headers, signal: AbortSignal.timeout(30_000) });
    out = await res.json().catch(() => ({}));
  }
  if (!res.ok) throw fail('Snowflake: ' + (out.message || res.statusText));
  const cols = (out.resultSetMetaData?.rowType || []).map(c => c.name.toLowerCase());
  return (out.data || []).map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

let ready = null;
const schema = () => ready ??= (async () => {
  await sql(`create database if not exists ${DB}`);
  await sql(`create schema if not exists ${DB}.${SCHEMA}`);
  await sql(`create table if not exists ${TABLE} (
    family_id string, session_id string, ts timestamp_tz, room string, event string,
    person string, chosen string, correct boolean, ms number, detail variant, is_sample boolean default false)`);
})().catch(err => { ready = null; throw err; });

/* ---------- events in ---------- */

const EVENTS = new Set(['session_start', 'room_enter', 'face_tap', 'picture_straightened',
  'story_told', 'photos_ordered', 'memory_kept', 'rest', 'skip']);
const text = (v, n = 60) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const num = (v, max) => (Number.isFinite(+v) && +v >= 0 ? Math.min(Math.round(+v), max) : null);

// The browser decides nothing about who the family is or whether a row is sample data.
function clean(e) {
  if (!e || !EVENTS.has(e.event)) return null;
  const ts = new Date(e.ts);
  return {
    session: text(e.session, 40) || 'unknown',
    ts: isNaN(ts) || Math.abs(ts - Date.now()) > 864e5 ? new Date().toISOString() : ts.toISOString(),
    room: /^[a-z]{1,20}$/.test(e.room || '') ? e.room : null,
    event: e.event,
    person: text(e.person),
    chosen: text(e.chosen),
    correct: typeof e.correct === 'boolean' ? e.correct : null,
    ms: num(e.ms, 3_600_000),
    detail: { hour: num(e.hour, 23), words: num(e.words, 10_000) }
  };
}

async function insert(rows) {
  await schema();
  await sql(`insert into ${TABLE} (family_id, session_id, ts, room, event, person, chosen, correct, ms, detail, is_sample)
    select ?, e.value:session::string, e.value:ts::timestamp_tz, e.value:room::string, e.value:event::string,
      e.value:person::string, e.value:chosen::string, e.value:correct::boolean, e.value:ms::number,
      e.value:detail, coalesce(e.value:is_sample::boolean, false)
    from table(flatten(input => parse_json(?))) e`, [FAMILY_ID, JSON.stringify(rows)]);
}

export async function logEvents(body) {
  const rows = (Array.isArray(body?.events) ? body.events : []).slice(0, 200).map(clean).filter(Boolean);
  if (!rows.length) return { saved: 0 };
  if (snowflakeOn) {
    await insert(rows);
    summaryCache = null;
  } else {
    await fs.mkdir(path.dirname(LOCAL), { recursive: true });
    await fs.appendFile(LOCAL, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  }
  return { saved: rows.length, to: snowflakeOn ? 'snowflake' : 'local' };
}

// For scripts/seed-snowflake.js: rows already shaped like clean() output, marked as sample.
export async function insertSample(rows) {
  if (!snowflakeOn) throw fail('Snowflake is not configured (set SNOWFLAKE_ACCOUNT and SNOWFLAKE_TOKEN).', 400);
  for (let i = 0; i < rows.length; i += 500) await insert(rows.slice(i, i + 500).map(r => ({ ...r, is_sample: true })));
}

export async function clearSample() {
  if (!snowflakeOn) throw fail('Snowflake is not configured.', 400);
  await schema();
  await sql(`delete from ${TABLE} where family_id = ? and is_sample`, [FAMILY_ID]);
}

/* ---------- insights out ---------- */

let summaryCache = null; // { key, summary }

async function summarize(facts) {
  const key = JSON.stringify(facts);
  if (summaryCache?.key === key) return summaryCache.summary;
  const prompt = `You write a short note for the family of an older relative who plays "Home Again", a gentle memory game. In the kitchen they are shown family faces and asked who sits in each chair; a wrong tap gets a kind correction.

Below is play data from the last weeks, as JSON. "median_seconds" is how long it took to find each person at the table that week; "mixups" counts taps on the wrong face. Weeks are Monday starts.

Write 2 to 4 short, warm, plain sentences to the family about how ${facts.callName} has been doing. Mention a clear change or pattern if there is one (for example someone taking longer to find over several weeks, or mix-ups mostly in the evening) and say it may be worth mentioning at the next doctor's visit only if the change is steady across several weeks. Use only what the data shows. Never diagnose, never use medical terms, never guess at causes or at how they feel (the data says nothing about enjoyment or mood). Plain text, no lists, no markdown.

Data:
${key}`;
  const [row] = await sql('select snowflake.cortex.complete(?, ?) as summary', [MODEL, prompt]);
  const summary = (row?.summary || '').trim();
  summaryCache = { key, summary };
  return summary;
}

export async function insights() {
  const mat = await loadMaterials().catch(() => ({ profile: {} }));
  const callName = mat.profile?.callName || mat.profile?.name || 'them';
  if (!snowflakeOn) {
    const local = await fs.readFile(LOCAL, 'utf8').then(t => t.split('\n').filter(Boolean).length).catch(() => 0);
    return { enabled: false, callName, localEvents: local };
  }
  await schema();
  const since = 'dateadd(week, -8, current_timestamp())';
  const [people, mixups, weeks] = await Promise.all([
    sql(`select person, to_char(date_trunc('week', ts), 'YYYY-MM-DD') as week,
        count_if(correct) as found, count_if(not correct) as mixups,
        round(median(iff(correct, ms, null)) / 1000, 1) as median_seconds, max(iff(is_sample, 1, 0)) as has_sample
      from ${TABLE} where family_id = ? and event = 'face_tap' and person is not null and ts >= ${since}
      group by 1, 2 order by 2, 1`, [FAMILY_ID]),
    sql(`select person, chosen, count(*) as times, count_if(detail:hour::int >= 17) as evening
      from ${TABLE} where family_id = ? and event = 'face_tap' and correct = false and ts >= ${since}
      group by 1, 2 order by times desc limit 8`, [FAMILY_ID]),
    sql(`select to_char(date_trunc('week', ts), 'YYYY-MM-DD') as week, count(distinct session_id) as sessions,
        count_if(event = 'rest') as rests, count_if(event = 'skip') as skips, count_if(event = 'story_told') as stories,
        max(iff(is_sample, 1, 0)) as has_sample
      from ${TABLE} where family_id = ? and ts >= ${since} group by 1 order by 1`, [FAMILY_ID])
  ]);
  const n = v => (v == null ? null : +v);
  const facts = {
    callName,
    weeks: weeks.map(w => ({ week: w.week, sessions: n(w.sessions), rests: n(w.rests), skips: n(w.skips), stories: n(w.stories) })),
    people: people.map(p => ({ person: p.person, week: p.week, found: n(p.found), mixups: n(p.mixups), median_seconds: n(p.median_seconds) })),
    mixups: mixups.map(m => ({ person: m.person, tapped_instead: m.chosen, times: n(m.times), in_evening: n(m.evening) }))
  };
  let summary = '', summaryError = null;
  if (facts.people.length) {
    try { summary = await summarize(facts); } catch (err) { summaryError = err.message; }
  }
  return {
    enabled: true,
    ...facts,
    sampleWeeks: weeks.filter(w => +w.has_sample).map(w => w.week),
    summary,
    summaryError,
    model: MODEL
  };
}
