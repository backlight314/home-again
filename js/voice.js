(function (global) {
  const synth = window.speechSynthesis;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let speaking = false;
  let queueToken = 0;
  let clipAudio = null;
  const roster = { narrator: null, mei: null, daniel: null, rose: null, warm: null };

  function allVoices() {
    return synth ? synth.getVoices() || [] : [];
  }

  function score(v, kind) {
    const n = (v.name || '') + ' ' + (v.lang || '');
    let s = 0;
    if (!/^en/i.test(v.lang || 'en')) s -= 8;
    if (/compact|eloquence|whisper|zarvox|trinoids|boing|bells|cellos|organ|bad news|good news|pipe|princess|albert|bahh|bubbles|junior|kathy|fred|jester|grandma|grandpa|eddy|flo|rocko|superstar/i.test(n)) s -= 80;
    if (/premium|enhanced|neural|natural|online \(natural\)|multilingual|siri/i.test(n)) s += 32;
    if (/ava|allison|zoe|nicky|susan|samantha|karen|moira|tessa|serena|victoria|jenny|aria|sara|sonia|emma|michelle|google uk english female|microsoft/i.test(n)) s += 16;
    if (/daniel|tom|alex|gordon|rishi|aaron|guy|davis|matthew|andrew|christopher|google uk english male/i.test(n)) s += 10;
    if (kind === 'narrator' && /jenny|samantha|karen|ava|sara|aria/i.test(n)) s += 8;
    if (kind === 'mei' && /ava|allison|zoe|nicky|samantha/i.test(n)) s += 10;
    if (kind === 'daniel' && /andrew|daniel|alex|guy|matthew|tom/i.test(n)) s += 10;
    if (kind === 'rose' && /emma|moira|karen|sonia|susan/i.test(n)) s += 10;
    if (kind === 'warm' && /aria|samantha|ava/i.test(n)) s += 8;
    if (v.localService) s += 6;
    if (/google us english$/i.test(n)) s -= 6;
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
    ['narrator', 'mei', 'daniel', 'rose', 'warm'].forEach((kind) => {
      roster[kind] = best(kind, used);
      if (roster[kind]) used.add(roster[kind].name);
    });
  }

  if (synth) {
    synth.addEventListener('voiceschanged', warm);
    warm();
  }

  function stopClip() {
    if (clipAudio) {
      try {
        clipAudio.pause();
        clipAudio.src = '';
      } catch (_) {}
      clipAudio = null;
    }
  }

  function stop() {
    queueToken += 1;
    speaking = false;
    stopClip();
    stopRadio();
    if (synth) synth.cancel();
    if (rec) {
      try {
        rec.stop();
      } catch (_) {}
      rec = null;
    }
  }

  function soften(text) {
    return String(text || '')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/["<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function canonWho(name) {
    const n = String(name || '')
      .toLowerCase()
      .replace(/^aunt\s+/, '')
      .trim();
    if (!n) return '';
    if (/mei/.test(n)) return 'mei';
    if (/daniel/.test(n)) return 'daniel';
    if (/rose/.test(n)) return 'rose';
    if (/warm|mom/.test(n)) return 'warm';
    if (/narrat|family/.test(n)) return 'narrator';
    return n;
  }

  function splitSpoken(text, role, speaker) {
    const raw = String(text || '').trim();
    const tagged = raw.match(/^([^:]{1,28}):\s*[“"']?([\s\S]+?)[”"']?\s*$/);
    if (tagged) {
      return { who: canonWho(tagged[1]) || 'narrator', text: tagged[2].replace(/^["“]|["”]$/g, '').trim() };
    }
    if (speaker) return { who: canonWho(speaker) || roleWho(role), text: raw };
    return { who: roleWho(role), text: raw };
  }

  function roleWho(role) {
    if (role === 'person') return 'daniel';
    if (role === 'letter') return 'mei';
    if (role === 'warm') return 'warm';
    return 'narrator';
  }

  function clipKey(who, text) {
    return (
      who +
      '|' +
      soften(text)
        .replace(/[—–]/g, '—')
        .toLowerCase()
    );
  }

  function findClip(who, text) {
    const bank = global.HomeAgainVoiceBank || {};
    const t = soften(text);
    const tries = [t, t.replace(/[—–]/g, '-'), t.replace(/[—–]/g, ','), t.replace(/\.$/, ''), t + '.'];
    for (let i = 0; i < tries.length; i++) {
      const k = clipKey(who, tries[i]);
      if (bank[k]) return bank[k];
    }
    return null;
  }

  function roleVoice(who) {
    warm();
    return roster[who] || roster.narrator;
  }

  function roleTone(who) {
    if (who === 'mei') return { rate: 0.92, pitch: 1.04 };
    if (who === 'daniel') return { rate: 0.9, pitch: 0.96 };
    if (who === 'rose') return { rate: 0.88, pitch: 0.94 };
    if (who === 'warm') return { rate: 0.9, pitch: 1.02 };
    return { rate: 0.9, pitch: 1.0 };
  }

  function playClip(src, token) {
    return new Promise((resolve) => {
      stopClip();
      const a = new Audio(src);
      clipAudio = a;
      const done = () => {
        if (clipAudio === a) clipAudio = null;
        resolve();
      };
      a.onended = done;
      a.onerror = done;
      a.play().then(() => {
        if (token !== queueToken) {
          stopClip();
          resolve();
        }
      }).catch(done);
    });
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
    if (!text) return Promise.resolve();
    const role = (opts && opts.role) || 'narrator';
    const spoken = splitSpoken(text, role, opts && opts.speaker);
    const token = ++queueToken;
    speaking = true;
    const clip = findClip(spoken.who, spoken.text);

    return (async () => {
      if (clip) {
        if (token !== queueToken) return;
        await playClip(clip, token);
        if (token === queueToken) speaking = false;
        return;
      }
      if (!synth) {
        speaking = false;
        return;
      }
      const voice = roleVoice(spoken.who);
      const tone = roleTone(spoken.who);
      if (token !== queueToken) return;
      await speakChunk(soften(spoken.text), voice, tone);
      if (token === queueToken) speaking = false;
    })();
  }

  function preload() {
    const bank = global.HomeAgainVoiceBank || {};
    Object.keys(bank).forEach((k) => {
      const a = new Audio();
      a.preload = 'auto';
      a.src = bank[k];
    });
  }

  function listen(onFinal, onFail) {
    if (!Rec) {
      if (onFail) onFail();
      return () => {};
    }
    if (rec) {
      try {
        rec.stop();
      } catch (_) {}
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
    rec.onerror = () => {
      if (onFail) onFail();
    };
    try {
      rec.start();
    } catch (_) {
      if (onFail) onFail();
    }
    return () => {
      try {
        rec && rec.stop();
      } catch (_) {}
      rec = null;
      return last;
    };
  }

  let audioCtx = null;
  let radioNodes = [];
  let radioTimer = 0;
  let radioEl = null;

  function stopRadio() {
    if (radioTimer) {
      clearInterval(radioTimer);
      radioTimer = 0;
    }
    if (radioEl) {
      try {
        radioEl.pause();
        radioEl.src = '';
      } catch (_) {}
      radioEl = null;
    }
    radioNodes.forEach((n) => {
      try {
        n.stop();
      } catch (_) {}
      try {
        n.disconnect();
      } catch (_) {}
    });
    radioNodes = [];
  }

  function noiseBuf(ctx) {
    const len = Math.floor(ctx.sampleRate * 0.8);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function radio(clip) {
    try {
      stopRadio();
      if (clip) {
        radioEl = new Audio(clip);
        radioEl.loop = true;
        radioEl.volume = 0.82;
        radioEl.play().catch(() => {});
        return;
      }
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const master = ctx.createGain();
      master.gain.value = 0.035;
      master.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf(ctx);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1200;
      f.Q.value = 0.6;
      src.connect(f);
      f.connect(master);
      src.start();
      radioNodes.push(src);
    } catch (_) {}
  }

  global.HomeAgainVoice = { speak, stop, listen, radio, warm, preload };
})(window);
