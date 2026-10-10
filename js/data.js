// Sample family data (placeholders). Replace with the real data.json shape from docs/TECH-DESIGN.md.
// Plain globals on purpose: no build step, works when index.html is opened from disk.
const people = {
  Mei: '--bg:#cdc3d2;--skin:#d9b394;--cloth:#6f6480;--hair:#3b3240',
  Daniel: '--bg:#bcc7d2;--skin:#cda683;--cloth:#4f6279;--hair:#44352a',
  'Aunt Rose': '--bg:#c3cfc4;--skin:#e0bb9b;--cloth:#6b8078;--hair:#a9a396'
};
// Five albums (books). Each book holds memories; finishing every memory completes the book.
// A memory with an `activity` is playable; the others show as pinned slips that say "coming soon".
const chapters = [
  { id: 'childhood', title: 'Childhood', color: '#b8893a',
    memories: [{ id: 'toybox', title: 'Toy box' }, { id: 'recipe', title: 'Recipe' }] },
  { id: 'school', title: 'School & young adult', color: '#5f7a58',
    memories: [{ id: 'radio', title: 'Radio' }, { id: 'yearbook', title: 'Yearbook' }] },
  { id: 'work', title: 'Work', color: '#44607d',
    memories: [{ id: 'job', title: 'The job' }] },
  { id: 'family', title: 'Family', color: '#9c3b2e',
    memories: [
      { id: 'table', title: 'Sunday table', activity: 'kitchen', scene: 'sc-table',
        caption: 'Sunday dinner, the house on Elm Street',
        line: 'Your chair at the table is still yours every Sunday.', by: 'Mei' },
      { id: 'lake', title: 'Porch stories', activity: 'porch', scene: 'sc-lake',
        caption: 'The lake, summer',
        line: 'I still think about the day at the lake, when you let me steer.', by: 'Mei' }
    ] },
  { id: 'today', title: 'Today', color: '#6d5262',
    memories: [{ id: 'call', title: 'Say hello' }] }
];
const plan = [
  { seat: 'seatC', who: 'Mei', hint: { Daniel: 'Daniel: "That is me, Mom. Look for Mei."', 'Aunt Rose': 'Rose: "That is me, your sister. Look for Mei."' }, hello: 'Mei: "Hi Mom, it is me."' },
  { seat: 'seatL', who: 'Daniel', hint: { 'Aunt Rose': 'Rose: "That is me again. Daniel is the other one."' }, hello: 'Daniel: "Hi Mom, I brought the bread."' }
];
const story = 'Dad let me steer the boat and I was so scared. He kept laughing.';
