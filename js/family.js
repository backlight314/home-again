(function (global) {
  let onSaved = null;
  let pendingPhotos = [];
  let pendingVoice = null;
  let recorder = null;
  let chunks = [];
  let busy = false;
  let built = false;

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The guide could not answer.');
    return data;
  }

  function drawProgress(root, prog) {
    const el = root.querySelector('#familyProgress');
    if (!prog || !prog.items) {
      el.innerHTML = '<span class="dot on">Talk</span>';
      return;
    }
    built = !!prog.built;
    el.innerHTML = prog.items
      .map((i) => `<span class="dot ${i.done ? 'done' : ''}">${escapeHtml(i.label)}</span>`)
      .join('');
    const play = root.querySelector('#familyPlay');
    if (play) play.classList.toggle('hide', !built);
    const next = root.querySelector('#familyNext');
    if (next) next.textContent = prog.ready && !prog.built ? 'Build album' : 'Send';
  }

  function addMessage(log, role, text, attachments) {
    if (!text && !(attachments && attachments.length)) return;
    const div = document.createElement('div');
    div.className = 'fmsg ' + role;
    let html = text ? `<p>${escapeHtml(text)}</p>` : '';
    (attachments || []).forEach((a) => {
      if (a.kind === 'photo' || a.url && /\.(jpg|jpeg|png|webp|gif)$/i.test(a.url)) {
        html += `<img src="${escapeHtml(a.url)}" alt="">`;
      } else if (a.kind === 'voice' || a.url) {
        html += `<audio controls src="${escapeHtml(a.url)}"></audio>`;
      }
    });
    div.innerHTML = html;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function drawTray(root) {
    const tray = root.querySelector('#fTray');
    tray.innerHTML =
      pendingPhotos
        .map(
          (p, i) =>
            `<span class="chip"><img src="${p.dataUrl}" alt=""><button type="button" data-photo="${i}" aria-label="Remove">&times;</button></span>`
        )
        .join('') +
      (pendingVoice
        ? `<span class="chip"><audio controls src="${pendingVoice.url}"></audio><button type="button" data-voice aria-label="Remove">&times;</button></span>`
        : '');
  }

  async function send(root, extra) {
    if (busy) return;
    const input = root.querySelector('#fTalk');
    const text = (input.value || '').trim();
    const start = extra && extra.start;
    if (!start && !text && !pendingPhotos.length && !pendingVoice) return;
    busy = true;
    const log = root.querySelector('#fLog');
    const body = {
      text: (extra && extra.text) || text,
      photos: pendingPhotos.map((p) => ({ dataUrl: p.dataUrl, hash: p.hash || '', faces: p.faces })),
      voice: pendingVoice ? pendingVoice.dataUrl : null,
      start: !!start
    };
    if (!start) {
      addMessage(log, 'family', body.text, [
        ...pendingPhotos.map((p) => ({ kind: 'photo', url: p.dataUrl })),
        ...(pendingVoice ? [{ kind: 'voice', url: pendingVoice.url }] : [])
      ]);
    }
    input.value = '';
    pendingPhotos = [];
    pendingVoice = null;
    drawTray(root);
    const status = root.querySelector('#fStatus');
    status.textContent = 'The guide is listening…';
    try {
      const r = await api('POST', '/api/chat', body);
      addMessage(log, 'guide', r.reply, r.attachments);
      drawProgress(root, r.progress);
      status.textContent = '';
    } catch (err) {
      addMessage(log, 'err', err.message);
      status.textContent = '';
    }
    busy = false;
  }

  async function playBuilt() {
    const pack = await api('GET', '/api/pack');
    HomeAgainPack.savePack(pack);
    if (onSaved) onSaved(pack);
  }

  function mount(root, opts) {
    onSaved = (opts && opts.onSaved) || null;
    pendingPhotos = [];
    pendingVoice = null;
    built = false;
    root.querySelector('#familyStep').innerHTML = `
      <h2>Talk</h2>
      <p class="lead">Tell the guide who this week is for. Add photos and a voice if you have them. It will make the album from what you share.</p>
      <div class="flog" id="fLog" role="log" aria-live="polite"></div>
      <p class="fstatus" id="fStatus"></p>
      <div class="ftray" id="fTray"></div>
      <div class="field">
        <label for="fTalk">Message</label>
        <textarea id="fTalk" placeholder="Who visited this week? What was for lunch?"></textarea>
      </div>
      <input id="fPhoto" type="file" accept="image/*" multiple hidden>
    `;
    const log = root.querySelector('#fLog');
    root.querySelector('#familyBack').classList.add('hide');
    root.querySelector('#familyNext').textContent = 'Send';
    root.querySelector('#familyExport').textContent = 'Start over';
    let play = root.querySelector('#familyPlay');
    if (!play) {
      play = document.createElement('button');
      play.id = 'familyPlay';
      play.type = 'button';
      play.className = 'btn btn-primary hide';
      play.textContent = 'Play this week';
      root.querySelector('.family-nav').appendChild(play);
    }
    play.onclick = () => playBuilt().catch((err) => addMessage(log, 'err', err.message));

    root.querySelector('#familyNext').onclick = async () => {
      if (root.querySelector('#familyNext').textContent === 'Build album') {
        const status = root.querySelector('#fStatus');
        status.textContent = 'Making this week’s album…';
        try {
          const r = await api('POST', '/api/build');
          addMessage(log, 'guide', r.summary || 'The album is ready.');
          const state = await api('GET', '/api/chat');
          drawProgress(root, { ...state.progress, built: true });
          status.textContent = '';
        } catch (err) {
          addMessage(log, 'err', err.message);
          status.textContent = '';
        }
        return;
      }
      send(root);
    };
    root.querySelector('#fTalk').onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(root);
      }
    };

    const photo = root.querySelector('#fPhoto');
    root.querySelector('#familyPhoto') && (root.querySelector('#familyPhoto').onclick = () => photo.click());
    if (!root.querySelector('#familyPhoto')) {
      const b = document.createElement('button');
      b.id = 'familyPhoto';
      b.type = 'button';
      b.className = 'btn btn-secondary';
      b.textContent = 'Photo';
      root.querySelector('.family-nav').insertBefore(b, root.querySelector('#familyNext'));
      b.onclick = () => photo.click();
    }
    photo.onchange = async () => {
      for (const file of photo.files || []) {
        pendingPhotos.push({ dataUrl: await readFileAsDataUrl(file) });
      }
      photo.value = '';
      drawTray(root);
    };
    root.querySelector('#fTray').onclick = (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.photo !== undefined) pendingPhotos.splice(+btn.dataset.photo, 1);
      if (btn.dataset.voice !== undefined) pendingVoice = null;
      drawTray(root);
    };

    if (!root.querySelector('#familyMic')) {
      const b = document.createElement('button');
      b.id = 'familyMic';
      b.type = 'button';
      b.className = 'btn btn-secondary';
      b.textContent = 'Voice';
      root.querySelector('.family-nav').insertBefore(b, root.querySelector('#familyNext'));
    }
    root.querySelector('#familyMic').onclick = async () => {
      if (recorder) {
        recorder.stop();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const dataUrl = await readFileAsDataUrl(blob);
          pendingVoice = { dataUrl, url: dataUrl };
          recorder = null;
          root.querySelector('#familyMic').textContent = 'Voice';
          drawTray(root);
        };
        recorder.start();
        root.querySelector('#familyMic').textContent = 'Stop';
      } catch (_) {
        addMessage(log, 'err', 'Microphone permission is needed, or you can type instead.');
      }
    };

    root.querySelector('#familyExport').onclick = async () => {
      if (!confirm('Start the talk over? Saved photos stay on this computer.')) return;
      try {
        await api('POST', '/api/chat/reset');
        log.innerHTML = '';
        built = false;
        drawProgress(root, null);
        await send(root, { start: true });
      } catch (err) {
        addMessage(log, 'err', err.message);
      }
    };

    (async () => {
      try {
        const r = await api('GET', '/api/chat');
        drawProgress(root, r.progress);
        (r.transcript || []).forEach((m) => addMessage(log, m.role === 'family' ? 'family' : 'guide', m.text, m.attachments));
        if (!(r.transcript || []).length) await send(root, { start: true });
      } catch (err) {
        addMessage(
          log,
          'err',
          err.message.indexOf('fetch') >= 0
            ? 'Start the app with npm start so the guide can talk. Open http://localhost:8787'
            : err.message
        );
      }
    })();
  }

  global.HomeAgainFamily = { mount };
})(window);
