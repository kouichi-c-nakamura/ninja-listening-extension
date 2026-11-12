// Ninja Listening Trainer - Shared Dual-Axis SVG Chart Renderer

window.renderNinjaChart = function (containerEl, sessionLog, options = {}) {
  if (!containerEl) return;

  const validData = sessionLog.filter((d) => d.VAS_Clarity !== null && d.VAS_Clarity !== undefined);
  if (validData.length === 0) {
    containerEl.innerHTML = '<div style="padding:10px;text-align:center;color:#888;font-size:11px;">No data recorded yet.</div>';
    return;
  }

  // 呼び出し元ごとの見た目オプション（デフォルト値あり）
  const width = options.width || 284;
  const height = options.height || 160;
  const bgColor = options.bgColor || '#181818';
  const showSubtitlesLegend = options.showSubtitlesLegend !== undefined ? options.showSubtitlesLegend : true;

  const pad = { top: 24, right: 44, bottom: 25, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const n = validData.length;
  const minRate = 0.0;
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

    const isSubOn = d.Subtitles === true || String(d.Subtitles).toLowerCase() === 'true';
    const circleFill = isSubOn ? '#ff00cc' : bgColor;
    const subLabel = isSubOn ? 'Subtitles ON' : 'Subtitles OFF';

    vasPoints +=
      '<circle cx="' + x + '" cy="' + y1 + '" r="3.2" fill="' + circleFill + '" stroke="#ff00cc" stroke-width="1.5">' +
      '<title>Step ' + d.StepIdx + ' (' + subLabel + '): Clarity ' + d.VAS_Clarity + '%</title></circle>';
    ratePoints +=
      '<rect x="' + (x - 2.6) + '" y="' + (y2 - 2.6) + '" width="5.2" height="5.2" fill="#00d2ff">' +
      '<title>Step ' + d.StepIdx + ': ' + d.PlaybackRate + 'x</title></rect>';
  });

  const xLabels = validData
    .map((d, i) => '<text x="' + getX(i) + '" y="' + (height - 8) + '" fill="#aaa" text-anchor="middle">' + d.StepIdx + '</text>')
    .join('');

  const midY = pad.top + innerH / 2;

  // 上部凡例（YouTubeモードは Subtitles ON/OFF 両方、ローカル音声モードは Clarity のみ）
  const leftLegend = showSubtitlesLegend
    ? '<circle cx="' + (pad.left - 4) + '" cy="10" r="2.8" fill="#ff00cc" stroke="#ff00cc" stroke-width="1.2"/>' +
      '<text x="' + (pad.left + 2) + '" y="13" fill="#ff00cc">Subtitles ON</text>' +
      '<circle cx="' + (pad.left + 64) + '" cy="10" r="2.8" fill="' + bgColor + '" stroke="#ff00cc" stroke-width="1.2"/>' +
      '<text x="' + (pad.left + 70) + '" y="13" fill="#ff00cc">Subtitles OFF</text>'
    : '<circle cx="' + pad.left + '" cy="10" r="2.8" fill="' + bgColor + '" stroke="#ff00cc" stroke-width="1.2"/>' +
      '<text x="' + (pad.left + 7) + '" y="13" fill="#ff00cc">Clarity</text>';

  const svg =
    '<svg width="' + width + '" height="' + height + '" style="background:' + bgColor + ';border-radius:6px;font-family:sans-serif;font-size:8.5px;user-select:none;">' +
    '  <line x1="' + pad.left + '" y1="' + pad.top + '" x2="' + (width - pad.right) + '" y2="' + pad.top + '" stroke="#333" stroke-dasharray="2,2"/>' +
    '  <line x1="' + pad.left + '" y1="' + midY + '" x2="' + (width - pad.right) + '" y2="' + midY + '" stroke="#444" stroke-dasharray="2,2"/>' +
    '  <line x1="' + pad.left + '" y1="' + (pad.top + innerH) + '" x2="' + (width - pad.right) + '" y2="' + (pad.top + innerH) + '" stroke="#444"/>' +
    // Y軸ラベル（Clarity / Speed）
    '  <text x="10" y="' + midY + '" fill="#ff00cc" font-weight="bold" text-anchor="middle" transform="rotate(-90, 10, ' + midY + ')">Clarity</text>' +
    '  <text x="' + (width - 9) + '" y="' + midY + '" fill="#00d2ff" font-weight="bold" text-anchor="middle" transform="rotate(90, ' + (width - 9) + ', ' + midY + ')">Speed</text>' +
    // Y軸目盛り（0%-100% と 0x-2.0x を完全同期）
    '  <text x="' + (pad.left - 4) + '" y="' + (pad.top + 3) + '" fill="#ff00cc" text-anchor="end">100%</text>' +
    '  <text x="' + (pad.left - 4) + '" y="' + (midY + 3) + '" fill="#ff00cc" text-anchor="end">50%</text>' +
    '  <text x="' + (pad.left - 4) + '" y="' + (pad.top + innerH) + '" fill="#ff00cc" text-anchor="end">0%</text>' +
    '  <text x="' + (width - pad.right + 4) + '" y="' + (pad.top + 3) + '" fill="#00d2ff" text-anchor="start">2.0x</text>' +
    '  <text x="' + (width - pad.right + 4) + '" y="' + (midY + 3) + '" fill="#00d2ff" text-anchor="start">1.0x</text>' +
    '  <text x="' + (width - pad.right + 4) + '" y="' + (pad.top + innerH) + '" fill="#00d2ff" text-anchor="start">0x</text>' +
    // プロット（Speed背面 → Clarity前面）
    '  <path d="' + ratePath + '" fill="none" stroke="#00d2ff" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.85"/>' +
    ratePoints +
    '  <path d="' + vasPath + '" fill="none" stroke="#ff00cc" stroke-width="2.2"/>' +
    vasPoints +
    xLabels +
    // 上部凡例
    leftLegend +
    '  <rect x="' + (width - pad.right - 34) + '" y="7" width="6" height="6" fill="#00d2ff"/>' +
    '  <text x="' + (width - pad.right - 25) + '" y="13" fill="#00d2ff">Speed</text>' +
    '</svg>';

  containerEl.innerHTML = svg;
  containerEl.style.display = 'block';
};