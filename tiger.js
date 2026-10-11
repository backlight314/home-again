// TigerData (hosted PostgreSQL) storage for the family's documents: the album
// ("materials"), the guide conversation, the built game, the game pack and the
// player's own log of their days ("journal").
// Used when DATABASE_URL is set; store.js falls back to local files otherwise.
//
// One row per family. Each document is a jsonb column, and every album change
// runs in a transaction that locks the row, so the album, the share link and the
// guide can all edit at once, from any number of servers.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const DOCS = ['materials', 'chat', 'game', 'pack', 'journal'];

// TigerData signs its servers with its own certificate authority (ca.timescale.com),
// which Node doesn't trust by default. Trust that authority explicitly instead of
// turning verification off. The saved certificate expires in October 2027; refresh
// it with certs/README or point TIGER_CA_FILE at a newer one.
function sslOptions(root) {
  const caFile = process.env.TIGER_CA_FILE || path.join(root, 'certs', 'timescale-ca.pem');
  return { ca: fs.readFileSync(caFile, 'utf8'), rejectUnauthorized: true };
}

export function createTigerStore({ url, familyId, root }) {
  const conn = new URL(url);
  conn.searchParams.delete('sslmode');  // TLS settings come from sslOptions
  const pool = new pg.Pool({ connectionString: conn.toString(), ssl: sslOptions(root), max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  pool.on('error', err => console.warn('TigerData connection dropped:', err.message));

  let ready = null;
  const schema = () => ready ??= pool.query(`
    create table if not exists family_data (
      family_id  text primary key,
      materials  jsonb,
      chat       jsonb,
      game       jsonb,
      pack       jsonb,
      updated_at timestamptz not null default now()
    );
    alter table family_data add column if not exists journal jsonb`).catch(err => { ready = null; throw err; });

  const column = name => {
    if (!DOCS.includes(name)) throw new Error('unknown document ' + name);
    return name;
  };

  async function loadDoc(name, fallback) {
    await schema();
    const { rows } = await pool.query(`select ${column(name)} as doc from family_data where family_id = $1`, [familyId]);
    return rows[0]?.doc ?? fallback;
  }

  async function saveDoc(name, value) {
    await schema();
    await pool.query(
      `insert into family_data (family_id, ${column(name)}) values ($1, $2::jsonb)
       on conflict (family_id) do update set ${column(name)} = excluded.${column(name)}, updated_at = now()`,
      [familyId, JSON.stringify(value)]);
  }

  // Load the album, let fn change it, save it, all while holding the row lock.
  async function withDoc(name, fallback, fn) {
    await schema();
    const db = await pool.connect();
    // a connection that drops while checked out reports here instead of crashing the server
    let broken = null;
    const onError = err => { broken = err; console.warn('TigerData connection dropped:', err.message); };
    db.on('error', onError);
    try {
      await db.query('begin');
      await db.query('insert into family_data (family_id) values ($1) on conflict (family_id) do nothing', [familyId]);
      const { rows } = await db.query(`select ${column(name)} as doc from family_data where family_id = $1 for update`, [familyId]);
      const doc = rows[0]?.doc ?? fallback();
      const out = await fn(doc);
      await db.query(`update family_data set ${column(name)} = $2::jsonb, updated_at = now() where family_id = $1`, [familyId, JSON.stringify(doc)]);
      await db.query('commit');
      return out;
    } catch (err) {
      await db.query('rollback').catch(() => {});
      throw err;
    } finally {
      db.off('error', onError);
      db.release(broken || undefined); // a broken connection is thrown away, not reused
    }
  }

  return { kind: 'TigerData', loadDoc, saveDoc, withDoc, schema, close: () => pool.end() };
}
