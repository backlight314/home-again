(function (global) {
  const synth = window.speechSynthesis;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let speaking = false;
  let queueToken = 0;
  const roster = { narrator: null, person: null, letter: null, warm: null };

  function allVoices() {
    return synth ? synth.getVoices() || [] : [];
  }

  function score(v, kind) {
    const n = (v.name || '') + ' ' + (v.lang || '');
    let s = 0;
    if (!/^en/i.test(v.lang || 'en')) s -= 8;
    if (/compact|eloquence|whisper|zarvox|trinoids|boing|bells|cellos|organ|bad news|good news|pipe|princess|albert|bahh|bubbles|junior|kathy|bells/i.test(n)) s -= 80;
    if (/premium|enhanced|neural|natural|superstar|siri|online \(natural\)|multilingual/i.test(n)) s += 28;
    if (/samantha|ava|allison|susan|zoe|karen|moira|tessa|fiona|serena|victoria|kate|martha|jenny|aria|sara|sonia|emma|google uk english female|microsoft zira|microsoft jenny/i.test(n)) s += 18;
    if (/daniel|tom|alex|fred|gordon|rishi|aaron|guy|davis|matthew|google uk english male|microsoft david|nicky/i.test(n)) s += 10;
    if (kind === 'narrator' && /samantha|karen|moira|ava|serena|jenny|sara/i.test(n)) s += 8;
    if (kind === 'person' && /daniel|alex|gordon|tom|guy|matthew/i.test(n)) s += 8;
    if (kind === 'letter' && /moira|fiona|tessa|victoria|kate/i.test(n)) s += 8;
    if (kind === 'warm' && /samantha|ava|karen/i.test(n)) s += 6;
    if (v.localService) s += 4;
    return s;
  }

  function best(kind, used) {
    const list = allVoices()
      .map((v) => ({ v, s: score(v, kind) }))
      .filter((x) => x.s > -20)
      .sort((a, b) => b.s - a.s);
    const pick = list.find((x) => !used.has(x.v.name)) || list[0];
    return pick ? pick.v : null;
  }

  function warm() {
    if (!synth) return;
    const used = new Set();
    roster.narrator = best('narrator', used);
    if (roster.narrator) used.add(roster.narrator.name);
    roster.person = best('person', used);
    if (roster.person) used.add(roster.person.name);
    roster.letter = best('letter', used);
    if (roster.letter) used.add(roster.letter.name);
    roster.warm = best('warm', used) || roster.narrator;
  }

  if (synth) {
    synth.addEventListener('voiceschanged', warm);
    warm();
  }

  function stop() {
    queueToken += 1;
    speaking = false;
    if (synth) synth.cancel();
    if (rec) {
      try { rec.stop(); } catch (_) {}
      rec = null;
    }
  }

  function soften(text) {
    return String(text || '')
      .replace(/["<>]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/([.!?])\s*/g, '$1 ')
      .replace(/,\s*/g, ', ')
      .trim();
  }

  function phrases(text) {
    const t = soften(text);
    if (!t) return [];
    return t
      .split(/(?<=[,:;])\s+|(?<=[.!?])\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  function roleVoice(role) {
    warm();
    if (role === 'person') return roster.person || roster.narrator;
    if (role === 'letter') return roster.letter || roster.warm || roster.narrator;
    if (role === 'warm') return roster.warm || roster.narrator;
    return roster.narrator;
  }

  function roleTone(role) {
    if (role === 'person') return { rate: 0.86, pitch: 0.96 };
    if (role === 'letter') return { rate: 0.8, pitch: 0.94 };
    if (role === 'warm') return { rate: 0.83, pitch: 1.02 };
    return { rate: 0.84, pitch: 1.0 };
  }

  function speakChunk(text, voice, tone) {
    return new Promise((resolve) => {
      if (!synth || !text) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = tone.rate;
      u.pitch = tone.pitch;
      u.volume = 1;
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang || 'en-US';
      } else {
        u.lang = 'en-US';
      }
      u.onend = resolve;
      u.onerror = resolve;
      synth.speak(u);
    });
  }

  function speak(text, opts) {
    if (!text || !synth) return Promise.resolve();
    const role = (opts && opts.role) || 'narrator';
    const token = ++queueToken;
    const bits = phrases(text);
    const voice = roleVoice(role);
    const tone = roleTone(role);
    speaking = true;

    return (async () => {
      for (let i = 0; i < bits.length; i++) {
        if (token !== queueToken) return;
        await speakChunk(bits[i], voice, tone);
        if (token !== queueToken) return;
        if (i < bits.length - 1) {
          await new Promise((r) => setTimeout(r, /[.!?]$/.test(bits[i]) ? 260 : 140));
        }
      }
      if (token === queueToken) speaking = false;
    })();
  }

  function listen(onFinal, onFail) {
    if (!Rec) {
      if (onFail) onFail();
      return () => {};
    }
    if (rec) {
      try { rec.stop(); } catch (_) {}
    }
    rec = new Rec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let last = '';
    rec.onresult = (ev) => {
      let bits = '';
      for (let i = 0; i < ev.results.length; i++) bits += ev.results[i][0].transcript + ' ';
      last = bits.trim();
      if (onFinal) onFinal(last, ev.results[ev.results.length - 1].isFinal);
    };
    rec.onerror = () => { if (onFail) onFail(); };
    try { rec.start(); } catch (_) { if (onFail) onFail(); }
    return () => {
      try { rec && rec.stop(); } catch (_) {}
      rec = null;
      return last;
    };
  }

  let audioCtx = null;
  let radioNodes = [];

  function radio(clear) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      radioNodes.forEach((n) => { try { n.stop(); } catch (_) {} });
      radioNodes = [];
      const ctx = audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const dur = clear ? 3.4 : 0.8;
      const master = ctx.createGain();
      master.gain.setValueAtTime(clear ? 0.045 : 0.025, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      master.connect(ctx.destination);
      if (clear) {
        [196, 247, 294].forEach((f, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = f;
          g.gain.value = 0.35 - i * 0.08;
          osc.connect(g);
          g.connect(master);
          osc.start();
          osc.stop(ctx.currentTime + dur);
          radioNodes.push(osc);
        });
      } else {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 70;
        osc.connect(master);
        osc.start();
        osc.stop(ctx.currentTime + dur);
        radioNodes.push(osc);
      }
    } catch (_) {}
  }

  global.HomeAgainVoice = { speak, stop, listen, radio, warm };
})(window);
