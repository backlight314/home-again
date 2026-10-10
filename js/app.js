const $ = id => document.getElementById(id);
const placed = {};            // memory id -> true once its photo is in its book
let currentBook = 'family';   // chapter id of the open book
let pendingPlace = null;      // memory id waiting to be placed with the animation
let viewing = null;           // memory id open in the overlay
let rereading = false;
const face = n => '<svg viewBox="0 0 100 80" style="' + people[n] + '"><use href="#person"/></svg>';
let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const clearAll = () => { timers.forEach(clearTimeout); timers = []; };
const chapter = id => chapters.find(c => c.id === id);
const memory = id => chapters.flatMap(c => c.memories).find(m => m.id === id);
const bookOf = id => chapters.find(c => c.memories.some(m => m.id === id));
const done = c => c.memories.filter(m => placed[m.id]).length;
const complete = c => done(c) === c.memories.length;
// Album photos carry no caption on the page; the caption and voice are in the memory overlay (tap the photo).
const memPrint = m => '<svg viewBox="0 0 120 80"><use href="#' + m.scene + '"/></svg>';

/* slot positions on the sheet, by how many memories the book holds: [left %, top %, rotation] */
const layout = {
  1: [[33, 32, .8]],
  2: [[8, 30, -2], [58, 30, 1.6]],
  3: [[8, 10, -2], [58, 8, 1.6], [33, 52, .8]],
  4: [[8, 9, -2], [58, 8, 1.6], [6, 50, 1.2], [56, 50, -1.6]]
};
/* pinned slip positions, in the order memories use them */
const slipSpots = ['t1', 't4', 't2', 't5'];

/* the shelf of books */
function buildShelf() {
  const box = $('books'); box.innerHTML = '';
  chapters.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'book b' + (i + 1) + (complete(c) ? ' full' : '');
    b.style.setProperty('--bk', c.color);
    b.dataset.id = c.id;
    b.setAttribute('aria-label', c.title + ', ' + done(c) + ' of ' + c.memories.length + ' memories');
    b.innerHTML = '<span class="plate">' + c.title + '</span><span class="prog">'
      + (complete(c) ? S.bookComplete : S.bookProgress(done(c), c.memories.length)) + '</span>';
    b.onclick = () => openBook(c.id, b);
    box.appendChild(b);
  });
}
/* zoom a book to full screen, open its cover, land on its album page */
function openBook(id, el) {
  currentBook = id;
  const scr = $('screen').getBoundingClientRect(), r = el.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'bookfly';
  fly.style.setProperty('--bk', chapter(id).color);
  fly.innerHTML = el.innerHTML;
  fly.style.cssText += ';left:' + (r.left - scr.left) + 'px;top:' + (r.top - scr.top) + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
  el.style.visibility = 'hidden';
  $('screen').appendChild(fly);
  // plain timeouts: show() clears the managed timers, and the flyer must outlive that
  setTimeout(() => { fly.style.left = '0px'; fly.style.top = '0px'; fly.style.width = scr.width + 'px'; fly.style.height = scr.height + 'px'; fly.classList.add('zoomed'); }, 30);
  setTimeout(() => { show('album', true); fly.classList.add('opening'); }, 1000);
  setTimeout(() => fly.remove(), 2100);
}

