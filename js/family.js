(function (global) {
  const STEPS = ['who', 'talk', 'keep'];
  const STEP_LABELS = { who: 'Name', talk: 'Talk', keep: 'Photos' };

  let step = 0;
  let draft = emptyDraft();
  let onSaved = null;
  let recorder = null;
  let chunks = [];
  let recStart = 0;
  let recognition = null;
  let recTimer = null;
  let talkBaseline = '';

  function emptyDraft() {
    return {
      preferredName: '',
      addressAs: '',
      eras: ['thisWeek'],
      people: [{ id: HomeAgainPack.uid('p'), name: '', relation: '', photoDataUrl: null }],
      memories: [],
      songs: [],
      photos: [],
      voice: { transcript: '', audioDataUrl: null, durationMs: 0 }
    };
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function escapeAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderProgress(root) {
    const el = root.querySelector('#familyProgress');
    el.innerHTML = STEPS.map((id, i) => {
      const cls = i === step ? 'on' : i < step ? 'done' : '';
      return `<span class="dot ${cls}">${STEP_LABELS[id]}</span>`;
    }).join('');
  }

  function syncFromDom(root) {
    const id = STEPS[step];
    if (id === 'who') {
      draft.preferredName = root.querySelector('#fName').value;
      draft.addressAs = root.querySelector('#fAddress').value || root.querySelector('#fName').value;
    }
    if (id === 'talk') {
      const ta = root.querySelector('#fTalk');
      if (ta) draft.voice.transcript = ta.value;
    }
    if (id === 'keep') {
      draft.people = [...root.querySelectorAll('.person-card')].map((card) => ({
        id: card.dataset.id,
        name: card.querySelector('.p-name').value,
        relation: card.querySelector('.p-rel').value,
        photoDataUrl: card.dataset.photo || null
      }));
    }
  }

  function thumbHtml(url) {
    if (url) return `<img class="thumb" src="${url}" alt="">`;
    return `<div class="thumb placeholder">Photo</div>`;
  }

  function stopRecognition() {
    if (recognition) {
      try { recognition.stop(); } catch (_) {}
      recognition = null;
    }
  }

  function startRecognition(root) {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return;
    stopRecognition();
    recognition = new Rec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = document.documentElement.lang || 'en-US';
    recognition.onresult = (ev) => {
      let final = '';
      for (let i = 0; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript + ' ';
      }
      const ta = root.querySelector('#fTalk');
      if (ta && final.trim()) {
        ta.value = [talkBaseline, final.trim()].filter(Boolean).join(' ');
        draft.voice.transcript = ta.value;
      }
    };
    try { recognition.start(); } catch (_) {}
  }

  async function startRecording(root) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      root.querySelector('#recHint').textContent = 'This browser cannot record audio. You can still type below.';
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    talkBaseline = (root.querySelector('#fTalk').value || '').trim();
    recorder = new MediaRecorder(stream);
    recStart = Date.now();
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      draft.voice.durationMs = Date.now() - recStart;
      draft.voice.audioDataUrl = await readFileAsDataUrl(blob);
      const audio = root.querySelector('#fPlayback');
      if (audio) {
        audio.src = draft.voice.audioDataUrl;
        audio.classList.remove('hide');
      }
      recorder = null;
    };
    recorder.start();
    startRecognition(root);
    root.querySelector('#recBtn').classList.add('live');
    root.querySelector('#recBtn').textContent = 'Stop';
    root.querySelector('#recHint').textContent = 'Listening… talk about this week. Who visited. What you ate. A song in the car.';
    recTimer = setInterval(() => {
      const s = Math.round((Date.now() - recStart) / 1000);
      const hint = root.querySelector('#recClock');
      if (hint) hint.textContent = s + 's';
      if (s >= 60) stopRecording(root);
    }, 250);
  }

  function stopRecording(root) {
    if (recTimer) { clearInterval(recTimer); recTimer = null; }
    stopRecognition();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    const btn = root.querySelector('#recBtn');
    if (btn) {
      btn.classList.remove('live');
      btn.textContent = 'Record';
    }
    const hint = root.querySelector('#recHint');
    if (hint) hint.textContent = 'You can record again, or edit the words below.';
  }

  function bindTalk(root) {
    const btn = root.querySelector('#recBtn');
    btn.onclick = async () => {
      if (recorder) stopRecording(root);
      else {
        try { await startRecording(root); }
        catch (_) {
          root.querySelector('#recHint').textContent = 'Microphone permission is needed, or you can type instead.';
        }
      }
    };
    if (draft.voice.audioDataUrl) {
      const audio = root.querySelector('#fPlayback');
      audio.src = draft.voice.audioDataUrl;
      audio.classList.remove('hide');
    }
  }

  function renderStep(root) {
    stopRecording(root);
    const host = root.querySelector('#familyStep');
    const id = STEPS[step];

    if (id === 'who') {
      host.innerHTML = `
        <h2>Who is this for this week?</h2>
        <p class="lead">Just a name the family still uses at the table.</p>
        <div class="field">
          <label for="fName">Their name</label>
          <input id="fName" type="text" placeholder="e.g. Mom, Dad, Eleanor" value="${escapeAttr(draft.preferredName)}">
        </div>
        <div class="field">
          <label for="fAddress">What should we call them in the rooms?</label>
          <input id="fAddress" type="text" placeholder="Usually the same name" value="${escapeAttr(draft.addressAs)}">
        </div>`;
    }

    if (id === 'talk') {
      host.innerHTML = `
        <h2>Tell us about them</h2>
        <p class="lead">Talk about this week — Sunday lunch, a song in the car, tea yesterday. Recent days are enough.</p>
        <div class="recorder">
          <button type="button" class="rec-btn" id="recBtn">Record</button>
          <div>
            <p id="recHint">What happened last Sunday? Who visited? Keep it close and ordinary.</p>
            <p class="clock" id="recClock"></p>
          </div>
        </div>
        <audio id="fPlayback" class="hide" controls></audio>
        <div class="field">
          <label for="fTalk">Words (you can edit)</label>
          <textarea id="fTalk" placeholder="Or type a few memories here.">${escapeHtml(draft.voice.transcript)}</textarea>
        </div>`;
      bindTalk(root);
    }

    if (id === 'keep') {
      host.innerHTML = `
        <h2>A few faces, if you have them</h2>
        <p class="lead">Optional. Photos make the kitchen table feel like home. Then we save the pack.</p>
        <div class="card-list" id="peopleList">
          ${draft.people.map((p) => personCard(p)).join('')}
        </div>
        <button type="button" class="btn btn-secondary" id="addPerson">Add another person</button>
        <div class="review-box" style="margin-top:20px">
          <h3>${escapeHtml(draft.preferredName || 'Unnamed')}</h3>
          <ul>
            <li>${draft.voice.audioDataUrl ? 'A voice recording is ready.' : 'No recording yet — words still count.'}</li>
            <li>${(draft.voice.transcript || '').trim() ? 'Memories were heard or typed.' : 'Add a little talk on the previous step if you can.'}</li>
          </ul>
        </div>`;
      bindPeople(host);
      host.querySelector('#addPerson').onclick = () => {
        syncFromDom(root);
        draft.people.push({
          id: HomeAgainPack.uid('p'),
          name: '',
          relation: '',
          photoDataUrl: null
        });
        renderStep(root);
      };
    }

    const back = root.querySelector('#familyBack');
    const next = root.querySelector('#familyNext');
    back.classList.toggle('hide', step === 0);
    next.textContent = id === 'keep' ? 'Save pack' : 'Continue';
    renderProgress(root);
  }

  function personCard(p) {
    return `
      <div class="person-card" data-id="${p.id}" data-photo="${escapeAttr(p.photoDataUrl || '')}">
        <div class="photo-row">
          ${thumbHtml(p.photoDataUrl)}
          <button type="button" class="btn btn-secondary file-btn">Add photo<input type="file" accept="image/*"></button>
          <button type="button" class="btn btn-ghost remove-person">Remove</button>
        </div>
        <div class="field">
          <label>Name</label>
          <input class="p-name" type="text" value="${escapeAttr(p.name)}" placeholder="Mei, Daniel…">
        </div>
        <div class="field">
          <label>Who they are to them</label>
          <input class="p-rel" type="text" value="${escapeAttr(p.relation)}" placeholder="daughter, neighbor">
        </div>
      </div>`;
  }

  function bindPeople(host) {
    host.querySelectorAll('.person-card').forEach((card) => {
      const input = card.querySelector('input[type="file"]');
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const url = await readFileAsDataUrl(file);
        card.dataset.photo = url;
        card.querySelector('.thumb, .placeholder').outerHTML = thumbHtml(url);
      };
      card.querySelector('.remove-person').onclick = () => {
        if (host.querySelectorAll('.person-card').length <= 1) return;
        card.remove();
      };
    });
  }

  function save() {
    const pack = HomeAgainPack.generateFromFamily(draft);
    HomeAgainPack.savePack(pack);
    return pack;
  }

  function mount(root, opts) {
    onSaved = (opts && opts.onSaved) || null;
    step = 0;
    const existing = HomeAgainPack.loadPack();
    if (existing) {
      draft = {
        preferredName: existing.profile.preferredName || '',
        addressAs: existing.profile.addressAs || '',
        eras: (existing.profile.eras || []).slice(),
        people: (existing.people || []).map((p) => ({
          id: p.id || HomeAgainPack.uid('p'),
          name: p.name || '',
          relation: p.relation || '',
          photoDataUrl: p.photoDataUrl || null
        })),
        memories: existing.memories || [],
        songs: existing.songs || [],
        photos: [],
        voice: {
          transcript: (existing.voice && existing.voice.transcript) || '',
          audioDataUrl: (existing.voice && existing.voice.audioDataUrl) || null,
          durationMs: (existing.voice && existing.voice.durationMs) || 0
        }
      };
      if (!draft.people.length) draft.people = emptyDraft().people;
    } else {
      draft = emptyDraft();
    }

    root.querySelector('#familyBack').onclick = () => {
      syncFromDom(root);
      if (step > 0) {
        step -= 1;
        renderStep(root);
      }
    };

    root.querySelector('#familyNext').onclick = () => {
      syncFromDom(root);
      if (STEPS[step] === 'keep') {
        const pack = save();
        if (onSaved) onSaved(pack);
        return;
      }
      step += 1;
      renderStep(root);
    };

    root.querySelector('#familyExport').onclick = () => {
      syncFromDom(root);
      HomeAgainPack.exportPack(HomeAgainPack.generateFromFamily(draft));
    };

    renderStep(root);
  }

  global.HomeAgainFamily = { mount };
})(window);
