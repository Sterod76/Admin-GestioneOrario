const TITLE_STOPWORDS = new Set([
  // italiano
  'il','lo','la','i','gli','le','l','un','una','uno','dello',
  'di','a','da','in','con','su','per','tra','fra',
  'del','della','dei','degli','delle','al','allo','alla','ai','agli','alle',
  'dal','dalla','dai','dagli','dalle','nel','nella','nei','negli','nelle',
  'sul','sulla','sui','sugli','sulle','col','coi',
  'e','o','ma','ed','od','che',
  // inglese
  'a','an','the','and','or','but','of','on','at','to','for','with','by','from','as','vs','via'
]);

function titleCaseItEn(s) {
  if (s == null || s === '') return s;
  let wordIdx = 0;
  return String(s).replace(/[A-Za-zÀ-ÿ]+/g, (word) => {
    const lower = word.toLowerCase();
    const isFirst = wordIdx === 0;
    wordIdx++;
    if (!isFirst && TITLE_STOPWORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

// Voce di menu: getUi() per primo, così dalla web app (google.script.run) lancia un
// errore prima di riscrivere le celle.
function fixCalendarEntries() {
  SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  const firstRow = HEADER_ROWS + 1;
  if (lastRow < firstRow) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Nessuna riga dati.', 'Normalizza', 3);
    return;
  }

  // Title-case su Nome corso (col D)
  const nameRange = sheet.getRange(firstRow, COL_NOMECORSO, lastRow - firstRow + 1, 1);
  const names = nameRange.getValues();
  let nameUpdated = 0;
  const newNames = names.map(row => {
    const v = row[0];
    if (v === '' || v === null) return [v];
    const fixed = titleCaseItEn(String(v));
    if (fixed !== v) nameUpdated++;
    return [fixed];
  });
  if (nameUpdated) nameRange.setValues(newNames);
  const numCols = CALENDAR_COLS_END - CALENDAR_COLS_START + 1;
  const range = sheet.getRange(firstRow, CALENDAR_COLS_START, lastRow - firstRow + 1, numCols);
  const values = range.getValues();

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const issues = [];

  const newRichTexts = values.map((row, rIdx) =>
    row.map((cell, cIdx) => {
      if (cell === '' || cell === null) return null;
      const text = String(cell);
      const lines = text.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
      const a1 = sheet.getRange(firstRow + rIdx, CALENDAR_COLS_START + cIdx).getA1Notation();

      if (lines.length > 2) {
        skipped++;
        issues.push(`${a1}: ${lines.length} righe (multi-sessione, saltata)`);
        return null;
      }
      if (lines.length === 0) return null;

      let timeRaw, roomRaw;
      if (lines.length === 2) {
        timeRaw = lines[0];
        roomRaw = lines[1];
      } else {
        const split = splitTimeAndRoom(lines[0]);
        if (!split) {
          errors++;
          issues.push(`${a1}: ora non riconosciuta "${lines[0]}"`);
          return null;
        }
        timeRaw = split.time;
        roomRaw = split.room;
      }

      const timeStr = parseTimeRange(timeRaw);
      if (!timeStr) {
        errors++;
        issues.push(`${a1}: ora non riconosciuta "${timeRaw}"`);
        return null;
      }

      let roomStr = '';
      if (roomRaw && roomRaw.trim().length) {
        const parsed = parseRoom(roomRaw);
        if (!parsed) {
          errors++;
          issues.push(`${a1}: aula non riconosciuta "${roomRaw}"`);
          return null;
        }
        roomStr = parsed;
      }
      updated++;
      return buildRichText(timeStr, roomStr);
    })
  );

  for (let r = 0; r < newRichTexts.length; r++) {
    for (let c = 0; c < newRichTexts[r].length; c++) {
      const rt = newRichTexts[r][c];
      if (rt) {
        sheet.getRange(firstRow + r, CALENDAR_COLS_START + c).setRichTextValue(rt);
      }
    }
  }

  if (issues.length) Logger.log(issues.join('\n'));
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `slot: agg ${updated} • salt ${skipped} • err ${errors} | nomi corso: agg ${nameUpdated}`,
    'Normalizza celle calendario',
    6
  );
}

function splitTimeAndRoom(s) {
  const m = String(s).match(/^\s*(\d{1,2}\s*[\s:.,\-–—]\s*\d{2}\s*[\s\-–—]\s*\d{1,2}\s*[\s:.,\-–—]\s*\d{2})\s*(.*?)\s*$/);
  if (!m) return null;
  return { time: m[1], room: m[2] || '' };
}

function parseTimeRange(s) {
  const m = String(s).match(/^\s*(\d{1,2})\s*[\s:.,\-–—]\s*(\d{2})\s*[\s\-–—]\s*(\d{1,2})\s*[\s:.,\-–—]\s*(\d{2})\s*$/);
  if (!m) return null;
  const h1 = Number(m[1]), m1 = Number(m[2]), h2 = Number(m[3]), m2 = Number(m[4]);
  if (h1 < 0 || h1 > 23 || h2 < 0 || h2 > 23 || m1 < 0 || m1 > 59 || m2 < 0 || m2 > 59) return null;
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return `${pad(h1)}:${pad(m1)}-${pad(h2)}:${pad(m2)}`;
}

function parseRoom(s) {
  const collapsed = String(s).replace(/\s+/g, ' ').trim();
  const m = collapsed.match(/^(aula|lab)\s*(.*)$/i);
  if (!m) return null;
  const prefix = m[1].toLowerCase() === 'aula' ? 'Aula' : 'Lab';
  const suffix = m[2].trim().toUpperCase();
  return suffix ? `${prefix} ${suffix}` : prefix;
}

function buildRichText(timeStr, roomStr) {
  const bold = SpreadsheetApp.newTextStyle().setBold(true).setItalic(false).build();
  const italic = SpreadsheetApp.newTextStyle().setBold(false).setItalic(true).build();
  if (!roomStr) {
    return SpreadsheetApp.newRichTextValue()
      .setText(timeStr)
      .setTextStyle(0, timeStr.length, bold)
      .build();
  }
  const full = timeStr + '\n' + roomStr;
  return SpreadsheetApp.newRichTextValue()
    .setText(full)
    .setTextStyle(0, timeStr.length, bold)
    .setTextStyle(timeStr.length + 1, full.length, italic)
    .build();
}
