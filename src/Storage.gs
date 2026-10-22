/**
 * Export/Import JSON dei fogli sorgente SxLT / SxLM.
 *
 * NB: NESSUN uso di DriveApp e NESSUN uso di google.script.run a runtime.
 * Lo script funziona anche con admin Workspace restrittivi.
 *
 *   EXPORT: HTML dialog. Il JSON viene SERIALIZZATO lato server e
 *           EMBEDDATO nell'HTML al rendering (via scriptlet template).
 *           Il browser triggera il download via Blob. Niente RPC.
 *
 *   IMPORT: ui.prompt() nativo (no HtmlService). L'utente incolla il JSON
 *           nella textbox e il server lo riceve via getResponseText().
 *
 * Il foglio PdS NON è incluso nell'export e viene ignorato in import.
 *
 * Formato JSON (v2, include "fmt" per roundtrip della formattazione):
 *   { version, semester, exportedAt, S1LT: {tabColor, header, rows, fmt}, ... }
 */

const STORAGE_VERSION = 2;

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT — HTML dialog con JSON embedded (no google.script.run runtime)
// ─────────────────────────────────────────────────────────────────────────────

function exportToJson() {
  const ui = SpreadsheetApp.getUi();
  const cfg = detectAuleConfig();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sources = ss.getSheets().filter(s => {
    const n = s.getName();
    return n.toUpperCase().startsWith(cfg.prefix) && n !== cfg.output;
  });
  if (!sources.length) {
    ui.alert('Export', 'Nessun foglio "' + cfg.prefix + '*" trovato.', ui.ButtonSet.OK);
    return;
  }

  // Niente prompt: il file ha lo STESSO nome del gsheet con estensione .json.
  const out = {
    version: STORAGE_VERSION,
    semester: cfg.prefix,
    year: String(new Date().getFullYear()),
    exportedAt: new Date().toISOString()
  };
  sources.forEach(sh => out[sh.getName()] = serializeSheet_(sh));
  // Non-disponibilità aule: vivono su SxAULE come celle unite e NON sono nei fogli
  // sopra → le salvo a parte come lista {room, day, start, end, text}.
  let nUnavail = 0;
  try { const un = getOrarioData_().unavail || []; out._unavail = un; nUnavail = un.length; } catch (e) { out._unavail = []; }
  // PdS (settings dei piani) e MATRICE (co-esami): salvati per backup. La MATRICE è
  // alimentata via IMPORTRANGE → in import NON viene reimportata; il PdS sì.
  let hasPds = false, hasCoex = false;
  const pdsSheet = ss.getSheetByName(PDS_SHEET_NAME);
  if (pdsSheet) { out[PDS_SHEET_NAME] = serializeSheet_(pdsSheet); hasPds = true; }
  const coexSheet = ss.getSheetByName(COEX_SHEET_NAME);
  if (coexSheet) { out[COEX_SHEET_NAME] = serializeSheet_(coexSheet); hasCoex = true; }
  const json = JSON.stringify(out, null, 2);
  const fname = ss.getName() + '.json';
  const sizeKb = Math.round(json.length / 1024);

  // Scrivi nel folder Drive del gsheet (stesso folder).
  let folder;
  try {
    const parents = DriveApp.getFileById(ss.getId()).getParents();
    if (!parents.hasNext()) {
      ui.alert('Esporta JSON',
        'Il gsheet non è in un folder Drive accessibile.\nSposta lo Spreadsheet in un folder.', ui.ButtonSet.OK);
      return;
    }
    folder = parents.next();
  } catch (e) {
    ui.alert('Esporta JSON',
      'Errore accesso Drive: ' + e.message + '\n\n(Possibile blocco scope Drive da parte dell\'admin Workspace.)',
      ui.ButtonSet.OK);
    return;
  }

  // Sovrascrivi se esiste, altrimenti crea
  const existing = folder.getFilesByName(fname);
  let action;
  if (existing.hasNext()) { existing.next().setContent(json); action = 'sovrascritto'; }
  else { folder.createFile(fname, json, MimeType.PLAIN_TEXT); action = 'creato'; }
  ui.alert('Esporta JSON',
    'File ' + action + ':\n  ' + fname + '\n' +
    'Folder: ' + folder.getName() + '\n' +
    'Fogli: ' + sources.map(s => s.getName()).join(', ') + '\n' +
    'Non-disponibilità aule: ' + nUnavail + '\n' +
    'PdS: ' + (hasPds ? 'incluso' : '—') + ' · MATRICE: ' + (hasCoex ? 'inclusa (solo backup)' : '—') + '\n' +
    'Dimensione: ' + sizeKb + ' KB',
    ui.ButtonSet.OK);
}

