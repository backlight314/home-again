// Sample family data (placeholders). Replace with the real data.json shape from docs/TECH-DESIGN.md.
// Plain globals on purpose: no build step, works when index.html is opened from disk.
const people = {
  Mei: '--bg:#cdc3d2;--skin:#d9b394;--cloth:#6f6480;--hair:#3b3240',
  Daniel: '--bg:#bcc7d2;--skin:#cda683;--cloth:#4f6279;--hair:#44352a',
  'Aunt Rose': '--bg:#c3cfc4;--skin:#e0bb9b;--cloth:#6b8078;--hair:#a9a396'
};
// One slot per chapter on the album page. Finishing a chapter earns its memory.
const chapters = [
  { id: 'childhood', title: 'Childhood', playable: false },
  { id: 'school', title: 'School & young adult', playable: false },
  { id: 'work', title: 'Work', playable: false },
  { id: 'family', title: 'Family', playable: true,
    memory: { scene: 'sc-table', caption: 'Sunday dinner, the house on Elm Street',
              line: 'Your chair at the table is still yours every Sunday.', by: 'Mei' } },
  { id: 'today', title: 'Today', playable: false }
];
const plan = [
  { seat: 'seatC', who: 'Mei', hint: { Daniel: 'Daniel: "That is me, Mom. Look for Mei."', 'Aunt Rose': 'Rose: "That is me, your sister. Look for Mei."' }, hello: 'Mei: "Hi Mom, it is me."' },
  { seat: 'seatL', who: 'Daniel', hint: { 'Aunt Rose': 'Rose: "That is me again. Daniel is the other one."' }, hello: 'Daniel: "Hi Mom, I brought the bread."' }
];
const story = 'Dad let me steer the boat and I was so scared. He kept laughing.';
