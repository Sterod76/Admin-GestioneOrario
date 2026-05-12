const PDS_SHEET_NAME = 'PdS';
const PDS_COL_OBB = 2;        // B
const PDS_COL_FOR_FIRST = 3;  // C (FOR1)
const PDS_COL_FOR_LAST = 6;   // F (FOR4)
const PDS_COL_OPT = 7;        // G
const LM_SHEET_REGEX = /LM$/i;

/**
 * Legge il foglio PdS, costruisce i set OBB/FOR globali, e applica
 * il vincolo a tutte le righe dei fogli S*LM in base al codice.
 *
 * Priorità: OBB > FOR > OPZ. Aggiunge anche un Note sulla cella Vincolo
 * (col G del foglio LM) che elenca per ogni PdS in cui appare il codice
 * con quale vincolo (OBB / FOR / OPZ). La nota è aggiunta solo per codici
 * con vincolo finale OBB o FOR (non per quelli OPZ).
 *
 * I codici nel PdS possono essere separati da qualsiasi whitespace
 * (spazi, tab, newline). Confronto case-insensitive.
 */
function assegnaVincoliDaPds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const pds = ss.getSheetByName(PDS_SHEET_NAME);
  if (!pds) {
    ui.alert(`Foglio "${PDS_SHEET_NAME}" non trovato.`);
    return;
  }
  const lastRow = pds.getLastRow();
  if (lastRow < 2) {
    ui.alert(`Foglio "${PDS_SHEET_NAME}" vuoto.`);
    return;
  }

  // Aggrega tutti i codici dalle colonne OBB e FOR, traccia anche la
  // classificazione per-PdS per ogni codice (OBB / FOR / OPZ).
  const data = pds.getRange(2, 1, lastRow - 1, PDS_COL_OPT).getValues();
  const obbSet = {};
  const forSet = {};
  const classByCodeByPds = {}; // { CODE: { 'PdS Name': 'OBB' | 'FOR' | 'OPZ' } }
  const priority = { OBB: 3, FOR: 2, OPZ: 1 };

  function setClass(code, pdsName, v) {
    if (!classByCodeByPds[code]) classByCodeByPds[code] = {};
    const cur = classByCodeByPds[code][pdsName];
    if (!cur || priority[v] > priority[cur]) {
      classByCodeByPds[code][pdsName] = v;
    }
  }

  data.forEach(row => {
    const pdsName = String(row[0] || '').trim();
    if (!pdsName) return;

    extractPdsCodes(row[PDS_COL_OBB - 1]).forEach(c => {
      obbSet[c] = true;
      setClass(c, pdsName, 'OBB');
    });
    for (let c = PDS_COL_FOR_FIRST; c <= PDS_COL_FOR_LAST; c++) {
      extractPdsCodes(row[c - 1]).forEach(code => {
        forSet[code] = true;
        setClass(code, pdsName, 'FOR');
      });
    }
    extractPdsCodes(row[PDS_COL_OPT - 1]).forEach(code => {
      setClass(code, pdsName, 'OPZ');
    });
  });

  const lmSheets = ss.getSheets().filter(s => LM_SHEET_REGEX.test(s.getName()));
  if (!lmSheets.length) {
    ui.alert('Nessun foglio LM trovato.');
    return;
  }

  let updated = 0, unchanged = 0, empty = 0;
  const breakdown = { OBB: 0, FOR: 0, OPZ: 0 };

  lmSheets.forEach(sh => {
    const lr = sh.getLastRow();
    if (lr < HEADER_ROWS + 1) return;
    const codes = sh.getRange(HEADER_ROWS + 1, COL_CODICE, lr - HEADER_ROWS, 1).getValues();
    const oldVinc = sh.getRange(HEADER_ROWS + 1, COL_VINCOLO, lr - HEADER_ROWS, 1).getValues();

    const newVinc = codes.map((r, i) => {
      const codeRaw = r[0];
      if (!codeRaw) { empty++; return [oldVinc[i][0]]; }
      const code = String(codeRaw).trim().toUpperCase();
      let v;
      if (obbSet[code]) v = 'OBB';
      else if (forSet[code]) v = 'FOR';
      else v = 'OPZ';
      breakdown[v]++;
      if (v !== String(oldVinc[i][0] || '').trim().toUpperCase()) updated++;
      else unchanged++;
      return [v];
    });

    const newNotes = codes.map((r, i) => {
      const codeRaw = r[0];
      if (!codeRaw) return [''];
      const v = newVinc[i][0];
      if (v !== 'OBB' && v !== 'FOR') return ['']; // solo OBB/FOR ricevono la nota
      const code = String(codeRaw).trim().toUpperCase();
      const classByPds = classByCodeByPds[code];
      if (!classByPds) return [''];
      const lines = Object.keys(classByPds).sort().map(pdsName =>
        `PdS ${pdsName}: ${classByPds[pdsName]}`
      );
      return [lines.join('\n')];
    });

    sh.getRange(HEADER_ROWS + 1, COL_VINCOLO, codes.length, 1).setValues(newVinc);
    sh.getRange(HEADER_ROWS + 1, COL_VINCOLO, codes.length, 1).setNotes(newNotes);
  });

  ss.toast(
    `OBB ${breakdown.OBB} • FOR ${breakdown.FOR} • OPZ ${breakdown.OPZ} ` +
    `(modifiche ${updated}, invariati ${unchanged})`,
    'Vincoli da PdS',
    7
  );
}

function extractPdsCodes(cellVal) {
  if (cellVal === null || cellVal === undefined || cellVal === '') return [];
  return String(cellVal)
    .split(/\s+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0);
}
