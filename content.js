// Ninja Listening Trainer - content script
// Runs on youtube.com/watch pages. Injects a small overlay panel that lets
// you mark a fragment (start/end) and replay it through a configurable
// sequence of playback speeds and subtitle on/off states. A wider view adds
// a synced, clickable transcript (word click -> OALD definition) plus a
// diagnostics log so failures are visible instead of silent.

(function () {
  const DEFAULT_STEPS = [
    { rate: 1.0, subtitles: false },
    { rate: 1.0, subtitles: true },
    { rate: 0.6, subtitles: true },
    { rate: 0.6, subtitles: true },
    { rate: 0.6, subtitles: true },
    { rate: 0.7, subtitles: true },
    { rate: 0.8, subtitles: true },
    { rate: 0.9, subtitles: true },
    { rate: 1.0, subtitles: false },
    { rate: 1.1, subtitles: false },
    { rate: 1.2, subtitles: false },
    { rate: 1.3, subtitles: false },
    { rate: 1.4, subtitles: false },
    { rate: 1.5, subtitles: false }
  ];

  const OALD_URL = 'https://www.oxfordlearnersdictionaries.com/definition/english/{word}';

  let video = null;
  let panel = null;
  let startTime = null;
  let endTime = null;
  let steps = DEFAULT_STEPS;
  let running = false;
  let stopRequested = false;
  let currentStepIndex = -1;
  let targetRate = 1.0;

  let panelWide = false;
  let captionTracks = [];
  let selectedTrackIndex = -1;
  let transcriptCues = [];
  let diagLog = [];
  let diagRunning = false;

  // YouTube's own player periodically re-asserts its internally stored
  // playback rate onto the <video> element (notably right after a seek or
  // play() call), which silently undoes video.playbackRate = x. Fight back
  // by re-applying our target rate whenever the browser reports a change.
  function attachVideoListeners(v) {
    v.addEventListener('ratechange', () => {
      if (running && Math.abs(v.playbackRate - targetRate) > 0.001) {
        v.playbackRate = targetRate;
      }
    });
    v.addEventListener('timeupdate', highlightActiveCue);
  }

  // ---------- helpers ----------

  function getVideoId() {
    try {
      const url = new URL(location.href);
      return url.searchParams.get('v') || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  function getVideoElement() {
    return document.querySelector('video.html5-main-video') || document.querySelector('video');
  }

  function waitForVideo() {
    return new Promise((resolve) => {
      const check = () => {
        const v = getVideoElement();
        if (v) resolve(v);
        else setTimeout(check, 400);
      };
      check();
    });
  }

  function getCaptionsButton() {
    return document.querySelector('.ytp-subtitles-button');
  }

  function captionsOn() {
    const btn = getCaptionsButton();
    return btn ? btn.getAttribute('aria-pressed') === 'true' : false;
  }

  function setCaptions(desired) {
    const btn = getCaptionsButton();
    if (!btn) return;
    if (captionsOn() !== desired) {
      btn.click();
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function formatTime(t) {
    if (t === null || t === undefined || isNaN(t)) return '--:--';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ---------- messaging to background service worker ----------

  function sendBgMessage(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: 'empty response from background' });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  // ---------- storage ----------

  function loadSteps(callback) {
    chrome.storage.sync.get(['steps'], (res) => {
      if (res.steps && Array.isArray(res.steps) && res.steps.length) {
        steps = res.steps;
      }
      if (callback) callback();
    });
  }

  function saveMarksForVideo() {
    const id = getVideoId();
    chrome.storage.local.get(['marks'], (res) => {
      const marks = res.marks || {};
      marks[id] = { startTime, endTime };
      chrome.storage.local.set({ marks: marks });
    });
  }

  function loadMarksForVideo() {
    const id = getVideoId();
    chrome.storage.local.get(['marks'], (res) => {
      const marks = res.marks || {};
      if (marks[id]) {
        startTime = marks[id].startTime;
        endTime = marks[id].endTime;
      } else {
        startTime = null;
        endTime = null;
      }
      updatePanelTimes();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.steps) {
      steps = changes.steps.newValue || DEFAULT_STEPS;
    }
  });

  // ---------- sequencer ----------

  async function playStep(step) {
    if (!video || startTime === null || endTime === null) return;
    targetRate = step.rate;
    video.currentTime = startTime;
    setCaptions(step.subtitles);
    video.playbackRate = targetRate;
    try {
      await video.play();
    } catch (e) {
      // autoplay might be blocked until user interacts; ignore
    }
    video.playbackRate = targetRate;
    while (!stopRequested && video.currentTime < endTime - 0.05 && !video.ended) {
      if (Math.abs(video.playbackRate - targetRate) > 0.001) {
        video.playbackRate = targetRate;
      }
      await sleep(100);
    }
    video.pause();
  }

  async function runSequence() {
    if (running) return;
    if (!video || startTime === null || endTime === null || endTime <= startTime) {
      updateStatus('Mark a valid start and end point first.');
      return;
    }
    running = true;
    stopRequested = false;
    for (let i = 0; i < steps.length; i++) {
      if (stopRequested) break;
      currentStepIndex = i;
      updateStatus();
      await playStep(steps[i]);
    }
    running = false;
    currentStepIndex = -1;
    updateStatus();
  }

  function stopSequence() {
    stopRequested = true;
    running = false;
    if (video) video.pause();
    currentStepIndex = -1;
    updateStatus();
  }

  // ---------- diagnostics + transcript ----------

  function logDiag(text, status) {
    diagLog.push({ text: text, status: status || 'info' });
    renderDiagnostics();
  }

  function clearDiag() {
    diagLog = [];
    renderDiagnostics();
  }

  function parseEvents(events) {
    const cues = [];
    (events || []).forEach((ev) => {
      if (!ev.segs) return;
      const text = ev.segs.map((s) => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
      if (!text) return;
      const start = (ev.tStartMs || 0) / 1000;
      const dur = (ev.dDurationMs || 0) / 1000;
      cues.push({ start: start, end: start + dur, text: text });
    });
    return cues;
  }

  async function fetchRaw(url) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (res.ok && text && text.trim().length > 0) {
        logDiag('Fetch via content script: HTTP ' + res.status + ', ' + text.length + ' bytes (used this path)', 'pass');
        return text;
      }
      logDiag('Fetch via content script: HTTP ' + res.status + ', ' + text.length + ' bytes \u2014 empty/unusable, trying background worker', 'fail');
    } catch (e) {
      logDiag('Fetch via content script threw: ' + e.message + ' \u2014 trying background worker', 'fail');
    }
    const bg = await sendBgMessage({ type: 'FETCH_TEXT', url: url });
    if (bg.ok && bg.text && bg.text.trim().length > 0) {
      logDiag('Fetch via background worker: HTTP ' + bg.status + ', ' + bg.text.length + ' bytes (used this path)', 'pass');
      return bg.text;
    }
    logDiag('Fetch via background worker: ' + (bg.error || ('HTTP ' + bg.status + ', empty body')), 'fail');
    return null;
  }

  function decodeHtmlEntities(str) {
    const ta = document.createElement('textarea');
    ta.innerHTML = str;
    return ta.value;
  }

  function parseTimedTextXml(xmlText) {
    const cues = [];
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) return cues;
    const nodes = doc.getElementsByTagName('text');
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const start = parseFloat(node.getAttribute('start') || '0');
      const dur = parseFloat(node.getAttribute('dur') || '0');
      let text = decodeHtmlEntities(node.textContent || '').replace(/\n/g, ' ').trim();
      if (!text) continue;
      cues.push({ start: start, end: start + dur, text: text });
    }
    return cues;
  }

  function pickDefaultTrackIndex(tracks) {
    let idx = tracks.findIndex((t) => t.languageCode && t.languageCode.indexOf('en') === 0 && t.kind !== 'asr');
    if (idx === -1) idx = tracks.findIndex((t) => t.languageCode && t.languageCode.indexOf('en') === 0);
    if (idx === -1) idx = 0;
    return idx;
  }

  async function loadSelectedTranscript() {
    if (selectedTrackIndex < 0 || !captionTracks[selectedTrackIndex]) return;
    const track = captionTracks[selectedTrackIndex];
    const label = (track.name && track.name.simpleText) || track.languageCode;
    logDiag('Loading transcript for "' + label + '"\u2026', 'info');

    const sep = track.baseUrl.indexOf('?') !== -1 ? '&' : '?';
    let cues = [];

    logDiag('Attempt 1: requesting fmt=json3\u2026', 'info');
    let raw = await fetchRaw(track.baseUrl + sep + 'fmt=json3');
    if (raw) {
      try {
        const data = JSON.parse(raw);
        const eventCount = (data.events || []).length;
        logDiag('Parsed JSON: ' + eventCount + ' raw caption events', eventCount > 0 ? 'pass' : 'fail');
        cues = parseEvents(data.events);
      } catch (e) {
        logDiag('json3 response was not valid JSON: ' + e.message, 'fail');
      }
    }

    if (!cues.length) {
      logDiag('Attempt 2: requesting default (XML) format\u2026', 'info');
      raw = await fetchRaw(track.baseUrl);
      if (raw) {
        cues = parseTimedTextXml(raw);
        logDiag('Parsed XML: ' + cues.length + ' text cues', cues.length > 0 ? 'pass' : 'fail');
      }
    }

    if (cues.length) {
      logDiag('Extracted ' + cues.length + ' usable text cues', 'pass');
      transcriptCues = cues;
      renderTranscript();
      logDiag('Done \u2014 transcript is showing below, synced to playback.', 'pass');
    } else {
      logDiag('FAIL: transcript could not be loaded in either format.', 'fail');
      transcriptCues = [];
      renderTranscript();
    }
  }

  async function runDiagnostics() {
    if (diagRunning) return;
    diagRunning = true;
    clearDiag();
    logDiag('Asking the background service worker to read the live page data\u2026', 'info');

    const bg = await sendBgMessage({ type: 'GET_PLAYER_RESPONSE' });
    if (!bg.ok) {
      logDiag('FAIL: could not reach the background service worker \u2014 ' + bg.error, 'fail');
      if (bg.error && bg.error.indexOf('Receiving end does not exist') !== -1) {
        logDiag('HINT: this almost always means the extension was reloaded/updated after this tab was already open. Refresh this YouTube tab (not the extension) and click "Run diagnostics" again.', 'info');
      }
      diagRunning = false;
      return;
    }
    logDiag('PASS: background service worker responded (source: ' + bg.source + ')', 'pass');

    const playerResponse = bg.playerResponse;
    if (!playerResponse) {
      logDiag('FAIL: page returned no player data at all', 'fail');
      diagRunning = false;
      return;
    }
    logDiag('PASS: received a player response object', 'pass');

    const tracklist = playerResponse.captions && playerResponse.captions.playerCaptionsTracklistRenderer;
    const tracks = tracklist && tracklist.captionTracks;
    if (!tracks || !tracks.length) {
      logDiag('FAIL: no captionTracks in the player response \u2014 this video may simply have no captions', 'fail');
      diagRunning = false;
      return;
    }
    logDiag('PASS: found ' + tracks.length + ' caption track(s):', 'pass');
    tracks.forEach((t) => {
      const label = (t.name && t.name.simpleText) || t.languageCode;
      logDiag('   \u2022 ' + label + '  (lang=' + t.languageCode + (t.kind === 'asr' ? ', auto-generated' : '') + ')', 'info');
    });

    captionTracks = tracks;
    populateTrackSelect();
    selectedTrackIndex = pickDefaultTrackIndex(tracks);
    const select = panel.querySelector('#nlp-track-select');
    if (select) select.value = String(selectedTrackIndex);

    await loadSelectedTranscript();
    diagRunning = false;
  }

  function getCurrentCaptionText() {
    const container = document.querySelector('.ytp-caption-window-container');
    if (!container) return '';
    const segments = container.querySelectorAll('.ytp-caption-segment');
    if (segments.length) {
      return Array.from(segments).map((s) => s.textContent).join(' ').replace(/\s+/g, ' ').trim();
    }
    return (container.textContent || '').replace(/\s+/g, ' ').trim();
  }

  async function harvestFragmentTranscript() {
    if (running) {
      logDiag('Stop the running sequence before capturing captions.', 'fail');
      return;
    }
    if (!video || startTime === null || endTime === null || endTime <= startTime) {
      logDiag('Mark a valid start/end fragment first \u2014 capture reads captions only within your marked fragment.', 'fail');
      return;
    }
    logDiag('Capturing captions directly from the screen for your marked fragment (playing it once, real-time)\u2026', 'info');
    setCaptions(true);
    video.currentTime = startTime;
    targetRate = 1.0;
    video.playbackRate = 1.0;
    try {
      await video.play();
    } catch (e) {}

    const cues = [];
    let lastText = '';
    let lastStart = startTime;

    while (video.currentTime < endTime - 0.05 && !video.ended) {
      const text = getCurrentCaptionText();
      if (text !== lastText) {
        if (lastText) {
          cues.push({ start: lastStart, end: video.currentTime, text: lastText });
        }
        lastText = text;
        lastStart = video.currentTime;
      }
      await sleep(120);
    }
    if (lastText) {
      cues.push({ start: lastStart, end: video.currentTime, text: lastText });
    }
    video.pause();

    const usable = cues.filter((c) => c.text && c.text.length > 0);
    logDiag('Captured ' + usable.length + ' caption line(s) from on-screen rendering', usable.length > 0 ? 'pass' : 'fail');
    if (usable.length) {
      transcriptCues = usable;
      renderTranscript();
      logDiag('Done \u2014 transcript below was captured directly from playback.', 'pass');
    } else {
      logDiag('No caption text detected \u2014 confirm captions are available and toggled on for this fragment.', 'fail');
    }
  }


  function cleanWord(raw) {
    return raw.replace(/[^A-Za-z'-]/g, '');
  }

  function openOALD(rawWord) {
    const word = cleanWord(rawWord).toLowerCase();
    if (!word) return;
    window.open(OALD_URL.replace('{word}', encodeURIComponent(word)), '_blank', 'noopener');
  }

  // ---------- UI ----------

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'ninja-listening-panel';
    panel.innerHTML =
      '<div class="nlp-header">' +
      '  <span>Ninja Listening Trainer</span>' +
      '  <span class="nlp-header-btns">' +
      '    <button id="nlp-wide-toggle" title="Toggle wide view">\u2922</button>' +
      '    <button id="nlp-toggle" title="Collapse">\u2013</button>' +
      '  </span>' +
      '</div>' +
      '<div class="nlp-body">' +
      '  <div class="nlp-row">' +
      '    <button id="nlp-mark-start">Mark start</button>' +
      '    <span id="nlp-start-label">--:--</span>' +
      '  </div>' +
      '  <div class="nlp-row">' +
      '    <button id="nlp-mark-end">Mark end</button>' +
      '    <span id="nlp-end-label">--:--</span>' +
      '  </div>' +
      '  <div class="nlp-row">' +
      '    <button id="nlp-run">\u25B6 Run sequence</button>' +
      '    <button id="nlp-stop">\u25A0 Stop</button>' +
      '  </div>' +
      '  <div class="nlp-status" id="nlp-status">Ready</div>' +
      '  <div class="nlp-wide-only" id="nlp-wide-section">' +
      '    <div class="nlp-divider"></div>' +
      '    <div class="nlp-row">' +
      '      <select id="nlp-track-select" class="nlp-track-select"><option>(none yet)</option></select>' +
      '      <button id="nlp-run-diag">Run diagnostics</button>' +
      '    </div>' +
      '    <div class="nlp-section-label">Diagnostics</div>' +
      '    <div id="nlp-diag-log" class="nlp-diag-log"></div>' +
      '    <div class="nlp-row">' +
      '      <button id="nlp-harvest-btn">\u25B6 Capture from playback (marked fragment)</button>' +
      '    </div>' +
      '    <div class="nlp-section-label">Transcript (click a word \u2192 OALD)</div>' +
      '    <div id="nlp-transcript-list" class="nlp-transcript-list">' +
      '      <div class="nlp-transcript-msg">Switch to wide view to auto-load captions. If direct download is blocked, mark a fragment and use "Capture from playback" instead.</div>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(panel);

    panel.querySelector('#nlp-toggle').addEventListener('click', () => {
      panel.classList.toggle('nlp-collapsed');
    });
    panel.querySelector('#nlp-wide-toggle').addEventListener('click', () => {
      panelWide = !panelWide;
      panel.classList.toggle('nlp-wide', panelWide);
      chrome.storage.local.set({ panelWide: panelWide });
      if (panelWide && transcriptCues.length === 0 && !diagRunning) {
        runDiagnostics();
      }
    });
    panel.querySelector('#nlp-mark-start').addEventListener('click', () => {
      if (!video) return;
      startTime = video.currentTime;
      updatePanelTimes();
      saveMarksForVideo();
    });
    panel.querySelector('#nlp-mark-end').addEventListener('click', () => {
      if (!video) return;
      endTime = video.currentTime;
      updatePanelTimes();
      saveMarksForVideo();
    });
    panel.querySelector('#nlp-run').addEventListener('click', () => runSequence());
    panel.querySelector('#nlp-stop').addEventListener('click', () => stopSequence());
    panel.querySelector('#nlp-run-diag').addEventListener('click', () => runDiagnostics());
    panel.querySelector('#nlp-harvest-btn').addEventListener('click', () => harvestFragmentTranscript());
    panel.querySelector('#nlp-track-select').addEventListener('change', (e) => {
      selectedTrackIndex = parseInt(e.target.value, 10);
      loadSelectedTranscript();
    });

    chrome.storage.local.get(['panelWide'], (res) => {
      panelWide = !!res.panelWide;
      panel.classList.toggle('nlp-wide', panelWide);
      if (panelWide) runDiagnostics();
    });
  }

  function renderDiagnostics() {
    if (!panel) return;
    const el = panel.querySelector('#nlp-diag-log');
    if (!el) return;
    el.innerHTML = diagLog.map((entry) => {
      const cls = entry.status === 'pass' ? 'nlp-diag-pass' : entry.status === 'fail' ? 'nlp-diag-fail' : 'nlp-diag-info';
      return '<div class="nlp-diag-line ' + cls + '">' + escapeHtml(entry.text) + '</div>';
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  function populateTrackSelect() {
    if (!panel) return;
    const select = panel.querySelector('#nlp-track-select');
    if (!select) return;
    select.innerHTML = '';
    captionTracks.forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = (t.name && t.name.simpleText) || (t.languageCode + (t.kind === 'asr' ? ' (auto)' : ''));
      select.appendChild(opt);
    });
  }

  function renderTranscript() {
    if (!panel) return;
    const wrap = panel.querySelector('#nlp-transcript-list');
    if (!wrap) return;
    if (!transcriptCues.length) {
      wrap.innerHTML = '<div class="nlp-transcript-msg">No transcript loaded.</div>';
      return;
    }
    wrap.innerHTML = '';
    transcriptCues.forEach((cue) => {
      const row = document.createElement('div');
      row.className = 'nlp-cue';
      row.dataset.start = cue.start;
      row.dataset.end = cue.end;
      const words = cue.text.split(/\s+/);
      words.forEach((w, wi) => {
        const span = document.createElement('span');
        span.className = 'nlp-word';
        span.textContent = w + (wi < words.length - 1 ? ' ' : '');
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          openOALD(w);
        });
        row.appendChild(span);
      });
      row.addEventListener('click', () => {
        if (video) video.currentTime = cue.start;
      });
      wrap.appendChild(row);
    });
  }

  function highlightActiveCue() {
    if (!panel || !video || !panelWide || !transcriptCues.length) return;
    const wrap = panel.querySelector('#nlp-transcript-list');
    if (!wrap) return;
    const t = video.currentTime;
    wrap.querySelectorAll('.nlp-cue').forEach((row) => {
      const active = t >= parseFloat(row.dataset.start) && t < parseFloat(row.dataset.end);
      row.classList.toggle('nlp-cue-active', active);
      if (active) {
        const rect = row.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        if (rect.top < wrapRect.top || rect.bottom > wrapRect.bottom) {
          row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    });
  }

  function updatePanelTimes() {
    if (!panel) return;
    panel.querySelector('#nlp-start-label').textContent = formatTime(startTime);
    panel.querySelector('#nlp-end-label').textContent = formatTime(endTime);
  }

  function updateStatus(message) {
    if (!panel) return;
    const el = panel.querySelector('#nlp-status');
    if (message) {
      el.textContent = message;
      return;
    }
    if (running && steps[currentStepIndex]) {
      const step = steps[currentStepIndex];
      el.textContent = 'Step ' + (currentStepIndex + 1) + '/' + steps.length +
        ': ' + step.rate + 'x, subtitles ' + (step.subtitles ? 'on' : 'off');
    } else {
      el.textContent = 'Ready';
    }
  }

  // ---------- YouTube SPA navigation ----------
  // YouTube swaps videos without a full page reload, so re-sync marks and
  // clear stale transcript/diagnostics state whenever the video changes.
  document.addEventListener('yt-navigate-finish', async () => {
    stopSequence();
    video = getVideoElement() || (await waitForVideo());
    attachVideoListeners(video);
    loadMarksForVideo();
    transcriptCues = [];
    captionTracks = [];
    clearDiag();
    renderTranscript();
    if (panelWide) runDiagnostics();
  });

  // ---------- init ----------

  (async () => {
    video = await waitForVideo();
    attachVideoListeners(video);
    buildPanel();
    loadSteps(() => {
      loadMarksForVideo();
    });
  })();
})();
