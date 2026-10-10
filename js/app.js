const $ = id => document.getElementById(id);
const found = [false, false, false, false];
const keys = ['kitchen', 'radio', 'porch', 'attic'];
const wins = ['w-kitchen', 'w-radio', 'w-porch', 'w-attic'];
const face = n => '<svg viewBox="0 0 100 80" style="' + people[n] + '"><use href="#person"/></svg>';
let timers = [], pending = -1, rereading = false;
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const clearAll = () => { timers.forEach(clearTimeout); timers = []; };

function paintProgress() {
  found.forEach((f, i) => $('pc' + i).classList.toggle('got', f));
  document.querySelectorAll('.housewrap svg').forEach(svg => {
    wins.forEach((w, i) => { const el = svg.querySelector('.' + w); if (el) el.classList.toggle('lit', found[i]); });
  });
}
function buildRooms() {
  const box = $('rooms'); box.innerHTML = '';
  letter.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'roomrow' + (found[i] ? ' found' : '');
    b.innerHTML = '<span class="n">' + p.room + '</span><span class="dots"></span><span class="s">' + (found[i] ? 'piece found' : 'piece waiting') + '</span>';
    b.onclick = () => { if (found[i]) { rereading = true; openSlip(i); } else show(keys[i]); };
    box.appendChild(b);
  });
  const n = found.filter(Boolean).length;
  $('hubCaption').innerHTML = S.hubCaption[n === 0 ? 0 : n < 4 ? 1 : 2] + '<span class="sub">' + n + ' OF 4 PIECES FOUND</span>';
}
function show(name) {
  clearAll();
  document.querySelectorAll('.scr').forEach(s => s.classList.toggle('on', s.id === 's-' + name));
  $('chrome').classList.toggle('on', name !== 'intro' && name !== 'ending');
  document.querySelectorAll('#controls button').forEach(b => b.setAttribute('aria-current', b.dataset.jump === name));
  paintProgress();
  if (name === 'hub') buildRooms();
  if (name === 'kitchen') initKitchen();
  if (name === 'radio') initRadio();
  if (name === 'porch') initPorch();
  if (name === 'attic') initAttic();
  if (name === 'ending') initEnding();
}
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));

function openSlip(i) {
  pending = i;
  $('rKick').textContent = rereading ? 'FROM THE ' + letter[i].room.toUpperCase() : ordinals[i];
  $('rLine').textContent = letter[i].line;
  $('rBy').textContent = 'recorded by ' + letter[i].by;
  $('rWave').classList.remove('on');
  $('rDone').textContent = rereading ? 'BACK TO THE HOUSE' : 'PUT IT IN THE LETTER';
  $('reveal').classList.add('on');
}
$('rPlay').onclick = () => { $('rWave').classList.add('on'); later(() => $('rWave').classList.remove('on'), 2600); };
$('rDone').onclick = () => {
  $('reveal').classList.remove('on');
  if (rereading) { rereading = false; show('hub'); return; }
  found[pending] = true; paintProgress();
  if (found.every(Boolean)) show('ending'); else show('hub');
};
$('restBtn').onclick = () => $('rest').classList.add('on');
$('restKeep').onclick = () => $('rest').classList.remove('on');
$('restHome').onclick = () => { $('rest').classList.remove('on'); show('hub'); };

/* kitchen */
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
  $('kSaid').hidden = true;
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
    $('kCap').innerHTML = 'And the next chair?<span class="sub">KITCHEN, SUNDAY</span>';
  } else {
    $('kCap').innerHTML = 'Everyone is home. Something is under the table.<span class="sub">KITCHEN, SUNDAY</span>';
    later(() => { rereading = false; openSlip(0); }, 2100);
  }
}

