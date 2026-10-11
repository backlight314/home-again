(function (global) {
  const $ = (id) => document.getElementById(id);
  const keys = ['kitchen', 'radio', 'porch', 'attic', 'today'];
  const weekKeys = keys.slice(0, 4); // the four rooms that hold this week's letter pieces
  const scenes = ['sc-table', 'sc-lake', 'sc-snow', 'sc-garden'];
  const layout = {
    1: [[33, 32, 0.8]],
    2: [[8, 30, -2], [58, 30, 1.6]],
    3: [[8, 10, -2], [58, 8, 1.6], [33, 52, 0.8]],
    4: [[8, 9, -2], [58, 8, 1.6], [6, 50, 1.2], [56, 50, -1.6]]
  };
  const slipSpots = ['t1', 't4', 't2', 't5'];

  let pack = null;
  let letter = [];
  let memories = [];
  let chapters = [];
  let found = [false, false, false, false];
  let placingId = null; // memory whose photo is still flying into its slot
  let currentBook = 'week';
  let pendingPlace = null;
  let viewing = null;
  let timers = [];
  let rereading = false;
  let round = 0;
  let bi = 0;
  let deg = 0;
  let talking = false;
  let atticSet = [];
  let straightened = [];
  let started = false;
  let familyAudio = null;
  let porchStop = null;
  let hub = null;
  let hubFailed = false;
  let hubInside = false;
  let hubMoving = false;
  const houseRooms = { kitchen: 'kitchen', radio: 'radio', porch: 'porch', attic: 'attic', hall: 'today' };

  // Play events for the family's insights page, sent to the server in small batches.
  // Only what happened and how long it took; never what the player said.
  let session = '';
  let outbox = [];
  let flushTimer = null;
  let roomT0 = 0;
  let stepT0 = 0;
  const since = (t0) => Math.round(performance.now() - t0);
  function track(event, room, extra) {
    outbox.push({ session, ts: new Date().toISOString(), hour: new Date().getHours(), event, room, ...extra });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 4000);
  }
  function flush() {
    if (!outbox.length) return;
    const body = JSON.stringify({ events: outbox.splice(0) });
    if (!(navigator.sendBeacon && navigator.sendBeacon('/api/events', body))) {
      fetch('/api/events', { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  }
  global.addEventListener('pagehide', flush);

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearAll = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const S = global.S || {
    comingSoon: 'This page is waiting for photos from your family.',
    open: 'tap to visit',
    putIn: 'PUT IT IN THE ALBUM',
    closeMemory: 'BACK TO THE ALBUM',
    placed: 'Another memory is home.',
    bookFull: 'This album is full of memories.',
    bookComplete: 'complete',
    bookProgress: (n, m) => n + ' of ' + m + ' memories'
  };
  const chapter = (id) => chapters.find((c) => c.id === id);
  const memory = (id) => chapters.flatMap((c) => c.memories).find((m) => m.id === id);
  const done = (c) => c.memories.filter((m) => m.activity && found[keys.indexOf(m.activity)]).length;
  const complete = (c) => c.memories.filter((m) => m.activity).length > 0 && done(c) === c.memories.filter((m) => m.activity).length;
  const memPrint = (m) => {
    if (m.photoDataUrl) return '<img src="' + m.photoDataUrl + '" alt="">';
    return '<svg viewBox="0 0 120 80"><use href="#' + (m.scene || 'sc-table') + '"></use></svg>';
  };

  // A read-aloud button toggles: press to play (button turns red with a stop square), press again to stop.
  let reader = null; // { btn, idle, cleanup, id }
  let readId = 0;
  function clearReader() {
    if (!reader) return;
    const { btn, idle, cleanup } = reader;
    reader = null;
    btn.classList.remove('reading');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = idle;
    if (cleanup) cleanup();
  }
  // run(done) starts the audio and calls done() when it ends by itself; cleanup() undoes any side effects on stop
  function beginRead(btn, run, cleanup) {
    hush();
    const id = ++readId;
    const idle = btn.innerHTML;
    run(() => {
      if (reader && reader.id === id) clearReader();
    });
    reader = { btn, idle, cleanup, id };
    btn.classList.add('reading');
    btn.setAttribute('aria-pressed', 'true');
    btn.innerHTML = '<span class="stopico" aria-hidden="true"></span>' + (btn.classList.contains('hearbtn') ? 'stop' : 'STOP');
  }
  function toggleRead(btn, run, cleanup) {
    if (reader && reader.btn === btn) {
      hush();
      return;
    }
    beginRead(btn, run, cleanup);
  }

  function hush() {
    if (familyAudio) {
      familyAudio.pause();
      familyAudio = null;
    }
    if (porchStop) {
      porchStop();
      porchStop = null;
    }
    if (window.HomeAgainVoice) HomeAgainVoice.stop();
    clearReader();
  }

  function speak(text, role, speaker) {
    if (window.HomeAgainVoice) return HomeAgainVoice.speak(text, { role: role || 'narrator', speaker });
    return Promise.resolve();
  }

  function personByName(name) {
    return (pack.people || []).find((p) => p.name === name) || null;
  }

  function face(name) {
    const p = personByName(name);
    if (p && p.photoDataUrl) {
      return `<img src="${p.photoDataUrl}" alt="${name}">`;
    }
    const palette =
      (p && p.palette) ||
      '--bg:#cdc3d2;--skin:#d9b394;--cloth:#6f6480;--hair:#3b3240';
    return `<svg viewBox="0 0 100 80" style="${palette}"><use href="#person"></use></svg>`;
  }

  function buildChapters() {
    const who = (pack.profile && pack.profile.preferredName) || 'home';
    memories = weekKeys.map((activity, i) => {
      const line = letter[i] || { room: activity, line: 'We love you.', by: 'Family' };
      const mem = (pack.memories && pack.memories[i]) || {};
      return {
        id: activity,
        title: line.room || mem.title || activity,
        activity,
        scene: mem.svgId || scenes[i],
        photoDataUrl: mem.photoDataUrl || null,
        caption: mem.title || line.room,
        line: line.line,
        by: line.by
      };
    });
    chapters = [
      { id: 'childhood', title: 'Childhood', color: '#b8893a', memories: [{ id: 'toybox', title: 'Toy box' }, { id: 'recipe', title: 'Recipe' }] },
      { id: 'school', title: 'School & young adult', color: '#5f7a58', memories: [{ id: 'yearbook', title: 'Yearbook' }] },
      { id: 'work', title: 'Work', color: '#44607d', memories: [{ id: 'job', title: 'The job' }] },
      { id: 'week', title: 'This week', color: '#9c3b2e', memories },
      { id: 'today', title: 'Today', color: '#6d5262', memories: [todayMemory()] }
    ];
    currentBook = 'week';
  }

  // The hall's page. pack.rooms.today { prompt, caption, line, by } can override any of it.
  function todayMemory() {
    const t = (pack.rooms && pack.rooms.today) || {};
    const call = pack.profile && (pack.profile.addressAs || pack.profile.preferredName);
    const first = personByName(todayFaces()[0]);
    const hung = hallPhotos()[0];
    return {
      id: 'today',
      title: 'Today',
      activity: 'today',
      scene: 'sc-table',
      photoDataUrl: (hung && hung.photoDataUrl) || (first && first.photoDataUrl) || null,
      caption: t.caption || 'The hall, today',
      line: t.line || 'Everyone is with you today' + (call ? ', ' + call : '') + '.',
      by: t.by || 'the family'
    };
  }

  function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('on'), 3600);
  }

  function buildShelf() {
    const box = $('books');
    box.innerHTML = '';
    chapters.forEach((c, i) => {
      const b = document.createElement('button');
      const playable = c.memories.some((m) => m.activity);
      const n = playable ? done(c) : 0;
      const m = c.memories.length;
      b.className = 'book b' + (i + 1) + (playable && complete(c) ? ' full' : '');
      b.style.setProperty('--bk', c.color);
      b.innerHTML =
        '<span class="plate">' +
        c.title +
        '</span><span class="prog">' +
        (playable && complete(c) ? S.bookComplete : playable ? S.bookProgress(n, m) : 'coming soon') +
        '</span>';
      b.setAttribute('aria-label', c.title);
      b.onclick = () => {
        if (playable) openBook(c.id, b);
        else toast(S.comingSoon);
      };
      box.appendChild(b);
    });
  }

  function openBook(id, el) {
    currentBook = id;
    const scr = $('screen').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'bookfly';
    fly.style.setProperty('--bk', chapter(id).color);
    fly.innerHTML = el.innerHTML;
    fly.style.cssText +=
      ';left:' +
      (r.left - scr.left) +
      'px;top:' +
      (r.top - scr.top) +
      'px;width:' +
      r.width +
      'px;height:' +
      r.height +
      'px';
    el.style.visibility = 'hidden';
    $('screen').appendChild(fly);
    setTimeout(() => {
      fly.style.left = '0px';
      fly.style.top = '0px';
      fly.style.width = scr.width + 'px';
      fly.style.height = scr.height + 'px';
      fly.classList.add('zoomed');
    }, 30);
    setTimeout(() => {
      hubInside = false;
      show('hub', true);
      hub?.reset();
      fly.classList.add('opening');
    }, 1000);
    setTimeout(() => fly.remove(), 2100);
  }

  // the reverse of openBook: the cover swings shut over the page, then the book settles back on the shelf
  function closeBook() {
    const book = chapter(currentBook);
    const scr = $('screen').getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'bookfly zoomed opening';
    fly.style.setProperty('--bk', book.color);
    fly.style.transition = 'none';
    fly.style.cssText += ';left:0px;top:0px;width:' + scr.width + 'px;height:' + scr.height + 'px';
    fly.innerHTML =
      '<span class="plate">' + book.title + '</span><span class="prog">' +
      (complete(book) ? S.bookComplete : S.bookProgress(done(book), book.memories.length)) + '</span>';
    $('screen').appendChild(fly);
    void fly.offsetWidth;
    fly.style.transition = '';
    fly.classList.remove('opening'); // swings shut
    setTimeout(() => {
      hubInside = false;
      show('shelf', true);
      const el = [...$('books').children].find((b) => b.getAttribute('aria-label') === book.title);
      const r = el && el.getBoundingClientRect();
      if (el) el.style.visibility = 'hidden';
      if (r) {
        fly.style.left = r.left - scr.left + 'px';
        fly.style.top = r.top - scr.top + 'px';
        fly.style.width = r.width + 'px';
        fly.style.height = r.height + 'px';
      }
      fly.classList.remove('zoomed');
      setTimeout(() => {
        fly.remove();
        if (el) el.style.visibility = '';
      }, 1000);
    }, 1000);
  }

  function buildAlbum() {
    const book = chapter(currentBook);
    const sheet = $('sheetpg');
    const n = book.memories.length;
    const spots = layout[n] || layout[4];
    sheet.innerHTML = '';
    sheet.dataset.title = book.title.toUpperCase();
    book.memories.forEach((m, i) => {
      const [l, t, rot] = spots[i] || spots[0];
      const filled = m.activity && found[keys.indexOf(m.activity)] && m.id !== placingId;
      const slot = document.createElement('div');
      slot.className = 'slot' + (filled ? ' filled' : '');
      slot.id = 'slot-' + m.id;
      slot.style.cssText = 'left:' + l + '%;top:' + t + '%;transform:rotate(' + rot + 'deg)';
      slot.innerHTML =
        '<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>' +
        (m.scene || m.photoDataUrl
          ? '<button class="print" aria-label="' +
            (m.caption || m.title) +
            '">' +
            (filled ? memPrint(m) : '') +
            '</button>'
          : '');
      const pr = slot.querySelector('.print');
      if (pr)
        pr.onclick = () => {
          if (filled) {
            rereading = true;
            openMemory(m.id);
          } else if (m.activity) show(m.activity);
        };
      sheet.appendChild(slot);
    });
    const tags = $('tags');
    tags.innerHTML = '';
    book.memories.forEach((m, i) => {
      const b = document.createElement('button');
      const playable = !!m.activity;
      const isDone = playable && found[keys.indexOf(m.activity)] && m.id !== placingId;
      b.className = 'slip-tag ' + (slipSpots[i] || 't1') + (playable && !isDone ? ' open' : '') + (isDone ? ' done' : '');
      b.innerHTML =
        '<span>' + m.title + (playable && !isDone ? '<small>' + S.open + '</small>' : '') + '</span>';
      b.onclick = () => {
        if (isDone) {
          rereading = true;
          openMemory(m.id);
        } else if (playable) show(m.activity);
        else toast(S.comingSoon);
      };
      tags.appendChild(b);
    });
  }

  function placeMemory(id) {
    const m = memory(id);
    const slot = $('slot-' + id);
    const scr = $('screen').getBoundingClientRect();
    if (!m || !slot) {
      found[keys.indexOf(id)] = true;
      return;
    }
    const r = slot.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'flyer';
    fly.innerHTML = '<div class="print">' + memPrint(m) + '</div>';
    fly.style.cssText =
      'left:' +
      scr.width * 0.3 +
      'px;top:' +
      scr.height * 0.22 +
      'px;width:' +
      scr.width * 0.4 +
      'px;transform:rotate(-1.4deg)';
    $('screen').appendChild(fly);
    later(() => {
      fly.style.left = r.left - scr.left + 'px';
      fly.style.top = r.top - scr.top + 'px';
      fly.style.width = r.width + 'px';
      fly.style.transform = 'rotate(-1.6deg)';
    }, 450);
    later(() => {
      placingId = null;
      buildAlbum();
      fly.remove();
      const book = chapter(currentBook);
      toast(complete(book) ? S.bookFull : S.placed);
      if (found.every(Boolean)) later(() => show('ending'), 1600);
      // stay on the album page; the player taps BACK TO THE HOUSE when ready
    }, 2100);
  }

  function paintHouseWindows() {
    if (!hub) return;
    Object.entries(houseRooms).forEach(([room, activity]) => hub.setLit(room, found[keys.indexOf(activity)]));
  }

  function hubCaption() {
    const n = found.filter(Boolean).length;
    const el = $('hubCaption');
    if (!el) return;
    el.innerHTML =
      (n === 0
        ? 'What happened this week?'
        : n < keys.length
          ? 'What else do you remember from this week?'
          : 'The week is coming together') +
      '<span class="sub">' +
      (hub ? 'TAP A ROOM TO GO IN · ' : '') +
      n +
      ' OF ' + keys.length + ' WINDOWS LIT</span>';
  }

  function buildRooms() {
    hubCaption();
    paintHouseWindows();
    const box = $('rooms');
    if (!box || (hub && $('s-hub').classList.contains('is3d'))) {
      box && (box.innerHTML = '');
      return;
    }
    box.innerHTML = '';
    keys.forEach((k, i) => {
      const b = document.createElement('button');
      b.className = 'roomrow door-' + k + (found[i] ? ' found' : '');
      b.innerHTML =
        '<span class="n">' +
        (letter[i] ? letter[i].room : 'Today') +
        '</span><span class="s">' +
        (found[i] ? 'in the album' : 'tap to go there') +
        '</span>';
      b.onclick = () => {
        if (found[i]) {
          rereading = true;
          openMemory(keys[i]);
        } else show(keys[i]);
      };
      box.appendChild(b);
    });
  }

  async function ensureHub() {
    if (hub || hubFailed) return hub;
    if (new URLSearchParams(location.search).has('flat')) {
      hubFailed = true;
      return null;
    }
    try {
      const { createHub } = await import('./hub3d.js?v=merge3');
      hub = createHub({
        mount: $('hub3d'),
        kitchenBtn: $('kitchenBtn'),
        onRoom: (name) => enterHouseRoom(name)
      });
      $('s-hub').classList.add('is3d');
      $('hub3d').onpointermove = (e) => {
        const r = $('hub3d').getBoundingClientRect();
        if (!r.width || !r.height) return;
        hub.pointer(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * -2);
      };
      paintHouseWindows();
    } catch (err) {
      console.warn('3D house unavailable', err);
      hubFailed = true;
    }
    return hub;
  }

  // the same 3D house, lit up and still, behind the cover
  let introHub = null;
  async function ensureIntroHub() {
    if (introHub || hubFailed || new URLSearchParams(location.search).has('flat')) return;
    try {
      const { createHub } = await import('./hub3d.js?v=merge3');
      introHub = createHub({ mount: $('intro3d'), kitchenBtn: document.createElement('button'), onRoom() {}, shift: 0.2 });
      ['kitchen', 'porch', 'radio', 'attic', 'hall'].forEach((k) => introHub.setLit(k, true));
      introHub.setActive($('s-intro').classList.contains('on'));
      $('s-intro').classList.add('is3d');
      $('s-intro').onpointermove = (e) => {
        const r = $('s-intro').getBoundingClientRect();
        if (r.width && r.height) introHub.pointer(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * -2);
      };
    } catch (err) {
      console.warn('3D cover unavailable', err);
    }
  }

  async function enterHouseRoom(name) {
    if (hubMoving) return;
    const activity = houseRooms[name];
    if (!activity) return;
    const idx = keys.indexOf(activity);
    if (found[idx]) {
      rereading = true;
      openMemory(activity);
      return;
    }
    hubMoving = true;
    try {
      if (hub) {
        hubInside = true;
        await hub.glideIn(name);
      }
      show(activity);
    } finally {
      hubMoving = false;
    }
  }

  async function leaveHouse() {
    show('hub');
    if (hub && hubInside) {
      hubMoving = true;
      hub.setActive(true);
      try {
        await hub.glideOut();
      } finally {
        hubInside = false;
        hubMoving = false;
      }
    }
  }

  // inside a room, the top-left button goes back to the house instead of leaving
  const ROOMS = ['kitchen', 'radio', 'porch', 'attic', 'today'];
  let current = 'intro';
  const inRoom = () => ROOMS.includes(current);
  function back() {
    if (!inRoom()) return false;
    $('reveal').classList.remove('on');
    closeDayLog();
    rereading = false;
    leaveHouse();
    return true;
  }

  function show(name, keepFly) {
    current = name;
    const backBtn = document.getElementById('globalBack');
    if (backBtn) backBtn.textContent = inRoom() ? '← Back to the house' : '← Leave';
    if (name !== 'today') closeDayLog();
    placingId = null;
    hush();
    clearAll();
    if (!keepFly) document.querySelectorAll('#screen .bookfly').forEach((f) => f.remove());
    document.querySelectorAll('#screen .flyer').forEach((f) => f.remove());
    document.querySelectorAll('.scr').forEach((s) => s.classList.toggle('on', s.id === 's-' + name));
    if (keys.includes(name)) {
      roomT0 = stepT0 = performance.now();
      track('room_enter', name);
    }
    $('chrome').classList.toggle('on', name !== 'intro' && name !== 'ending');
    hub?.setActive(name === 'hub');
    introHub?.setActive(name === 'intro');
    document.querySelectorAll('#controls button').forEach((b) =>
      b.setAttribute('aria-current', b.dataset.jump === name ? 'true' : 'false')
    );
    if (name === 'shelf') {
      buildShelf();
      speak('Which album today? This week is open.');
    }
    if (name === 'hub') {
      ensureHub().then(() => {
        buildRooms();
        paintHouseWindows();
      });
      buildRooms();
      const n = found.filter(Boolean).length;
      speak(n === 0 ? 'What happened this week?' : n < keys.length ? 'What else do you remember from this week?' : 'The week is coming together');
    }
    if (name === 'album') {
      placingId = pendingPlace;
      buildAlbum();
      if (pendingPlace) {
        const id = pendingPlace;
        pendingPlace = null;
        placeMemory(id);
      } else {
        speak('These are this week’s pages.');
      }
    }
    if (name === 'intro') ensureIntroHub();
    if (name === 'intro') speak('This week is still here. Come in when you are ready.', 'warm');
    if (name === 'kitchen') initKitchen();
    if (name === 'radio') initRadio();
    if (name === 'porch') initPorch();
    if (name === 'attic') initAttic();
    if (name === 'today') initToday();
    if (name === 'ending') initEnding();
  }

  function playFamilyVoice(done) {
    const finish = () => {
      const w = $('mWave');
      if (w) w.classList.remove('on');
      if (done) done();
    };
    $('mWave').classList.add('on');
    hush();
    const url = pack.voice && pack.voice.audioDataUrl;
    const m = memory(viewing);
    const line = m && m.line;
    if (url) {
      familyAudio = new Audio(url);
      familyAudio.onended = finish;
      familyAudio.play().catch(() => {
        speak(line, 'letter', m && m.by).then(finish);
      });
      return;
    }
    speak(line, 'letter', m && m.by).then(finish);
  }

  function openMemory(id) {
    hush();
    const m = memory(id);
    viewing = id;
    $('mPrint').querySelector('.sepia').innerHTML = memPrint(m);
    $('mCap').textContent = m.caption || m.title;
    $('mLine').textContent = '“' + m.line + '”';
    $('mBy').textContent = 'recorded by ' + m.by;
    $('mWave').classList.remove('on');
    $('mDone').textContent = rereading ? S.closeMemory : S.putIn;
    const pr = $('mPrint');
    pr.classList.remove('developed');
    $('reveal').classList.add('on');
    later(() => pr.classList.add('developed'), 300);
    beginRead($('mPlay'), (done) => speak(m.line, 'letter', m.by).then(done));
  }

  function setSeat(el, state, who) {
    el.className = 'seat' + (state === 'target' ? ' target' : state === 'filled' ? ' filled' : '');
    if (state === 'filled') el.innerHTML = face(who);
    else if (state === 'target')
      el.innerHTML =
        '<span class="ring"><svg viewBox="0 0 100 100"><use href="#pencilring"></use></svg></span><span class="lbl">?</span>';
    else el.innerHTML = '<span class="lbl">empty</span>';
  }

  function kitchenPlan() {
    return (pack.rooms && pack.rooms.kitchen && pack.rooms.kitchen.rounds) || [];
  }

  function kitchenFaces() {
    const plan = kitchenPlan();
    const names = new Set();
    plan.forEach((r) => {
      names.add(r.who);
      Object.keys(r.hints || {}).forEach((n) => names.add(n));
    });
    (pack.people || []).forEach((p) => names.add(p.name));
    return [...names].slice(0, 3);
  }

  function initKitchen() {
    round = 0;
    setSeat($('seatL'), 'empty');
    setSeat($('seatC'), 'target');
    setSeat($('seatR'), 'empty');
    $('kSaid').hidden = true;
    $('kPhoto').hidden = true;
    $('kPhoto').classList.remove('on');
    $('kNext').classList.add('hide');
    const prompt = (pack.rooms.kitchen && pack.rooms.kitchen.prompt) || 'Who sat with you at lunch last Sunday?';
    $('kCap').innerHTML = prompt + '<span class="sub">SUNDAY · KITCHEN</span>';
    drawFaces(kitchenFaces());
    speak(prompt);
  }

  function drawFaces(list) {
    const row = $('kRow');
    row.innerHTML = '';
    list.forEach((n) => {
      const b = document.createElement('button');
      b.className = 'print';
      b.innerHTML = face(n) + '<div class="pname">' + n + '</div>';
      b.onclick = () => pick(n, b, list);
      row.appendChild(b);
    });
  }

  function said(t) {
    $('kSaidText').textContent = t;
    $('kSaid').hidden = false;
    speak(t, 'person');
  }

  function pick(n, btn, list) {
    const plan = kitchenPlan();
    const p = plan[round];
    if (!p) return;
    track('face_tap', 'kitchen', { person: p.who, chosen: n, correct: n === p.who, ms: since(stepT0) });
    if (n !== p.who) {
      btn.classList.add('marked');
      said((p.hints && p.hints[n]) || 'Try another face.');
      return;
    }
    setSeat($(p.seat), 'filled', n);
    stepT0 = performance.now(); // the next chair's clock starts now
    said(p.hello);
    drawFaces(list.filter((x) => x !== n));
    round++;
    if (round < plan.length) {
      setSeat($(plan[round].seat), 'target');
      $('kCap').innerHTML = 'And the next chair?<span class="sub">SUNDAY · KITCHEN</span>';
    } else {
      $('kCap').innerHTML = 'Everyone is home.<span class="sub">SUNDAY · KITCHEN</span>';
      // with everyone seated, what we ate that day comes to the table
      const photo = pack.rooms.kitchen && pack.rooms.kitchen.photoDataUrl;
      if (photo) {
        $('kPhoto').innerHTML = `<img src="${photo}" alt="">`;
        $('kPhoto').hidden = false;
        // let the hello be read first, then clear the bubble off the table
        later(() => {
          $('kSaid').hidden = true;
          $('kRow').innerHTML = '';
          $('kPhoto').classList.add('on');
        }, 2600);
      }
      later(() => $('kNext').classList.remove('hide'), 1200);
    }
  }

  function bands() {
    return [
      { t: 'Happy Times', clip: 'audio/radio/happy-times.mp3', clear: false },
      { t: 'One More Dance', clip: 'audio/radio/one-more-dance.mp3', clear: true },
      { t: 'Midnight Funk', clip: 'audio/radio/midnight-funk.mp3', clear: false },
      { t: 'Heartbeat', clip: 'audio/radio/heartbeat.mp3', clear: false }
    ];
  }

  function paintBand() {
    const list = bands();
    const b = list[bi];
    $('station').textContent = b.t;
    $('station').classList.toggle('clear', b.clear);
    $('keepSong').classList.toggle('hide', !b.clear);
    const prompt = (pack.rooms.radio && pack.rooms.radio.prompt) || 'Turn the dial until a song comes in';
    $('rCap').innerHTML =
      (b.clear ? 'This one was on in the car' : prompt) + '<span class="sub">TUESDAY · IN THE CAR</span>';
    if (window.HomeAgainVoice) {
      HomeAgainVoice.stop();
      HomeAgainVoice.radio(b.clip);
    }
  }

  // the needle sweeps across the dial: one fixed angle per station, from -60 to +60 degrees
  function needleAngle(i, n) {
    return n > 1 ? -60 + (120 * i) / (n - 1) : 0;
  }

  function tune(step) {
    const list = bands();
    bi = (bi + step + list.length) % list.length;
    const n = document.getElementById('needle');
    if (n) n.style.transform = 'rotate(' + needleAngle(bi, list.length) + 'deg)';
    paintBand();
  }

  function initRadio() {
    bi = 0;
    deg = 0;
    const n = document.getElementById('needle');
    if (n) n.style.transform = 'rotate(' + needleAngle(0, bands().length) + 'deg)';
    paintBand();
    speak((pack.rooms.radio && pack.rooms.radio.prompt) || 'Turn the dial until a song comes in');
  }

  function initPorch() {
    talking = false;
    $('mic').classList.remove('live');
    $('pHeard').textContent = 'tap the microphone and talk';
    $('pStamp').classList.add('hide');
    $('pFollow').classList.add('hide');
    $('porchTake').classList.add('hide');
    const porch = pack.rooms.porch || {};
    const prompt = porch.prompt || 'Tell me about this day';
    $('pCap').innerHTML = prompt + '<span class="sub">YESTERDAY · GARDEN</span>';
    speak(prompt);
    const print = $('porchPrint');
    if (porch.photoDataUrl) {
      print.innerHTML = `<img src="${porch.photoDataUrl}" alt=""><div class="pname">${porch.prompt || 'a memory'}</div>`;
    } else {
      const svgId = porch.svgId || 'sc-snow';
      print.innerHTML = `<svg viewBox="0 0 120 80"><use href="#${svgId}"></use></svg><div class="pname">yesterday</div>`;
    }
  }

  function finishPorch(heard) {
    if (porchStop) {
      const last = porchStop();
      porchStop = null;
      heard = heard || last;
    }
    if (talking) track('story_told', 'porch', { ms: since(stepT0), words: heard ? heard.trim().split(/\s+/).length : 0 });
    talking = false;
    $('mic').classList.remove('live');
    const story = (pack.rooms.porch && pack.rooms.porch.storyText) || '';
    $('pHeard').textContent = heard || story || 'Thank you.';
    $('pStamp').classList.remove('hide');
    $('pFollow').classList.remove('hide');
    $('pCap').innerHTML = 'Thank you for telling me<span class="sub">YESTERDAY · GARDEN</span>';
    speak('Thank you for telling me.');
    later(() => $('porchTake').classList.remove('hide'), 900);
  }

  let porchTalkId = 0;
  function porchTalk() {
    if (talking) {
      finishPorch();
      return;
    }
    talking = true;
    stepT0 = performance.now();
    $('mic').classList.add('live');
    $('pCap').innerHTML = 'I am listening. Tap again when you are done.<span class="sub">YESTERDAY · GARDEN</span>';
    $('pHeard').textContent = 'listening…';
    // wait for the spoken prompt to end so the mic never hears the app's own voice
    const talkId = ++porchTalkId;
    speak('I am listening.').then(() => {
      if (!talking || talkId !== porchTalkId) return;
      porchStop = HomeAgainVoice.listen(
      (text) => {
        if (text) $('pHeard').textContent = text;
      },
      () => {
        const story = (pack.rooms.porch && pack.rooms.porch.storyText) || 'We were happy together.';
        let i = 0;
        const step = () => {
          i += 2;
          $('pHeard').textContent = story.slice(0, i);
          if (i < story.length) later(step, 65);
          else finishPorch(story);
        };
        step();
      }
    );
    });
    later(() => {
      if (talking) finishPorch();
    }, 12000);
  }

  function atticPhotos() {
    return (pack.rooms.attic && pack.rooms.attic.photos) || [];
  }

  function drawAttic() {
    const pics = atticPhotos();
    const sh = $('shelf');
    sh.querySelectorAll('.mount').forEach((m) => m.remove());
    const lefts = ['0%', '39%', '78%'];
    for (let i = 0; i < 3; i++) {
      const m = document.createElement('div');
      m.className = 'mount ' + (atticSet[i] ? 'set' : i === atticSet.length ? 'next' : 'open');
      m.style.left = lefts[i];
      let inner = '<span class="num">' + (i + 1) + '</span>';
      if (atticSet[i]) {
        const pic = pics.find((p) => p.id === atticSet[i]) || pics[i];
        if (pic && pic.photoDataUrl) inner += `<img src="${pic.photoDataUrl}" alt="">`;
        else if (pic && pic.svgId)
          inner += `<svg viewBox="0 0 120 80"><use href="#${pic.svgId}"></use></svg>`;
      }
      m.innerHTML = inner;
      sh.appendChild(m);
    }
    const box = $('box');
    box.innerHTML = '';
    pics.slice(0, 3).forEach((p) => {
      const b = document.createElement('button');
      b.className = 'pick' + (atticSet.includes(p.id) ? ' gone' : '');
      if (p.photoDataUrl) b.innerHTML = `<img src="${p.photoDataUrl}" alt="${p.label || ''}">`;
      else
        b.innerHTML = `<svg viewBox="0 0 120 80"><use href="#${p.svgId || 'sc-lake'}"></use></svg>`;
      b.setAttribute('aria-label', p.label || 'photo');
      b.onclick = () => {
        if (atticSet.length < 3 && !atticSet.includes(p.id)) {
          atticSet.push(p.id);
          if (atticSet.length === 3) track('photos_ordered', 'attic', { ms: since(roomT0) });
          drawAttic();
        }
      };
      box.appendChild(b);
    });
    if (atticSet.length === 3) {
      $('aCap').innerHTML = 'That looks right<span class="sub">THIS WEEK · PHOTOGRAPHS</span>';
      later(() => $('atticTake').classList.remove('hide'), 700);
    } else {
      const prompt = (pack.rooms.attic && pack.rooms.attic.prompt) || 'Which one came first?';
      $('aCap').innerHTML = prompt + '<span class="sub">THIS WEEK · PHOTOGRAPHS</span>';
      $('atticTake').classList.add('hide');
    }
  }

  // tall photos (most phone pictures) get tall frames instead of being cut to a strip
  function fitAtticFrames() {
    const room = $('s-attic');
    const urls = atticPhotos().map((p) => p.photoDataUrl).filter(Boolean);
    room.classList.remove('tall');
    let seen = 0;
    let tall = 0;
    urls.forEach((u) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        seen++;
        if (img.naturalHeight > img.naturalWidth) tall++;
        if (seen === urls.length) room.classList.toggle('tall', tall * 2 > urls.length);
      };
      img.src = u;
    });
  }

  function initAttic() {
    atticSet = [];
    fitAtticFrames();
    drawAttic();
    speak((pack.rooms.attic && pack.rooms.attic.prompt) || 'Which one came first?');
  }

  // Today, in the hall: the family's pictures hang a little crooked. Each tap sets one
  // straight, brings it into colour, and that person says hello. Any order, nothing to get wrong.
  const tilts = [-9, 7, -5];

  function todayFaces() {
    return kitchenFaces();
  }

  // album photos the pack hangs in the hall (pack.rooms.today.photos), when the album has them
  function hallPhotos() {
    return ((pack.rooms && pack.rooms.today && pack.rooms.today.photos) || []).filter((p) => p.photoDataUrl);
  }

  // What hangs in the hall: those photos, each read out by its caption, or else the
  // family's portraits, each saying hello.
  function todayItems() {
    const photos = hallPhotos();
    if (photos.length) {
      return photos.map((p, i) => ({
        key: 'photo' + i,
        label: p.caption,
        pic: '<img src="' + p.photoDataUrl + '" alt="">',
        say: p.caption.charAt(0).toUpperCase() + p.caption.slice(1).replace(/[.!]*$/, '.'),
        role: 'warm'
      }));
    }
    return todayFaces().map((n) => ({ key: n, label: n, small: relationOf(n), pic: face(n), say: helloFor(n), role: 'person' }));
  }

  function setTodayCap(text) {
    const day = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    $('tCap').innerHTML = text + '<span class="sub">TODAY · ' + day + '</span>';
  }

  function helloFor(name) {
    const r = kitchenPlan().find((x) => x.who === name);
    if (r && r.hello) return r.hello;
    const call = pack.profile && (pack.profile.addressAs || pack.profile.preferredName);
    return name + ': "Hi' + (call ? ' ' + call : '') + ', it is me."';
  }

  function relationOf(name) {
    const rel = ((personByName(name) || {}).relation || '').trim();
    return !rel || /^your\b/i.test(rel) ? rel : 'your ' + rel;
  }

  function drawFrames() {
    const box = $('tFrames');
    box.innerHTML = '';
    todayItems().forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hframe';
      b.style.setProperty('--tilt', tilts[i % tilts.length] + 'deg');
      b.setAttribute('aria-label', 'Straighten the picture of ' + it.label);
      b.innerHTML =
        '<svg class="wire" viewBox="0 0 100 30" aria-hidden="true"><path d="M10 30L50 3L90 30"/><circle cx="50" cy="3" r="3"/></svg>' +
        '<span class="sway"><span class="pic">' + it.pic + '</span></span>';
      // captions come from the family, so they go in as text
      const who = document.createElement('span');
      who.className = 'who' + (it.small === undefined ? ' cap' : '');
      who.textContent = it.label;
      if (it.small) {
        const s = document.createElement('small');
        s.textContent = it.small;
        who.appendChild(s);
      }
      b.appendChild(who);
      b.onclick = () => straighten(it, b);
      box.appendChild(b);
    });
  }

  function todaySaid(t, role) {
    $('tSaidText').textContent = t;
    $('tSaid').hidden = false;
    speak(t, role || 'person');
  }

  function straighten(it, btn) {
    todaySaid(it.say, it.role); // tapping a straight picture again just says it again
    if (straightened.includes(it.key)) return;
    straightened.push(it.key);
    // a person's name when the picture is of family; never a photo's caption
    track('picture_straightened', 'today', { person: it.role === 'person' ? it.key : null, ms: since(stepT0) });
    stepT0 = performance.now();
    btn.classList.add('straight');
    btn.setAttribute('aria-label', 'Picture of ' + it.label);
    const left = todayItems().length - straightened.length;
    if (left > 0) {
      setTodayCap(left === 1 ? 'Just one more' : 'That one looks better');
      return;
    }
    setTodayCap(hallPhotos().length ? 'The pictures are straight again' : 'Everyone is here today');
    later(() => $('todayTake').classList.remove('hide'), 1200);
  }

  function initToday() {
    straightened = [];
    $('tSaid').hidden = true;
    $('todayTake').classList.add('hide');
    drawFrames();
    const t = (pack.rooms && pack.rooms.today) || {};
    if (!todayItems().length) {
      setTodayCap('The hall is quiet today');
      later(() => $('todayTake').classList.remove('hide'), 900);
      return;
    }
    setTodayCap(t.prompt || 'The pictures are a little crooked');
    speak((t.prompt || 'The pictures in the hall are a little crooked.') + ' Tap one to set it straight.');
  }

  // The day log, opened from the hall: the player's own note of what they did today,
  // said, tapped or typed, kept with the album so the family can read it. It opens
  // over the hall, so closing it leaves the pictures as they were.
  const DAY_CHIPS = ['I went for a walk', 'I had a good meal', 'I talked with family', 'I listened to music', 'I rested', 'I saw a friend'];
  let dayEntries = [];
  let dayStop = null;
  let dayLive = false;
  const localDay = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  async function journal(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error('journal ' + res.status);
    return (await res.json()).entries || [];
  }

  function drawDayLog() {
    const today = dayEntries.filter((e) => e.date === localDay());
    const list = $('dayLog');
    list.innerHTML = '';
    today.forEach((e) => {
      const li = document.createElement('li');
      const t = document.createElement('time');
      t.textContent = new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const s = document.createElement('span');
      s.textContent = e.text;
      const x = document.createElement('button');
      x.className = 'x';
      x.type = 'button';
      x.textContent = 'remove';
      x.setAttribute('aria-label', 'Remove ' + e.text);
      x.onclick = () => removeDay(e.id);
      li.append(t, s, x);
      list.appendChild(li);
    });
    $('dayEmpty').hidden = today.length > 0;
  }

  async function addDay(text, source) {
    text = (text || '').trim();
    if (!text) return;
    try {
      dayEntries = await journal('POST', '/api/journal', { text, source, date: localDay() });
    } catch (_) {
      dayEntries.push({ id: 'local' + Date.now(), date: localDay(), at: new Date().toISOString(), text, source });
    }
    drawDayLog();
    speak('I wrote that down.');
  }

  async function removeDay(id) {
    try {
      dayEntries = await journal('DELETE', '/api/journal/' + id);
    } catch (_) {
      dayEntries = dayEntries.filter((e) => e.id !== id);
    }
    drawDayLog();
  }

  function stopDayTalk() {
    dayLive = false;
    $('tTalk').textContent = 'TAP AND TALK';
    $('tTalk').classList.remove('live');
    if (!dayStop) return '';
    const last = dayStop();
    dayStop = null;
    return last;
  }

  function dayTalk() {
    if (dayLive) {
      const said = stopDayTalk() || $('tType').value;
      $('tType').value = '';
      addDay(said, 'voice');
      return;
    }
    dayLive = true;
    $('tTalk').textContent = 'I AM DONE';
    $('tTalk').classList.add('live');
    // wait for the spoken prompt to end so the mic never hears the app's own voice
    speak('I am listening.').then(() => {
      if (!dayLive) return;
      dayStop = HomeAgainVoice.listen(
        (text) => {
          if (text) $('tType').value = text;
        },
        () => {
          stopDayTalk();
          $('tType').focus();
        }
      );
    });
  }

  async function openDayLog() {
    hush();
    $('todaySheet').dataset.title =
      'TODAY · ' + new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    $('tType').value = '';
    drawDayLog();
    $('dayLogOvl').classList.add('on');
    speak('What did you do today?');
    try {
      dayEntries = await journal('GET', '/api/journal');
    } catch (_) {}
    drawDayLog();
  }

  function closeDayLog() {
    stopDayTalk();
    $('dayLogOvl').classList.remove('on');
  }

  function initEnding() {
    $('sheet').innerHTML = letter
      .map(
        (p, i) =>
          '<div class="ln" id="ln' + i + '">' + p.line + '<span>' + p.by + '</span></div>'
      )
      .join('');
    const callName = (pack.ending && pack.ending.callName) || letter[0].by;
    const call = $('calltile');
    call.innerHTML =
      '<span class="av">' +
      face(callName) +
      '</span>' +
      callName +
      ' is here now<button class="pressbtn red" id="sayHello" style="font-size:2.3cqw;padding:.9cqw 1.8cqw">SAY HELLO</button>';
    $('sayHello').onclick = () =>
      toggleRead($('sayHello'), (done) => speak('Hello, ' + callName + '. We are here with you.', 'warm').then(done));
    speak('This week is whole.');
  }

  function keepMemory(activity) {
    rereading = false;
    track('memory_kept', activity, { ms: since(roomT0) });
    found[keys.indexOf(activity)] = true; // counted now, so leaving mid-animation loses nothing
    paintHouseWindows();
    openMemory(activity);
  }

  function wireOnce() {
    if (started) return;
    started = true;

    document.querySelectorAll('#view-play [data-go]').forEach((b) => {
      const room = (b.closest('.scr') || {}).id?.slice(2);
      const skips = b.dataset.go === 'hub' && keys.includes(room) && /skip/.test(b.textContent);
      b.onclick = () => {
        if (skips) track('skip', room, { ms: since(roomT0) });
        if (b.dataset.go === 'hub') leaveHouse();
        else if (b.dataset.go === 'shelf' && !$('s-intro').classList.contains('on')) closeBook();
        else show(b.dataset.go);
      };
    });

    $('mPlay').onclick = () => toggleRead($('mPlay'), (done) => playFamilyVoice(done));
    $('mDone').onclick = () => {
      $('reveal').classList.remove('on');
      if (rereading) {
        rereading = false;
        leaveHouse();
        return;
      }
      pendingPlace = viewing;
      currentBook = (chapters.find((c) => c.memories.some((m) => m.id === viewing)) || chapter('week')).id;
      show('album');
    };
    $('restBtn').onclick = () => {
      track('rest', (document.querySelector('#screen .scr.on') || {}).id?.slice(2));
      $('rest').classList.add('on');
    };
    $('restKeep').onclick = () => $('rest').classList.remove('on');
    $('restHome').onclick = () => {
      $('rest').classList.remove('on');
      leaveHouse();
    };
    $('kNext').onclick = () => keepMemory('kitchen');
    $('tuneL').onclick = () => tune(-1);
    $('tuneR').onclick = () => tune(1);
    $('keepSong').onclick = () => keepMemory('radio');
    $('mic').onclick = porchTalk;
    $('porchTake').onclick = () => keepMemory('porch');
    $('atticTake').onclick = () => keepMemory('attic');
    $('todayTake').onclick = () => keepMemory('today');
    $('dayLogBtn').onclick = openDayLog;
    $('dayClose').onclick = closeDayLog;
    DAY_CHIPS.forEach((t) => {
      const c = document.createElement('button');
      c.className = 'chip';
      c.type = 'button';
      c.textContent = t;
      c.onclick = () => addDay(t, 'tap');
      $('tChips').appendChild(c);
    });
    const typed = () => {
      const v = $('tType').value;
      $('tType').value = '';
      addDay(v, 'typed');
    };
    $('tAdd').onclick = typed;
    $('tType').onkeydown = (e) => {
      if (e.key === 'Enter') typed();
    };
    $('tTalk').onclick = dayTalk;
    $('hearLetter').onclick = () =>
      toggleRead(
        $('hearLetter'),
        (done) => {
          clearAll();
          document.querySelectorAll('.sheet .ln').forEach((l) => l.classList.remove('say'));
          letter.forEach((p, i) =>
            later(() => {
              document.querySelectorAll('.sheet .ln').forEach((l) => l.classList.remove('say'));
              const el = $('ln' + i);
              if (el) el.classList.add('say');
              speak(p.line, 'letter', p.by);
            }, i * 4200)
          );
          later(() => {
            document.querySelectorAll('.sheet .ln').forEach((l) => l.classList.remove('say'));
            done();
          }, letter.length * 4200);
        },
        () => {
          clearAll();
          document.querySelectorAll('.sheet .ln').forEach((l) => l.classList.remove('say'));
        }
      );

    const debug = new URLSearchParams(location.search).has('debug');
    const controls = $('controls');
    const note = $('playNote');
    if (debug) {
      controls.classList.add('debug');
      note.classList.add('debug');
    }
    [
      ['intro', 'Cover'],
      ['shelf', 'Albums'],
      ['hub', 'This week'],
      ['album', 'Album page'],
      ['kitchen', 'Kitchen'],
      ['radio', 'Car'],
      ['porch', 'Garden'],
      ['attic', 'Photos'],
      ['today', 'Today'],
      ['ending', 'Ending']
    ].forEach(([k, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.jump = k;
      b.onclick = () => {
        $('reveal').classList.remove('on');
        $('rest').classList.remove('on');
        rereading = false;
        show(k);
      };
      controls.appendChild(b);
    });
    const rb = document.createElement('button');
    rb.textContent = 'Start over';
    rb.onclick = () => {
      found.fill(false);
      $('reveal').classList.remove('on');
      show('intro');
    };
    controls.appendChild(rb);
  }

  function start(nextPack) {
    pack = nextPack || HomeAgainPack.activePack();
    letter = (pack.letter || []).slice(0, 4);
    while (letter.length < 4) {
      letter.push({
        room: ['Sunday kitchen', 'Tuesday car', 'Garden', 'Photographs'][letter.length],
        line: 'We love you.',
        by: (pack.people && pack.people[0] && pack.people[0].name) || 'Family'
      });
    }
    found = keys.map(() => false);
    session = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    track('session_start', 'intro');
    rereading = false;
    pendingPlace = null;
    viewing = null;
    hubInside = false;
    hub?.reset();
    clearAll();
    $('reveal').classList.remove('on');
    $('rest').classList.remove('on');
    buildChapters();

    const who = pack.profile && pack.profile.preferredName;
    $('playSub').textContent = who
      ? `This week, with ${who}. Four memories in the album.`
      : 'Four memories in this week’s album.';

    if (window.HomeAgainVoice) {
      HomeAgainVoice.warm();
      HomeAgainVoice.preload();
    }
    wireOnce();
    show('intro');
  }

  global.HomeAgainPlay = { start, show, back };
})(window);