/* a book's album page */
function buildAlbum() {
  const book = chapter(currentBook), sheet = $('sheetpg'), n = book.memories.length;
  sheet.innerHTML = ''; sheet.dataset.title = book.title.toUpperCase();
  book.memories.forEach((m, i) => {
    const [l, t, rot] = layout[n][i];
    const slot = document.createElement('div');
    slot.className = 'slot' + (placed[m.id] ? ' filled' : '');
    slot.id = 'slot-' + m.id;
    slot.style.cssText = 'left:' + l + '%;top:' + t + '%;transform:rotate(' + rot + 'deg)';
    slot.innerHTML = '<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>'
      + (m.scene ? '<button class="print" aria-label="' + m.caption + '">' + (placed[m.id] ? memPrint(m) : '') + '</button>' : '');
    const pr = slot.querySelector('.print');
    if (pr) pr.onclick = () => { if (placed[m.id]) { rereading = true; openMemory(m.id); } };
    sheet.appendChild(slot);
  });
  const tags = $('tags'); tags.innerHTML = '';
  book.memories.forEach((m, i) => {
    const b = document.createElement('button');
    const playable = !!m.activity, isDone = !!placed[m.id];
    b.className = 'slip-tag ' + slipSpots[i] + (playable && !isDone ? ' open' : '') + (isDone ? ' done' : '');
    b.innerHTML = '<span>' + m.title + (playable && !isDone ? '<small>' + S.open + '</small>' : '') + '</span>';
    b.onclick = () => {
      if (isDone) { rereading = true; openMemory(m.id); }
      else if (playable) show(m.activity);
      else toast(S.comingSoon);
    };
    tags.appendChild(b);
  });
}
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3600);
}
function placeMemory(id) {
  const m = memory(id), slot = $('slot-' + id), scr = $('screen').getBoundingClientRect();
  const r = slot.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'flyer';
  fly.innerHTML = '<div class="print">' + memPrint(m) + '</div>';
  fly.style.cssText = 'left:' + (scr.width * .3) + 'px;top:' + (scr.height * .22) + 'px;width:' + (scr.width * .4) + 'px;transform:rotate(-1.4deg)';
  $('screen').appendChild(fly);
  later(() => {
    fly.style.left = (r.left - scr.left) + 'px'; fly.style.top = (r.top - scr.top) + 'px'; fly.style.width = r.width + 'px';
    fly.style.transform = 'rotate(-1.6deg)';
  }, 450);
  later(() => {
    placed[id] = true; buildAlbum(); fly.remove();
    toast(complete(chapter(currentBook)) ? S.bookFull : S.placed);
  }, 2100);
}

function show(name, keepFly) {
  clearAll();
  if (!keepFly) document.querySelectorAll('#screen .bookfly').forEach(f => f.remove());
  document.querySelectorAll('#screen .flyer').forEach(f => f.remove());
  document.querySelectorAll('.scr').forEach(s => s.classList.toggle('on', s.id === 's-' + name));
  $('chrome').classList.toggle('on', name !== 'intro');
  document.querySelectorAll('#controls button').forEach(b => b.setAttribute('aria-current', b.dataset.jump === name));
  if (name === 'shelf') buildShelf();
  if (name === 'album') { buildAlbum(); if (pendingPlace) { const id = pendingPlace; pendingPlace = null; placeMemory(id); } }
  if (name === 'kitchen') initKitchen();
  if (name === 'porch') initPorch();
}
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));

/* memory overlay */
function openMemory(id) {
  const m = memory(id); viewing = id;
  $('mUse').setAttribute('href', '#' + m.scene);
  $('mCap').textContent = m.caption;
  $('mLine').textContent = '“' + m.line + '”';
  $('mBy').textContent = 'recorded by ' + m.by;
  $('mWave').classList.remove('on');
  $('mDone').textContent = rereading ? S.closeMemory : S.putIn;
  const pr = $('mPrint'); pr.classList.remove('developed');
  $('reveal').classList.add('on');
  later(() => pr.classList.add('developed'), 300);
}
$('mPlay').onclick = () => { $('mWave').classList.add('on'); later(() => $('mWave').classList.remove('on'), 2600); };
$('mDone').onclick = () => {
  $('reveal').classList.remove('on');
  if (!rereading) { pendingPlace = viewing; currentBook = bookOf(viewing).id; }
  rereading = false;
  show('album');
};
$('restBtn').onclick = () => $('rest').classList.add('on');
$('restKeep').onclick = () => $('rest').classList.remove('on');
$('restHome').onclick = () => { $('rest').classList.remove('on'); show('shelf'); };

