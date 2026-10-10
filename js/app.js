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

  async function goPlay() {
    try {
      const res = await fetch('/api/pack');
      if (res.ok) HomeAgainPack.savePack(await res.json());
    } catch (_) {}
    showView('play');
    HomeAgainPlay.start(HomeAgainPack.activePack());
  }

  document.getElementById('btnPlay').onclick = goPlay;
  document.getElementById('btnFamily').onclick = goFamily;
  document.getElementById('globalBack').onclick = goHome;

  refreshHomeStatus();
  if (new URLSearchParams(location.search).has('play')) goPlay();
  else showView('home');
})();
