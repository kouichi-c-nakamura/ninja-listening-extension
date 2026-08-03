// Ninja Listening Trainer - local audio file player.
// Same mark-a-fragment / run-a-speed-sequence idea as the YouTube content
// script, but for local mp3/m4a/wav/ogg/etc files picked via the File API.
// No captions here (audio files have none), and no playback-rate-enforcer
// hack is needed since a plain <audio> element doesn't fight us the way
// YouTube's own player does.

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
let currentFileKey = null; // name+size, used to remember marks per file
let steps = DEFAULT_STEPS;
let startTime = 0;
let endTime = 0;
let running = false;
let stopRequested = false;
let currentStepIndex = -1;

const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const fileInfo = document.getElementById('file-info');
const fileNameEl = document.getElementById('file-name');
const controls = document.getElementById('controls');
const statusEl = document.getElementById('status');
const startLabel = document.getElementById('start-label');
const endLabel = document.getElementById('end-label');
const stepsListEl = document.getElementById('steps-list');

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
    endTime = 0;
    if (callback) callback();
    return;
  }
  chrome.storage.local.get(['audioMarks'], (res) => {
    const marks = res.audioMarks || {};
    if (marks[currentFileKey]) {
      startTime = marks[currentFileKey].startTime;
      endTime = marks[currentFileKey].endTime;
    } else {
      startTime = 0;
      endTime = 0;
    }
    if (callback) callback();
  });
}

// ---------- file loading ----------

function loadFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  fileNameEl.textContent = file.name;
  audio = document.getElementById('audio');
  audio.src = url;
  currentFileKey = fileKeyFor(file);

  fileInfo.classList.remove('hidden');
  controls.classList.remove('hidden');

  loadMarksForFile(() => {
    updateTimeLabels();
    renderStepsList();
    updateStatus();
  });
}

fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
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

async function playStep(step) {
  if (!audio || endTime <= startTime) return;
  audio.currentTime = startTime;
  audio.playbackRate = step.rate;
  try {
    await audio.play();
  } catch (e) {}
  while (!stopRequested && audio.currentTime < endTime - 0.05 && !audio.ended) {
    await sleep(100);
  }
  audio.pause();
}

async function runSequence(fromIndex) {
  if (running) return;
  if (!audio || endTime <= startTime) {
    updateStatus('Mark a valid start and end point first.');
    return;
  }
  running = true;
  stopRequested = false;
  const start = (typeof fromIndex === 'number' && fromIndex >= 0) ? fromIndex : 0;
  for (let i = start; i < steps.length; i++) {
    if (stopRequested) break;
    currentStepIndex = i;
    updateStatus();
    renderStepsList();
    await playStep(steps[i]);
  }
  running = false;
  currentStepIndex = -1;
  updateStatus();
  renderStepsList();
}

function stopSequence() {
  stopRequested = true;
  running = false;
  if (audio) audio.pause();
  currentStepIndex = -1;
  updateStatus();
  renderStepsList();
}

document.getElementById('run-btn').addEventListener('click', () => runSequence());
document.getElementById('stop-btn').addEventListener('click', () => stopSequence());

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
      if (running) stopSequence();
      setTimeout(() => runSequence(i), 50);
    });
    stepsListEl.appendChild(row);
  });
}

// ---------- init ----------

loadSteps(() => {
  renderStepsList();
});
