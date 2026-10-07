// PLAYER - controls live outside the composition and are hidden in recording mode.
// Time is the single source of truth: playback derives t from a clock anchor, so pausing,
// seeking and restarting never drift out of sync with subtitles or animation.
(function () {
  'use strict';
  const S = window.SERIES, C = window.EPISODE_CONFIG;
  const canvas = document.getElementById('video');
  const ep = new window.SeriesEngine.Episode(canvas, S, C);
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  let t = Math.min(S.duration, Math.max(0, parseFloat(params.get('t')) || 0));
  let playing = false;
  let anchorT = 0, anchorNow = 0;
  let onEnd = null;

  const fmt = (s) => {
    const m = Math.floor(s / 60), r = s - m * 60;
    return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`;
  };

  function draw() {
    ep.render(t);
    $('scrub').value = t;
    $('time').textContent = `${fmt(t)} / 00:45`;
  }

  function seek(v) {
    t = Math.min(S.duration, Math.max(0, v));
    anchorT = t;
    anchorNow = performance.now();
    draw();
  }

  function play() {
    if (t >= S.duration - 0.01) t = 0;
    playing = true;
    anchorT = t;
    anchorNow = performance.now();
    $('play').textContent = 'Pause';
    requestAnimationFrame(tick);
  }

  function pause() {
    playing = false;
    $('play').textContent = 'Play';
  }

  function tick(now) {
    if (!playing) return;
    t = anchorT + (now - anchorNow) / 1000;
    if (t >= S.duration) {
      t = S.duration;
      draw();
      pause();
      if (onEnd) { const f = onEnd; onEnd = null; f(); }
      return;
    }
    draw();
    requestAnimationFrame(tick);
  }

  function msg(s) { $('msg').textContent = s; }

  // chapter jump buttons
  S.timeline.forEach((c) => {
    const b = document.createElement('button');
    b.textContent = c.label || (c.id === 'opening' ? 'Opening' : 'Closing');
    b.onclick = () => seek(c.start);
    $('chapters').appendChild(b);
  });

  $('play').onclick = () => (playing ? pause() : play());
  $('restart').onclick = () => { seek(0); play(); };
  $('scrub').oninput = (e) => seek(parseFloat(e.target.value));
  $('phone').onclick = (e) => {
    const on = document.body.classList.toggle('phone');
    e.target.setAttribute('aria-pressed', on);
  };
  $('safe').onclick = (e) => {
    ep.showSafe = !ep.showSafe;
    e.target.setAttribute('aria-pressed', ep.showSafe);
    draw();
  };
  function setRecord(on) {
    document.body.classList.toggle('record', on);
    if (on) msg('');
  }
  $('record').onclick = () => setRecord(true);
  $('png').onclick = () => {
    const a = document.createElement('a');
    a.download = `iaward-ep01-frame-${t.toFixed(2)}s.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    msg('Frame saved as PNG (1080 × 1920).');
  };
  $('webm').onclick = () => {
    if (!canvas.captureStream || !window.MediaRecorder) {
      msg('This browser cannot record the canvas. Use the MP4 render script instead (see README).');
      return;
    }
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 16e6 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const a = document.createElement('a');
      a.download = 'iaward-ep01-realtime.webm';
      a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      a.click();
      msg('WebM saved (silent, real-time capture). For a frame-accurate H.264 MP4, use tools/render-mp4.mjs.');
    };
    msg('Recording WebM in real time... keep this tab visible for 45 seconds.');
    seek(0);
    rec.start();
    onEnd = () => setTimeout(() => rec.stop(), 150);
    play();
  };

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.key !== ' ') return;
    if (e.key === ' ') { e.preventDefault(); playing ? pause() : play(); }
    else if (e.key === 'ArrowRight') { pause(); seek(t + 1 / S.fps); }
    else if (e.key === 'ArrowLeft') { pause(); seek(t - 1 / S.fps); }
    else if (e.key === 'Home') seek(0);
    else if (e.key === 'r' || e.key === 'R') setRecord(!document.body.classList.contains('record'));
    else if (e.key === 'Escape') setRecord(false);
  });

  // Hooks for the frame-accurate renderer and the validator.
  window.__episode = {
    engine: ep,
    duration: S.duration,
    fps: S.fps,
    renderAt(v) { pause(); t = v; ep.render(v); },
    ready: null,
  };

  async function loadFonts() {
    const faces = (window.SERIES_FONTS || []).map((f) => new FontFace(f.family, `url(${f.src})`, { weight: f.weight }));
    for (const f of faces) {
      try { document.fonts.add(await f.load()); } catch (err) { console.warn('Font failed to load; using fallback', err); }
    }
  }

  window.__episode.ready = loadFonts().then(() => {
    if (params.get('record') === '1') document.body.classList.add('record');
    if (params.get('native') === '1') document.body.classList.add('native');
    if (params.get('safe') === '1') ep.showSafe = true;
    draw();
    if (params.get('autoplay') === '1') play();
    return true;
  });
})();
