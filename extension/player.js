// Ninja Listening Trainer - local audio file player.

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

let audio = null;
let currentFileKey = null;
let currentRawFileName = '';
let steps = DEFAULT_STEPS;
let startTime = 0;
let endTime = 30;
let running = false;
let stopRequested = false;
let runToken = 0;
let currentStepIndex = -1;

let sessionLog = [];
let waitingForVas = false;
let currentVasResolve = null;

const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const browseBtn = document.getElementById('browse-btn');
const fileInfo = document.getElementById('file-info');
const fileNameEl = document.getElementById('file-name');
const controls = document.getElementById('controls');
const statusEl = document.getElementById('status');
const startLabel = document.getElementById('start-label');
const endLabel = document.getElementById('end-label');
const stepsListEl = document.getElementById('steps-list');
const configFile = document.getElementById('config-file-input');
const vasSlider = document.getElementById('vas-slider');
const vasCurrentVal = document.getElementById('vas-current-val');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTime(t) {
  if (t === null || t === undefined || isNaN(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return m + ':' + s;
}

function fileKeyFor(file) {
  return file.name + ':' + file.size;
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.steps) {
    steps = changes.steps.newValue || DEFAULT_STEPS;
    renderStepsList();
  }
});

function saveMarksForFile() {
  if (!currentFileKey) return;
  chrome.storage.local.get(['audioMarks'], (res) => {
    const marks = res.audioMarks || {};
    marks[currentFileKey] = { startTime, endTime };
    chrome.storage.local.set({ audioMarks: marks });
  });
}

function loadMarksForFile(callback) {
  if (!currentFileKey) {
    startTime = 0;
    endTime = 30;
    if (callback) callback();
    return;
  }
  chrome.storage.local.get(['audioMarks'], (res) => {
    const marks = res.audioMarks || {};
    const record = marks[currentFileKey];

    if (record) {
      startTime = typeof record.startTime === 'number' ? record.startTime : 0;
      if (typeof record.endTime === 'number' && record.endTime > startTime) {
        endTime = record.endTime;
      } else {
        endTime = startTime + 30;
      }
    } else {
      startTime = 0;
      endTime = 30;
    }
    if (callback) callback();
  });
}

// ---------- file loading ----------

function loadFile(file) {
  if (!file) return;
  const newFileKey = fileKeyFor(file);
  if (currentFileKey && currentFileKey !== newFileKey) {
    sessionLog = [];
    const chartContainer = document.getElementById('chart-container');
    if (chartContainer) chartContainer.style.display = 'none';
  }

  currentRawFileName = file.name;
  const url = URL.createObjectURL(file);
  fileNameEl.textContent = file.name;
  audio = document.getElementById('audio');
  audio.src = url;
  currentFileKey = newFileKey;

  fileInfo.classList.remove('hidden');
  controls.classList.remove('hidden');

  const onReady = () => {
    loadMarksForFile(() => {
      if (audio.duration && !isNaN(audio.duration)) {
        if (endTime > audio.duration) {
          endTime = audio.duration;
        }
      }
      updateTimeLabels();
      renderStepsList();
      saveMarksForFile();
      updateStatus('Ready');
    });
  };

  if (audio.readyState >= 1) {
    onReady();
  } else {
    audio.onloadedmetadata = onReady;
  }
}

fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
});

if (browseBtn) {
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
}

dropZone.addEventListener('click', () => {
  fileInput.click();
});

['dragenter', 'dragover'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  });
});
dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) loadFile(file);
});

// ---------- marks ----------

document.getElementById('mark-start').addEventListener('click', () => {
  if (!audio) return;
  startTime = audio.currentTime;
  updateTimeLabels();
  saveMarksForFile();
});

document.getElementById('start-at-end').addEventListener('click', () => {
  if (endTime === null || isNaN(endTime) || endTime <= 0) return;
  stopSequence();
  startTime = endTime;
  
  let nextEnd = startTime + 30;
  if (audio && audio.duration && !isNaN(audio.duration) && nextEnd > audio.duration) {
    nextEnd = audio.duration;
  }
  endTime = nextEnd;

  if (audio) {
    audio.currentTime = startTime;
  }
  updateTimeLabels();
  saveMarksForFile();
  updateStatus('Moved to next fragment.');
});

