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

let steps = [];

function render() {
  const body = document.getElementById('steps-body');
  body.innerHTML = '';
  steps.forEach((step, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + (i + 1) + '</td>' +
      '<td><input type="number" step="0.05" min="0.25" max="2" value="' + step.rate + '" data-idx="' + i + '" class="rate-input"></td>' +
      '<td><input type="checkbox" ' + (step.subtitles ? 'checked' : '') + ' data-idx="' + i + '" class="sub-input"></td>' +
      '<td class="row-actions">' +
      '  <button data-idx="' + i + '" class="up">\u2191</button>' +
      '  <button data-idx="' + i + '" class="down">\u2193</button>' +
      '  <button data-idx="' + i + '" class="del">\u2715</button>' +
      '</td>';
    body.appendChild(tr);
  });

  body.querySelectorAll('.rate-input').forEach((el) => el.addEventListener('input', (e) => {
    steps[+e.target.dataset.idx].rate = parseFloat(e.target.value) || 1.0;
  }));
  body.querySelectorAll('.sub-input').forEach((el) => el.addEventListener('change', (e) => {
    steps[+e.target.dataset.idx].subtitles = e.target.checked;
  }));
  body.querySelectorAll('.del').forEach((el) => el.addEventListener('click', (e) => {
    steps.splice(+e.target.dataset.idx, 1);
    render();
  }));
  body.querySelectorAll('.up').forEach((el) => el.addEventListener('click', (e) => {
    const i = +e.target.dataset.idx;
    if (i > 0) {
      const tmp = steps[i - 1];
      steps[i - 1] = steps[i];
      steps[i] = tmp;
      render();
    }
  }));
  body.querySelectorAll('.down').forEach((el) => el.addEventListener('click', (e) => {
    const i = +e.target.dataset.idx;
    if (i < steps.length - 1) {
      const tmp = steps[i + 1];
      steps[i + 1] = steps[i];
      steps[i] = tmp;
      render();
    }
  }));
}

document.getElementById('add-row').addEventListener('click', () => {
  steps.push({ rate: 1.0, subtitles: false });
  render();
});

document.getElementById('save').addEventListener('click', () => {
  chrome.storage.sync.set({ steps: steps }, () => {
    const msg = document.getElementById('save-msg');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 1500);
  });
});

document.getElementById('reset').addEventListener('click', () => {
  steps = JSON.parse(JSON.stringify(DEFAULT_STEPS));
  render();
});

chrome.storage.sync.get(['steps'], (res) => {
  steps = (res.steps && res.steps.length) ? res.steps : JSON.parse(JSON.stringify(DEFAULT_STEPS));
  render();
});
