(function (global) {
  const $ = (id) => document.getElementById(id);
  // every activity that keeps a memory: this week's five rooms, Today, Childhood, then Work
  const weekKeys = ['kitchen', 'radio', 'porch', 'attic', 'walk'];
  const workKeys = ['desk', 'phone', 'break', 'files'];
  const keys = ['kitchen', 'radio', 'porch', 'attic', 'walk', 'today', 'toybox', 'recipe', ...workKeys];
  const scenes = ['sc-table', 'sc-lake', 'sc-snow', 'sc-garden', 'sc-walk'];
  // The Childhood yard and the Today room are 3D places like the house. Each place has spots to go into.
  const placeRooms = { childhood: { treehouse: 'toybox', cottage: 'recipe' }, today: { letter: 'today', desk: 'journal' } };
  const placeScreen = { childhood: 'childhub', today: 'todayhub' };
  const placeOf = { toybox: 'childhood', recipe: 'childhood', today: 'today', journal: 'today' };
  // where the pictures sit on an album page: [left %, top %, turn in degrees, width %]
  const layout = {
    1: [[20, 12, -1, 60]],
    2: [[5, 20, -2, 43], [52, 24, 1.6, 43]],
    3: [[8, 10, -2, 34], [58, 8, 1.6, 34], [33, 52, 0.8, 34]],
    4: [[8, 9, -2, 34], [58, 8, 1.6, 34], [6, 50, 1.2, 34], [56, 50, -1.6, 34]]
  };
  const slipSpots = ['t1', 't4', 't2', 't5'];

  let pack = null;
  let letter = [];
  let memories = [];
  let chapters = [];
  let found = keys.map(() => false);
  let keptOrder = []; // the rooms kept today, in the order they were kept (one album page each)
  let placing = []; // memories whose photos are still flying into their slots, in order
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
  let phoneSeq = [];
  let started = false;
  let familyAudio = null;
  let porchStop = null;
  let hub = null;
  let hubFailed = false;
  let hubInside = false;
  let hubMoving = false;
  let office = null;
  let officeFailed = false;
  let officeInside = false;
  let officeMoving = false;
  const houseRooms = { kitchen: 'kitchen', radio: 'radio', porch: 'porch', attic: 'attic', hall: 'walk' };
  const officeRooms = { desk: 'desk', break: 'break', phone: 'phone', files: 'files' };
  const weekFound = () => weekKeys.filter((k) => found[keys.indexOf(k)]).length;
  const workFound = () => workKeys.filter((k) => found[keys.indexOf(k)]).length;

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
    const many = (m.photos || []).length > 1;
    if (many) return '<span class="collage" style="--n:' + m.photos.length + '">' + m.photos.map((u) => '<img src="' + u + '" alt="">').join('') + '</span>';
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
    reader = { btn, idle, cleanup, id };
    btn.classList.add('reading');
    btn.setAttribute('aria-pressed', 'true');
    btn.innerHTML = '<span class="stopico" aria-hidden="true"></span>' + (btn.classList.contains('hearbtn') ? 'stop' : 'STOP');
    run(() => {
      if (reader && reader.id === id) clearReader();
    });
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
      // every picture from the room goes onto its page, with the letter piece's own photo
      const photos = [...new Set([...roomPhotos(activity), mem.photoDataUrl].filter(Boolean))];
      return {
        id: activity,
        title: line.room || mem.title || activity,
        activity,
        scene: mem.svgId || scenes[i],
        photoDataUrl: photos[0] || null,
        photos,
        caption: mem.title || line.room,
        line: line.line,
        by: line.by
      };
    });
    chapters = [
      { id: 'childhood', title: 'Childhood', color: '#b8893a', memories: childMemories() },
      { id: 'school', title: 'School & young adult', color: '#5f7a58', memories: [{ id: 'yearbook', title: 'Yearbook' }] },
      { id: 'work', title: 'Work', color: '#44607d', memories: workMemories() },
      { id: 'week', title: 'This week', color: '#9c3b2e', memories },
      { id: 'today', title: 'Today', color: '#6d5262', memories: todayMemories() }
    ];
    currentBook = 'week';
  }

  // Childhood and the Wednesday walk: sample content. pack.rooms.toybox / recipe / walk can replace any of it,
  // so a family's own toys, dish, voices and places slot in without code changes.
  const childDefaults = {
    toybox: {
      prompt: 'Which toy do you remember?',
      caption: 'The toy box, long ago',
      line: 'Dad made you that wooden train himself, and you never let go of it.',
      by: 'Aunt Rose',
      toys: [
        { id: 'train', label: 'wooden train', line: 'Dad made that train from scrap wood. You would not let anyone else push it.' },
        { id: 'bear', label: 'teddy bear', line: 'Your bear had one ear chewed flat. You took him everywhere.' },
        { id: 'top', label: 'spinning top', line: 'You could make that top spin for ages. Dad timed you.' }
      ]
    },
    recipe: {
      prompt: 'What goes into Grandma’s apple cake?',
      caption: 'Grandma’s kitchen, a Sunday afternoon',
      line: 'Grandma always said the secret was a little extra cinnamon.',
      by: 'Aunt Rose',
      done: 'It is in the oven. It smells just like her kitchen.',
      ingredients: [
        { id: 'apples', label: 'apples', line: 'Grandma peeled them in one long curl.' },
        { id: 'flour', label: 'flour', line: 'Flour on your nose, every single time.' },
        { id: 'eggs', label: 'eggs', line: 'You were in charge of cracking them. Gently.' },
        { id: 'sugar', label: 'sugar', line: 'A little extra, and she never told Mom.' },
        { id: 'butter', label: 'butter', line: 'Soft butter, left out on the sill.' },
        { id: 'cinnamon', label: 'cinnamon', line: 'Her secret. You could smell it down the street.' }
      ]
    },
    walk: {
      prompt: 'What did you notice on Wednesday’s walk?',
      caption: 'The lane, Wednesday',
      line: 'You stopped to watch a robin on the fence. You said it looked like it was listening.',
      // x and y: where each thing sits in the picture, in percent
      spots: [
        { id: 'robin', label: 'the robin', x: 43.9, y: 58.5, line: 'A robin sat on the fence and watched you go by. You said hello to it.' },
        { id: 'bakery', label: 'the bakery', x: 80.5, y: 64, line: 'The bakery smelled like warm bread. You bought two rolls and kept one for later.' },
        { id: 'bench', label: 'the bench', x: 24.5, y: 72, line: 'You sat on the bench by the big tree for a while. Nobody hurried you.' }
      ]
    }
  };
  const childCfg = (k) => Object.assign({}, childDefaults[k], (pack && pack.rooms && pack.rooms[k]) || {});

  function childMemories() {
    const toy = childCfg('toybox');
    const rec = childCfg('recipe');
    return [
      { id: 'toybox', title: 'Toy box', activity: 'toybox', scene: 'sc-toys', photoDataUrl: toy.photoDataUrl || null, caption: toy.caption, line: toy.line, by: toy.by },
      { id: 'recipe', title: 'Recipe', activity: 'recipe', scene: 'sc-cake', photoDataUrl: rec.photoDataUrl || null, caption: rec.caption, line: rec.line, by: rec.by }
    ];
  }

  // the album photos a room shows while it is played (the table, the garden, the three in the attic)
  function roomPhotos(activity) {
    const r = (pack.rooms && pack.rooms[activity]) || {};
    if (activity === 'attic') return atticPhotos().map((p) => p.photoDataUrl);
    return [r.photoDataUrl];
  }

  function todayLetter() {
    const t = (pack.rooms && pack.rooms.today) || {};
    const by = t.by || ((pack.people || [])[0] && pack.people[0].name) || 'the family';
    const call = (pack.profile && (pack.profile.addressAs || pack.profile.preferredName)) || 'you';
    const fallback =
      window.HomeAgainPack && HomeAgainPack.todayLines
        ? HomeAgainPack.todayLines(call, pack.people)
        : [
            `Hi ${call}.`,
            'This morning you were already in your chair. The light was on your hands.',
            'You let the tea sit until it was kind. You always wait like that.',
            'Nothing loud happened. You were gentle with us anyway.',
            'That kindness is yours. It is still in the room.',
            'I am glad this day found you. I am glad I did too.'
          ];
    const stale = t.lines && t.lines[0] === 'Morning came in quiet.';
    const lines = !stale && t.lines && t.lines.length ? t.lines : fallback;
    return {
      prompt: stale || !t.prompt ? 'From this morning' : t.prompt,
      caption: t.caption || 'Today',
      by,
      lines,
      line: t.line || lines.join(' ')
    };
  }

  function todayMemory() {
    const L = todayLetter();
    const first = personByName(L.by) || (pack.people || [])[0];
    return {
      id: 'today',
      title: 'Today',
      activity: 'today',
      scene: 'sc-table',
      photoDataUrl: (first && first.photoDataUrl) || null,
      caption: L.caption,
      line: L.line,
      by: L.by
    };
  }

  function todayMemories() {
    return [todayMemory()];
  }

  function workLetter() {
    const people = pack.people || [];
    const p0 = (people[0] && people[0].name) || 'Alina';
    const p1 = (people[1] && people[1].name) || 'Christopher';
    const p2 = (people[2] && people[2].name) || 'Eason';
    const fallback = [
      { room: 'Your desk', line: 'Your badge still hangs by the lamp. ' + p1 + ' left it there so you would see it first.', by: p1 },
      { room: 'The phone', line: 'You called home at lunch. ' + p0 + ' picked up before the second ring.', by: p0 },
      { room: 'Break room', line: 'Your mug is the blue one. It has always been the blue one.', by: p0 },
      { room: 'The files', line: p2 + ' said today’s report goes in the out tray. You still remember that.', by: p2 }
    ];
    const custom = pack.workLetter;
    return workKeys.map((activity, i) => Object.assign({ activity }, fallback[i], (custom && custom[i]) || {}));
  }

  function workMemories() {
    const letter = workLetter();
    return workKeys.map((activity, i) => {
      const line = letter[i];
      const room = (pack.rooms && pack.rooms[activity]) || {};
      return {
        id: activity,
        title: line.room || room.title || activity,
        activity,
        scene: room.svgId || scenes[i],
        photoDataUrl: room.photoDataUrl || null,
        caption: room.caption || line.room,
        line: room.line || line.line,
        by: line.by
      };
    });
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
    hush();
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
      officeInside = false;
      if (id === 'childhood' || id === 'today') {
        places[id]?.reset();
        placeInside[id] = false;
        show(placeScreen[id], true);
      } else if (id === 'work') {
        show('office', true);
        office?.reset();
      } else {
        show('hub', true);
        hub?.reset();
      }
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
      officeInside = false;
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

  // The album is a book of pages: each room kept today gets its own page, in the order
  // it was kept, holding every picture from that room. The player flips between them.
  const pageAt = {}; // the page each book is open at
  let pageNow = []; // the pictures on the page being shown
  let turning = false;

  // the rooms a book has pages for, in the order they were kept
  const bookPages = (book) => keptOrder.filter((a) => book.memories.some((m) => m.activity === a));

  // one picture per photo: a week room's page shows all its photos; the Today page shows
  // each of the hall's photos (each its own memory, so tapping one reads its caption)
  function pageItems(book, activity) {
    return book.memories
      .filter((m) => m.activity === activity)
      .flatMap((m) => ((m.photos || []).length ? m.photos : [m.photoDataUrl || null]).map((src) => ({ m, src })))
      .map((it, i) => ({ ...it, key: 'p-' + activity + '-' + i }));
  }
  const itemPrint = (it) => (it.src ? '<img src="' + it.src + '" alt="">' : memPrint({ scene: it.m.scene }));

  function buildAlbum() {
    const book = chapter(currentBook);
    const sheet = $('sheetpg');
    const pages = bookPages(book);
    const at = Math.max(0, Math.min(pageAt[book.id] || 0, pages.length - 1));
    pageAt[book.id] = at;
    sheet.innerHTML = '';
    pageNow = pages.length ? pageItems(book, pages[at]) : [];
    const first = pageNow[0] && pageNow[0].m;
    const roomName = first ? (book.memories.filter((m) => m.activity === pages[at]).length > 1 ? book.title : first.title) : '';
    sheet.dataset.title = book.title.toUpperCase() + (roomName && roomName !== book.title ? ' · ' + roomName.toUpperCase() : '');
    if (!pages.length) {
      const empty = document.createElement('div');
      empty.className = 'emptypg';
      empty.textContent = 'Keep a memory from a room and its pictures start the first page.';
      sheet.appendChild(empty);
    }
    const spots = layout[pageNow.length] || layout[4];
    pageNow.forEach((it, i) => {
      const [l, t, rot, w] = spots[i] || spots[0];
      const filled = !placing.includes(it.key);
      const slot = document.createElement('div');
      slot.className = 'slot' + (filled ? ' filled' : '');
      slot.id = 'slot-' + it.key;
      slot.style.cssText = 'left:' + l + '%;top:' + t + '%;width:' + (w || 34) + '%;transform:rotate(' + rot + 'deg)';
      slot.innerHTML =
        '<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>' +
        '<button class="print" aria-label="' + (it.m.caption || it.m.title) + '">' + (filled ? itemPrint(it) : '') + '</button>';
      slot.querySelector('.print').onclick = () => {
        if (!slot.classList.contains('filled')) return;
        rereading = true;
        openMemory(it.m.id);
      };
      sheet.appendChild(slot);
    });
    // page turning: arrows, a count, and a swipe on the page
    $('pgPrev').hidden = $('pgNext').hidden = pages.length < 2;
    $('pgPrev').disabled = at === 0;
    $('pgNext').disabled = at >= pages.length - 1;
    $('pgCount').textContent = pages.length > 1 ? 'page ' + (at + 1) + ' of ' + pages.length : '';
    buildTags();
  }

  function turnPage(to) {
    const book = chapter(currentBook);
    const pages = bookPages(book);
    const from = pageAt[book.id] || 0;
    if (turning || placing.length || to < 0 || to >= pages.length || to === from) return;
    const sheet = $('sheetpg');
    const fwd = to > from;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) {
      pageAt[book.id] = to;
      buildAlbum();
      return;
    }
    // the page lifts on its spine, the next one lies down in its place
    turning = true;
    const flat = 'perspective(2400px) rotateY(0deg) rotate(-.5deg)';
    const edge = 'perspective(2400px) rotateY(' + (fwd ? -90 : 90) + 'deg) rotate(-.5deg)';
    const back = 'perspective(2400px) rotateY(' + (fwd ? 90 : -90) + 'deg) rotate(-.5deg)';
    sheet.style.transformOrigin = fwd ? 'left center' : 'right center';
    sheet.animate([{ transform: flat }, { transform: edge }], { duration: 320, easing: 'ease-in' }).onfinish = () => {
      pageAt[book.id] = to;
      buildAlbum();
      sheet.style.transformOrigin = fwd ? 'right center' : 'left center';
      sheet.animate([{ transform: back }, { transform: flat }], { duration: 380, easing: 'ease-out' }).onfinish = () => {
        sheet.style.transformOrigin = '';
        turning = false;
      };
    };
    speak('Page ' + (to + 1) + '.');
  }

  // a slot whose photo just landed: filled in place, so nothing else on the page redraws
  function fillSlot(it) {
    const slot = $('slot-' + it.key);
    const pr = slot && slot.querySelector('.print');
    if (!pr) return;
    pr.innerHTML = itemPrint(it);
    slot.classList.add('filled');
  }

  // a tag for each room of the book: a kept room opens its page, the others go to the room
  function buildTags() {
    const book = chapter(currentBook);
    const tags = $('tags');
    tags.innerHTML = '';
    const rooms = [...new Set(book.memories.filter((m) => m.activity).map((m) => m.activity))];
    const pages = bookPages(book);
    rooms.forEach((activity, i) => {
      const mems = book.memories.filter((m) => m.activity === activity);
      const title = mems.length > 1 ? book.title : mems[0].title;
      const isDone = found[keys.indexOf(activity)] && !placing.some((k) => k.startsWith('p-' + activity + '-'));
      const b = document.createElement('button');
      b.className = 'slip-tag ' + (slipSpots[i] || 't1') + (isDone ? ' done' : ' open');
      b.innerHTML = '<span>' + title + (isDone ? '' : '<small>' + S.open + '</small>') + '</span>';
      b.onclick = () => {
        if (isDone) turnPage(pages.indexOf(activity));
        else show(activity);
      };
      tags.appendChild(b);
    });
    // books that are not playable yet keep their quiet tags
    book.memories.filter((m) => !m.activity).forEach((m, j) => {
      const b = document.createElement('button');
      b.className = 'slip-tag ' + (slipSpots[rooms.length + j] || 't1');
      b.innerHTML = '<span>' + m.title + '</span>';
      b.onclick = () => toast(S.comingSoon);
      tags.appendChild(b);
    });
  }

  // A kept room's photos fade in over the middle of the page, then glide and turn into
  // their slots (transform only, so it stays smooth), one after another.
  function placeMemories(ids) {
    let left = ids.length;
    if (!left) return;
    ids.forEach((id, i) =>
      later(
        () =>
          placeMemory(id, () => {
            if (--left > 0) return;
            const book = chapter(currentBook);
            toast(complete(book) ? S.bookFull : S.placed);
            if (currentBook === 'week' && weekFound() === weekKeys.length) later(() => show('ending'), 1600);
            // stay on the album page; the player taps BACK TO THE HOUSE when ready
          }),
        i * 700
      )
    );
  }

  function placeMemory(key, done) {
    const it = pageNow.find((x) => x.key === key);
    const slot = $('slot-' + key);
    const sheet = $('sheetpg');
    if (!it || !slot) {
      placing = placing.filter((x) => x !== key);
      done();
      return;
    }
    // the flyer lives on the page, sized and turned exactly like its slot, so it lands
    // without a jump; it starts centred on the screen, larger and a little tilted
    const fly = document.createElement('div');
    fly.className = 'flyer';
    fly.style.left = slot.style.left;
    fly.style.top = slot.style.top;
    fly.style.width = slot.style.width;
    fly.innerHTML = '<div class="print">' + itemPrint(it) + '</div>';
    sheet.appendChild(fly);
    const scr = $('screen').getBoundingClientRect();
    const pg = sheet.getBoundingClientRect();
    const dx = scr.left + scr.width * 0.5 - (pg.left + fly.offsetLeft + fly.offsetWidth / 2);
    const dy = scr.top + scr.height * 0.42 - (pg.top + fly.offsetTop + fly.offsetHeight / 2);
    const big = (scr.width * 0.36) / fly.offsetWidth;
    const rot = (/rotate\(([-\d.]+)deg\)/.exec(slot.style.transform) || [0, 0])[1];
    const from = 'translate(' + dx + 'px,' + dy + 'px) scale(' + big + ') rotate(-2deg)';
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const img = fly.querySelector('img');
    const ready = img && img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    ready.then(() => {
      if (!fly.isConnected) return; // left the page meanwhile
      const glide = fly.animate(
        [
          { transform: from, opacity: 0, easing: 'ease-out' },
          { transform: from, opacity: 1, offset: 0.2, easing: 'cubic-bezier(.3, .1, .2, 1)' },
          { transform: 'rotate(' + rot + 'deg)', opacity: 1 }
        ],
        { duration: calm ? 0 : 1500, fill: 'forwards' }
      );
      glide.onfinish = () => {
        placing = placing.filter((x) => x !== key);
        fillSlot(it); // the slot's print fades in under the flyer...
        buildTags();
        fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: calm ? 0 : 450, delay: calm ? 0 : 250, fill: 'forwards' }).onfinish = () => {
          fly.remove(); // ...then the flyer fades away on top of it
          done();
        };
      };
    });
  }

  function paintHouseWindows() {
    if (!hub) return;
    Object.entries(houseRooms).forEach(([room, activity]) => hub.setLit(room, found[keys.indexOf(activity)]));
  }

  function paintOfficeWindows() {
    if (!office) return;
    Object.entries(officeRooms).forEach(([room, activity]) => office.setLit(room, found[keys.indexOf(activity)]));
  }

  function hubCaption() {
    const n = weekFound();
    const el = $('hubCaption');
    if (!el) return;
    el.innerHTML =
      (n === 0
        ? 'What happened this week?'
        : n < weekKeys.length
          ? 'What else do you remember from this week?'
          : 'The week is coming together') +
      '<span class="sub">' +
      (hub ? 'TAP A ROOM TO GO IN · ' : '') +
      n +
      ' OF ' + weekKeys.length + ' WINDOWS LIT</span>';
  }

  function officeCaption() {
    const n = workFound();
    const el = $('officeCaption');
    if (!el) return;
    el.innerHTML =
      (n === 0
        ? 'The office is still here'
        : n < workKeys.length
          ? 'What else do you remember from work?'
          : 'The office is coming together') +
      '<span class="sub">' +
      (office ? 'TAP A ROOM TO GO IN · ' : '') +
      n +
      ' OF ' + workKeys.length + ' WINDOWS LIT</span>';
  }

  function buildOfficeRooms() {
    officeCaption();
    paintOfficeWindows();
    const box = $('officeRooms');
    if (!box || (office && $('s-office').classList.contains('is3d'))) {
      box && (box.innerHTML = '');
      return;
    }
    box.innerHTML = '';
    workKeys.forEach((k) => {
      const i = keys.indexOf(k);
      const m = memory(k);
      const b = document.createElement('button');
      b.className = 'roomrow door-' + k + (found[i] ? ' found' : '');
      b.innerHTML =
        '<span class="n">' +
        (m ? m.title : k) +
        '</span><span class="s">' +
        (found[i] ? 'in the album' : 'tap to go there') +
        '</span>';
      b.onclick = () => {
        if (found[i]) {
          rereading = true;
          openMemory(k);
        } else show(k);
      };
      box.appendChild(b);
    });
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
    weekKeys.forEach((k, i) => {
      const b = document.createElement('button');
      b.className = 'roomrow door-' + k + (found[i] ? ' found' : '');
      b.innerHTML =
        '<span class="n">' +
        (letter[i] ? letter[i].room : k) +
        '</span><span class="s">' +
        (found[i] ? 'in the album' : 'tap to go there') +
        '</span>';
      b.onclick = () => {
        if (found[i]) {
          rereading = true;
          openMemory(k);
        } else show(k);
      };
      box.appendChild(b);
    });
  }

  async function ensureHub() {
    if (hub || hubFailed) return hub;
    if (new URLSearchParams(location.search).has('flat')) {
      hubFailed = true;
      $('s-hub').classList.add('no3d');
      return null;
    }
    try {
      const { createHub } = await import('./hub3d.js?v=todaybook');
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
      $('s-hub').classList.add('no3d'); // only now show the flat door list
    }
    return hub;
  }

  // the same 3D house, lit up and still, behind the cover
  let introHub = null;
  let introLoading = false;
  async function ensureIntroHub() {
    if (introHub || introLoading) return;
    if (hubFailed || new URLSearchParams(location.search).has('flat')) {
      $('s-intro').classList.add('no3d');
      return;
    }
    introLoading = true;
    try {
      const { createHub } = await import('./hub3d.js?v=todaybook');
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
      $('s-intro').classList.add('no3d'); // only now show the flat house
    }
    introLoading = false;
  }

  /* ---------- the Childhood yard and the Today room: 3D places like the house ---------- */
  const places = { childhood: null, today: null };
  const placeFailed = { childhood: false, today: false };
  const placeInside = { childhood: false, today: false };
  const placeMoving = { childhood: false, today: false };
  const placeMount = { childhood: 'childhub3d', today: 'todayhub3d' };

  async function ensurePlace(kind) {
    if (places[kind] || placeFailed[kind]) return places[kind];
    const sec = $(placeScreen[kind] ? 's-' + placeScreen[kind] : '');
    if (new URLSearchParams(location.search).has('flat')) {
      placeFailed[kind] = true;
      sec.classList.add('no3d');
      return null;
    }
    try {
      const { createPlace } = await import('./place3d.js?v=merge32');
      places[kind] = createPlace({ kind, mount: $(placeMount[kind]), onRoom: (name) => enterPlaceRoom(kind, name) });
      sec.classList.add('is3d');
      $(placeMount[kind]).onpointermove = (e) => {
        const r = $(placeMount[kind]).getBoundingClientRect();
        if (!r.width || !r.height) return;
        places[kind].pointer(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * -2);
      };
      places[kind].setActive(current === placeScreen[kind]);
      paintPlaceLights(kind);
    } catch (err) {
      console.warn('3D place unavailable', kind, err);
      placeFailed[kind] = true;
      sec.classList.add('no3d');
    }
    return places[kind];
  }

  function paintPlaceLights(kind) {
    const pl = places[kind];
    if (!pl) return;
    Object.entries(placeRooms[kind]).forEach(([room, activity]) => pl.setLit(room, keys.includes(activity) && found[keys.indexOf(activity)]));
  }

  const placeCaption = {
    childhood: ['Where did you play?', 'What else do you remember?', 'You remember it all'],
    today: ['What is today?', 'Anything else from today?', 'Today is in the album']
  };
  function drawPlace(kind) {
    const acts = Object.values(placeRooms[kind]).filter((a) => keys.includes(a));
    const n = acts.filter((a) => found[keys.indexOf(a)]).length;
    const line = placeCaption[kind][n === 0 ? 0 : n < acts.length ? 1 : 2];
    $(kind === 'childhood' ? 'childCaption' : 'todayCaption').innerHTML =
      line + '<span class="sub">' + (places[kind] ? 'TAP A PLACE TO GO IN' : 'CHOOSE A PLACE') + '</span>';
    paintPlaceLights(kind);
    if (placeFailed[kind]) drawPlaceList(kind); // no WebGL: plain buttons instead of the 3D place
    return line;
  }

  const placeLabels = {
    childhood: { treehouse: 'Toy box', cottage: 'Grandma’s kitchen' },
    today: { letter: 'The letter', desk: 'Your day' }
  };
  function drawPlaceList(kind) {
    const sec = $('s-' + placeScreen[kind]);
    let box = sec.querySelector('.list');
    if (!box) {
      box = document.createElement('div');
      box.className = 'list';
      sec.appendChild(box);
    }
    box.innerHTML = '';
    Object.keys(placeRooms[kind]).forEach((name) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'roomrow';
      b.innerHTML = '<span class="n">' + placeLabels[kind][name] + '</span>';
      b.onclick = () => enterPlaceRoom(kind, name);
      box.appendChild(b);
    });
  }

  async function enterPlaceRoom(kind, name) {
    if (placeMoving[kind]) return;
    const activity = placeRooms[kind][name];
    if (!activity) return;
    if (keys.includes(activity) && found[keys.indexOf(activity)]) {
      rereading = true;
      openMemory(activity);
      return;
    }
    placeMoving[kind] = true;
    try {
      if (places[kind]) {
        placeInside[kind] = true;
        await places[kind].glideIn(name);
      }
      show(activity);
    } finally {
      placeMoving[kind] = false;
    }
  }

  async function leavePlace(kind) {
    show(placeScreen[kind]);
    if (places[kind] && placeInside[kind]) {
      placeMoving[kind] = true;
      places[kind].setActive(true);
      try {
        await places[kind].glideOut();
      } finally {
        placeInside[kind] = false;
        placeMoving[kind] = false;
      }
    }
  }

  async function ensureOffice() {
    if (office || officeFailed) return office;
    if (new URLSearchParams(location.search).has('flat')) {
      officeFailed = true;
      $('s-office').classList.add('no3d');
      return null;
    }
    try {
      const { createOffice } = await import('./office3d.js?v=album2');
      office = createOffice({
        mount: $('office3d'),
        deskBtn: $('deskBtn'),
        onRoom: (name) => enterOfficeRoom(name),
        onAlbum: () => {
          currentBook = 'work';
          show('album');
        }
      });
      $('s-office').classList.add('is3d');
      $('office3d').onpointermove = (e) => {
        const r = $('office3d').getBoundingClientRect();
        if (!r.width || !r.height) return;
        office.pointer(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * -2);
      };
      paintOfficeWindows();
    } catch (err) {
      console.warn('3D office unavailable', err);
      officeFailed = true;
      $('s-office').classList.add('no3d');
    }
    return office;
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

  async function enterOfficeRoom(name) {
    if (officeMoving) return;
    const activity = officeRooms[name];
    if (!activity) return;
    const idx = keys.indexOf(activity);
    if (found[idx]) {
      rereading = true;
      openMemory(activity);
      return;
    }
    hush();
    officeMoving = true;
    try {
      if (office) {
        officeInside = true;
        await office.glideIn(name);
      }
      show(activity);
    } finally {
      officeMoving = false;
    }
  }

  async function leaveOffice() {
    show('office');
    if (office && officeInside) {
      officeMoving = true;
      office.setActive(true);
      try {
        await office.glideOut();
      } finally {
        officeInside = false;
        officeMoving = false;
      }
    }
  }

  function leaveAlbumHub() {
    if (currentBook === 'work') leaveOffice();
    else if (currentBook === 'childhood') leavePlace('childhood');
    else if (currentBook === 'today') leavePlace('today');
    else leaveHouse();
  }

  // inside a room, the top-left button goes back to the house instead of leaving
  const ROOMS = ['kitchen', 'radio', 'porch', 'attic', 'walk', 'today', ...workKeys];
  let current = 'intro';
  const inRoom = () => ROOMS.includes(current) || !!placeOf[current];
  function back() {
    if (!inRoom()) return false;
    $('reveal').classList.remove('on');
    closeDayLog();
    rereading = false;
    if (placeOf[current]) leavePlace(placeOf[current]);
    else if (workKeys.includes(current)) leaveOffice();
    else leaveHouse();
    return true;
  }

  function show(name, keepFly) {
    current = name;
    const backBtn = document.getElementById('globalBack');
    if (backBtn) {
      backBtn.textContent = workKeys.includes(current)
        ? '← Back to the office'
        : placeOf[current]
          ? placeOf[current] === 'childhood' ? '← Back to childhood' : '← Back to today'
          : inRoom() ? '← Back to the house' : '← Leave';
    }
    if (name !== 'journal') closeDayLog();
    placing = [];
    hush();
    clearAll();
    if (!keepFly) document.querySelectorAll('#screen .bookfly').forEach((f) => f.remove());
    document.querySelectorAll('#screen .flyer').forEach((f) => f.remove());
    document.querySelectorAll('.scr').forEach((s) => s.classList.toggle('on', s.id === 's-' + name));
    if (keys.includes(name) || name === 'journal') {
      roomT0 = stepT0 = performance.now();
      track('room_enter', name);
    }
    $('chrome').classList.toggle('on', name !== 'intro' && name !== 'ending');
    hub?.setActive(name === 'hub');
    office?.setActive(name === 'office');
    introHub?.setActive(name === 'intro');
    places.childhood?.setActive(name === 'childhub');
    places.today?.setActive(name === 'todayhub');
    document.querySelectorAll('#controls button').forEach((b) =>
      b.setAttribute('aria-current', b.dataset.jump === name ? 'true' : 'false')
    );
    if (name === 'childhub' || name === 'todayhub') {
      const kind = name === 'childhub' ? 'childhood' : 'today';
      ensurePlace(kind).then(() => drawPlace(kind));
      speak(drawPlace(kind));
    }
    if (name === 'shelf') {
      ensurePlace('childhood'); // load both places now, so nothing flashes when a book opens
      ensurePlace('today');
      buildShelf();
      speak('Which album today? This week is open.');
    }
    if (name === 'hub') {
      ensureHub().then(() => {
        buildRooms();
        paintHouseWindows();
      });
      buildRooms();
      const n = weekFound();
      speak(n === 0 ? 'What happened this week?' : n < weekKeys.length ? 'What else do you remember from this week?' : 'The week is coming together');
    }
    if (name === 'office') {
      ensureOffice().then(() => {
        buildOfficeRooms();
        paintOfficeWindows();
      });
      buildOfficeRooms();
      const n = workFound();
      speak(n === 0 ? 'The office is still here.' : n < workKeys.length ? 'What else do you remember from work?' : 'The office is coming together');
    }
    if (name === 'album') {
      const albumBack = $('albumBack');
      if (albumBack) {
        if (currentBook === 'today') {
          albumBack.dataset.go = 'todayhub';
          albumBack.textContent = 'BACK TO TODAY';
        } else if (currentBook === 'childhood') {
          albumBack.dataset.go = 'childhub';
          albumBack.textContent = 'BACK TO CHILDHOOD';
        } else if (currentBook === 'work') {
          albumBack.dataset.go = 'office';
          albumBack.textContent = 'BACK TO THE OFFICE';
        } else {
          albumBack.dataset.go = 'hub';
          albumBack.textContent = 'BACK TO THE HOUSE';
        }
      }
      // a room just kept: open at its page and fly all its pictures in
      const kept = pendingPlace && memory(pendingPlace);
      const book = chapter(currentBook);
      placing = [];
      if (kept) {
        pageAt[book.id] = bookPages(book).indexOf(kept.activity);
        placing = pageItems(book, kept.activity).map((it) => it.key);
      }
      buildAlbum();
      if (pendingPlace) {
        pendingPlace = null;
        placeMemories(placing.slice());
      } else {
        speak(
          currentBook === 'today'
            ? 'From this morning.'
            : currentBook === 'childhood'
              ? 'These are your childhood pages.'
              : currentBook === 'work'
                ? 'These are the work pages.'
                : 'These are this week’s pages.'
        );
      }
    }
    if (name === 'intro') ensureIntroHub();
    if (name === 'intro') speak('This week is still here. Come in when you are ready.', 'warm');
    if (name === 'kitchen') initKitchen();
    if (name === 'radio') initRadio();
    if (name === 'porch') initPorch();
    if (name === 'attic') initAttic();
    if (name === 'today') initToday();
    if (name === 'journal') initJournal();
    if (name === 'toybox') initToybox();
    if (name === 'recipe') initRecipe();
    if (name === 'walk') initWalk();
    if (name === 'desk') initDesk();
    if (name === 'phone') initPhone();
    if (name === 'break') initBreak();
    if (name === 'files') initFiles();
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
    $('keepSong').classList.remove('hide'); // any song can be kept, not only the one from the car
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

  // the day the game treats as today: the pack's asOf (YYYY-MM-DD), or the real date
  function gameDay() {
    return pack && /^\d{4}-\d{2}-\d{2}$/.test(pack.asOf || '') ? new Date(pack.asOf + 'T12:00') : new Date();
  }

  // the room's photos, oldest first when they carry album dates (that is the right order)
  function atticPhotos() {
    const pics = ((pack.rooms.attic && pack.rooms.attic.photos) || []).slice(0, 3);
    return pics.every((p) => p.date) ? pics.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) : pics;
  }
  const dated = () => atticPhotos().every((p) => p.date);
  const shortDate = (d) => new Date(d + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  let atticDeal = []; // the order the photos lie in the box, shuffled so the box gives nothing away

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
        if (pic && pic.date) inner += `<span class="when">${shortDate(pic.date)}</span>`;
        else if (pic && pic.svgId)
          inner += `<svg viewBox="0 0 120 80"><use href="#${pic.svgId}"></use></svg>`;
      }
      m.innerHTML = inner;
      sh.appendChild(m);
    }
    const box = $('box');
    box.innerHTML = '';
    atticDeal.map((id) => pics.find((p) => p.id === id)).filter(Boolean).forEach((p) => {
      const b = document.createElement('button');
      b.className = 'pick' + (atticSet.includes(p.id) ? ' gone' : '');
      if (p.photoDataUrl) b.innerHTML = `<img src="${p.photoDataUrl}" alt="${p.label || ''}">`;
      else
        b.innerHTML = `<svg viewBox="0 0 120 80"><use href="#${p.svgId || 'sc-lake'}"></use></svg>`;
      b.setAttribute('aria-label', p.label || 'photo');
      b.onclick = () => {
        if (atticSet.length < 3 && !atticSet.includes(p.id)) {
          // dated photos go back in the order they happened; a later one is set aside gently
          if (dated() && p.id !== pics[atticSet.length].id) {
            b.classList.remove('later');
            void b.offsetWidth;
            b.classList.add('later');
            const say = 'That one came a little later.';
            $('aCap').innerHTML = say + '<span class="sub">THIS WEEK · PHOTOGRAPHS</span>';
            speak(say);
            return;
          }
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
    atticDeal = atticPhotos().map((p) => p.id);
    if (dated()) {
      // shuffle until it is not already in order
      for (let n = 0; n < 6 && atticDeal.every((id, i) => id === atticPhotos()[i].id); n++) {
        atticDeal.sort(() => Math.random() - 0.5);
      }
    }
    fitAtticFrames();
    drawAttic();
    speak((pack.rooms.attic && pack.rooms.attic.prompt) || 'Which one came first?');
  }

  function setTodayCap(text) {
    const day = gameDay().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    $('tCap').innerHTML = text + '<span class="sub">TODAY · ' + day + '</span>';
  }

  function paintTodayLetter() {
    const L = todayLetter();
    const box = $('todayLetter');
    box.innerHTML = '';
    L.lines.forEach((line, i) => {
      const d = document.createElement('div');
      d.className = 'ln';
      d.id = 'tdln' + i;
      d.textContent = line;
      box.appendChild(d);
    });
    const from = document.createElement('div');
    from.className = 'ln';
    const who = document.createElement('span');
    who.textContent = L.by;
    from.appendChild(who);
    box.appendChild(from);
  }

  function hearTodayLetter() {
    const L = todayLetter();
    const lines = L.lines;
    const id = reader && reader.id;
    return (async () => {
      for (let i = 0; i < lines.length; i++) {
        if (!reader || reader.id !== id) return;
        document.querySelectorAll('#todayLetter .ln').forEach((el) => el.classList.remove('say'));
        const el = $('tdln' + i);
        if (el) el.classList.add('say');
        await speak(lines[i], 'letter', L.by);
      }
      if (!reader || reader.id !== id) return;
      document.querySelectorAll('#todayLetter .ln').forEach((el) => el.classList.remove('say'));
      $('todayTake').classList.remove('hide');
    })();
  }

  function initToday() {
    $('todayTake').classList.add('hide');
    paintTodayLetter();
    const L = todayLetter();
    setTodayCap(L.prompt);
    later(() => {
      toggleRead($('hearToday'), (done) => hearTodayLetter().then(done), () => {
        document.querySelectorAll('#todayLetter .ln').forEach((el) => el.classList.remove('say'));
      });
    }, 500);
  }

  // The day log, opened from the hall: the player's own note of what they did today,
  // said, tapped or typed, kept with the album so the family can read it. It opens
  // over the hall, so closing it leaves the letter as it was.
  const DAY_CHIPS = ['I went for a walk', 'I had a good meal', 'I talked with family', 'I listened to music', 'I rested', 'I saw a friend'];
  let dayEntries = [];
  let dayStop = null;
  let dayLive = false;
  const localDay = () => {
    const d = gameDay();
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
      'TODAY · ' + gameDay().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
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

  /* ---------- childhood: the toy box ---------- */
  let toyHeard = new Set();
  const toyIcon = (id) => (document.getElementById('toy-' + id) ? 'toy-' + id : 'toy-ball');

  function drawToys() {
    const c = childCfg('toybox');
    const row = $('toyRow');
    row.innerHTML = '';
    c.toys.slice(0, 3).forEach((toy) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'print toy' + (toyHeard.has(toy.id) ? ' picked' : '');
      b.innerHTML = '<svg viewBox="0 0 100 80"><use href="#' + toyIcon(toy.id) + '"></use></svg><div class="pname">' + toy.label + '</div>';
      b.onclick = () => tapToy(toy);
      row.appendChild(b);
    });
  }

  function initToybox() {
    const c = childCfg('toybox');
    toyHeard = new Set();
    $('toyCap').innerHTML = c.prompt + '<span class="sub">CHILDHOOD · THE TOY BOX</span>';
    $('toySaid').hidden = true;
    $('toyKeep').classList.add('hide');
    drawToys();
    speak(c.prompt);
  }

  // every toy is a good answer: it lifts out, and someone who was there tells its story
  function tapToy(toy) {
    const c = childCfg('toybox');
    toyHeard.add(toy.id);
    track('toy_tap', 'toybox', { toy: toy.id, ms: since(stepT0) });
    stepT0 = performance.now();
    $('toySaidText').textContent = toy.line;
    $('toySaid').hidden = false;
    speak(toy.line, 'person', c.by);
    drawToys();
    if (toyHeard.size >= 2) later(() => $('toyKeep').classList.remove('hide'), 1200);
    if (toyHeard.size >= c.toys.slice(0, 3).length) {
      $('toyCap').innerHTML = 'That is the whole toy box.<span class="sub">CHILDHOOD · THE TOY BOX</span>';
    }
  }

  /* ---------- childhood: Grandma's apple cake ---------- */
  let bowl = [];
  let ingQueue = [];
  const ingIcon = (id) => (document.getElementById('ing-' + id) ? 'ing-' + id : 'ing-flour');

  function drawBowl() {
    $('bowlFill').innerHTML = bowl
      .map((ing, i) => '<svg viewBox="0 0 100 80" style="--r:' + (i % 2 ? 1 : -1) * (6 + i * 3) + 'deg"><use href="#' + ingIcon(ing.id) + '"></use></svg>')
      .join('');
  }

  function drawIngredients() {
    const row = $('recRow');
    row.innerHTML = '';
    ingQueue.slice(0, 3).forEach((ing) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'print ing';
      b.innerHTML = '<svg viewBox="0 0 100 80"><use href="#' + ingIcon(ing.id) + '"></use></svg><div class="pname">' + ing.label + '</div>';
      b.onclick = () => addIngredient(ing);
      row.appendChild(b);
    });
  }

  function initRecipe() {
    const c = childCfg('recipe');
    bowl = [];
    ingQueue = c.ingredients.slice();
    $('recCap').innerHTML = c.prompt + '<span class="sub">CHILDHOOD · GRANDMA’S KITCHEN</span>';
    $('recSaid').hidden = true;
    $('recKeep').classList.add('hide');
    drawBowl();
    drawIngredients();
    speak(c.prompt);
  }

  // any three ingredients make the cake: however feels right, nothing to get wrong
  function addIngredient(ing) {
    const c = childCfg('recipe');
    ingQueue = ingQueue.filter((x) => x.id !== ing.id);
    bowl.push(ing);
    track('ingredient_tap', 'recipe', { ingredient: ing.id, ms: since(stepT0) });
    stepT0 = performance.now();
    drawBowl();
    $('recSaidText').textContent = ing.line;
    $('recSaid').hidden = false;
    speak(ing.line, 'person', c.by);
    if (bowl.length >= 3) {
      $('recRow').innerHTML = '';
      $('recCap').innerHTML = c.done + '<span class="sub">CHILDHOOD · GRANDMA’S KITCHEN</span>';
      later(() => $('recKeep').classList.remove('hide'), 1400);
    } else {
      drawIngredients();
    }
  }

  /* ---------- Wednesday's walk: look around the lane, tap what you remember ---------- */
  let walkSeen = new Set();

  function drawSpots() {
    const c = childCfg('walk');
    const box = $('walkSpots');
    box.innerHTML = '';
    c.spots.slice(0, 3).forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'spot' + (walkSeen.has(s.id) ? ' seen' : '');
      b.style.left = s.x + '%';
      b.style.top = s.y + '%';
      b.setAttribute('aria-label', s.label);
      b.innerHTML = '<span class="ring"></span><span class="tag">' + s.label + '</span>';
      b.onclick = () => tapSpot(s);
      box.appendChild(b);
    });
  }

  function initWalk() {
    const c = childCfg('walk');
    walkSeen = new Set();
    $('walkCap').innerHTML = c.prompt + '<span class="sub">WEDNESDAY · THE WALK</span>';
    $('walkSaid').hidden = true;
    $('walkKeep').classList.add('hide');
    drawSpots();
    speak(c.prompt);
  }

  // every spot is worth a story; nothing to find wrong
  function tapSpot(s) {
    const c = childCfg('walk');
    walkSeen.add(s.id);
    track('spot_tap', 'walk', { spot: s.id, ms: since(stepT0) });
    stepT0 = performance.now();
    $('walkSaidText').textContent = s.line;
    $('walkSaid').hidden = false;
    speak(s.line, 'person', (pack.people && pack.people[0] && pack.people[0].name) || undefined);
    drawSpots();
    if (walkSeen.size >= 2) later(() => $('walkKeep').classList.remove('hide'), 1200);
    if (walkSeen.size >= c.spots.slice(0, 3).length) {
      $('walkCap').innerHTML = 'What a good walk.<span class="sub">WEDNESDAY · THE WALK</span>';
    }
  }

  /* ---------- today: your day, the journal ---------- */
  function initJournal() {
    $('jrnCap').innerHTML = 'Your day<span class="sub">TODAY · ' + gameDay().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() + '</span>';
    later(openDayLog, 450);
  }

  function sayWork(saidId, textId, text) {
    const box = $(saidId);
    const el = $(textId);
    if (box && el) {
      el.textContent = text;
      box.hidden = false;
    }
    speak(text);
  }

  function whoName(i, fallback) {
    return ((pack.people || [])[i] && pack.people[i].name) || fallback;
  }

  function initDesk() {
    $('deskTake').classList.add('hide');
    $('dSaid').hidden = true;
    const you = (pack.profile && (pack.profile.addressAs || pack.profile.preferredName)) || 'you';
    const badges = (pack.rooms && pack.rooms.desk && pack.rooms.desk.badges) || [
      { id: 'other1', label: whoName(1, 'Chris'), mine: false, say: 'That is ' + whoName(1, 'Chris') + '’s badge.' },
      { id: 'mine', label: you, mine: true, say: 'That is yours. Hang it on the hook.' },
      { id: 'other2', label: whoName(0, 'Alina'), mine: false, say: 'That is ' + whoName(0, 'Alina') + '’s. Yours is the other one.' }
    ];
    const box = $('deskBadges');
    box.innerHTML = '';
    badges.forEach((item) => {
      const b = document.createElement('button');
      b.className = 'wcard';
      b.type = 'button';
      b.innerHTML = '<small>ID</small><span>' + item.label + '</span>';
      b.onclick = () => {
        box.querySelectorAll('.wcard').forEach((el) => el.classList.remove('found', 'clear'));
        b.classList.add(item.mine ? 'clear' : 'found');
        sayWork('dSaid', 'dSaidText', item.say);
        if (item.mine) {
          track('badge_found', 'desk', { ms: since(roomT0) });
          $('deskTake').classList.remove('hide');
        }
      };
      box.appendChild(b);
    });
    const prompt = (pack.rooms && pack.rooms.desk && pack.rooms.desk.prompt) || 'Find your badge and hang it up';
    $('dCap').innerHTML = prompt + '<span class="sub">WORK · THE DESK</span>';
    speak(prompt);
  }

  function paintDialed(code) {
    const el = $('phoneDialed');
    el.textContent = phoneSeq.map((n) => n).join(' · ') || '—';
    el.classList.toggle('ok', phoneSeq.length === code.length && phoneSeq.every((n, i) => n === code[i]));
  }

  function initPhone() {
    phoneSeq = [];
    $('phoneTake').classList.add('hide');
    $('phSaid').hidden = true;
    const code = (pack.rooms && pack.rooms.phone && pack.rooms.phone.code) || [3, 1, 2];
    $('dialNote').textContent = 'Home is ' + code.join(', then ');
    const prompt = (pack.rooms && pack.rooms.phone && pack.rooms.phone.prompt) || 'Call home. The number is on the note';
    $('phCap').innerHTML = prompt + '<span class="sub">WORK · THE PHONE</span>';
    const box = $('phoneDial');
    box.innerHTML = '';
    [1, 2, 3, 4].forEach((n) => {
      const b = document.createElement('button');
      b.className = 'wdial-key';
      b.type = 'button';
      b.textContent = String(n);
      b.onclick = () => {
        const next = code[phoneSeq.length];
        if (n !== next) {
          phoneSeq = [];
          paintDialed(code);
          $('phoneTake').classList.add('hide');
          sayWork('phSaid', 'phSaidText', 'Not that one. Start again from the note.');
          return;
        }
        phoneSeq.push(n);
        paintDialed(code);
        if (phoneSeq.length === code.length) {
          sayWork('phSaid', 'phSaidText', 'That is home. They will hear you.');
          track('dialed_home', 'phone', { ms: since(roomT0) });
          $('phoneTake').classList.remove('hide');
        } else {
          sayWork('phSaid', 'phSaidText', 'Yes. The next number is on the note.');
        }
      };
      box.appendChild(b);
    });
    paintDialed(code);
    speak(prompt);
  }

  function initBreak() {
    $('breakTake').classList.add('hide');
    $('bSaid').hidden = true;
    const mugs = (pack.rooms && pack.rooms.break && pack.rooms.break.mugs) || [
      { id: 'white', label: 'the white mug', mine: false, say: 'That one is for visitors.' },
      { id: 'blue', label: 'the blue mug', mine: true, say: 'The blue one. That has always been yours.' },
      { id: 'red', label: 'the red mug', mine: false, say: 'That is the office mug. Yours is blue.' }
    ];
    const box = $('breakMugs');
    box.innerHTML = '';
    mugs.forEach((mug) => {
      const b = document.createElement('button');
      b.className = 'wmug ' + mug.id;
      b.type = 'button';
      b.textContent = mug.label;
      b.onclick = () => {
        box.querySelectorAll('.wmug').forEach((el) => el.classList.remove('found', 'clear'));
        b.classList.add(mug.mine ? 'clear' : 'found');
        sayWork('bSaid', 'bSaidText', mug.say);
        if (mug.mine) {
          track('mug_found', 'break', { ms: since(roomT0) });
          $('breakTake').classList.remove('hide');
        }
      };
      box.appendChild(b);
    });
    const prompt = (pack.rooms && pack.rooms.break && pack.rooms.break.prompt) || 'Which mug is yours?';
    $('bCap').innerHTML = prompt + '<span class="sub">WORK · BREAK ROOM</span>';
    speak(prompt);
  }

  function initFiles() {
    $('filesTake').classList.add('hide');
    const trays = [
      { id: 'in', label: 'IN', say: 'That tray is for mail coming in.' },
      { id: 'hold', label: 'HOLD', say: 'Hold is for later. Today’s report goes out.' },
      { id: 'out', label: 'OUT', say: 'Yes. Out. That is where today’s report goes.' }
    ];
    const box = $('fileTrays');
    box.innerHTML = '';
    trays.forEach((tray) => {
      const b = document.createElement('button');
      b.className = 'wtray';
      b.type = 'button';
      b.textContent = tray.label;
      b.onclick = () => {
        box.querySelectorAll('.wtray').forEach((el) => el.classList.remove('found', 'clear'));
        b.classList.add(tray.id === 'out' ? 'clear' : 'found');
        $('fCap').innerHTML = tray.say + '<span class="sub">WORK · THE FILES</span>';
        speak(tray.say);
        if (tray.id === 'out') {
          $('workReport').classList.add('sent');
          track('report_out', 'files', { ms: since(roomT0) });
          $('filesTake').classList.remove('hide');
        }
      };
      box.appendChild(b);
    });
    $('workReport').classList.remove('sent');
    const prompt = (pack.rooms && pack.rooms.files && pack.rooms.files.prompt) || 'Today’s report goes in the out tray';
    $('fCap').innerHTML = prompt + '<span class="sub">WORK · THE FILES</span>';
    speak(prompt);
  }

  function keepMemory(activity) {
    rereading = false;
    track('memory_kept', activity, { ms: since(roomT0) });
    found[keys.indexOf(activity)] = true; // counted now, so leaving mid-animation loses nothing
    if (!keptOrder.includes(activity)) keptOrder.push(activity);
    saveKept();
    paintHouseWindows();
    if (placeOf[activity]) paintPlaceLights(placeOf[activity]);
    paintOfficeWindows();
    openMemory(activity);
  }

  function wireOnce() {
    if (started) return;
    started = true;

    // flip the album: the arrows, or a swipe across the page
    $('pgPrev').onclick = () => turnPage((pageAt[currentBook] || 0) - 1);
    $('pgNext').onclick = () => turnPage((pageAt[currentBook] || 0) + 1);
    let swipeX = null;
    $('sheetpg').addEventListener('pointerdown', (e) => (swipeX = e.clientX));
    $('sheetpg').addEventListener('pointerup', (e) => {
      if (swipeX === null) return;
      const dx = e.clientX - swipeX;
      swipeX = null;
      if (Math.abs(dx) > 60) turnPage((pageAt[currentBook] || 0) + (dx < 0 ? 1 : -1));
    });

    document.querySelectorAll('#view-play [data-go]').forEach((b) => {
      const room = (b.closest('.scr') || {}).id?.slice(2);
      const skips = keys.includes(room) && /skip/.test(b.textContent);
      b.onclick = () => {
        if (skips) track('skip', room, { ms: since(roomT0) });
        if (b.dataset.go === 'hub') leaveHouse();
        else if (b.dataset.go === 'childhub') leavePlace('childhood');
        else if (b.dataset.go === 'todayhub') leavePlace('today');
        else if (b.dataset.go === 'office') leaveOffice();
        else if (b.dataset.go === 'shelf' && !$('s-intro').classList.contains('on')) closeBook();
        else show(b.dataset.go);
      };
    });

    $('mPlay').onclick = () => toggleRead($('mPlay'), (done) => playFamilyVoice(done));
    $('mDone').onclick = () => {
      $('reveal').classList.remove('on');
      if (rereading) {
        rereading = false;
        if (currentBook === 'today') closeBook();
        else leaveAlbumHub();
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
      if (current === 'today' || currentBook === 'today') closeBook();
      else leaveAlbumHub();
    };
    $('kNext').onclick = () => keepMemory('kitchen');
    $('tuneL').onclick = () => tune(-1);
    $('tuneR').onclick = () => tune(1);
    $('keepSong').onclick = () => keepMemory('radio');
    $('mic').onclick = porchTalk;
    $('porchTake').onclick = () => keepMemory('porch');
    $('atticTake').onclick = () => keepMemory('attic');
    $('todayTake').onclick = () => keepMemory('today');
    $('deskTake').onclick = () => keepMemory('desk');
    $('phoneTake').onclick = () => keepMemory('phone');
    $('breakTake').onclick = () => keepMemory('break');
    $('filesTake').onclick = () => keepMemory('files');
    $('hearToday').onclick = () =>
      toggleRead($('hearToday'), (done) => hearTodayLetter().then(done), () => {
        document.querySelectorAll('#todayLetter .ln').forEach((el) => el.classList.remove('say'));
      });
    $('jrnOpen').onclick = openDayLog;
    $('dayClose').onclick = () => {
      closeDayLog();
      if (current === 'journal') leavePlace('today');
    };
    $('toyKeep').onclick = () => keepMemory('toybox');
    $('recKeep').onclick = () => keepMemory('recipe');
    $('walkKeep').onclick = () => keepMemory('walk');
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
      ['office', 'Work'],
      ['desk', 'Desk'],
      ['phone', 'Phone'],
      ['break', 'Break'],
      ['files', 'Files'],
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

  // What is in the photobook stays there for the rest of the day, on this device; at
  // midnight (the tablet's clock) the book starts empty again.
  const KEPT_KEY = 'homeAgain.kept';
  const clockDay = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  function loadKept() {
    try {
      const k = JSON.parse(localStorage.getItem(KEPT_KEY) || 'null');
      if (k && k.day === clockDay() && Array.isArray(k.rooms)) return k.rooms.filter((r) => keys.includes(r));
    } catch (_) {}
    return [];
  }
  function saveKept() {
    try {
      localStorage.setItem(KEPT_KEY, JSON.stringify({ day: clockDay(), rooms: keptOrder }));
    } catch (_) {}
  }
  let midnight = null;
  function resetAtMidnight() {
    clearTimeout(midnight);
    const next = new Date();
    next.setHours(24, 0, 1, 0);
    midnight = setTimeout(() => {
      keptOrder = [];
      found = keys.map(() => false);
      try { localStorage.removeItem(KEPT_KEY); } catch (_) {}
      paintHouseWindows();
      const on = (document.querySelector('#screen .scr.on') || {}).id;
      if (on === 's-hub') buildRooms();
      if (on === 's-shelf') buildShelf();
      if (on === 's-album') buildAlbum();
      resetAtMidnight();
    }, next - Date.now());
  }

  function start(nextPack) {
    pack = nextPack || HomeAgainPack.activePack();
    letter = (pack.letter || []).slice(0, weekKeys.length);
    while (letter.length < weekKeys.length) {
      const i = letter.length;
      letter.push({
        room: ['Sunday kitchen', 'Tuesday car', 'Garden', 'Photographs', 'Wednesday walk'][i],
        line: i === 4 ? childDefaults.walk.line : 'We love you.',
        by: (pack.people && pack.people[0] && pack.people[0].name) || 'Family'
      });
    }
    keptOrder = loadKept();
    found = keys.map((k) => keptOrder.includes(k));
    resetAtMidnight();
    session = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    track('session_start', 'intro');
    rereading = false;
    pendingPlace = null;
    viewing = null;
    hubInside = false;
    officeInside = false;
    hub?.reset();
    office?.reset();
    Object.keys(places).forEach((k) => {
      placeInside[k] = false;
      places[k]?.reset();
    });
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
    ensureIntroHub(); // load both 3D houses now, so nothing flat flashes the first time they appear
    ensureHub();
    ensureOffice();
    show('intro');
  }

  global.HomeAgainPlay = { start, show, back };
})(window);
