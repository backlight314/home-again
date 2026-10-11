/**
 * GamePack schema (v1) — frontend contract for Family → Play.
 * Backend can later replace load/save with the same shape.
 *
 * GamePack: {
 *   version: 1,
 *   profile: { preferredName, addressAs, eras: string[] },
 *   people: [{ id, name, relation?, photoDataUrl?, palette? }],
 *   memories: [{ id, title, placeYear?, text, photoDataUrl? }],
 *   songs: [{ id, title }],
 *   voice: { transcript, audioDataUrl?, durationMs? },
 *   letter: [{ room, line, by }],
 *   rooms: {
 *     kitchen: { prompt, rounds: [{ seat, who, hello, hints }], photoCaption?, photoDataUrl? },
 *     radio: { prompt, bands: [{ t, clear }] },
 *     porch: { prompt, photoDataUrl?, storyText },
 *     attic: { prompt, photos: [{ id, label, svgId?, photoDataUrl? }] },
 *     today: { prompt?, caption?, line?, by?, photos?: [{ caption, photoDataUrl? }] }
 *   },
 *   ending: { callName }
 * }
 */
(function (global) {
  const STORAGE_KEY = 'homeAgain.pack';
  const PALETTES = [
    '--bg:#c5d9ec;--skin:#d9b394;--cloth:#4f6f8f;--hair:#3b3240',
    '--bg:#d2e4f5;--skin:#cda683;--cloth:#3d7fb8;--hair:#44352a',
    '--bg:#c8e0d4;--skin:#e0bb9b;--cloth:#4a7a6a;--hair:#5a5048',
    '--bg:#dde8f2;--skin:#d4a888;--cloth:#5a7390;--hair:#2c3540'
  ];

  function uid(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 9);
  }

  function demoPack() {
    return {
      version: 1,
      profile: {
        preferredName: 'Mom',
        addressAs: 'Mom',
        eras: ['thisWeek']
      },
      people: [
        { id: 'p_alina', name: 'Alina', relation: 'daughter', palette: PALETTES[0] },
        { id: 'p_christopher', name: 'Christopher', relation: 'son', palette: PALETTES[1] },
        { id: 'p_eason', name: 'Eason', relation: 'son', palette: PALETTES[2] }
      ],
      memories: [
        {
          id: 'm1',
          title: 'Sunday lunch',
          placeYear: 'last Sunday',
          text: 'Last Sunday Alina sat in your chair and poured the tea. The soup was too hot.'
        },
        {
          id: 'm2',
          title: 'In the car',
          placeYear: 'Tuesday',
          text: 'Tuesday in the car Christopher had One More Dance on again. You hummed along.'
        },
        {
          id: 'm3',
          title: 'Tea outside',
          placeYear: 'yesterday',
          text: 'Yesterday we had tea in the garden. A bee landed on your saucer and you laughed.'
        },
        {
          id: 'm4',
          title: 'The photos',
          placeYear: 'this week',
          text: 'This week’s pictures are on the table. We were all here. We still are.'
        }
      ],
      songs: [
        { id: 's1', title: 'One More Dance' },
        { id: 's2', title: 'Happy Times' },
        { id: 's3', title: 'Midnight Funk' },
        { id: 's4', title: 'Heartbeat' }
      ],
      letter: [
        { room: 'Sunday kitchen', line: 'Last Sunday you asked for a second cup. Alina is still laughing about the soup.', by: 'Alina' },
        { room: 'Tuesday car', line: 'Tuesday you hummed that song in the car. Christopher kept it on the whole way home.', by: 'Christopher' },
        { room: 'Garden', line: 'Yesterday the bee sat on your saucer. You said it wanted sugar too.', by: 'Alina' },
        { room: 'Photographs', line: 'This week we took these pictures so you can see we were here. We are here.', by: 'Eason' }
      ],
      rooms: {
        kitchen: {
          prompt: 'Who sat with you at lunch last Sunday?',
          photoCaption: 'the soup we drank', // the album photo laid on the table once everyone is seated
          rounds: [
            {
              seat: 'seatC',
              who: 'Alina',
              hello: 'Alina: "Hi Mom. It is Sunday again. I brought the soup."',
              hints: {
                Christopher: 'Christopher: "That is me. Alina sat across from you on Sunday."',
                Eason: 'Eason: "That is me. Look for Alina — she poured the tea."'
              }
            },
            {
              seat: 'seatL',
              who: 'Christopher',
              hello: 'Christopher: "Hi Mom. I came after work on Sunday."',
              hints: {
                Eason: 'Eason: "Christopher was on your left. I was late."'
              }
            },
            {
              seat: 'seatR',
              who: 'Eason',
              hello: 'Eason: "Hi Mom. I was late, but I made it in time for the soup."',
              hints: {}
            }
          ]
        },
        radio: {
          prompt: 'Find the song from the car on Tuesday',
          bands: [
            { t: 'Happy Times', clip: 'audio/radio/happy-times.mp3', clear: false },
            { t: 'One More Dance', clip: 'audio/radio/one-more-dance.mp3', clear: true },
            { t: 'Midnight Funk', clip: 'audio/radio/midnight-funk.mp3', clear: false },
            { t: 'Heartbeat', clip: 'audio/radio/heartbeat.mp3', clear: false }
          ]
        },
        porch: {
          prompt: 'Tell me about tea in the garden yesterday',
          storyText: 'We sat outside. A bee landed on the saucer and Mom laughed. Alina took a picture.',
          svgId: 'sc-garden'
        },
        today: {
          // album photos hung in the hall, named by caption and filled in from the album at Play
          photos: [
            { caption: 'you helped with cooking dinner' },
            { caption: "we celebrated chris's birthday" },
            { caption: 'we went on a city walk' }
          ]
        },
        attic: {
          prompt: 'Which photo came first this week?',
          photos: [
            { id: 'a1', label: 'Sunday lunch', svgId: 'sc-garden' },
            { id: 'a2', label: 'Tuesday car', svgId: 'sc-lake' },
            { id: 'a3', label: 'Yesterday tea', svgId: 'sc-snow' }
          ]
        }
      },
      voice: {
        transcript: 'Last Sunday we had soup. Tuesday the song was on in the car. Yesterday a bee landed on her tea. This week we took pictures so she can see we were here.'
      },
      ending: { callName: 'Alina' }
    };
  }

  function savePack(pack) {
    const copy = JSON.parse(JSON.stringify(pack));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
    } catch (_) {
      if (copy.voice) copy.voice.audioDataUrl = null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
    }
    return pack;
  }

  function loadPack() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const pack = JSON.parse(raw);
      if (!pack || pack.version !== 1) return null;
      const eras = (pack.profile && pack.profile.eras) || [];
      const blob = JSON.stringify(pack.memories || []).toLowerCase();
      if (eras.includes('childhood') && /1974|childhood|oldest|lake house|snow day/.test(blob)) {
        return null;
      }
      return pack;
    } catch (_) {
      return null;
    }
  }

  function clearPack() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function activePack() {
    return loadPack() || demoPack();
  }

  function exportPack(pack) {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'home-again-pack.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function personPalette(i) {
    return PALETTES[i % PALETTES.length];
  }

  function snippetsFromTalk(text) {
    if (!text) return [];
    return String(text)
      .split(/[.?!]+\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 18)
      .slice(0, 8);
  }

  function peopleFromTalk(text) {
    const found = [];
    const seen = new Set();
    const re = /(?:my|our)\s+(daughter|son|sister|brother|husband|wife|niece|nephew|grandson|granddaughter|grandchild|friend|neighbor)\s+([A-Z][a-zA-Z'-]+)/g;
    let m;
    const src = text || '';
    while ((m = re.exec(src))) {
      const name = m[2];
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      found.push({ name, relation: m[1] });
    }
    return found;
  }

  function songFromTalk(text) {
    const m = (text || '').match(/(?:song|sang|singing|radio)\s+(?:called\s+|was\s+)?["“]?([A-Z][^"”.\n]{2,40})/);
    return m ? m[1].trim() : '';
  }

  /**
   * Mock generate: Family wizard draft → full GamePack for Play.
   * No AI — simple deterministic mapping rules. Voice transcript becomes memories.
   */
  function generateFromFamily(draft) {
    const name = (draft.preferredName || 'loved one').trim();
    const addressAs = (draft.addressAs || name).trim();
    const talk = (draft.voice && draft.voice.transcript) || '';
    const spokenPeople = peopleFromTalk(talk);
    const people = (draft.people || [])
      .filter((p) => p.name && p.name.trim())
      .map((p, i) => ({
        id: p.id || uid('p'),
        name: p.name.trim(),
        relation: (p.relation || '').trim(),
        photoDataUrl: p.photoDataUrl || null,
        palette: personPalette(i)
      }));
    spokenPeople.forEach((sp) => {
      if (!people.some((p) => p.name.toLowerCase() === sp.name.toLowerCase())) {
        people.push({
          id: uid('p'),
          name: sp.name,
          relation: sp.relation,
          photoDataUrl: null,
          palette: personPalette(people.length)
        });
      }
    });

    while (people.length < 2) {
      people.push({
        id: uid('p'),
        name: people.length === 0 ? 'Alina' : 'Christopher',
        relation: 'family',
        photoDataUrl: null,
        palette: personPalette(people.length)
      });
    }

    let memories = (draft.memories || [])
      .filter((m) => (m.title && m.title.trim()) || (m.text && m.text.trim()))
      .map((m) => ({
        id: m.id || uid('m'),
        title: (m.title || 'A memory').trim(),
        placeYear: (m.placeYear || '').trim(),
        text: (m.text || '').trim(),
        photoDataUrl: m.photoDataUrl || null
      }));
    snippetsFromTalk(talk).forEach((line) => {
      if (memories.some((m) => m.text === line)) return;
      memories.push({
        id: uid('m'),
        title: line.split(/[,.]/)[0].slice(0, 42),
        placeYear: '',
        text: line,
        photoDataUrl: null
      });
    });
    (draft.photos || []).forEach((ph, i) => {
      if (!ph || !ph.photoDataUrl) return;
      if (memories[i]) memories[i].photoDataUrl = memories[i].photoDataUrl || ph.photoDataUrl;
      else {
        memories.push({
          id: uid('m'),
          title: ph.caption || 'A photograph',
          placeYear: '',
          text: ph.caption || 'A photograph from home.',
          photoDataUrl: ph.photoDataUrl
        });
      }
    });

    const weekFill = [
      { title: 'Sunday lunch', placeYear: 'last Sunday', text: 'Last Sunday we sat down together. The soup was too hot.' },
      { title: 'In the car', placeYear: 'Tuesday', text: 'Tuesday in the car that song came on again.' },
      { title: 'Tea outside', placeYear: 'yesterday', text: 'Yesterday we had tea in the garden.' },
      { title: 'The photos', placeYear: 'this week', text: 'This week’s pictures are still on the table.' }
    ];
    while (memories.length < 4) {
      const f = weekFill[memories.length];
      memories.push({
        id: uid('m'),
        title: f.title,
        placeYear: f.placeYear,
        text: f.text,
        photoDataUrl: null
      });
    }

    const songs = (draft.songs || [])
      .filter((s) => s.title && s.title.trim())
      .map((s) => ({ id: s.id || uid('s'), title: s.title.trim() }));

    if (!songs.length) {
      const guessed = songFromTalk(talk);
      songs.push({ id: uid('s'), title: guessed || 'the song from Tuesday' });
    }

    const p0 = people[0];
    const p1 = people[1];
    const p2 = people[2] || people[0];
    const m0 = memories[0];
    const m1 = memories[1];
    const m2 = memories[2];
    const m3 = memories[3];

    const letter = [
      {
        room: 'Sunday kitchen',
        line: m0.text || `Dear ${addressAs}, last Sunday we still saved your place at the table.`,
        by: p0.name
      },
      {
        room: 'Tuesday car',
        line: m1.text || `Tuesday that song still sounded like you, ${addressAs}.`,
        by: p1.name
      },
      {
        room: 'Garden',
        line: m2.text || `Yesterday in the garden I still think about tea with you.`,
        by: p0.name
      },
      {
        room: 'Photographs',
        line: m3.text || `This week’s pictures are still on the table.`,
        by: p2.name
      }
    ];

    const faceNames = people.slice(0, 3).map((p) => p.name);
    while (faceNames.length < 3) faceNames.push(people[0].name);

    const hintsFor = (correct, others) => {
      const hints = {};
      others.forEach((n) => {
        if (n !== correct) {
          hints[n] = `${n}: "That is me. Look for ${correct}."`;
        }
      });
      return hints;
    };

    const pack = {
      version: 1,
      profile: {
        preferredName: name,
        addressAs,
        eras: draft.eras && draft.eras.length ? draft.eras.slice() : ['thisWeek']
      },
      people,
      memories,
      songs,
      letter,
      rooms: {
        kitchen: {
          prompt: 'Who sat with you at lunch last Sunday?',
          rounds: [
            {
              seat: 'seatC',
              who: p0.name,
              hello: `${p0.name}: "Hi ${addressAs}, it is me."`,
              hints: hintsFor(p0.name, faceNames)
            },
            {
              seat: 'seatL',
              who: p1.name,
              hello: `${p1.name}: "Hi ${addressAs}."`,
              hints: hintsFor(p1.name, faceNames)
            }
          ]
        },
        radio: {
          prompt: 'Find the song from the car on Tuesday',
          bands: [
            { t: 'Happy Times', clip: 'audio/radio/happy-times.mp3', clear: false },
            { t: 'One More Dance', clip: 'audio/radio/one-more-dance.mp3', clear: true },
            { t: 'Midnight Funk', clip: 'audio/radio/midnight-funk.mp3', clear: false },
            { t: 'Heartbeat', clip: 'audio/radio/heartbeat.mp3', clear: false }
          ]
        },
        porch: {
          prompt: `Tell me about ${m2.title || 'tea yesterday'}`,
          storyText: m2.text || 'Yesterday we had tea in the garden.',
          photoDataUrl: m2.photoDataUrl || null,
          svgId: m2.photoDataUrl ? null : 'sc-snow'
        },
        attic: {
          prompt: 'Which photo came first this week?',
          photos: memories.slice(0, 3).map((m, i) => ({
            id: m.id,
            label: m.title,
            photoDataUrl: m.photoDataUrl || null,
            svgId: m.photoDataUrl ? null : ['sc-garden', 'sc-lake', 'sc-snow'][i]
          }))
        }
      },
      voice: draft.voice
        ? {
            transcript: talk,
            audioDataUrl: draft.voice.audioDataUrl || null,
            durationMs: draft.voice.durationMs || 0
          }
        : null,
      ending: { callName: p0.name }
    };

    return pack;
  }

  function packSummary(pack) {
    if (!pack) return 'No family pack saved yet — Play will use the demo story.';
    const n = pack.profile && pack.profile.preferredName ? pack.profile.preferredName : 'someone';
    const people = (pack.people || []).length;
    const mems = (pack.memories || []).length;
    const voice = pack.voice && pack.voice.transcript ? ' · voice saved' : '';
    return `Pack ready for <strong>${escapeHtml(n)}</strong> · ${people} people · ${mems} memories${voice}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.HomeAgainPack = {
    STORAGE_KEY,
    uid,
    demoPack,
    savePack,
    loadPack,
    clearPack,
    activePack,
    exportPack,
    generateFromFamily,
    packSummary,
    personPalette
  };
})(window);
