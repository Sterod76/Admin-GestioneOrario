// Voci di menu: getUi() per primo, così dalla web app (google.script.run) lanciano
// un errore prima di scrivere.
function saveTableFormat() {
  SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) {
    SpreadsheetApp.getUi().alert('Foglio vuoto.');
    return;
  }
  const titles = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const arr = [];
  for (let c = 1; c <= lastCol; c++) {
    const cell = sheet.getRange(1, c);
    const rotation = cell.getTextRotation();
    arr.push({
      col: columnToLetter(c),
      width: sheet.getColumnWidth(c),
      title: (titles[c - 1] === '' || titles[c - 1] === null) ? null : String(titles[c - 1]),
      orientation: rotation ? rotation.getDegrees() : 0
    });
  }
  setTableFormat_(arr);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Salvate ${arr.length} colonne dal foglio "${sheet.getName()}".`,
    'Formato tabella',
    4
  );
}

function reloadTableFormat() {
  SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const fmt = getTableFormat();
  if (!fmt.length) {
    SpreadsheetApp.getUi().alert('Nessun formato salvato. Usa prima "Salva formato tabella".');
    return;
  }
  let applied = 0;
  const errors = [];
  fmt.forEach((row, i) => {
    const colIdx = letterToColumn(String(row.col || '').trim());
    if (!colIdx) {
      errors.push(`Voce ${i + 1}: colonna "${row.col}" non valida`);
      return;
    }
    if (row.width != null && !isNaN(Number(row.width))) {
      sheet.setColumnWidth(colIdx, Number(row.width));
    }
    const headerCell = sheet.getRange(1, colIdx);
    if (row.title != null && row.title !== '') {
      headerCell.setValue(row.title);
    }
    const deg = parseOrientation(row.orientation);
    if (deg !== null) headerCell.setTextRotation(deg);
    applied++;
  });
  if (errors.length) Logger.log(errors.join('\n'));
  ss.toast(
    `Applicato a ${applied} colonne.` + (errors.length ? ` Errori: ${errors.length}` : ''),
    'Formato tabella',
    4
  );
}

function parseOrientation(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return clampDeg(v);
  const s = String(v).trim().toLowerCase();
  if (s === 'h' || s === 'horizontal' || s === 'orizzontale') return 0;
  if (s === 'v' || s === 'vertical' || s === 'verticale') return 90;
  const n = Number(s);
  return isNaN(n) ? null : clampDeg(n);
}

function clampDeg(n) {
  if (n < -90) return -90;
  if (n > 90) return 90;
  return n;
}

function letterToColumn(letter) {
  const s = letter.toUpperCase();
  if (!/^[A-Z]+$/.test(s)) return null;
  let col = 0;
  for (let i = 0; i < s.length; i++) col = col * 26 + (s.charCodeAt(i) - 64);
  return col;
}

function columnToLetter(col) {
  let s = '';
  while (col > 0) {
    const r = (col - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}
