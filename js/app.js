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
      const res = await fetch('/api/album');
      if (!res.ok) return pack;
      const mat = (await res.json()).materials;
      const portraits = mat.people
        .map((f) => ({ name: f.name.toLowerCase(), url: (mat.photos.find((ph) => ph.id === f.photoId) || {}).url }))
        .filter((f) => f.url);
      // album photos (not cropped portraits) dated in the last seven days, oldest first
      const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const today = day(new Date());
      const thisWeek = () =>
        mat.photos
          .filter((ph) => !ph.croppedFrom && /^\d{4}-\d{2}-\d{2}$/.test(ph.year || ''))
          .map((ph) => ({ ph, at: day(new Date(ph.year + 'T00:00')) }))
          .filter((x) => x.at <= today && today - x.at < 7 * 864e5)
          .sort((a, b) => a.at - b.at);
      const same = (a, b) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));
      (pack.people || []).forEach((p) => {
        const hit = !p.photoDataUrl && portraits.find((f) => same(f.name, p.name.toLowerCase()));
        if (hit) p.photoDataUrl = hit.url;
      });
      const attic = pack.rooms && pack.rooms.attic;
      if (attic && !(attic.photos || []).some((p) => p.photoDataUrl)) {
        const week = thisWeek().slice(-3);
        if (week.length === 3) {
          attic.photos = week.map(({ ph }, i) => ({ id: 'a' + (i + 1), label: ph.caption || 'a photo from this week', photoDataUrl: ph.url }));
        }
      }
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
      // the hall hangs the album photos the pack names by caption
      ((pack.rooms && pack.rooms.today && pack.rooms.today.photos) || []).forEach((p) => {
        if (p.photoDataUrl || !p.caption) return;
        const ph = mat.photos.find((x) => !x.croppedFrom && (x.caption || '').toLowerCase() === p.caption.toLowerCase());
        if (ph) p.photoDataUrl = ph.url;
      });
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
    } catch (_) {}
    return pack;
  }

  async function goPlay() {
    try {
      const res = await fetch('/api/pack');
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
