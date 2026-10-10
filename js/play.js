(function (global) {
  const $ = (id) => document.getElementById(id);
  const keys = ['kitchen', 'radio', 'porch', 'attic'];
  const wins = ['w-kitchen', 'w-radio', 'w-porch', 'w-attic'];
  const ordinals = ['PIECE ONE OF FOUR', 'PIECE TWO OF FOUR', 'PIECE THREE OF FOUR', 'PIECE FOUR OF FOUR'];

  let pack = null;
  let letter = [];
  let found = [false, false, false, false];
  let timers = [];
  let pending = -1;
  let rereading = false;
  let round = 0;
  let bi = 0;
  let deg = 0;
  let talking = false;
  let atticSet = [];
  let started = false;
  let familyAudio = null;
  let porchStop = null;

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearAll = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

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
  }

  function speak(text, role) {
    if (window.HomeAgainVoice) return HomeAgainVoice.speak(text, { role: role || 'narrator' });
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
      '--bg:#c5d9ec;--skin:#d9b394;--cloth:#4f6f8f;--hair:#3b3240';
    return `<svg viewBox="0 0 100 80" style="${palette}"><use href="#person"></use></svg>`;
  }

  function paintProgress() {
    found.forEach((f, i) => {
      const el = $('pc' + i);
      if (el) el.classList.toggle('got', f);
    });
    document.querySelectorAll('.housewrap svg').forEach((svg) => {
      wins.forEach((w, i) => {
        const el = svg.querySelector('.' + w);
        if (el) el.classList.toggle('lit', found[i]);
      });
    });
  }

  function buildRooms() {
    const box = $('rooms');
    box.innerHTML = '';
    letter.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'roomrow door-' + keys[i] + (found[i] ? ' found' : '');
      b.innerHTML =
        '<span class="n">' +
        p.room +
        '</span><span class="s">' +
        (found[i] ? 'piece found' : 'piece waiting') +
        '</span>';
      b.onclick = () => {
        if (found[i]) {
          rereading = true;
          openSlip(i);
        } else show(keys[i]);
      };
      box.appendChild(b);
    });
    const n = found.filter(Boolean).length;
    $('hubCaption').innerHTML =
      (n === 0
        ? 'What happened this week?'
        : n < 4
          ? 'What else do you remember from this week?'
          : 'The week is coming together') +
      '<span class="sub">' +
      n +
      ' OF 4 PIECES FOUND</span>';
  }

  function show(name) {
    hush();
    clearAll();
    document.querySelectorAll('.scr').forEach((s) => s.classList.toggle('on', s.id === 's-' + name));
    $('chrome').classList.toggle('on', name !== 'intro' && name !== 'ending');
    document.querySelectorAll('#controls button').forEach((b) =>
      b.setAttribute('aria-current', b.dataset.jump === name ? 'true' : 'false')
    );
    paintProgress();
    if (name === 'hub') {
      buildRooms();
      paintMemories();
      const n = found.filter(Boolean).length;
      speak(n === 0 ? 'What happened this week?' : n < 4 ? 'What else do you remember from this week?' : 'The week is coming together');
    }
    if (name === 'intro') speak('This week is still here. Come in when you are ready.', 'warm');
    if (name === 'kitchen') initKitchen();
    if (name === 'radio') initRadio();
    if (name === 'porch') initPorch();
    if (name === 'attic') initAttic();
    if (name === 'ending') initEnding();
  }

  function paintMemories() {
    const rail = $('memoryRail');
    if (!rail || !pack) return;
    const mems = (pack.memories || []).slice(0, 3);
    const fallback = ['sc-garden', 'sc-lake', 'sc-snow'];
    rail.innerHTML = mems
      .map((m, i) => {
        const pic = m.photoDataUrl
          ? '<img src="' + m.photoDataUrl + '" alt="">'
          : '<svg viewBox="0 0 120 80"><use href="#' + fallback[i] + '"></use></svg>';
        const title = (m.title || 'a memory').slice(0, 28);
        return '<div class="polaroid">' + pic + '<span>' + title + '</span></div>';
      })
      .join('');
  }

  function playFamilyVoice() {
    $('rWave').classList.add('on');
    hush();
    const url = pack.voice && pack.voice.audioDataUrl;
    const line = letter[pending] && letter[pending].line;
    if (url) {
      familyAudio = new Audio(url);
      familyAudio.onended = () => $('rWave').classList.remove('on');
      familyAudio.play().catch(() => {
        speak(line, 'letter').then(() => $('rWave').classList.remove('on'));
      });
      return;
    }
    speak(line, 'letter').then(() => $('rWave').classList.remove('on'));
  }

  function openSlip(i) {
    pending = i;
    $('rKick').textContent = rereading ? 'FROM THE ' + letter[i].room.toUpperCase() : ordinals[i];
    $('rLine').textContent = letter[i].line;
    $('rBy').textContent = 'recorded by ' + letter[i].by;
    $('rWave').classList.remove('on');
    $('rDone').textContent = rereading ? 'BACK TO THE HOUSE' : 'PUT IT IN THE LETTER';
    $('reveal').classList.add('on');
    speak(letter[i].line, 'letter');
  }

  /* kitchen */
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
    if (n !== p.who) {
      btn.classList.add('marked');
      said((p.hints && p.hints[n]) || 'Try another face.');
      return;
    }
    setSeat($(p.seat), 'filled', n);
    said(p.hello);
    drawFaces(list.filter((x) => x !== n));
    round++;
    if (round < plan.length) {
      setSeat($(plan[round].seat), 'target');
      $('kCap').innerHTML = 'And the next chair?<span class="sub">SUNDAY · KITCHEN</span>';
    } else {
      $('kCap').innerHTML = 'Everyone is home. Something is under the table.<span class="sub">SUNDAY · KITCHEN</span>';
      later(() => {
        rereading = false;
        openSlip(0);
      }, 2100);
    }
  }

  /* radio */
  function bands() {
    return (pack.rooms.radio && pack.rooms.radio.bands) || [
      { t: 'static', clear: false },
      { t: 'a song', clear: true }
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
      (b.clear ? 'Where did you hear this one?' : prompt) + '<span class="sub">TUESDAY · IN THE CAR</span>';
    if (window.HomeAgainVoice) HomeAgainVoice.radio(b.clear);
    if (b.clear) speak(b.t);
  }

  function tune(step) {
    const list = bands();
    bi = (bi + step + list.length) % list.length;
    deg += step * 48;
    const n = document.getElementById('needle');
    if (n) n.style.transform = 'rotate(' + deg + 'deg)';
    paintBand();
  }

  function initRadio() {
    bi = 0;
    deg = 0;
    const n = document.getElementById('needle');
    if (n) n.style.transform = 'none';
    paintBand();
    speak((pack.rooms.radio && pack.rooms.radio.prompt) || 'Turn the dial until a song comes in');
  }

  /* porch */
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
      const svgId = porch.svgId || 'sc-lake';
      print.innerHTML = `<svg viewBox="0 0 120 80"><use href="#${svgId}"></use></svg><div class="pname">a memory</div>`;
    }
  }

  function finishPorch(heard) {
    if (porchStop) {
      const last = porchStop();
      porchStop = null;
      heard = heard || last;
    }
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

  function porchTalk() {
    if (talking) {
      finishPorch();
      return;
    }
    talking = true;
    $('mic').classList.add('live');
    $('pCap').innerHTML = 'I am listening. Tap again when you are done.<span class="sub">YESTERDAY · GARDEN</span>';
    $('pHeard').textContent = 'listening…';
    speak('I am listening.');
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
    later(() => {
      if (talking) finishPorch();
    }, 12000);
  }

  /* attic */
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

  function initAttic() {
    atticSet = [];
    drawAttic();
    speak((pack.rooms.attic && pack.rooms.attic.prompt) || 'Which one came first?');
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
    $('sayHello').onclick = () => {
      $('sayHello').textContent = 'CALLING ' + callName.toUpperCase();
      speak('Hello, ' + callName + '. We are here with you.', 'warm');
    };
    speak('The letter is whole.');
  }

  function wireOnce() {
    if (started) return;
    started = true;

    document.querySelectorAll('#view-play [data-go]').forEach((b) => {
      b.onclick = () => show(b.dataset.go);
    });

    $('rPlay').onclick = () => playFamilyVoice();
    $('rDone').onclick = () => {
      $('reveal').classList.remove('on');
      if (rereading) {
        rereading = false;
        show('hub');
        return;
      }
      found[pending] = true;
      paintProgress();
      if (found.every(Boolean)) show('ending');
      else show('hub');
    };
    $('restBtn').onclick = () => $('rest').classList.add('on');
    $('restKeep').onclick = () => $('rest').classList.remove('on');
    $('restHome').onclick = () => {
      $('rest').classList.remove('on');
      show('hub');
    };
    $('tuneL').onclick = () => tune(-1);
    $('tuneR').onclick = () => tune(1);
    $('keepSong').onclick = () => {
      rereading = false;
      openSlip(1);
    };
    $('mic').onclick = porchTalk;
    $('porchTake').onclick = () => {
      rereading = false;
      openSlip(2);
    };
    $('atticTake').onclick = () => {
      rereading = false;
      openSlip(3);
    };
    $('hearLetter').onclick = () => {
      clearAll();
      hush();
      document.querySelectorAll('.sheet .ln').forEach((l) => l.classList.remove('say'));
      letter.forEach((p, i) =>
        later(() => {
          document.querySelectorAll('.sheet .ln').forEach((l) => l.classList.remove('say'));
          const el = $('ln' + i);
          if (el) el.classList.add('say');
          speak(p.line, 'letter');
        }, i * 4200)
      );
      later(() => document.querySelectorAll('.sheet .ln').forEach((l) => l.classList.remove('say')), letter.length * 4200);
    };

    const debug = new URLSearchParams(location.search).has('debug');
    const controls = $('controls');
    const note = $('playNote');
    if (debug) {
      controls.classList.add('debug');
      note.classList.add('debug');
    }
    [
      ['intro', 'Opening'],
      ['hub', 'House'],
      ['kitchen', 'Kitchen'],
      ['radio', 'Radio room'],
      ['porch', 'Porch'],
      ['attic', 'Attic'],
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
    found = [false, false, false, false];
    rereading = false;
    pending = -1;
    clearAll();
    $('reveal').classList.remove('on');
    $('rest').classList.remove('on');

    const who = pack.profile && pack.profile.preferredName;
    $('playSub').textContent = who
      ? `This week, with ${who}. Four rooms. Four small days.`
      : 'Four rooms, four pieces of a letter.';

    paintMemories();
    if (window.HomeAgainVoice) HomeAgainVoice.warm();
    wireOnce();
    show('intro');
  }

  global.HomeAgainPlay = { start, show };
})(window);
