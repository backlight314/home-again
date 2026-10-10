const $ = id => document.getElementById(id);
const placed = {};            // chapter id -> true once its memory is in the album
let pendingPlace = null;      // chapter id waiting to be placed with the animation
let viewing = null;           // chapter id whose memory is open in the overlay
let rereading = false;
const face = n => '<svg viewBox="0 0 100 80" style="' + people[n] + '"><use href="#person"/></svg>';
let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const clearAll = () => { timers.forEach(clearTimeout); timers = []; };
const chapter = id => chapters.find(c => c.id === id);
// Album photos carry no caption on the page; the caption and voice are in the memory overlay (tap the photo).
const memPrint = c => '<svg viewBox="0 0 120 80"><use href="#' + c.memory.scene + '"/></svg>';

/* album page */
function buildAlbum() {
  const sheet = $('sheetpg'); sheet.innerHTML = '';
  chapters.forEach((c, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot s' + (i + 1) + (placed[c.id] ? ' filled' : '');
    slot.id = 'slot-' + c.id;
    slot.innerHTML = '<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>'
      + (c.memory ? '<button class="print" aria-label="' + c.memory.caption + '">' + (placed[c.id] ? memPrint(c) : '') + '</button>' : '');
    const pr = slot.querySelector('.print');
    if (pr) pr.onclick = () => { if (placed[c.id]) { rereading = true; openMemory(c.id); } };
    sheet.appendChild(slot);
  });
  const tags = $('tags'); tags.innerHTML = '';
  chapters.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'slip-tag t' + (i + 1) + (c.playable && !placed[c.id] ? ' open' : '') + (placed[c.id] ? ' done' : '');
    b.innerHTML = '<span>' + c.title + (c.playable && !placed[c.id] ? '<small>' + S.open + '</small>' : '') + '</span>';
    b.onclick = () => { if (c.playable) show(c.id === 'family' ? 'kitchen' : c.id); else toast(S.comingSoon); };
    tags.appendChild(b);
  });
}
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3600);
}
function placeMemory(id) {
  const c = chapter(id), slot = $('slot-' + id), scr = $('screen').getBoundingClientRect();
  const r = slot.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'flyer';
  fly.innerHTML = '<div class="print">' + memPrint(c) + '</div>';
  fly.style.cssText = 'left:' + (scr.width * .3) + 'px;top:' + (scr.height * .22) + 'px;width:' + (scr.width * .4) + 'px;transform:rotate(-1.4deg)';
  $('screen').appendChild(fly);
  later(() => {
    fly.style.left = (r.left - scr.left) + 'px'; fly.style.top = (r.top - scr.top) + 'px'; fly.style.width = r.width + 'px';
    fly.style.transform = 'rotate(-1.6deg)';
  }, 450);
  later(() => {
    placed[id] = true; buildAlbum(); fly.remove();
    toast('Another memory is home.');
  }, 2100);
}

function show(name) {
  clearAll();
  document.querySelectorAll('#screen .flyer').forEach(f => f.remove());
  document.querySelectorAll('.scr').forEach(s => s.classList.toggle('on', s.id === 's-' + name));
  $('chrome').classList.toggle('on', name !== 'intro');
  document.querySelectorAll('#controls button').forEach(b => b.setAttribute('aria-current', b.dataset.jump === name));
  if (name === 'album') { buildAlbum(); if (pendingPlace) { const id = pendingPlace; pendingPlace = null; placeMemory(id); } }
  if (name === 'kitchen') initKitchen();
  if (name === 'porch') initPorch();
}
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));

/* memory overlay */
function openMemory(id) {
  const c = chapter(id); viewing = id;
  $('mUse').setAttribute('href', '#' + c.memory.scene);
  $('mCap').textContent = c.memory.caption;
  $('mLine').textContent = '“' + c.memory.line + '”';
  $('mBy').textContent = 'recorded by ' + c.memory.by;
  $('mWave').classList.remove('on');
  $('mDone').textContent = rereading ? S.closeMemory : S.putIn;
  const pr = $('mPrint'); pr.classList.remove('developed');
  $('reveal').classList.add('on');
  later(() => pr.classList.add('developed'), 300);
}
$('mPlay').onclick = () => { $('mWave').classList.add('on'); later(() => $('mWave').classList.remove('on'), 2600); };
$('mDone').onclick = () => {
  $('reveal').classList.remove('on');
  if (!rereading) pendingPlace = viewing;
  rereading = false;
  show('album');
};
$('restBtn').onclick = () => $('rest').classList.add('on');
$('restKeep').onclick = () => $('rest').classList.remove('on');
$('restHome').onclick = () => { $('rest').classList.remove('on'); show('album'); };

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
$('kNext').onclick = () => show('porch');

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
// Finishing the porch finishes the Family chapter and earns its memory.
$('porchTake').onclick = () => { rereading = false; openMemory('family'); };

/* review strip (design review only) */
[['intro','Cover'],['album','Album'],['kitchen','Kitchen'],['porch','Porch']]
  .forEach(([k, label]) => {
    const b = document.createElement('button'); b.textContent = label; b.dataset.jump = k;
    b.onclick = () => { $('reveal').classList.remove('on'); $('rest').classList.remove('on'); rereading = false; show(k); };
    $('controls').appendChild(b);
  });
const rb = document.createElement('button'); rb.textContent = 'Start over';
rb.onclick = () => { Object.keys(placed).forEach(k => delete placed[k]); $('reveal').classList.remove('on'); show('intro'); };
$('controls').appendChild(rb);

show('intro');
