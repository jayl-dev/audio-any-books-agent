/**
 * create_epub_player_html.js
 * Builds a self-contained reader page for an EPUB chapter: reflowing text (with images inlined),
 * synchronized narration, current-paragraph highlight with follow-along scrolling, and
 * click-a-paragraph-to-jump. Only the MP3 is loaded from beside the page.
 */

// JSON that is safe to embed inside a <script> element
const LINE_SEP = new RegExp(String.fromCharCode(0x2028), 'g');
const PARA_SEP = new RegExp(String.fromCharCode(0x2029), 'g');
const embed = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(LINE_SEP, '\\u2028').replace(PARA_SEP, '\\u2029');
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function createEpubPlayerHtml({ title, bookTitle, chapterTitle, audioFilename, markers, paragraphs, blocks }) {
  const paraData = paragraphs.map(p => ({ start: p.startSeconds, end: p.endSeconds, blocks: p.blocks || [] }));
  const chapterHtml = blocks.map(b => b.html).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #e9e4da;
      --paper: #fbf8f2;
      --text: #1f1d1a;
      --muted: #6b665d;
      --line: rgba(0, 0, 0, 0.1);
      --brand: #0e7490;
      --hl: rgba(14, 116, 144, 0.14);
      --hl-edge: #0e7490;
      --code-bg: #f1ece2;
      --bar: rgba(251, 248, 242, 0.94);
      --fs: 19px;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --bg: #0b1120; --paper: #111827; --text: #e5e7eb; --muted: #9ca3af; --line: rgba(255, 255, 255, 0.12);
        --brand: #38bdf8; --hl: rgba(56, 189, 248, 0.16); --hl-edge: #38bdf8; --code-bg: #0b1222; --bar: rgba(17, 24, 39, 0.94);
      }
    }
    :root[data-theme="dark"] {
      --bg: #0b1120; --paper: #111827; --text: #e5e7eb; --muted: #9ca3af; --line: rgba(255, 255, 255, 0.12);
      --brand: #38bdf8; --hl: rgba(56, 189, 248, 0.16); --hl-edge: #38bdf8; --code-bg: #0b1222; --bar: rgba(17, 24, 39, 0.94);
    }

    * { box-sizing: border-box; }
    html { scroll-padding-top: 80px; scroll-padding-bottom: 140px; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
    button { font: inherit; color: inherit; background: none; border: 1px solid transparent; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
    button:hover { border-color: var(--line); }
    button.on { color: var(--brand); border-color: var(--brand); }

    header.bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bar); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
    header .titles { flex: 1; min-width: 0; }
    header .book { font-size: 0.78rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    header .chapter { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    header .tools { display: flex; gap: 4px; flex-shrink: 0; }

    main { padding: 24px 16px 170px; }
    article.book { max-width: 44rem; margin: 0 auto; background: var(--paper); padding: clamp(20px, 5vw, 56px); border-radius: 6px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
      font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif; font-size: var(--fs); line-height: 1.65; overflow-wrap: break-word; }
    article.book [data-b] { border-radius: 4px; transition: background 0.25s ease, box-shadow 0.25s ease; scroll-margin: 90px 0 150px; }
    article.book [data-b].narrated { cursor: pointer; }
    article.book [data-b].narrated:hover { background: rgba(127, 127, 127, 0.08); }
    body.highlight article.book [data-b].hl { background: var(--hl); box-shadow: -8px 0 0 var(--hl), 8px 0 0 var(--hl), -11px 0 0 var(--hl-edge); }
    article.book h1, article.book h2, article.book h3, article.book h4 { font-family: -apple-system, "Segoe UI", sans-serif; line-height: 1.3; margin: 1.6em 0 0.6em; }
    article.book p { margin: 0 0 1em; }
    article.book pre { font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-size: 0.8em; line-height: 1.5; background: var(--code-bg); padding: 12px 14px; overflow-x: auto; white-space: pre; }
    article.book code { font-family: ui-monospace, Consolas, monospace; font-size: 0.88em; }
    article.book img, article.book svg { max-width: 100%; height: auto; display: block; margin: 1em auto; }
    article.book table { border-collapse: collapse; width: 100%; font-size: 0.85em; margin: 0 0 1em; display: block; overflow-x: auto; }
    article.book td, article.book th { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
    article.book .li { position: relative; padding-left: 1.4em; margin: 0 0 0.5em; }
    article.book .li::before { content: "\\2022"; position: absolute; left: 0.3em; color: var(--muted); }
    article.book blockquote, article.book figcaption { color: var(--muted); }
    article.book a { color: var(--brand); }

    #back-to-narration { position: fixed; left: 50%; transform: translateX(-50%); bottom: 118px; z-index: 11; display: none; background: var(--brand); color: #fff; border: 0; border-radius: 999px; padding: 8px 16px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25); }
    :root[data-theme="dark"] #back-to-narration { color: #0b1120; }

    footer.player { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; background: var(--bar); backdrop-filter: blur(8px); border-top: 1px solid var(--line); padding: 10px 16px 14px; }
    .player-inner { max-width: 44rem; margin: 0 auto; }
    .track { position: relative; height: 8px; background: var(--line); border-radius: 6px; cursor: pointer; overflow: hidden; touch-action: manipulation; }
    .track .loaded { position: absolute; inset: 0 auto 0 0; width: 0; background: rgba(127, 127, 127, 0.25); transition: width 0.2s linear, opacity 0.4s; }
    .track .fill { position: relative; height: 100%; width: 0; background: var(--brand); border-radius: 6px; }
    .meta { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--muted); margin: 6px 0 4px; gap: 12px; }
    #status { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .controls { display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap; }
    #play { width: 46px; height: 46px; border-radius: 50%; background: var(--brand); color: var(--paper); font-size: 1.1rem; border: 0; }
    .speed { display: flex; align-items: center; gap: 2px; margin-left: 8px; font-size: 0.85rem; }
    @media (max-width: 520px) {
      header .book { display: none; }
      .speed { margin-left: 0; }
      main { padding-left: 8px; padding-right: 8px; }
    }
  </style>
</head>
<body class="highlight">
  <header class="bar">
    <div class="titles">
      <div class="book">${escapeHtml(bookTitle || '')}</div>
      <div class="chapter">${escapeHtml(chapterTitle || title)}</div>
    </div>
    <div class="tools">
      <button id="follow-btn" class="on" title="Follow the narration (F)">Follow</button>
      <button id="highlight-btn" class="on" title="Highlight the paragraph being read (H)">Highlight</button>
      <button id="font-down" title="Smaller text (-)">A&minus;</button>
      <button id="font-up" title="Larger text (+)">A+</button>
      <button id="theme-btn" title="Light / dark (T)">&#9681;</button>
    </div>
  </header>

  <main>
    <article class="book" id="book">${chapterHtml}</article>
  </main>

  <button id="back-to-narration" type="button">Back to narration</button>

  <footer class="player">
    <div class="player-inner">
      <div class="track" id="track"><div class="loaded" id="loaded"></div><div class="fill" id="fill"></div></div>
      <div class="meta"><span id="status">Ready</span><span id="time">00:00 / 00:00</span></div>
      <div class="controls">
        <button id="prev-para" title="Previous paragraph ([)">&#9198;</button>
        <button id="back5" title="Back 5 seconds (&larr;)">&#8634; 5s</button>
        <button id="play" title="Play / pause (Space)">&#9654;</button>
        <button id="fwd5" title="Forward 5 seconds (&rarr;)">5s &#8635;</button>
        <button id="next-para" title="Next paragraph (])">&#9197;</button>
        <div class="speed"><button id="slower" title="Slower">&minus;</button><span id="speed-label">1.0x</span><button id="faster" title="Faster">+</button></div>
      </div>
    </div>
  </footer>

  <audio id="audio" src="${escapeHtml(audioFilename)}" preload="metadata"></audio>

  <script>
    const PARAGRAPHS = ${embed(paraData)};
    const MARKERS = ${embed(markers.map(m => ({ page: m.page, start: m.startSeconds, end: m.endSeconds })))};
    const STORE = 'epub_voiceover_' + ${embed(audioFilename)}.replace(/[^a-zA-Z0-9_-]/g, '_');
    const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

    const $ = id => document.getElementById(id);
    const audio = $('audio');
    const book = $('book');
    const root = document.documentElement;
    const store = {
      get(key, fallback) { try { const v = localStorage.getItem(STORE + '_' + key); return v === null ? fallback : JSON.parse(v); } catch (_) { return fallback; } },
      set(key, value) { try { localStorage.setItem(STORE + '_' + key, JSON.stringify(value)); } catch (_) {} }
    };
    const fmt = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };

    // Blocks that are narrated can be clicked to jump there
    const blockEls = {};
    book.querySelectorAll('[data-b]').forEach(el => { blockEls[el.dataset.b] = el; });
    const paraOfBlock = {};
    PARAGRAPHS.forEach((p, i) => p.blocks.forEach(b => { if (!(b in paraOfBlock)) paraOfBlock[b] = i; if (blockEls[b]) blockEls[b].classList.add('narrated'); }));

    // ---------- Preferences ----------
    let follow = store.get('follow', true);
    let highlight = store.get('highlight', true);
    let fontSize = store.get('font', 19);
    const theme = store.get('theme', null);
    if (theme) root.dataset.theme = theme;
    const applyPrefs = () => {
      $('follow-btn').classList.toggle('on', follow);
      $('highlight-btn').classList.toggle('on', highlight);
      document.body.classList.toggle('highlight', highlight);
      root.style.setProperty('--fs', fontSize + 'px');
    };
    applyPrefs();
    $('follow-btn').onclick = () => { follow = !follow; store.set('follow', follow); applyPrefs(); if (follow) scrollToCurrent(); };
    $('highlight-btn').onclick = () => { highlight = !highlight; store.set('highlight', highlight); applyPrefs(); };
    const setFont = d => { fontSize = Math.min(30, Math.max(14, fontSize + d)); store.set('font', fontSize); applyPrefs(); if (follow) scrollToCurrent(false); };
    $('font-down').onclick = () => setFont(-1);
    $('font-up').onclick = () => setFont(1);
    $('theme-btn').onclick = () => {
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      store.set('theme', root.dataset.theme);
    };

    // ---------- Current paragraph ----------
    let currentPara = -1;
    const paragraphAt = t => {
      for (let i = 0; i < PARAGRAPHS.length; i++) if (t >= PARAGRAPHS[i].start && t < PARAGRAPHS[i].end) return i;
      return t >= (PARAGRAPHS.length ? PARAGRAPHS[PARAGRAPHS.length - 1].end : 0) ? PARAGRAPHS.length - 1 : -1;
    };
    const firstBlockEl = i => (PARAGRAPHS[i] && PARAGRAPHS[i].blocks.map(b => blockEls[b]).find(Boolean)) || null;
    let programmaticScroll = 0;
    function scrollToCurrent(smooth = true) {
      const el = firstBlockEl(currentPara);
      if (!el) return;
      programmaticScroll = Date.now();
      el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      $('back-to-narration').style.display = 'none';
    }
    function setCurrent(i, scroll) {
      if (i === currentPara) return;
      if (currentPara >= 0) PARAGRAPHS[currentPara].blocks.forEach(b => blockEls[b] && blockEls[b].classList.remove('hl'));
      currentPara = i;
      if (i >= 0) PARAGRAPHS[i].blocks.forEach(b => blockEls[b] && blockEls[b].classList.add('hl'));
      $('status').textContent = i >= 0 ? 'Paragraph ' + (i + 1) + ' of ' + PARAGRAPHS.length : 'Ready';
      if (scroll && follow && !followPaused) scrollToCurrent();
    }

    // Scrolling away while playing pauses following until "Back to narration"
    let followPaused = false;
    const userScrolled = () => {
      if (Date.now() - programmaticScroll < 1200 || audio.paused || !follow) return;
      followPaused = true;
      $('back-to-narration').style.display = 'block';
    };
    addEventListener('wheel', userScrolled, { passive: true });
    addEventListener('touchmove', userScrolled, { passive: true });
    $('back-to-narration').onclick = () => { followPaused = false; scrollToCurrent(); };

    // Click a paragraph to jump the narration there
    book.addEventListener('click', e => {
      if (e.target.closest('a[href]') || !getSelection().isCollapsed) return;
      const el = e.target.closest('[data-b]');
      if (!el) return;
      let idx = paraOfBlock[el.dataset.b];
      if (idx === undefined) {
        const b = +el.dataset.b;
        idx = PARAGRAPHS.findIndex(p => p.blocks.some(x => x >= b));
      }
      if (idx >= 0) jumpToParagraph(idx);
    });
    function jumpToParagraph(i) {
      i = Math.max(0, Math.min(PARAGRAPHS.length - 1, i));
      audio.currentTime = PARAGRAPHS[i].start + 0.01;
      followPaused = false;
      setCurrent(i, false);
      scrollToCurrent();
    }

    // ---------- Seeking on hosts without HTTP range support ----------
    // Seeking into audio that hasn't downloaded needs range requests. If the server ignores them,
    // download the file in the background and switch to it, applying any seek made meanwhile.
    let seekable = !/^https?:$/.test(location.protocol);
    let pendingSeek = null;
    let pausedForSeek = false;
    const nativeTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get() { return pendingSeek !== null ? pendingSeek : nativeTime.get.call(audio); },
      set(t) {
        if (seekable) return nativeTime.set.call(audio, t);
        pendingSeek = t;
        if (!audio.paused) { pausedForSeek = true; audio.pause(); }
        $('status').textContent = 'Loading audio...';
        updateTime();
      }
    });
    audio.addEventListener('play', () => { if (pendingSeek !== null) { pausedForSeek = true; audio.pause(); } });
    function applyPendingSeek() {
      const t = pendingSeek, resume = pausedForSeek;
      pendingSeek = null; pausedForSeek = false;
      if (t !== null) nativeTime.set.call(audio, t);
      if (resume) audio.play().catch(() => {});
    }
    (async function ensureSeekable() {
      if (seekable || typeof fetch !== 'function') return;
      try {
        const res = await fetch(audio.currentSrc || audio.src, { headers: { Range: 'bytes=0-1' } });
        if (res.status === 206 || !res.ok || !res.body) {
          if (res.body) res.body.cancel();
          seekable = true; applyPendingSeek(); return;
        }
        const total = Number(res.headers.get('Content-Length')) || 0;
        const reader = res.body.getReader();
        const chunks = []; let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
          if (total) $('loaded').style.width = (got / total * 100) + '%';
        }
        $('loaded').style.opacity = '0';
        if (pendingSeek === null) pendingSeek = nativeTime.get.call(audio);
        if (!audio.paused) { pausedForSeek = true; audio.pause(); }
        const rate = audio.playbackRate;
        audio.addEventListener('loadedmetadata', () => { audio.playbackRate = rate; seekable = true; applyPendingSeek(); }, { once: true });
        audio.src = URL.createObjectURL(new Blob(chunks, { type: res.headers.get('Content-Type') || 'audio/mpeg' }));
        audio.load();
      } catch (_) { seekable = true; applyPendingSeek(); }
    })();

    // ---------- Transport ----------
    const playBtn = $('play');
    const togglePlay = () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); };
    playBtn.onclick = togglePlay;
    audio.addEventListener('play', () => { playBtn.innerHTML = '&#10074;&#10074;'; if (follow) { followPaused = false; scrollToCurrent(); } });
    audio.addEventListener('pause', () => { playBtn.innerHTML = '&#9654;'; saveProgress(); });
    audio.addEventListener('ended', () => store.set('time', 0));
    $('back5').onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 5); };
    $('fwd5').onclick = () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 5); };
    $('prev-para').onclick = () => {
      const i = paragraphAt(audio.currentTime);
      // Within the first 2 seconds of a paragraph, go to the previous one; otherwise restart this one
      jumpToParagraph(i > 0 && audio.currentTime - PARAGRAPHS[i].start < 2 ? i - 1 : Math.max(0, i));
    };
    $('next-para').onclick = () => jumpToParagraph(paragraphAt(audio.currentTime) + 1);

    let speed = store.get('speed', 1);
    const setSpeed = s => { speed = s; audio.playbackRate = s; $('speed-label').textContent = s.toFixed(2).replace(/0$/, '') + 'x'; store.set('speed', s); };
    setSpeed(speed);
    audio.addEventListener('loadedmetadata', () => { audio.playbackRate = speed; });
    const stepSpeed = d => { const i = SPEEDS.indexOf(speed); setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 1 : i) + d))]); };
    $('slower').onclick = () => stepSpeed(-1);
    $('faster').onclick = () => stepSpeed(1);

    const track = $('track');
    track.addEventListener('click', e => {
      const r = track.getBoundingClientRect();
      if (audio.duration) audio.currentTime = (e.clientX - r.left) / r.width * audio.duration;
    });

    function updateTime() {
      const t = audio.currentTime, d = audio.duration || 0;
      $('fill').style.width = d ? (t / d * 100) + '%' : '0';
      $('time').textContent = fmt(t) + ' / ' + fmt(d);
    }
    audio.addEventListener('timeupdate', () => {
      updateTime();
      setCurrent(paragraphAt(audio.currentTime), !audio.paused);
      if (Date.now() - lastSave > 5000) saveProgress();
    });
    audio.addEventListener('seeked', () => setCurrent(paragraphAt(audio.currentTime), false));
    audio.addEventListener('loadedmetadata', updateTime);

    // ---------- Progress ----------
    let lastSave = 0;
    function saveProgress() { lastSave = Date.now(); if (audio.currentTime > 1) store.set('time', audio.currentTime); }
    const saved = store.get('time', 0);
    if (saved > 1) {
      audio.addEventListener('loadedmetadata', () => {
        if (saved < (audio.duration || Infinity) - 2) {
          audio.currentTime = saved;
          setCurrent(paragraphAt(saved), false);
          scrollToCurrent(false);
          $('status').textContent = 'Resumed at ' + fmt(saved);
        }
      }, { once: true });
    }

    // ---------- Keyboard and media keys ----------
    addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      const k = e.key;
      if (k === ' ') { e.preventDefault(); togglePlay(); }
      else if (k === 'ArrowLeft') { e.preventDefault(); $('back5').click(); }
      else if (k === 'ArrowRight') { e.preventDefault(); $('fwd5').click(); }
      else if (k === '[') $('prev-para').click();
      else if (k === ']') $('next-para').click();
      else if (k === 'h' || k === 'H') $('highlight-btn').click();
      else if (k === 'f' || k === 'F') $('follow-btn').click();
      else if (k === 't' || k === 'T') $('theme-btn').click();
      else if (k === '+' || k === '=') setFont(1);
      else if (k === '-' || k === '_') setFont(-1);
    });
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: ${embed(chapterTitle || title)}, album: ${embed(bookTitle || '')} });
      const ms = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch (_) {} };
      ms('play', () => audio.play());
      ms('pause', () => audio.pause());
      ms('seekbackward', () => $('back5').click());
      ms('seekforward', () => $('fwd5').click());
      ms('previoustrack', () => $('prev-para').click());
      ms('nexttrack', () => $('next-para').click());
    }
  </script>
</body>
</html>`;
}

module.exports = { createEpubPlayerHtml };