/* kitchen: the Sunday table, reunion first */
let round = 0;
const ring = '<span class="ring"><svg viewBox="0 0 100 100"><use href="#pencilring"/></svg></span>';
function setSeat(el, state, who) {
  el.className = 'seat' + (state === 'target' ? ' target' : state === 'filled' ? ' filled' : '');
  if (state === 'filled') el.innerHTML = face(who);
  else if (state === 'target') el.innerHTML = ring + '<span class="lbl">?</span>';
  else el.innerHTML = '<span class="lbl">empty</span>';
}
function initKitchen() {
  round = 0;
  setSeat($('seatL'), 'empty'); setSeat($('seatC'), 'target'); setSeat($('seatR'), 'empty');
  $('kSaid').hidden = true; $('kNext').classList.add('hide');
  $('kCap').innerHTML = 'Who sits in the circled chair?<span class="sub">KITCHEN, SUNDAY</span>';
  drawFaces(['Daniel', 'Mei', 'Aunt Rose']);
}
function drawFaces(list) {
  const row = $('kRow'); row.innerHTML = '';
  list.forEach(n => {
    const b = document.createElement('button');
    b.className = 'print';
    b.innerHTML = face(n) + '<div class="pname">' + n + '</div>';
    b.onclick = () => pick(n, b, list);
    row.appendChild(b);
  });
}
function said(t) { $('kSaidText').textContent = t; $('kSaid').hidden = false; }
function pick(n, btn, list) {
  const p = plan[round];
  if (n !== p.who) { btn.classList.add('marked'); said(p.hint[n]); return; }
  setSeat($(p.seat), 'filled', n);
  said(p.hello);
  drawFaces(list.filter(x => x !== n));
  round++;
  if (round < plan.length) {
    setSeat($(plan[round].seat), 'target');
    $('kCap').innerHTML = S.seatNext + '<span class="sub">KITCHEN, SUNDAY</span>';
  } else {
    $('kCap').innerHTML = S.seatDone + '<span class="sub">KITCHEN, SUNDAY</span>';
    later(() => $('kNext').classList.remove('hide'), 1200);
  }
}
$('kNext').onclick = () => { rereading = false; openMemory('table'); };

/* porch: tell the story of one photo */
let talking = false;
function initPorch() {
  talking = false;
  $('mic').classList.remove('live');
  $('pHeard').textContent = 'tap the microphone and talk';
  $('pStamp').classList.add('hide'); $('pFollow').classList.add('hide'); $('porchTake').classList.add('hide');
  $('pCap').innerHTML = 'Tell me about this day at the lake<span class="sub">PORCH, LATE AFTERNOON</span>';
}
$('mic').onclick = () => {
  if (talking) return;
  talking = true;
  $('mic').classList.add('live');
  $('pCap').innerHTML = 'I am listening<span class="sub">PORCH, LATE AFTERNOON</span>';
  let i = 0;
  const step = () => {
    i += 2; $('pHeard').textContent = story.slice(0, i);
    if (i < story.length) later(step, 65);
    else later(() => {
      $('mic').classList.remove('live');
      $('pStamp').classList.remove('hide'); $('pFollow').classList.remove('hide');
      $('pCap').innerHTML = 'Thank you for telling me<span class="sub">PORCH, LATE AFTERNOON</span>';
      later(() => $('porchTake').classList.remove('hide'), 900);
    }, 500);
  };
  step();
};
$('porchTake').onclick = () => { rereading = false; openMemory('lake'); };

/* review strip (design review only) */
[['intro','Cover'],['shelf','Albums'],['album','Album page'],['kitchen','Kitchen'],['porch','Porch']]
  .forEach(([k, label]) => {
    const b = document.createElement('button'); b.textContent = label; b.dataset.jump = k;
    b.onclick = () => { $('reveal').classList.remove('on'); $('rest').classList.remove('on'); rereading = false; show(k); };
    $('controls').appendChild(b);
  });
const rb = document.createElement('button'); rb.textContent = 'Start over';
rb.onclick = () => { Object.keys(placed).forEach(k => delete placed[k]); $('reveal').classList.remove('on'); show('intro'); };
$('controls').appendChild(rb);

show('intro');
