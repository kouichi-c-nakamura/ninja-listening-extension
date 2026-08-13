// Ninja Listening Trainer - content script
// Runs on youtube.com/watch pages AND on local audio files opened directly
// via a file:// URL (matched by extension in manifest.json). Injects a
// small overlay panel that lets you mark a fragment (start/end) and replay
// it through a configurable sequence of playback speeds and subtitle
// on/off states. Subtitle toggling is a no-op on local files (there's no
// CC button to find), so the same sequencer code works for both.

// 3-Arm Experimental Presets
  const PRESETS = {
    ninja: [
      { rate: 1.0, subtitles: false },
      { rate: 1.0, subtitles: true },
      { rate: 0.6, subtitles: true },
      { rate: 0.7, subtitles: true },
      { rate: 0.8, subtitles: true },
      { rate: 1.0, subtitles: false },
      { rate: 2.0, subtitles: false }
    ],
    compression: [
      { rate: 1.0, subtitles: false },
      { rate: 1.2, subtitles: false },
      { rate: 1.5, subtitles: false },
      { rate: 2.0, subtitles: false }
    ],
    static: [
      { rate: 1.0, subtitles: false },
      { rate: 1.0, subtitles: false },
      { rate: 1.0, subtitles: false }
    ]
  };

  let sessionLog = []; // Stores the trial data
  let waitingForVas = false;
  let currentVasResolve = null;



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
    if (myToken !== runToken) return; // Superseded before starting

    targetRate = step.rate;
    video.currentTime = startTime;
    setCaptions(step.subtitles);
    video.playbackRate = targetRate;
    try {
      await video.play();
    } catch (e) {}
    if (myToken !== runToken) return;

    video.playbackRate = targetRate;
    while (myToken === runToken && !stopRequested && video.currentTime < endTime - 0.05 && !video.ended) {
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
  // Replaces the old runSequence loop
  // Accepts an index to jump straight to a specific row.
  async function runSequence(fromIndex) {
    if (!video || startTime === null || endTime === null || endTime <= startTime) {
      updateStatus('Mark a valid start and end point first.');
      return;
    }
    
    // 1. Unblock any active VAS prompt if running
    if (waitingForVas && currentVasResolve) {
      currentVasResolve(null);
    }

    // 2. Cancel any currently active step loop
    runToken++; 
    const currentToken = runToken;
    stopRequested = false;
    running = true;

    const startIdx = (typeof fromIndex === 'number' && fromIndex >= 0) ? fromIndex : 0;

    // Reset log only if starting from the beginning
    if (startIdx === 0) {
      sessionLog = [];
    }

    for (let i = startIdx; i < steps.length; i++) {
      if (stopRequested || currentToken !== runToken) break;
      currentStepIndex = i;
      updateStatus();
      renderStepsList();

      // Play current step
      await playStep(steps[i], currentToken);
      if (stopRequested || currentToken !== runToken) break;

      // ★ リアルタイム評価: 毎ステップごとにチェックボックスの最新状態を確認
      const isVasEnabled = panel.querySelector('#nlp-enable-vas')?.checked || false;

      // Optional VAS Rating Prompt
      if (isVasEnabled) {
        const vasScore = await promptVAS();
        if (stopRequested || currentToken !== runToken) break;

        // Log rating (Nullでない場合のみ記録)
        if (vasScore !== null) {
          sessionLog.push({
            SubjectID: "SUBJ_001",
            Timestamp: new Date().toISOString(),
            VideoID: getVideoId(),
            StartTime: startTime.toFixed(2),
            EndTime: endTime.toFixed(2),
            StepIdx: i + 1,
            PlaybackRate: steps[i].rate,
            Subtitles: steps[i].subtitles,
            VAS_Clarity: vasScore
          });
        }
      }
    }
    
    // Only clear running state if this token is still the active one
    if (currentToken === runToken) {
      running = false;
      currentStepIndex = -1;
      updateStatus(stopRequested ? 'Stopped' : 'Sequence Complete.');
      renderStepsList();
    }
  }

  // Opens the VAS UI and returns a Promise that resolves on Submit
  function promptVAS() {
    return new Promise((resolve) => {
      waitingForVas = true;
      const vasContainer = panel.querySelector('#nlp-vas-container');
      const slider = panel.querySelector('#nlp-vas-slider');
      
      if (vasContainer) {
        vasContainer.classList.add('nlp-active');
      }
      if (slider) {
        slider.value = 50;
      }
      
      currentVasResolve = (score) => {
        if (vasContainer) {
          vasContainer.classList.remove('nlp-active'); // 必ず非表示にする
        }
        waitingForVas = false;
        resolve(score);
      };
    });
  }

  function stopSequence() {
    stopRequested = true;
    runToken++; // Invalidates in-flight step
    running = false;
    
    if (waitingForVas && currentVasResolve) {
      currentVasResolve(null);
    }

    if (video) video.pause();
    currentStepIndex = -1;
    updateStatus('Stopped');
    renderStepsList();
  }

  // ---------- UI ----------

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'ninja-listening-panel';
    panel.classList.add('nlp-collapsed');    
    panel.innerHTML =
      '<div class="nlp-header">' +
      '  <span>Ninja Listening Trainer</span>' +
      '  <span class="nlp-header-btns">' +
      '    <button id="nlp-settings" title="Settings">\u2699</button>' +
      '    <button id="nlp-view-toggle" title="Toggle detailed view">\u2922</button>' +
      '    <button id="nlp-toggle" title="Collapse">\u2013</button>' +
      '  </span>' +
      '</div>' +
      '<div class="nlp-body">' +
      
      '  <div class="nlp-controls-row">' +
      '    <select id="nlp-preset-select" class="nlp-preset-select">' +
      '      <option value="ninja">Ninja Protocol (0.6x Anchor)</option>' +
      '      <option value="compression">Pure Compression</option>' +
      '      <option value="static">Static Control (1.0x)</option>' +
      '    </select>' +
      '    <button id="nlp-load-btn" class="nlp-file-btn">Load</button>' +
      '    <button id="nlp-export-btn" class="nlp-file-btn">Export Data</button>' +
      '  </div>' +

      // --- NEW: Optional VAS Checkbox Row ---
      '  <div class="nlp-row" style="font-size: 11px; opacity: 0.9;">' +
      '    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">' +
      '      <input type="checkbox" id="nlp-enable-vas"> Collect VAS Ratings' +
      '    </label>' +
      '  </div>' +

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
      
      // VAS Container
      '  <div id="nlp-vas-container">' +
      '    <div class="nlp-vas-question">At this speed, how clearly could you perceive the acoustic details (individual sounds, phonemes, and syllables) of the speech?</div>' +
      '    <div class="nlp-vas-labels"><span>0%: Blur/Noise</span><span>100%: Crystal Clear</span></div>' +
      '    <input type="range" id="nlp-vas-slider" min="0" max="100" step="5" value="50">' +
      '    <div class="nlp-vas-actions">' +
      '      <button id="nlp-vas-replay" class="nlp-file-btn">\uD83D\uDD04 Replay</button>' +
      '      <button id="nlp-vas-submit" class="nlp-row button">Submit \u2794</button>' +
      '    </div>' +
      '  </div>' +
      '</div>';
      
    document.body.appendChild(panel);

    // Hidden file input for loading configs
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

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

    // Preset Selection
    panel.querySelector('#nlp-preset-select').addEventListener('change', (e) => {
      steps = PRESETS[e.target.value];
    });

    // VAS Replay Button
    panel.querySelector('#nlp-vas-replay').addEventListener('click', () => {
      playStep(steps[currentStepIndex]); // Replays without advancing the loop
    });

    // VAS Submit Button
    panel.querySelector('#nlp-vas-submit').addEventListener('click', () => {
      if (waitingForVas && currentVasResolve) {
        const score = panel.querySelector('#nlp-vas-slider').value;
        currentVasResolve(parseInt(score, 10));
      }
    });

    // Export Data (CSV)
    panel.querySelector('#nlp-export-btn').addEventListener('click', () => {
      if (sessionLog.length === 0) {
        alert("No data to export yet.");
        return;
      }
      
      const headers = "SubjectID,Timestamp,VideoID,StartTime,EndTime,StepIdx,PlaybackRate,Subtitles,VAS_Clarity\n";
      const csv = sessionLog.map(row => 
        `${row.SubjectID},${row.Timestamp},${row.VideoID},${row.StartTime},${row.EndTime},${row.StepIdx},${row.PlaybackRate},${row.Subtitles},${row.VAS_Clarity}`
      ).join("\n");
      
      const blob = new Blob([headers + csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ninja_research_log_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Load Config (JSON)
    panel.querySelector('#nlp-load-btn').addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const config = JSON.parse(ev.target.result);
          if (config.stepsArray) steps = config.stepsArray;
          if (config.startTime) startTime = config.startTime;
          if (config.endTime) endTime = config.endTime;
          updatePanelTimes();
          alert("Config loaded successfully.");
        } catch (err) {
          alert("Invalid JSON config.");
        }
      };
      reader.readAsText(file);
    });

    // buildPanel() 内のイベントリスナー追加エリアへ挿入
    panel.querySelector('#nlp-enable-vas').addEventListener('change', (e) => {
      // 走行中にOFFに切り替えられたら、現在開いているVASプロンプトをスキップして次へ進める
      if (!e.target.checked && waitingForVas && currentVasResolve) {
        currentVasResolve(null);
      }
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
    // Always build the UI panel first so it's ready
    buildPanel();

    // Now wait for the media element
    video = await waitForVideo();
    
    if (video) {
      attachRateEnforcer(video);
      loadMarksForVideo();
    } else {
      updateStatus("No video/audio element detected on this page.");
    }

    loadSteps(() => {
      renderStepsList();
    });
})();
})();