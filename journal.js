// The player's own log of their day, written from the "Today" album: a few words
// spoken, tapped or typed. Kept with the album (TigerData or data/journal.json)
// so the family can read what the day held.
import { storage, newId } from './store.js';

const empty = () => ({ entries: [] });
const SOURCES = ['voice', 'tap', 'typed'];

export const loadJournal = async () => (await storage.docs.loadDoc('journal', null)) ?? empty();

// body: { text, date (the tablet's YYYY-MM-DD), source }
export function addEntry(body) {
  const text = String(body.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) throw Object.assign(new Error('Say or type what you did.'), { status: 400 });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : new Date().toISOString().slice(0, 10);
  const source = SOURCES.includes(body.source) ? body.source : 'typed';
  return storage.docs.withDoc('journal', empty, (j) => {
    if (!Array.isArray(j.entries)) j.entries = [];
    j.entries.push({ id: newId('j'), date, at: new Date().toISOString(), text, source });
    return j;
  });
}

export function removeEntry(id) {
  return storage.docs.withDoc('journal', empty, (j) => {
    j.entries = (j.entries || []).filter((e) => e.id !== id);
    return j;
  });
}
