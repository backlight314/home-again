// Sample family data (placeholders). Replace with the real data.json shape from docs/TECH-DESIGN.md.
// Plain globals on purpose: no build step, works when index.html is opened from disk.
const letter = [
  { room: 'Kitchen', line: 'Dear Mom, your chair at the table is still yours every Sunday.', by: 'Mei' },
  { room: 'Radio room', line: 'That song was playing the night Dad asked you to dance.', by: 'Daniel' },
  { room: 'Porch', line: 'I still think about the day at the lake, when you let me steer.', by: 'Mei' },
  { room: 'Attic', line: 'Every picture in this house is someone who loves you. We do.', by: 'Aunt Rose' }
];

const people = {
  Mei: '--bg:#cdc3d2;--skin:#d9b394;--cloth:#6f6480;--hair:#3b3240',
  Daniel: '--bg:#bcc7d2;--skin:#cda683;--cloth:#4f6279;--hair:#44352a',
  'Aunt Rose': '--bg:#c3cfc4;--skin:#e0bb9b;--cloth:#6b8078;--hair:#a9a396'
};

const ordinals = ['PIECE ONE OF FOUR', 'PIECE TWO OF FOUR', 'PIECE THREE OF FOUR', 'PIECE FOUR OF FOUR'];

const plan = [
  { seat: 'seatC', who: 'Mei', hint: { Daniel: 'Daniel: "That is me, Mom. Look for Mei."', 'Aunt Rose': 'Rose: "That is me, your sister. Look for Mei."' }, hello: 'Mei: "Hi Mom, it is me."' },
  { seat: 'seatL', who: 'Daniel', hint: { 'Aunt Rose': 'Rose: "That is me again. Daniel is the other one."' }, hello: 'Daniel: "Hi Mom, I brought the bread."' }
];

const bands = [
  { t: 'static', clear: false }, { t: 'a song from 1974', clear: true },
  { t: 'static', clear: false }, { t: 'faint talking', clear: false }
];

const story = 'Dad let me steer the boat and I was so scared. He kept laughing.';

const pics = ['sc-garden', 'sc-lake', 'sc-snow'];
