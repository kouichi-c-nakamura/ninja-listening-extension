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
  currentRawFileName = file.name;
  const url = URL.createObjectURL(file);
  fileNameEl.textContent = file.name;
  audio = document.getElementById('audio');
  audio.src = url;
  currentFileKey = fileKeyFor(file);

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
  if (startIdx === 0) {
    sessionLog = [];
  }

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
        sessionLog.push({
          SubjectID: 'SUBJ_001',
          Timestamp: new Date().toISOString(),
          VideoID: currentRawFileName || 'local_file',
          StartTime: startTime.toFixed(2),
          EndTime: endTime.toFixed(2),
          StepIdx: i + 1,
          PlaybackRate: steps[i].rate,
          Subtitles: false,
          VAS_Clarity: vasScore
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
  if (!chartWrap) return;

  const validData = sessionLog.filter((d) => d.VAS_Clarity !== null && d.VAS_Clarity !== undefined);
  if (validData.length === 0) {
    chartWrap.innerHTML = '<div style="padding:10px;text-align:center;color:#888;font-size:11px;">No data recorded yet.</div>';
    return;
  }

  const width = 380;
  const height = 160;
  const pad = { top: 20, right: 40, bottom: 25, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const n = validData.length;
  const minRate = 0.5;
  const maxRate = 2.0;

  const getX = (i) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const getY1 = (vas) => pad.top + innerH - (vas / 100) * innerH;
  const getY2 = (rate) => {
    const clamped = Math.max(minRate, Math.min(maxRate, rate));
    return pad.top + innerH - ((clamped - minRate) / (maxRate - minRate)) * innerH;
  };

  let vasPath = '';
  let ratePath = '';
  let vasPoints = '';
  let ratePoints = '';

  validData.forEach((d, i) => {
    const x = getX(i);
    const y1 = getY1(d.VAS_Clarity);
    const y2 = getY2(d.PlaybackRate);

    vasPath += (i === 0 ? 'M ' + x + ' ' + y1 : ' L ' + x + ' ' + y1);
    ratePath += (i === 0 ? 'M ' + x + ' ' + y2 : ' L ' + x + ' ' + y2);

    vasPoints += '<circle cx="' + x + '" cy="' + y1 + '" r="3" fill="#ff00cc" stroke="#fff" stroke-width="1"><title>Step ' + d.StepIdx + ': Performance ' + d.VAS_Clarity + '%</title></circle>';
    ratePoints += '<rect x="' + (x - 2.5) + '" y="' + (y2 - 2.5) + '" width="5" height="5" fill="#00d2ff"><title>Step ' + d.StepIdx + ': ' + d.PlaybackRate + 'x</title></rect>';
  });

  const xLabels = validData.map((d, i) => '<text x="' + getX(i) + '" y="' + (height - 8) + '" fill="#aaa" text-anchor="middle">' + d.StepIdx + '</text>').join('');

  const svg =
    '<svg width="' + width + '" height="' + height + '" style="background:#0f1115;border-radius:6px;font-family:sans-serif;font-size:9px;user-select:none;">' +
    '  <line x1="' + pad.left + '" y1="' + pad.top + '" x2="' + (width - pad.right) + '" y2="' + pad.top + '" stroke="#252a35" stroke-dasharray="2,2"/>' +
    '  <line x1="' + pad.left + '" y1="' + (pad.top + innerH / 2) + '" x2="' + (width - pad.right) + '" y2="' + (pad.top + innerH / 2) + '" stroke="#252a35" stroke-dasharray="2,2"/>' +
    '  <line x1="' + pad.left + '" y1="' + (pad.top + innerH) + '" x2="' + (width - pad.right) + '" y2="' + (pad.top + innerH) + '" stroke="#333842"/>' +
    '  <text x="' + (pad.left - 4) + '" y="' + (pad.top + 3) + '" fill="#ff00cc" text-anchor="end">100%</text>' +
    '  <text x="' + (pad.left - 4) + '" y="' + (pad.top + innerH / 2 + 3) + '" fill="#ff00cc" text-anchor="end">50%</text>' +
    '  <text x="' + (pad.left - 4) + '" y="' + (pad.top + innerH) + '" fill="#ff00cc" text-anchor="end">0%</text>' +
    '  <text x="' + (width - pad.right + 4) + '" y="' + (pad.top + 3) + '" fill="#00d2ff" text-anchor="start">2.0x</text>' +
    '  <text x="' + (width - pad.right + 4) + '" y="' + (pad.top + innerH / 2 + 3) + '" fill="#00d2ff" text-anchor="start">1.25x</text>' +
    '  <text x="' + (width - pad.right + 4) + '" y="' + (pad.top + innerH) + '" fill="#00d2ff" text-anchor="start">0.5x</text>' +
    '  <path d="' + ratePath + '" fill="none" stroke="#00d2ff" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.8"/>' +
    '  <path d="' + vasPath + '" fill="none" stroke="#ff00cc" stroke-width="2"/>' +
    ratePoints +
    vasPoints +
    xLabels +
    '  <circle cx="' + (pad.left + 5) + '" cy="10" r="3" fill="#ff00cc"/>' +
    '  <text x="' + (pad.left + 12) + '" y="13" fill="#ff00cc">Clarity</text>' +
    '  <rect x="' + (width - pad.right - 55) + '" y="7" width="6" height="6" fill="#00d2ff"/>' +
    '  <text x="' + (width - pad.right - 45) + '" y="13" fill="#00d2ff">Speed</text>' +
    '</svg>';

  chartWrap.innerHTML = svg;
  chartWrap.style.display = 'block';
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
  if (sessionLog.length === 0) {
    alert('No data to export yet.');
    return;
  }

  const headers = 'SubjectID,Timestamp,VideoID,StartTime,EndTime,StepIdx,PlaybackRate,Subtitles,VAS_Clarity\n';
  const csv = sessionLog
    .map(
      (row) =>
        row.SubjectID +
        ',' +
        row.Timestamp +
        ',' +
        row.VideoID +
        ',' +
        row.StartTime +
        ',' +
        row.EndTime +
        ',' +
        row.StepIdx +
        ',' +
        row.PlaybackRate +
        ',' +
        row.Subtitles +
        ',' +
        row.VAS_Clarity
    )
    .join('\n');

  const blob = new Blob([headers + csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ninja_local_research_log_' + Date.now() + '.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- Load (JSON / CSV 兼用) ----------

document.getElementById('load-btn').addEventListener('click', () => {
  configFile.click();
});

configFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const text = ev.target.result.trim();
    configFile.value = '';

    // 1. JSON
    if (file.name.endsWith('.json') || text.startsWith('{')) {
      try {
        const config = JSON.parse(text);
        if (config.stepsArray) steps = config.stepsArray;
        if (config.startTime !== undefined) startTime = config.startTime;
        if (config.endTime !== undefined) endTime = config.endTime;
        updateTimeLabels();
        renderStepsList();
        saveMarksForFile();
        alert('Config loaded successfully.');
      } catch (err) {
        alert('Invalid JSON config.');
      }
      return;
    }

    // 2. CSV
    try {
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        alert('CSV contains no data rows.');
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());

      // 判定A: 定点観測セッション復元ログ (StartTime, EndTime, VideoID)
      if (headers.includes('starttime') && headers.includes('endtime')) {
        const startCol = headers.indexOf('starttime');
        const endCol = headers.indexOf('endtime');
        const videoCol = headers.indexOf('videoid');

        const lastRow = lines[lines.length - 1].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const newStart = parseFloat(lastRow[startCol]);
        const newEnd = parseFloat(lastRow[endCol]);
        const targetFile = videoCol !== -1 ? lastRow[videoCol] : null;

        if (isNaN(newStart) || isNaN(newEnd)) {
          alert('Could not parse StartTime/EndTime from CSV.');
          return;
        }

        if (targetFile && currentRawFileName && targetFile !== currentRawFileName) {
          const match = confirm(`This log was recorded on file:\n"${targetFile}"\n\nCurrent file is:\n"${currentRawFileName}"\n\nApply marks to current audio anyway?`);
          if (!match) return;
        }

        stopSequence();
        startTime = newStart;
        endTime = newEnd;
        if (audio) {
          audio.currentTime = startTime;
        }
        updateTimeLabels();
        saveMarksForFile();
        updateStatus(`Restored session: ${formatTime(startTime)} - ${formatTime(endTime)}`);
        alert(`Session restored: ${formatTime(startTime)} - ${formatTime(endTime)}`);
        return;
      }

      // 判定B: 速度プロトコル定義 CSV
      const rateCol = headers.findIndex((h) => h.includes('rate') || h.includes('speed') || h.includes('tempo'));
      if (rateCol !== -1) {
        const newSteps = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
          const r = parseFloat(cols[rateCol]);
          if (!isNaN(r)) {
            newSteps.push({ rate: r, subtitles: false });
          }
        }
        if (newSteps.length > 0) {
          steps = newSteps;
          renderStepsList();
          updateStatus(`Loaded ${steps.length} steps protocol.`);
          alert(`Loaded ${steps.length} steps protocol.`);
          return;
        }
      }

      alert('Unrecognized CSV format.');
    } catch (err) {
      alert('Failed to parse CSV: ' + err.message);
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