document.getElementById('mark-end').addEventListener('click', () => {
  if (!audio) return;
  endTime = audio.currentTime;
  updateTimeLabels();
  saveMarksForFile();
});

function updateTimeLabels() {
  startLabel.textContent = formatTime(startTime);
  endLabel.textContent = formatTime(endTime);
}

// ---------- sequencer ----------

async function playStep(step, myToken) {
  if (!audio || endTime <= startTime) return;
  if (myToken !== runToken) return;

  audio.currentTime = startTime;
  audio.playbackRate = step.rate;
  try {
    await audio.play();
  } catch (e) {}
  if (myToken !== runToken) return;

  while (myToken === runToken && !stopRequested && audio.currentTime < endTime - 0.05 && !audio.ended) {
    await sleep(100);
  }
  if (myToken === runToken) {
    audio.pause();
  }
}

async function runSequence(fromIndex) {
  if (!audio || endTime <= startTime) {
    updateStatus('Mark a valid start and end point first.');
    return;
  }

  if (waitingForVas && currentVasResolve) {
    currentVasResolve(null);
  }

  runToken++;
  const currentToken = runToken;
  stopRequested = false;
  running = true;

  const startIdx = (typeof fromIndex === 'number' && fromIndex >= 0) ? fromIndex : 0;

  for (let i = startIdx; i < steps.length; i++) {
    if (stopRequested || currentToken !== runToken) break;
    currentStepIndex = i;
    updateStatus();
    renderStepsList();

    await playStep(steps[i], currentToken);
    if (stopRequested || currentToken !== runToken) break;

    const isVasEnabled = document.getElementById('enable-vas').checked;
    if (isVasEnabled) {
      const vasScore = await promptVAS();
      if (stopRequested || currentToken !== runToken) break;

      if (vasScore !== null) {
        const currentProtocol = document.getElementById('preset-select')?.value || 'custom';

        sessionLog.push({
          SubjectID: 'SUBJ_001',
          Timestamp: new Date().toISOString(),
          VideoID: currentRawFileName || 'local_file',
          StartTime: startTime.toFixed(2),
          EndTime: endTime.toFixed(2),
          StepIdx: i + 1,
          PlaybackRate: steps[i].rate,
          Subtitles: false,
          VAS_Clarity: vasScore,
          URL: currentRawFileName || 'local_file',
          Title: currentRawFileName || 'Local Audio',
          Protocol: currentProtocol
        });

        const chartContainer = document.getElementById('chart-container');
        if (chartContainer && chartContainer.style.display !== 'none') {
          renderPerformanceChart();
        }
      }
    }
  }

  if (currentToken === runToken) {
    running = false;
    currentStepIndex = -1;
    if (audio) audio.playbackRate = 1.0;
    updateStatus(stopRequested ? 'Stopped' : 'Sequence Complete.');
    renderStepsList();

    if (sessionLog.length > 0) {
      renderPerformanceChart();
    }
  }
}

function promptVAS() {
  return new Promise((resolve) => {
    waitingForVas = true;
    const vasContainer = document.getElementById('vas-container');
    const slider = document.getElementById('vas-slider');

    vasContainer.classList.remove('hidden');
    slider.value = 50;
    if (vasCurrentVal) vasCurrentVal.textContent = '50%';

    currentVasResolve = (score) => {
      vasContainer.classList.add('hidden');
      waitingForVas = false;
      resolve(score);
    };
  });
}

function stopSequence() {
  stopRequested = true;
  runToken++;
  running = false;

  if (waitingForVas && currentVasResolve) {
    currentVasResolve(null);
  }

  if (audio) {
    audio.pause();
    audio.playbackRate = 1.0;
  }
  currentStepIndex = -1;
  updateStatus('Stopped');
  renderStepsList();
}

document.getElementById('run-btn').addEventListener('click', () => runSequence());
document.getElementById('stop-btn').addEventListener('click', () => stopSequence());

document.getElementById('enable-vas').addEventListener('change', (e) => {
  if (!e.target.checked && waitingForVas && currentVasResolve) {
    currentVasResolve(null);
  }
});

if (vasSlider && vasCurrentVal) {
  vasSlider.addEventListener('input', (e) => {
    vasCurrentVal.textContent = e.target.value + '%';
  });
}

