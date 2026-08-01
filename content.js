// Ninja Listening Trainer - content script
// Runs on youtube.com/watch pages AND on local audio files opened directly
// via a file:// URL (matched by extension in manifest.json). Injects a
// small overlay panel that lets you mark a fragment (start/end) and replay
// it through a configurable sequence of playback speeds and subtitle
// on/off states. Subtitle toggling is a no-op on local files (there's no
// CC button to find), so the same sequencer code works for both.

(function () {
  const isFileMode = location.protocol === 'file:';

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
    { rate: 1.5, subtitles: false },
    { rate: 1.6, subtitles: false },
    { rate: 1.7, subtitles: false },
    { rate: 1.8, subtitles: false },
    { rate: 1.9, subtitles: false },
    { rate: 2.0, subtitles: false }
  ];

  let video = null;
  let panel = null;
  let startTime = 0;
  let endTime = 0;
  let steps = DEFAULT_STEPS;
  let running = false;
  let runToken = 0; // incremented on every new run/stop; invalidates any in-flight run
  let currentStepIndex = -1;
  let targetRate = 1.0;
  let panelMode = 'mini'; // Tracks window width state

  function attachRateEnforcer(v) {
    v.addEventListener('ratechange', () => {
      if (running && Math.abs(v.playbackRate - targetRate) > 0.001) {
        v.playbackRate = targetRate;
      }
    });
  }

  // ---------- helpers ----------

  function getVideoId() {
    if (isFileMode) {
      return location.href; // the file path itself is already a stable, unique key
    }
    try {
      const url = new URL(location.href);
      return url.searchParams.get('v') || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  function getVideoElement() {
    if (isFileMode) {
      // Browsers render a plain <audio> (or occasionally <video>) element
      // for a raw local media file.
      return document.querySelector('audio') || document.querySelector('video');
    }
    return document.querySelector('video.html5-main-video') || document.querySelector('video');
  }

  function waitForVideo() {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        const v = getVideoElement();
        if (v) {
          resolve(v);
          return;
        }
        attempts++;
        if (attempts > 30) {
          // Give up after ~12s rather than polling forever on a page that
          // will never have a media element.
          resolve(null);
          return;
        }
        setTimeout(check, 400);
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
      renderStepsList(); // Live update UI if options change
    }
  });

  // ---------- sequencer ----------

  async function playStep(step, myToken) {
    if (!video || startTime === null || endTime === null) return;
    if (myToken !== runToken) return; // superseded before we even started

    targetRate = step.rate;
    video.currentTime = startTime;
    setCaptions(step.subtitles);
    video.playbackRate = targetRate;
    try {
      await video.play();
    } catch (e) {}
    if (myToken !== runToken) return; // superseded while awaiting play()

    video.playbackRate = targetRate;
    while (myToken === runToken && video.currentTime < endTime - 0.05 && !video.ended) {
      if (Math.abs(video.playbackRate - targetRate) > 0.001) {
        video.playbackRate = targetRate;
      }
      await sleep(100);
    }
    if (myToken === runToken) {
      video.pause();
    }
  }

  // Accepts an index to jump straight to a specific row. Starting a new run
  // always supersedes any run already in progress -- no need to stop first.
  async function runSequence(fromIndex) {
    if (!video || startTime === null || endTime === null || endTime <= startTime) {
      updateStatus('Mark a valid start and end point first.');
      return;
    }
    runToken++; // invalidates any previous run, including one still in flight
    const myToken = runToken;
    running = true;

    const startIdx = (typeof fromIndex === 'number' && fromIndex >= 0) ? fromIndex : 0;

    for (let i = startIdx; i < steps.length; i++) {
      if (myToken !== runToken) return; // a newer run took over; stop touching shared state
      currentStepIndex = i;
      updateStatus();
      renderStepsList(); // Highlight current row
      await playStep(steps[i], myToken);
    }

    if (myToken === runToken) {
      running = false;
      currentStepIndex = -1;
      updateStatus();
      renderStepsList(); // Remove highlights
    }
  }

  function stopSequence() {
    runToken++; // invalidates any in-flight run
    running = false;
    if (video) video.pause();
    currentStepIndex = -1;
    updateStatus();
    renderStepsList();
  }

  // ---------- UI ----------

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'ninja-listening-panel';
    panel.classList.add('nlp-collapsed'); // <-- Add this line here    
    panel.innerHTML =
      '<div class="nlp-header">' +
      '  <span>Ninja Listening Trainer' + (isFileMode ? ' <span class="nlp-mode-tag">local file</span>' : '') + '</span>' +
      '  <span class="nlp-header-btns">' +
      '    <button id="nlp-settings" title="Settings">\u2699</button>' + // Added Settings Gear
      '    <button id="nlp-view-toggle" title="Toggle detailed view">\u2922</button>' + 
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
      '  <div class="nlp-detail-only" id="nlp-steps-wrap">' +
      '    <div class="nlp-steps-label">Steps (click to jump in)</div>' +
      '    <div id="nlp-steps-list"></div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(panel);

    // Open options page safely via background script (Works on Chrome & Firefox)
    panel.querySelector('#nlp-settings').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openOptionsPage' });
    });

    // View toggles
    panel.querySelector('#nlp-toggle').addEventListener('click', () => {
      panel.classList.toggle('nlp-collapsed');
    });
    
    panel.querySelector('#nlp-view-toggle').addEventListener('click', () => {
      panelMode = panelMode === 'mini' ? 'detailed' : 'mini';
      chrome.storage.local.set({ panelMode: panelMode });
      applyPanelMode();
    });

    // Action buttons
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

    // Restore last used view state
    chrome.storage.local.get(['panelMode'], (res) => {
      panelMode = res.panelMode === 'detailed' ? 'detailed' : 'mini';
      applyPanelMode();
    });
  }

  function applyPanelMode() {
    if (!panel) return;
    panel.classList.toggle('nlp-detailed', panelMode === 'detailed');
    renderStepsList();
  }

  function renderStepsList() {
    if (!panel || panelMode !== 'detailed') return;
    const list = panel.querySelector('#nlp-steps-list');
    if (!list) return;
    
    list.innerHTML = ''; // Clear existing
    
    steps.forEach((step, i) => {
      const row = document.createElement('div');
      // Highlight the active step if running
      row.className = 'nlp-step-row' + (i === currentStepIndex ? ' nlp-step-active' : '');
      
      const rateLabel = (Math.round(step.rate * 100) / 100).toString() + 'x';
      row.innerHTML =
        '<span class="nlp-step-idx">' + (i + 1) + '</span>' +
        '<span class="nlp-step-rate">' + rateLabel + '</span>' +
        (isFileMode ? '' : '<span class="nlp-step-cc">' + (step.subtitles ? 'CC on' : 'CC off') + '</span>');
      
      // Make row clickable to jump straight to this iteration.
      // runSequence() bumps the run token itself, which immediately
      // invalidates whatever was running before -- no need to stop first
      // or guess at a delay.
      row.addEventListener('click', () => {
        runSequence(i);
      });
      
      list.appendChild(row);
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
  document.addEventListener('yt-navigate-finish', async () => {
    stopSequence();
    video = getVideoElement() || (await waitForVideo());
    if (!video) return;
    attachRateEnforcer(video);
    loadMarksForVideo();
  });

  // ---------- init ----------

  (async () => {
    video = await waitForVideo();
    if (!video) return; // no audio/video element on this page; don't show the panel
    attachRateEnforcer(video);
    buildPanel();
    loadSteps(() => {
      loadMarksForVideo();
      renderStepsList();
    });
  })();
})();