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
  let startTime = null;
  let endTime = null;
  let steps = DEFAULT_STEPS;
  let running = false;
  let stopRequested = false;
  let runToken = 0; // incremented on every new run/stop; invalidates any in-flight run
  let currentStepIndex = -1;
  let targetRate = 1.0;
  let panelMode = 'mini'; // Tracks window width state

  function attachRateEnforcer(v) {
    if (!v || v._rateEnforcerAttached) return;
    v._rateEnforcerAttached = true;
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
        if (attempts > 50) { // Polling up to 20s
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
        startTime = typeof marks[id].startTime === 'number' ? marks[id].startTime : null;
        endTime = typeof marks[id].endTime === 'number' ? marks[id].endTime : null;
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

      // Real-time evaluation of checkbox state
      const isVasEnabled = panel ? panel.querySelector('#nlp-enable-vas')?.checked : false;

      // Optional VAS Rating Prompt
      if (isVasEnabled) {
        const vasScore = await promptVAS();
        if (stopRequested || currentToken !== runToken) break;

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

          // Live-update chart if it is currently displayed on screen
          const chartContainer = panel ? panel.querySelector('#nlp-chart-container') : null;
          if (chartContainer && chartContainer.style.display !== 'none') {
            renderPerformanceChart();
          }
        }
      }
    }

    // Wrap up sequence state
    if (currentToken === runToken) {
      running = false;
      currentStepIndex = -1;
      updateStatus(stopRequested ? 'Stopped' : 'Sequence Complete.');
      renderStepsList();

      // Automatically render and display chart if VAS was collected
      if (sessionLog.length > 0) {
        renderPerformanceChart();
      }
    }
  }

  function promptVAS() {
    return new Promise((resolve) => {
      waitingForVas = true;
      const vasContainer = panel ? panel.querySelector('#nlp-vas-container') : null;
      const slider = panel ? panel.querySelector('#nlp-vas-slider') : null;

      if (vasContainer) {
        vasContainer.classList.add('nlp-active');
      }
      if (slider) {
        slider.value = 50;
      }

      currentVasResolve = (score) => {
        if (vasContainer) {
          vasContainer.classList.remove('nlp-active');
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

  // ---------- In-House Dual-Axis Plotter ----------

  function renderPerformanceChart() {
    const chartWrap = panel.querySelector('#nlp-chart-container');
    if (!chartWrap) return;

    // Filter points that actually have VAS scores recorded
    const validData = sessionLog.filter(d => d.VAS_Clarity !== null && d.VAS_Clarity !== undefined);
    if (validData.length === 0) {
      chartWrap.innerHTML = '<div style="padding:10px;text-align:center;color:#888;font-size:11px;">No VAS data collected yet.</div>';
      return;
    }

    const width = 280;
    const height = 150;
    const pad = { top: 20, right: 35, bottom: 25, left: 35 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;

    const n = validData.length;
    const minRate = 0.5;
    const maxRate = 2.0;

    // Coordinate mapping helpers
    const getX = (i) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const getY1 = (vas) => pad.top + innerH - (vas / 100) * innerH; // VAS: 0 - 100
    const getY2 = (rate) => {
      const clamped = Math.max(minRate, Math.min(maxRate, rate));
      return pad.top + innerH - ((clamped - minRate) / (maxRate - minRate)) * innerH;
    };

    // Construct SVG Paths
    let vasPath = '';
    let ratePath = '';
    let vasPoints = '';
    let ratePoints = '';

    validData.forEach((d, i) => {
      const x = getX(i);
      const y1 = getY1(d.VAS_Clarity);
      const y2 = getY2(d.PlaybackRate);

      vasPath += (i === 0 ? `M ${x} ${y1}` : ` L ${x} ${y1}`);
      ratePath += (i === 0 ? `M ${x} ${y2}` : ` L ${x} ${y2}`);

      vasPoints += `<circle cx="${x}" cy="${y1}" r="3" fill="#ff00cc" stroke="#fff" stroke-width="1"><title>Step ${d.StepIdx}: VAS ${d.VAS_Clarity}%</title></circle>`;
      ratePoints += `<rect x="${x - 2.5}" y="${y2 - 2.5}" width="5" height="5" fill="#00d2ff"><title>Step ${d.StepIdx}: ${d.PlaybackRate}x</title></rect>`;
    });

    const svg = `
      <svg width="${width}" height="${height}" style="background:#181818;border-radius:6px;font-family:sans-serif;font-size:9px;user-select:none;">
        <!-- Grid lines -->
        <line x1="${pad.left}" y1="${pad.top}" x2="${width - pad.right}" y2="${pad.top}" stroke="#333" stroke-dasharray="2,2"/>
        <line x1="${pad.left}" y1="${pad.top + innerH / 2}" x2="${width - pad.right}" y2="${pad.top + innerH / 2}" stroke="#333" stroke-dasharray="2,2"/>
        <line x1="${pad.left}" y1="${pad.top + innerH}" x2="${width - pad.right}" y2="${pad.top + innerH}" stroke="#444"/>

        <!-- Y1 (VAS) Axis Labels (Left - Magenta) -->
        <text x="${pad.left - 4}" y="${pad.top + 4}" fill="#ff00cc" text-anchor="end">100%</text>
        <text x="${pad.left - 4}" y="${pad.top + innerH / 2 + 3}" fill="#ff00cc" text-anchor="end">50%</text>
        <text x="${pad.left - 4}" y="${pad.top + innerH}" fill="#ff00cc" text-anchor="end">0%</text>

        <!-- Y2 (Speed) Axis Labels (Right - Cyan) -->
        <text x="${width - pad.right + 4}" y="${pad.top + 4}" fill="#00d2ff" text-anchor="start">2.0x</text>
        <text x="${width - pad.right + 4}" y="${pad.top + innerH / 2 + 3}" fill="#00d2ff" text-anchor="start">1.25x</text>
        <text x="${width - pad.right + 4}" y="${pad.top + innerH}" fill="#00d2ff" text-anchor="start">0.5x</text>

        <!-- Traces -->
        <path d="${ratePath}" fill="none" stroke="#00d2ff" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.8"/>
        <path d="${vasPath}" fill="none" stroke="#ff00cc" stroke-width="2"/>

        <!-- Data Nodes -->
        ${ratePoints}
        ${vasPoints}

        <!-- X-axis tick labels (Step numbers) -->
        ${validData.map((d, i) => `<text x="${getX(i)}" y="${height - 8}" fill="#aaa" text-anchor="middle">${d.StepIdx}</text>`).join('')}

        <!-- Legend -->
        <circle cx="${pad.left + 5}" cy="10" r="3" fill="#ff00cc"/>
        <text x="${pad.left + 12}" y="13" fill="#ff00cc">VAS Clarity</text>
        <rect x="${width - pad.right - 55}" y="7" width="6" height="6" fill="#00d2ff"/>
        <text x="${width - pad.right - 45}" y="13" fill="#00d2ff">Speed</text>
      </svg>
    `;

    chartWrap.innerHTML = svg;
    chartWrap.style.display = 'block';
  }

  // ---------- UI ----------

  function buildPanel() {
    if (document.getElementById('ninja-listening-panel')) {
      panel = document.getElementById('ninja-listening-panel');
      return;
    }
    if (!document.body) return;

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

      // Row 1: Full-width Preset Select
      '  <div class="nlp-row" style="margin-bottom: 4px;">' +
      '    <select id="nlp-preset-select" class="nlp-preset-select" style="width: 100%;">' +
      '      <option value="ninja">Ninja Protocol (0.6x Anchor)</option>' +
      '      <option value="compression">Pure Compression</option>' +
      '      <option value="static">Static Control (1.0x)</option>' +
      '    </select>' +
      '  </div>' +

      // Row 2: Action Buttons (Load / Export / Chart)
      '  <div class="nlp-controls-row" style="display: flex; gap: 4px; margin-bottom: 6px;">' +
      '    <button id="nlp-load-btn" class="nlp-file-btn" style="flex: 1;">Load</button>' +
      '    <button id="nlp-export-btn" class="nlp-file-btn" style="flex: 1.3;">Export Data</button>' +
      '    <button id="nlp-chart-btn" class="nlp-file-btn" style="flex: 1;">\uD83D\uDCCA Chart</button>' +
      '  </div>' +

      // Optional Performance Checkbox Row
      '  <div class="nlp-row" style="font-size: 11px; opacity: 0.9; margin-bottom: 4px;">' +
      '    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">' +
      '      <input type="checkbox" id="nlp-enable-vas"> Record your performance' +
      '    </label>' +
      '  </div>' +

      // Start Time Row with Integrated Next Button
      '  <div class="nlp-row" style="display: flex; align-items: center; gap: 6px;">' +
      '    <button id="nlp-mark-start" style="flex: 0 0 auto;">Mark start</button>' +
      '    <span id="nlp-start-label" style="min-width: 42px;">--:--</span>' +
      '    <button id="nlp-start-at-end" class="nlp-file-btn" title="Set Start to previous End and seek forward" style="margin-left: auto; padding: 2px 8px; font-weight: bold; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #eee; cursor: pointer;">Next \u2794</button>' +
      '  </div>' +

      // End Time Row
      '  <div class="nlp-row">' +
      '    <button id="nlp-mark-end">Mark end</button>' +
      '    <span id="nlp-end-label">--:--</span>' +
      '  </div>' +

      // Run / Stop Row
      '  <div class="nlp-row">' +
      '    <button id="nlp-run">\u25B6 Run sequence</button>' +
      '    <button id="nlp-stop">\u25A0 Stop</button>' +
      '  </div>' +

      '  <div class="nlp-status" id="nlp-status">Ready</div>' +
      '  <div class="nlp-detail-only" id="nlp-steps-wrap">' +
      '    <div class="nlp-steps-label">Steps (click to jump in)</div>' +
      '    <div id="nlp-steps-list"></div>' +
      '  </div>' +

      // Performance Chart Container
      '  <div id="nlp-chart-container" style="display:none;margin-top:8px;text-align:center;"></div>' +

      // VAS Prompt Container
      '  <div id="nlp-vas-container">' +
      '    <div class="nlp-vas-question">At this speed, how clearly could you perceive the acoustic details (individual sounds, phonemes, and syllables) of the speech?</div>' +
      '    <div class="nlp-vas-labels"><span>0%: Blur/Noise</span><span>100%: Crystal Clear</span></div>' +
      '    <input type="range" id="nlp-vas-slider" min="0" max="100" step="1" value="50">' +
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

    // Open options page safely via background script
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

    panel.querySelector('#nlp-start-at-end').addEventListener('click', () => {
      if (endTime === null || isNaN(endTime)) return;
      stopSequence();
      startTime = endTime;
      endTime = null;
      if (video) {
        video.currentTime = startTime;
      }
      updatePanelTimes();
      saveMarksForVideo();
      updateStatus('Moved to previous End. Mark new End point.');
    });

    panel.querySelector('#nlp-mark-end').addEventListener('click', () => {
      if (!video) return;
      endTime = video.currentTime;
      updatePanelTimes();
      saveMarksForVideo();
    });

    panel.querySelector('#nlp-run').addEventListener('click', () => runSequence());
    panel.querySelector('#nlp-stop').addEventListener('click', () => stopSequence());

    panel.querySelector('#nlp-enable-vas').addEventListener('change', (e) => {
      if (!e.target.checked && waitingForVas && currentVasResolve) {
        currentVasResolve(null);
      }
    });

    // Toggle Chart Visibility
    panel.querySelector('#nlp-chart-btn').addEventListener('click', () => {
      const container = panel.querySelector('#nlp-chart-container');
      if (container.style.display === 'none' || container.innerHTML === '') {
        renderPerformanceChart();
        container.style.display = 'block';
      } else {
        container.style.display = 'none';
      }
    });

    // Preset Selection
    panel.querySelector('#nlp-preset-select').addEventListener('change', (e) => {
      steps = PRESETS[e.target.value];
      renderStepsList();
    });

    // VAS Replay Button
    panel.querySelector('#nlp-vas-replay').addEventListener('click', () => {
      if (steps[currentStepIndex]) {
        playStep(steps[currentStepIndex], runToken);
      }
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
        alert('No data to export yet.');
        return;
      }

      const headers = 'SubjectID,Timestamp,VideoID,StartTime,EndTime,StepIdx,PlaybackRate,Subtitles,VAS_Clarity\n';
      const csv = sessionLog.map(row => 
        `${row.SubjectID},${row.Timestamp},${row.VideoID},${row.StartTime},${row.EndTime},${row.StepIdx},${row.PlaybackRate},${row.Subtitles},${row.VAS_Clarity}`
      ).join('\n');

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
          if (config.startTime !== undefined) startTime = config.startTime;
          if (config.endTime !== undefined) endTime = config.endTime;
          updatePanelTimes();
          renderStepsList();
          alert('Config loaded successfully.');
        } catch (err) {
          alert('Invalid JSON config.');
        }
      };
      reader.readAsText(file);
    });

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

    list.innerHTML = '';

    steps.forEach((step, i) => {
      const row = document.createElement('div');
      row.className = 'nlp-step-row' + (i === currentStepIndex ? ' nlp-step-active' : '');

      const rateLabel = (Math.round(step.rate * 100) / 100).toString() + 'x';
      row.innerHTML =
        '<span class="nlp-step-idx">' + (i + 1) + '</span>' +
        '<span class="nlp-step-rate">' + rateLabel + '</span>' +
        (isFileMode ? '' : '<span class="nlp-step-cc">' + (step.subtitles ? 'CC on' : 'CC off') + '</span>');

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

  // ---------- Navigation and Persistent Lifecycle Handler ----------

  async function handlePageActivation() {
    const isWatchPage = location.pathname.startsWith('/watch') || isFileMode;
    if (!isWatchPage) {
      if (panel) panel.style.display = 'none';
      return;
    }

    buildPanel();
    if (panel) panel.style.display = '';

    video = getVideoElement() || (await waitForVideo());
    if (video) {
      attachRateEnforcer(video);
      loadMarksForVideo();
      updateStatus('Ready');
    } else {
      updateStatus('No video/audio element detected.');
    }
    loadSteps(() => {
      renderStepsList();
    });
  }

  // Navigation hooks
  document.addEventListener('yt-navigate-finish', () => {
    stopSequence();
    handlePageActivation();
  });

  window.addEventListener('spfdone', () => {
    stopSequence();
    handlePageActivation();
  });

  window.addEventListener('popstate', handlePageActivation);

  // Periodic safeguard check
  let initPollCount = 0;
  const initInterval = setInterval(() => {
    initPollCount++;
    if (!document.getElementById('ninja-listening-panel') && document.body) {
      handlePageActivation();
    }
    if (initPollCount > 15) {
      clearInterval(initInterval);
    }
  }, 500);

  // Init trigger
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handlePageActivation);
  } else {
    handlePageActivation();
  }
})();