function serializeSheet_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const tabColor = (function () {
    try { return sh.getTabColor() || null; } catch (e) { return null; }
  })();
  if (lastRow < 1 || lastCol < 1) {
    return { tabColor: tabColor, header: [], rows: [] };
  }
  const range = sh.getRange(1, 1, lastRow, lastCol);
  const all = range.getValues();
  const header = all[0].map(h => String(h == null ? '' : h));
  // Righe POSIZIONALI (array di valori, in ordine di colonna): round-trip esatto
  // anche con header VUOTI o DUPLICATI (es. colonne calendario LUN-SAB senza
  // intestazione). Il vecchio formato a oggetti {header: valore} faceva collassare
  // le colonne con lo stesso header (es. tutte "") perdendo i dati del calendario.
  const rows = all.slice(1).map(row =>
    row.map(v => (v === null || v === undefined) ? '' : (typeof v === 'string' ? v : String(v)))
  );
  const colWidths = [];
  for (let c = 1; c <= lastCol; c++) colWidths.push(sh.getColumnWidth(c));
  const fmt = {
    nRows: lastRow,
    nCols: lastCol,
    colWidths: colWidths,
    backgrounds: range.getBackgrounds(),
    fontWeights: range.getFontWeights(),
    fontColors: range.getFontColors(),
    horizontalAlignments: range.getHorizontalAlignments(),
    verticalAlignments: range.getVerticalAlignments(),
    wraps: range.getWraps(),
    numberFormats: range.getNumberFormats(),
    frozenRows: sh.getFrozenRows(),
    frozenCols: sh.getFrozenColumns()
  };
  return { tabColor: tabColor, header: header, rows: rows, fmt: fmt };
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT — ui.prompt() nativo (single-line textbox, accetta paste lungo)
// ─────────────────────────────────────────────────────────────────────────────