/* radio */
let bi = 0, deg = 0;
function paintBand() {
  const b = bands[bi];
  $('station').textContent = b.t;
  $('station').classList.toggle('clear', b.clear);
  $('keepSong').classList.toggle('hide', !b.clear);
  $('rCap').innerHTML = (b.clear ? 'Where did you hear this one?' : 'Turn the dial until a song comes in') + '<span class="sub">RADIO ROOM</span>';
}
function tune(step) {
  bi = (bi + step + bands.length) % bands.length; deg += step * 48;
  const n = document.getElementById('needle');
  if (n) n.style.transform = 'rotate(' + deg + 'deg)';
  paintBand();
}
function initRadio() { bi = 0; deg = 0; const n = document.getElementById('needle'); if (n) n.style.transform = 'none'; paintBand(); }
$('tuneL').onclick = () => tune(-1);
$('tuneR').onclick = () => tune(1);
$('keepSong').onclick = () => { rereading = false; openSlip(1); };

/* porch */
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
$('porchTake').onclick = () => { rereading = false; openSlip(2); };

/* attic */
let set = [];
function drawAttic() {
  const sh = $('shelf');
  sh.querySelectorAll('.mount').forEach(m => m.remove());
  const lefts = ['0%', '39%', '78%'];
  for (let i = 0; i < 3; i++) {
    const m = document.createElement('div');
    m.className = 'mount ' + (set[i] ? 'set' : (i === set.length ? 'next' : 'open'));
    m.style.left = lefts[i];
    m.innerHTML = '<span class="num">' + (i + 1) + '</span>' + (set[i] ? '<svg viewBox="0 0 120 80"><use href="#' + set[i] + '"/></svg>' : '');
    sh.appendChild(m);
  }
  const box = $('box'); box.innerHTML = '';
  pics.forEach(p => {
    const b = document.createElement('button');
    b.className = 'pick' + (set.includes(p) ? ' gone' : '');
    b.innerHTML = '<svg viewBox="0 0 120 80"><use href="#' + p + '"/></svg>';
    b.setAttribute('aria-label', 'photo');
    b.onclick = () => { if (set.length < 3 && !set.includes(p)) { set.push(p); drawAttic(); } };
    box.appendChild(b);
  });
  if (set.length === 3) {
    $('aCap').innerHTML = 'That looks right<span class="sub">ATTIC, THE PHOTO BOX</span>';
    later(() => $('atticTake').classList.remove('hide'), 700);
  } else {
    $('aCap').innerHTML = 'Which one came first?<span class="sub">ATTIC, THE PHOTO BOX</span>';
    $('atticTake').classList.add('hide');
  }
}
function initAttic() { set = []; drawAttic(); }
$('atticTake').onclick = () => { rereading = false; openSlip(3); };

/* ending */
function initEnding() {
  $('sheet').innerHTML = letter.map((p, i) => '<div class="ln" id="ln' + i + '">' + p.line + '<span>' + p.by + '</span></div>').join('');
}
$('hearLetter').onclick = () => {
  clearAll();
  document.querySelectorAll('.sheet .ln').forEach(l => l.classList.remove('say'));
  letter.forEach((_, i) => later(() => {
    document.querySelectorAll('.sheet .ln').forEach(l => l.classList.remove('say'));
    const el = $('ln' + i); if (el) el.classList.add('say');
  }, i * 2200));
  later(() => document.querySelectorAll('.sheet .ln').forEach(l => l.classList.remove('say')), letter.length * 2200);
};
$('sayHello').onclick = () => { $('sayHello').textContent = 'CALLING MEI'; };

/* review strip */
[['intro','Opening'],['hub','House'],['kitchen','Kitchen'],['radio','Radio room'],['porch','Porch'],['attic','Attic'],['ending','Ending']]
  .forEach(([k, label]) => {
    const b = document.createElement('button'); b.textContent = label; b.dataset.jump = k;
    b.onclick = () => { $('reveal').classList.remove('on'); $('rest').classList.remove('on'); rereading = false; show(k); };
    $('controls').appendChild(b);
  });
const rb = document.createElement('button'); rb.textContent = 'Start over';
rb.onclick = () => { found.fill(false); $('reveal').classList.remove('on'); show('intro'); };
$('controls').appendChild(rb);

show('intro');