document.getElementById('vas-replay').addEventListener('click', () => {
  if (steps[currentStepIndex]) {
    playStep(steps[currentStepIndex], runToken);
  }
});

document.getElementById('vas-submit').addEventListener('click', () => {
  if (waitingForVas && currentVasResolve) {
    const score = document.getElementById('vas-slider').value;
    currentVasResolve(parseInt(score, 10));
  }
});

document.getElementById('preset-select').addEventListener('change', (e) => {
  steps = PRESETS[e.target.value];
  renderStepsList();
});

// ---------- In-House Dual-Axis Plotter ----------

function renderPerformanceChart() {
  const chartWrap = document.getElementById('chart-container');
  window.renderNinjaChart(chartWrap, sessionLog, {
    width: 380,
    height: 175,
    bgColor: '#0f1115',
    showSubtitlesLegend: false
  });
}

document.getElementById('chart-btn').addEventListener('click', () => {
  const container = document.getElementById('chart-container');
  if (container.style.display === 'none' || container.innerHTML === '') {
    renderPerformanceChart();
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
});

// ---------- Export Data ----------

document.getElementById('export-btn').addEventListener('click', () => {
  window.NinjaIO.exportSessionCsv(sessionLog, 'local_audio');
});

// ---------- Load (JSON / CSV 兼用) ----------

document.getElementById('load-btn').addEventListener('click', () => {
  configFile.click();
});

configFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    configFile.value = '';
    try {
      const parsed = window.NinjaIO.parseLoadedFile(file.name, ev.target.result);

      if (parsed.type === 'json') {
        if (parsed.steps) steps = parsed.steps;
        if (parsed.startTime !== undefined) startTime = parsed.startTime;
        if (parsed.endTime !== undefined) endTime = parsed.endTime;
        updateTimeLabels();
        renderStepsList();
        saveMarksForFile();
        alert('Config loaded successfully.');
      } else if (parsed.type === 'protocol') {
        steps = parsed.steps;
        renderStepsList();
        updateStatus(`Loaded ${steps.length} steps protocol.`);
        alert(`Loaded ${steps.length} steps protocol.`);
      } else if (parsed.type === 'session') {
        if (parsed.protocol && PRESETS[parsed.protocol]) {
          steps = PRESETS[parsed.protocol];
          const presetSelect = document.getElementById('preset-select');
          if (presetSelect) presetSelect.value = parsed.protocol;
          renderStepsList();
        }

        if (parsed.videoId && currentRawFileName && parsed.videoId !== currentRawFileName) {
          const match = confirm(
            `This log was recorded on file:\n"${parsed.videoId}"\n\nCurrent file is:\n"${currentRawFileName}"\n\nApply marks to current audio anyway?`
          );
          if (!match) return;
        }

        stopSequence();
        startTime = parsed.startTime;
        endTime = parsed.endTime;
        if (audio) audio.currentTime = startTime;
        updateTimeLabels();
        saveMarksForFile();
        updateStatus(`Restored session: ${formatTime(startTime)} - ${formatTime(endTime)}`);
        alert(`Session restored: ${formatTime(startTime)} - ${formatTime(endTime)}`);
      }
    } catch (err) {
      alert(err.message);
    }
  };
  reader.readAsText(file);
});

// ---------- UI ----------

function updateStatus(message) {
  if (message) {
    statusEl.textContent = message;
    return;
  }
  if (running && steps[currentStepIndex]) {
    const step = steps[currentStepIndex];
    statusEl.textContent = 'Step ' + (currentStepIndex + 1) + '/' + steps.length + ': ' + step.rate + 'x';
  } else {
    statusEl.textContent = 'Ready';
  }
}

function renderStepsList() {
  stepsListEl.innerHTML = '';
  steps.forEach((step, i) => {
    const row = document.createElement('div');
    row.className = 'step-row' + (i === currentStepIndex ? ' active' : '');
    const rateLabel = (Math.round(step.rate * 100) / 100).toString() + 'x';
    row.innerHTML = '<span class="step-idx">' + (i + 1) + '</span><span class="step-rate">' + rateLabel + '</span>';
    row.addEventListener('click', () => {
      runSequence(i);
    });
    stepsListEl.appendChild(row);
  });
}

// ---------- init ----------

loadSteps(() => {
  renderStepsList();
});