// Ninja Listening Trainer - Shared CSV/JSON Export & Import (with Backward Compatibility)

window.NinjaIO = (function () {
  function escapeCsv(val) {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // クォート（カンマを含むタイトル等）に対応した1行CSVパーサ
  function parseCsvLine(line) {
    const res = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === ',' && !inQ) {
        res.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    res.push(cur.trim());
    return res;
  }

  /**
   * セッションログを新12列フォーマット（既存9列の順序完全維持 + URL, Title, Protocol）でCSVダウンロード
   */
  function exportSessionCsv(sessionLog, filenamePrefix = 'ninja') {
    if (!sessionLog || sessionLog.length === 0) {
      alert('No data to export yet.');
      return;
    }

    const headers =
      'SubjectID,Timestamp,VideoID,StartTime,EndTime,StepIdx,PlaybackRate,Subtitles,VAS_Clarity,URL,Title,Protocol\n';

    const csvBody = sessionLog
      .map((row) =>
        [
          escapeCsv(row.SubjectID ?? 'SUBJ_001'),
          escapeCsv(row.Timestamp ?? ''),
          escapeCsv(row.VideoID ?? ''),
          row.StartTime ?? '',
          row.EndTime ?? '',
          row.StepIdx ?? '',
          row.PlaybackRate ?? '',
          row.Subtitles ?? false,
          row.VAS_Clarity ?? '',
          escapeCsv(row.URL ?? ''),
          escapeCsv(row.Title ?? ''),
          escapeCsv(row.Protocol ?? '')
        ].join(',')
      )
      .join('\n');

    const blob = new Blob([headers + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (sessionLog[0].Title || filenamePrefix)
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 35);
    a.download = `ninja_${safeTitle}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 読み込んだテキスト（JSON / 旧9列CSV / 新12列CSV / プロトコルCSV）を自動判別して構造化オブジェクトを返す
   * @returns { type: 'json' | 'session' | 'protocol', ... }
   */
  function parseLoadedFile(fileName, rawText) {
    const text = rawText.trim();

    // 1. JSON 形式
    if (fileName.toLowerCase().endsWith('.json') || text.startsWith('{')) {
      const config = JSON.parse(text);
      return {
        type: 'json',
        steps: Array.isArray(config.stepsArray) ? config.stepsArray : null,
        startTime: typeof config.startTime === 'number' ? config.startTime : undefined,
        endTime: typeof config.endTime === 'number' ? config.endTime : undefined
      };
    }

    // 2. CSV 形式（# コメント行があればスキップして後方互換・将来互換を確保）
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    if (lines.length < 2) {
      throw new Error('CSV contains no data rows.');
    }

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());

    // 判定A: 定点観測セッション復元ログ（StartTime, EndTime を含む：旧9列・新12列両対応）
    if (headers.includes('starttime') && headers.includes('endtime')) {
      const startCol = headers.indexOf('starttime');
      const endCol = headers.indexOf('endtime');
      const videoCol = headers.indexOf('videoid');
      const urlCol = headers.indexOf('url');
      const titleCol = headers.indexOf('title');
      const protoCol = headers.indexOf('protocol');

      const lastRow = parseCsvLine(lines[lines.length - 1]);
      const startTime = parseFloat(lastRow[startCol]);
      const endTime = parseFloat(lastRow[endCol]);

      if (isNaN(startTime) || isNaN(endTime)) {
        throw new Error('Could not parse StartTime/EndTime from CSV.');
      }

      return {
        type: 'session',
        startTime,
        endTime,
        videoId: videoCol !== -1 && lastRow[videoCol] ? lastRow[videoCol] : null,
        url: urlCol !== -1 && lastRow[urlCol] ? lastRow[urlCol] : null,
        title: titleCol !== -1 && lastRow[titleCol] ? lastRow[titleCol] : null,
        protocol: protoCol !== -1 && lastRow[protoCol] ? lastRow[protoCol] : null
      };
    }

    // 判定B: 速度プロトコル定義 CSV（Rate / Speed / Tempo を含む）
    const rateCol = headers.findIndex(
      (h) => h.includes('rate') || h.includes('speed') || h.includes('tempo')
    );
    const subCol = headers.findIndex((h) => h.includes('sub') || h.includes('caption'));

    if (rateCol !== -1) {
      const steps = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const rate = parseFloat(cols[rateCol]);
        if (!isNaN(rate)) {
          const subtitles =
            subCol !== -1
              ? cols[subCol].toLowerCase() === 'true' || cols[subCol] === '1'
              : false;
          steps.push({ rate, subtitles });
        }
      }
      if (steps.length > 0) {
        return { type: 'protocol', steps };
      }
    }

    throw new Error('Unrecognized CSV format.');
  }

  return {
    exportSessionCsv,
    parseLoadedFile
  };
})();