function importFromJson() {
  const ui = SpreadsheetApp.getUi();
  try {
    // Niente prompt: si carica il file con lo STESSO nome del gsheet (.json).
    const cfg = detectAuleConfig();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const fname = ss.getName() + '.json';

    // Carica file dal folder Drive del gsheet
    let folder;
    try {
      const parents = DriveApp.getFileById(ss.getId()).getParents();
      if (!parents.hasNext()) {
        ui.alert('Importa JSON', 'Il gsheet non è in un folder accessibile.\nSposta lo Spreadsheet in un folder Drive.', ui.ButtonSet.OK);
        return;
      }
      folder = parents.next();
    } catch (e) {
      ui.alert('Importa JSON', 'Errore accesso Drive: ' + e.message + '\n\n(Possibile blocco scope Drive da parte dell\'admin Workspace.)', ui.ButtonSet.OK);
      return;
    }
    const files = folder.getFilesByName(fname);
    if (!files.hasNext()) {
      ui.alert('Importa JSON',
        'File "' + fname + '" non trovato nel folder "' + folder.getName() + '".\n\nEsporta prima con "Esporta JSON" (crea un file con lo stesso nome del gsheet).',
        ui.ButtonSet.OK);
      return;
    }
    const text = files.next().getBlob().getDataAsString();
    if (!text || !/^\{/.test(text.trim())) {
      ui.alert('Importa JSON', 'File "' + fname + '" non sembra contenere JSON valido.', ui.ButtonSet.OK);
      return;
    }

    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('JSON malformato: ' + e.message); }
    // Semestre = quello dichiarato nel file (è l'export di QUESTO gsheet); fallback al rilevato.
    const semester = (data.semester ? String(data.semester).toUpperCase() : cfg.prefix);
    if (!data.semester) data.semester = semester;

    // Conferma esplicita: mostra quali fogli verranno sostituiti
    const metaKeys = ['version', 'semester', 'year', 'exportedAt'];
    const sheetKeys = Object.keys(data).filter(k =>
      metaKeys.indexOf(k) === -1 &&
      k !== PDS_SHEET_NAME &&
      k.toUpperCase().indexOf(semester) === 0 &&
      data[k] && typeof data[k] === 'object' &&
      Array.isArray(data[k].header) && Array.isArray(data[k].rows));
    if (!sheetKeys.length) {
      ui.alert('Importa JSON', 'Nessun foglio "' + semester + '*" valido nel file.', ui.ButtonSet.OK);
      return;
    }
    const sheetInfo = sheetKeys.map(k => '  • ' + k + ' (' + data[k].rows.length + ' righe)').join('\n');
    const hasPdsInFile = !!(data[PDS_SHEET_NAME] && data[PDS_SHEET_NAME].header && data[PDS_SHEET_NAME].rows);
    const nUn = Array.isArray(data._unavail) ? data._unavail.length : 0;
    const extra =
      (hasPdsInFile ? '  • ' + PDS_SHEET_NAME + ' (settings dei piani)\n' : '') +
      (nUn ? '  • non-disponibilità aule (' + nUn + ')\n' : '');
    const confirm = ui.alert('Conferma import da "' + fname + '"',
      'Verranno SOSTITUITI (vecchi dati cancellati, nuovi scritti):\n' +
      sheetInfo + '\n' + extra + '\n' +
      'Bordi e formattazione preservati. La MATRICE co-esami NON viene importata\n' +
      '(è alimentata da IMPORTRANGE). Altri fogli/semestri non toccati.\n\nProcedere?',
      ui.ButtonSet.OK_CANCEL);
    if (confirm !== ui.Button.OK) return;

    const msg = applyImportFromJson_(JSON.stringify(data));
    // Dopo l'import: rigenera SxAULE dalle sessioni appena importate (+ ripristina le
    // non-disponibilità) e RISCRIVE lo snapshot della web app — altrimenti il sito,
    // che legge lo snapshot, continuerebbe a mostrare i dati vecchi.
    let extraMsg = '';
    const un = Array.isArray(data._unavail) ? data._unavail : [];
    try {
      tabellaAule_({ ss: ss, interactive: false, extraUnavail: un, removedUnavail: [] });
      const d = getOrarioData_(); d.pendingEdits = []; _writeSnapshot_(d);
      extraMsg = '\nSxAULE rigenerato e snapshot Web App aggiornato' +
        (un.length ? ' (non-disponibilità ripristinate: ' + un.length + ')' : '') + '.' +
        '\n→ Ricarica la web app (o premi 📥 Carica) per vedere i dati.';
    } catch (e) { extraMsg = '\n⚠ Rigenerazione/snapshot non riuscita: ' + ((e && e.message) || e); }
    ui.alert('Import completato (' + fname + ')', msg + extraMsg, ui.ButtonSet.OK);
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    Logger.log('ERROR importFromJson: ' + msg + '\n' + (e && e.stack ? e.stack : ''));
    try { ui.alert('Import fallito', msg + '\n\n(Vedi log: Estensioni → Apps Script → Esecuzioni)', ui.ButtonSet.OK); } catch (e2) {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT — core logic (chiamato da importFromJson). Privata (_): una funzione
// globale senza _ è chiamabile con google.script.run da chiunque apra la web app.
// ─────────────────────────────────────────────────────────────────────────────

function applyImportFromJson_(jsonText) {
  let data;
  try { data = JSON.parse(jsonText); }
  catch (e) { throw new Error('JSON malformato: ' + e.message); }
  if (!data || typeof data !== 'object') throw new Error('JSON non valido.');
  if (!data.version) throw new Error('Campo "version" mancante.');
  if (!data.semester) throw new Error('Campo "semester" mancante.');

  const newPrefix = String(data.semester).toUpperCase();
  if (newPrefix !== 'S1' && newPrefix !== 'S2') {
    throw new Error('semester non valido: "' + data.semester + '"');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Identifica i fogli presenti nel JSON (es. solo S1LM, oppure S1LT+S1LM)
  const metaKeys = ['version', 'semester', 'year', 'exportedAt'];
  const sheetKeys = Object.keys(data).filter(k =>
    metaKeys.indexOf(k) === -1 &&
    k !== PDS_SHEET_NAME &&
    k.toUpperCase().indexOf(newPrefix) === 0 &&
    data[k] && typeof data[k] === 'object' &&
    Array.isArray(data[k].header) && Array.isArray(data[k].rows));

  if (!sheetKeys.length) {
    throw new Error('Nessun foglio "' + newPrefix + '*" valido trovato nel JSON.');
  }

  // Se i fogli del semestre opposto esistono ma quelli del semestre target no,
  // rinominali (es. S2LT → S1LT) così formato/bordi/larghezze vengono ereditati.
  const oppositePrefix = newPrefix === 'S1' ? 'S2' : 'S1';
  const renamed = [];
  ss.getSheets().forEach(sh => {
    const n = sh.getName();
    if (n.toUpperCase().indexOf(oppositePrefix) === 0) {
      const suffix = n.substring(2);
      const targetName = newPrefix + suffix;
      if (!ss.getSheetByName(targetName)) {
        try {
          sh.setName(targetName);
          renamed.push(n + ' → ' + targetName);
        } catch (e) {}
      }
    }
  });

  // Aggiorna SOLO i fogli presenti nel JSON. NON cancella nient'altro
  // (né siblings del semestre, né l'altro semestre, né PdS).
  const writtenNames = [];
  sheetKeys.forEach(key => {
    importSheetData_(ss, key, data[key]);
    writtenNames.push(key);
  });

  // PdS: importato SE presente nel JSON (settings dei piani). La MATRICE invece
  // NON si importa mai (è alimentata da IMPORTRANGE): se nel file c'è, si ignora.
  let pdsImported = false;
  const pdsData = data[PDS_SHEET_NAME];
  if (pdsData && typeof pdsData === 'object' && Array.isArray(pdsData.header) && Array.isArray(pdsData.rows)) {
    importSheetData_(ss, PDS_SHEET_NAME, pdsData);
    pdsImported = true;
  }

  // Identifica gli altri fogli esistenti del SEMESTRE corrente, preservati
  const allCurrSheets = ss.getSheets()
    .map(s => s.getName())
    .filter(n => n.toUpperCase().startsWith(newPrefix));
  const preservedSame = allCurrSheets.filter(n => writtenNames.indexOf(n) === -1);

  // Identifica fogli dell'altro semestre (anch'essi preservati)
  const preservedOpp = ss.getSheets()
    .map(s => s.getName())
    .filter(n => n.toUpperCase().startsWith(oppositePrefix));

  let msg = '';
  if (renamed.length) {
    msg += '🏷️ Rinominati (semestre cambiato):\n  ' + renamed.join('\n  ') + '\n';
  }
  msg += '🔄 Sostituiti (vecchi dati cancellati, nuovi scritti):\n  ' +
         writtenNames.join(', ');
  if (preservedSame.length) {
    msg += '\n📋 Non toccati (' + newPrefix + '*, non nel JSON):\n  ' + preservedSame.join(', ');
  }
  if (preservedOpp.length) {
    msg += '\n📋 Non toccati (' + oppositePrefix + '*, altro semestre):\n  ' + preservedOpp.join(', ');
  }
  msg += pdsImported
    ? '\n🔄 PdS: importato (settings ripristinati).'
    : '\n📋 PdS: non presente nel file → non toccato.';
  return msg;
}

function importSheetData_(ss, sheetName, sd) {
  let sh = ss.getSheetByName(sheetName);
  const isNew = !sh;
  if (isNew) sh = ss.insertSheet(sheetName);

  const header = sd.header.map(h => String(h == null ? '' : h));
  const ncols = header.length;
  const rowCount = sd.rows.length;
  const newTotalRows = 1 + rowCount;
  if (ncols === 0) return;

  // Costruisci la matrice dei valori (header + rows). Supporta entrambi i formati:
  // - posizionale (nuovo): row è un ARRAY di valori in ordine di colonna;
  // - a oggetti (file vecchi): row è { header: valore } (fragile con header dup/vuoti).
  const dataMatrix = [header];
  sd.rows.forEach(row => {
    if (Array.isArray(row)) {
      const arr = [];
      for (let i = 0; i < ncols; i++) { const v = row[i]; arr.push((v === null || v === undefined) ? '' : v); }
      dataMatrix.push(arr);
    } else {
      dataMatrix.push(header.map(h => { const v = row[h]; return (v === null || v === undefined) ? '' : v; }));
    }
  });

  if (isNew) {
    // Foglio nuovo: scrivi tutto + applica formato dal JSON se presente
    try { sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart(); } catch (e) {}
    sh.clear();
    sh.clearNotes();
    sh.getRange(1, 1, newTotalRows, ncols).setValues(dataMatrix);
    if (!sd.fmt) sh.getRange(1, 1, 1, ncols).setFontWeight('bold');
    if (sd.fmt) applySheetFormat_(sh, sd.fmt, newTotalRows, ncols);
    if (sd.tabColor) try { sh.setTabColor(sd.tabColor); } catch (e) {}
    return;
  }

  // Foglio esistente: PRESERVA totalmente bordi, conditional formatting,
  // larghezze colonne, font, sfondi, ecc.
  // Strategia: niente clear*, riempi le vecchie celle di "" (cancella contenuto
  // ma mantiene formato), poi sovrascrivi con i nuovi dati, poi rimuovi le
  // righe in eccesso.
  try { sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart(); } catch (e) {}
  const oldLastRow = sh.getLastRow();
  const oldLastCol = sh.getLastColumn();
  const wipeCols = Math.max(oldLastCol, ncols);

  // 1. cancella i contenuti (riempi di "")
  if (oldLastRow > 0 && wipeCols > 0) {
    const blank = [];
    for (let i = 0; i < oldLastRow; i++) blank.push(new Array(wipeCols).fill(''));
    sh.getRange(1, 1, oldLastRow, wipeCols).setValues(blank);
  }
  sh.clearNotes();

  // 2. scrivi header + righe del JSON
  sh.getRange(1, 1, newTotalRows, ncols).setValues(dataMatrix);

  // 3. rimuovi le righe in eccesso (se il foglio era più lungo dei nuovi dati)
  if (oldLastRow > newTotalRows) {
    sh.deleteRows(newTotalRows + 1, oldLastRow - newTotalRows);
  }

  // Tab color: aggiornalo se diverso (è una proprietà del foglio, non del contenuto)
  if (sd.tabColor) {
    try { sh.setTabColor(sd.tabColor); } catch (e) {}
  }
}

function applySheetFormat_(sh, fmt, dataRows, dataCols) {
  if (Array.isArray(fmt.colWidths)) {
    fmt.colWidths.slice(0, dataCols).forEach((w, i) => {
      if (w && w > 0) {
        try { sh.setColumnWidth(i + 1, w); } catch (e) {}
      }
    });
  }
  const fmtRows = fmt.backgrounds ? Math.min(fmt.backgrounds.length, dataRows) : dataRows;
  const fmtCols = dataCols;
  if (fmtRows < 1) return;
  const r = sh.getRange(1, 1, fmtRows, fmtCols);

  function slice2D(m) {
    if (!Array.isArray(m)) return null;
    return m.slice(0, fmtRows).map(row =>
      Array.isArray(row) ? row.slice(0, fmtCols) : new Array(fmtCols).fill(''));
  }
  let arr;
  if ((arr = slice2D(fmt.backgrounds))) r.setBackgrounds(arr);
  if ((arr = slice2D(fmt.fontWeights))) r.setFontWeights(arr);
  if ((arr = slice2D(fmt.fontColors))) r.setFontColors(arr);
  if ((arr = slice2D(fmt.horizontalAlignments))) r.setHorizontalAlignments(arr);
  if ((arr = slice2D(fmt.verticalAlignments))) r.setVerticalAlignments(arr);
  if ((arr = slice2D(fmt.wraps))) r.setWraps(arr);
  if ((arr = slice2D(fmt.numberFormats))) r.setNumberFormats(arr);

  if (typeof fmt.frozenRows === 'number') {
    try { sh.setFrozenRows(fmt.frozenRows); } catch (e) {}
  }
  if (typeof fmt.frozenCols === 'number') {
    try { sh.setFrozenColumns(fmt.frozenCols); } catch (e) {}
  }
}
