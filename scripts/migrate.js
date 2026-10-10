// One-time copy of a local data/ folder into TigerData (and photos and voices into
// the bucket, if S3_BUCKET is set). Your local files are left as they are.
//
//   npm run migrate              copy data/ for FAMILY_ID (default "default")
//   npm run migrate -- --force   overwrite that family's existing TigerData data
import fs from 'node:fs/promises';
import path from 'node:path';
import { storage, ROOT, FAMILY_ID } from '../store.js';

const DATA = process.env.HOME_AGAIN_DATA || path.join(ROOT, 'data');
const force = process.argv.includes('--force');
const readJSON = async name => { try { return JSON.parse(await fs.readFile(path.join(DATA, name + '.json'), 'utf8')); } catch { return null; } };

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set, so there is nowhere to copy to. Add it to .env.'); process.exit(1); }
const { docs, media } = storage;

const existing = await docs.loadDoc('materials', null);
if (existing && (existing.photos?.length || existing.people?.length) && !force) {
  console.error(`Family "${FAMILY_ID}" already has data in TigerData (${existing.people?.length || 0} people, ${existing.photos?.length || 0} photos). Nothing copied. Run with --force to overwrite it.`);
  await docs.close(); process.exit(1);
}

let copied = 0;
for (const name of ['materials', 'chat', 'game', 'pack']) {
  const doc = await readJSON(name);
  if (doc) { await docs.saveDoc(name, doc); copied++; console.log(`copied ${name}.json`); }
}

let files = 0, skipped = 0;
if (process.env.S3_BUCKET) {
  const dir = path.join(DATA, 'media');
  const names = await fs.readdir(dir).catch(() => []);
  for (const name of names) {
    if (await media.exists(name)) { skipped++; continue; }
    await media.put(name, await fs.readFile(path.join(dir, name)));
    files++;
  }
  console.log(`uploaded ${files} photos and voices to ${media.kind}${skipped ? ` (${skipped} were already there)` : ''}`);
} else console.log('S3_BUCKET is not set, so photos and voices stay in the local folder.');

console.log(`Done: ${copied} documents copied to TigerData for family "${FAMILY_ID}".`);
await docs.close();
