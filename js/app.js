(function () {
  const views = {
    home: document.getElementById('view-home'),
    family: document.getElementById('view-family'),
    play: document.getElementById('view-play')
  };

  function showView(name) {
    Object.keys(views).forEach((k) => {
      views[k].classList.toggle('on', k === name);
    });
    document.body.dataset.mode = name;
    document.getElementById('globalBack').classList.toggle('hide', name === 'home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function refreshHomeStatus() {
    const el = document.getElementById('packStatus');
    const saved = HomeAgainPack.loadPack();
    el.innerHTML = HomeAgainPack.packSummary(saved);
  }

  function goHome() {
    showView('home');
    refreshHomeStatus();
  }

  function goFamily() {
    location.href = '/family';
  }

  // Fills the game from the album where it has no photo of its own: people get
  // their portrait, matched by name (an album "Chris" fills "Christopher"), the
  // photo room gets this week's album photos, the lunch table gets the photo of
  // the meal, and each letter piece gets a photo from this week of the person who
  // recorded it.
  async function withAlbumPhotos(pack) {
    try {
      const res = await fetch('/api/album', { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return pack;
      const mat = (await res.json()).materials;
      const portraits = mat.people
        .map((f) => ({ name: f.name.toLowerCase(), url: (mat.photos.find((ph) => ph.id === f.photoId) || {}).url }))
        .filter((f) => f.url);
      // "today" is the pack's asOf (YYYY-MM-DD) when it sets one, else the real date
      const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const today = day(pack.asOf ? new Date(pack.asOf + 'T00:00') : new Date());
      // album photos (not cropped portraits) with a full date up to today, oldest first
      // (photos from the same day keep the order they were added)
      const dated = () =>
        mat.photos
          .filter((ph) => !ph.croppedFrom && /^\d{4}-\d{2}-\d{2}$/.test(ph.year || ''))
          .map((ph, i) => ({ ph, i, at: day(new Date(ph.year + 'T00:00')) }))
          .filter((x) => x.at <= today)
          .sort((a, b) => a.at - b.at || a.i - b.i);
      const thisWeek = () => dated().filter((x) => today - x.at < 7 * 864e5);
      const same = (a, b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));
      (pack.people || []).forEach((p) => {
        const hit = !p.photoDataUrl && portraits.find((f) => same(f.name, p.name.toLowerCase()));
        if (hit) p.photoDataUrl = hit.url;
      });
      // the lunch table gets the album photo the pack names by caption ("the soup we drank"),
      // or else the newest photo of a meal
      const kitchen = pack.rooms && pack.rooms.kitchen;
      if (kitchen && !kitchen.photoDataUrl) {
        const albumPhotos = mat.photos.filter((ph) => !ph.croppedFrom);
        const want = (kitchen.photoCaption || '').toLowerCase();
        const meal =
          (want && albumPhotos.find((ph) => (ph.caption || '').toLowerCase() === want)) ||
          albumPhotos.filter((ph) => /soup|lunch|dinner|meal/i.test(ph.caption || '')).pop();
        if (meal) kitchen.photoDataUrl = meal.url;
      }
      // and the Sunday lunch memory (the kitchen's, first) shows that same photo
      const lunch = (pack.memories || [])[0];
      if (lunch && !lunch.photoDataUrl && kitchen && kitchen.photoDataUrl) lunch.photoDataUrl = kitchen.photoDataUrl;
      // the garden gets the album photo whose caption its prompt names ("tea in the garden"),
      // and so does its memory (the porch's, third)
      const porch = pack.rooms && pack.rooms.porch;
      if (porch && !porch.photoDataUrl) {
        const prompt = (porch.prompt || '').toLowerCase();
        const named = mat.photos.filter((ph) => !ph.croppedFrom && ph.caption && prompt.includes(ph.caption.toLowerCase())).pop();
        if (named) porch.photoDataUrl = named.url;
      }
      const tea = (pack.memories || [])[2];
      if (tea && !tea.photoDataUrl && porch && porch.photoDataUrl) tea.photoDataUrl = porch.photoDataUrl;
      // the photo room gets the three most recent dated photos before today that no other
      // room shows, oldest first, so they can be put back in the order they happened
      const attic = pack.rooms && pack.rooms.attic;
      if (attic && !(attic.photos || []).some((p) => p.photoDataUrl)) {
        const used = [kitchen && kitchen.photoDataUrl, porch && porch.photoDataUrl];
        const before = dated().filter((x) => x.at < today && !used.includes(x.ph.url)).slice(-3);
        if (before.length === 3) {
          attic.photos = before.map(({ ph }, i) => ({ id: 'a' + (i + 1), label: ph.caption || 'a photo', date: ph.year, photoDataUrl: ph.url }));
        }
      }
      // a letter piece gets a photo from this week of the person who recorded it
      const shows = (ph, name) => {
        const ids = mat.people.filter((f) => same(f.name.toLowerCase(), name)).map((f) => f.id);
        return (ph.faces || []).some((f) => ids.includes(f.personId) && f.status === 'confirmed') ||
          (ph.who || '').toLowerCase().split(/\s*,\s*|\s+and\s+/).some((w) => w && same(w, name));
      };
      (pack.letter || []).slice(0, 4).forEach((piece, i) => {
        const mem = (pack.memories || [])[i];
        if (!mem || mem.photoDataUrl || !piece.by) return;
        const hit = thisWeek().filter(({ ph }) => shows(ph, piece.by.toLowerCase())).pop();
        if (hit) mem.photoDataUrl = hit.ph.url;
      });
      // Every book shows something from the family's own life. The work rooms and the childhood pages take the
      // photos saved with their theme; any room or page still without a photo borrows one the family uploaded
      // (an unused one first), so each album page ends with a real photo.
      const portraitIds = new Set((mat.people || []).map((f) => f.photoId).filter(Boolean));
      const scenes = mat.photos.filter((ph) => !ph.croppedFrom && !portraitIds.has(ph.id));
      if (scenes.length) {
        pack.rooms = pack.rooms || {};
        const room = (k) => (pack.rooms[k] = pack.rooms[k] || {});
        const used = new Set(
          [...(pack.memories || []).map((m) => m.photoDataUrl), ...Object.values(pack.rooms).map((r) => r && r.photoDataUrl), ...((pack.rooms.attic || {}).photos || []).map((p) => p.photoDataUrl)].filter(Boolean)
        );
        let spare = 0;
        const next = (theme) => {
          const ph = scenes.find((x) => x.theme === theme && !used.has(x.url)) || scenes.find((x) => !used.has(x.url)) || scenes[spare++ % scenes.length];
          used.add(ph.url);
          return ph.url;
        };
        [['desk', 'work'], ['phone', 'work'], ['break', 'work'], ['files', 'work'], ['toybox', 'childhood'], ['recipe', 'childhood'], ['walk', 'week']].forEach(([k, theme]) => {
          if (!room(k).photoDataUrl) room(k).photoDataUrl = next(theme);
        });
        (pack.memories || []).forEach((m) => {
          if (!m.photoDataUrl) m.photoDataUrl = next('week');
        });
      }
    } catch (_) {}
    return pack;
  }

  async function goPlay() {
    try {
      // a slow or unreachable album store must not keep Play from opening
      const res = await fetch('/api/pack', { signal: AbortSignal.timeout(3000) });
      if (res.ok) HomeAgainPack.savePack(await res.json());
    } catch (_) {}
    showView('play');
    HomeAgainPlay.start(await withAlbumPhotos(HomeAgainPack.activePack()));
  }

  document.getElementById('btnPlay').onclick = goPlay;
  document.getElementById('btnFamily').onclick = goFamily;
  // in a room it goes back to the house; anywhere else it leaves to the home screen
  document.getElementById('globalBack').onclick = () => {
    if (document.body.dataset.mode === 'play' && HomeAgainPlay.back()) return;
    goHome();
  };

  refreshHomeStatus();
  if (new URLSearchParams(location.search).has('play')) goPlay();
  else showView('home');
})();
