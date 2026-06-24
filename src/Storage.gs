/**
 * Export/Import JSON dei fogli sorgente SxLT / SxLM.
 *
 * Il file vive nello STESSO folder Drive del gsheet. Sia in export sia in import
 * un piccolo dialogo HtmlService chiede il NOME del file: il campo è
 * PRE-COMPILATO col nome del gsheet (default) ma resta EDITABILE, così si può
 * salvare/leggere un backup con un nome diverso. Il dialogo parla col server via
 * google.script.run (richiede lo scope Drive, già concesso). Si usa un dialogo e
 * non ui.prompt() perché il prompt nativo NON consente di pre-compilare il campo.
 *
 *   EXPORT: dialog → exportJsonWithName(name) scrive <name>.json nel folder.
 *   IMPORT: dialog → peekImportByName(name) mostra cosa verrà sostituito →
 *           conferma → applyImportByName(name) applica e rigenera SxAULE/snapshot.
 *
 * Il foglio PdS è incluso (settings); la MATRICE solo come backup (in import NON
 * viene riscritta: è alimentata da IMPORTRANGE).
 *
 * Formato JSON (v2, include "fmt" per roundtrip della formattazione):
 *   { version, semester, exportedAt, S1LT: {tabColor, header, rows, fmt}, ... }
 */

const STORAGE_VERSION = 2;

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT — dialog per il nome (default = nome gsheet, editabile) → scrive nel folder
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
    ui.alert('Esporta JSON', 'Nessun foglio "' + cfg.prefix + '*" trovato.', ui.ButtonSet.OK);
    return;
  }
  _showNameDialog_('export', '📤 Esporta JSON', ss.getName());
}

// Chiamata dal dialogo (google.script.run) col nome scelto. Scrive <name>.json e
// ritorna il messaggio di esito (mostrato nel dialogo). Lancia con messaggio
// leggibile in caso di errore (loggato anche sull'Execution log via _logRethrow_).
function exportJsonWithName(name) {
  try { return _exportJsonImpl_(name); } catch (e) { _logRethrow_('exportJsonWithName', e); }
}
function _exportJsonImpl_(name) {
  const cfg = detectAuleConfig();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sources = ss.getSheets().filter(s => {
    const n = s.getName();
    return n.toUpperCase().startsWith(cfg.prefix) && n !== cfg.output;
  });
  if (!sources.length) throw new Error('Nessun foglio "' + cfg.prefix + '*" trovato.');

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
  try { const un = getOrarioData().unavail || []; out._unavail = un; nUnavail = un.length; } catch (e) { out._unavail = []; }
  // PdS (settings dei piani) e MATRICE (co-esami): salvati per backup. La MATRICE è
  // alimentata via IMPORTRANGE → in import NON viene reimportata; il PdS sì.
  let hasPds = false, hasCoex = false;
  const pdsSheet = ss.getSheetByName(PDS_SHEET_NAME);
  if (pdsSheet) { out[PDS_SHEET_NAME] = serializeSheet_(pdsSheet); hasPds = true; }
  const coexSheet = ss.getSheetByName(COEX_SHEET_NAME);
  if (coexSheet) { out[COEX_SHEET_NAME] = serializeSheet_(coexSheet); hasCoex = true; }
  const json = JSON.stringify(out, null, 2);
  const fname = _jsonFileName_(name, ss.getName());
  const sizeKb = Math.round(json.length / 1024);

  // Scrivi nel folder Drive del gsheet (stesso folder). Sovrascrivi se esiste.
  const folder = _gsheetFolder_();
  const existing = folder.getFilesByName(fname);
  let action;
  if (existing.hasNext()) { existing.next().setContent(json); action = 'sovrascritto'; }
  else { folder.createFile(fname, json, MimeType.PLAIN_TEXT); action = 'creato'; }
  return 'File ' + action + ':\n  ' + fname + '\n' +
    'Folder: ' + folder.getName() + '\n' +
    'Fogli: ' + sources.map(s => s.getName()).join(', ') + '\n' +
    'Non-disponibilità aule: ' + nUnavail + '\n' +
    'PdS: ' + (hasPds ? 'incluso' : '—') + ' · MATRICE: ' + (hasCoex ? 'inclusa (solo backup)' : '—') + '\n' +
    'Dimensione: ' + sizeKb + ' KB';
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
// IMPORT — dialog per il nome (default = nome gsheet, editabile) → peek → conferma
// ─────────────────────────────────────────────────────────────────────────────

function importFromJson() {
  _showNameDialog_('import', '📥 Importa JSON', SpreadsheetApp.getActiveSpreadsheet().getName());
}

// Step 1 (dal dialogo): legge il file <name>.json, valida e ritorna un riepilogo
// di cosa verrà sostituito. NON modifica nulla. Ritorna { fname, summary };
// lancia con messaggio leggibile se il file manca o non è valido.
function peekImportByName(name) {
  try { return _peekImportImpl_(name); } catch (e) { _logRethrow_('peekImportByName', e); }
}
function _peekImportImpl_(name) {
  const cfg = detectAuleConfig();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fname = _jsonFileName_(name, ss.getName());
  const text = _readJsonFile_(fname);
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('JSON malformato in "' + fname + '": ' + e.message); }
  // Semestre = quello dichiarato nel file (è l'export di QUESTO gsheet); fallback al rilevato.
  const semester = (data.semester ? String(data.semester).toUpperCase() : cfg.prefix);
  const metaKeys = ['version', 'semester', 'year', 'exportedAt'];
  const sheetKeys = Object.keys(data).filter(k =>
    metaKeys.indexOf(k) === -1 &&
    k !== PDS_SHEET_NAME &&
    k.toUpperCase().indexOf(semester) === 0 &&
    data[k] && typeof data[k] === 'object' &&
    Array.isArray(data[k].header) && Array.isArray(data[k].rows));
  if (!sheetKeys.length) throw new Error('Nessun foglio "' + semester + '*" valido nel file "' + fname + '".');
  const sheetInfo = sheetKeys.map(k => '• ' + k + ' (' + data[k].rows.length + ' righe)').join('\n');
  const hasPdsInFile = !!(data[PDS_SHEET_NAME] && data[PDS_SHEET_NAME].header && data[PDS_SHEET_NAME].rows);
  const nUn = Array.isArray(data._unavail) ? data._unavail.length : 0;
  const extra =
    (hasPdsInFile ? '\n• ' + PDS_SHEET_NAME + ' (settings dei piani)' : '') +
    (nUn ? '\n• non-disponibilità aule (' + nUn + ')' : '');
  return {
    fname: fname,
    summary: 'Verranno SOSTITUITI (vecchi dati cancellati, nuovi scritti):\n' + sheetInfo + extra +
      '\n\nBordi e formattazione preservati. La MATRICE NON viene importata\n' +
      '(è alimentata da IMPORTRANGE). Altri fogli/semestri non toccati.'
  };
}

// Step 2 (dal dialogo, dopo conferma): applica davvero l'import + rigenera SxAULE
// e riscrive lo snapshot della web app. Ritorna il messaggio di esito.
function applyImportByName(name) {
  try { return _applyImportImpl_(name); } catch (e) { _logRethrow_('applyImportByName', e); }
}
function _applyImportImpl_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fname = _jsonFileName_(name, ss.getName());
  const text = _readJsonFile_(fname);
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('JSON malformato in "' + fname + '": ' + e.message); }
  if (!data.semester) data.semester = detectAuleConfig().prefix;

  const msg = applyImportFromJson(JSON.stringify(data));
  // Dopo l'import: rigenera SxAULE dalle sessioni appena importate (+ ripristina le
  // non-disponibilità) e RISCRIVE lo snapshot della web app — altrimenti il sito,
  // che legge lo snapshot, continuerebbe a mostrare i dati vecchi.
  let extraMsg = '';
  const un = Array.isArray(data._unavail) ? data._unavail : [];
  try {
    tabellaAule({ ss: ss, interactive: false, extraUnavail: un, removedUnavail: [] });
    const d = getOrarioData(); d.pendingEdits = []; _writeSnapshot_(d);
    extraMsg = '\nSxAULE rigenerato e snapshot Web App aggiornato' +
      (un.length ? ' (non-disponibilità ripristinate: ' + un.length + ')' : '') + '.' +
      '\n→ Ricarica la web app (o premi 📥 Carica) per vedere i dati.';
  } catch (e) { extraMsg = '\n⚠ Rigenerazione/snapshot non riuscita: ' + ((e && e.message) || e); }
  return 'Import completato (' + fname + ')\n\n' + msg + extraMsg;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper condivisi: nome file, folder Drive, lettura file, dialogo HTML
// ─────────────────────────────────────────────────────────────────────────────

// Logga su Execution log e rilancia: i google.script.run perdono lo stack curato
// lato server, così le failure di import/export restano tracciate per il
// post-mortem (Estensioni → Apps Script → Esecuzioni).
function _logRethrow_(label, e) {
  try { Logger.log('ERROR ' + label + ': ' + ((e && e.message) || e) + '\n' + ((e && e.stack) || '')); } catch (e2) {}
  throw e;
}

// Normalizza il nome scelto in un filename .json: trim, fallback al nome del
// gsheet se vuoto, niente doppio ".json".
function _jsonFileName_(name, fallback) {
  let base = String(name == null ? '' : name).trim();
  if (!base) base = String(fallback == null ? '' : fallback).trim() || 'orario';
  base = base.replace(/\.json$/i, '');
  return base + '.json';
}

// Folder Drive che contiene il gsheet (dove vivono i .json). Lancia con messaggio
// leggibile se Drive non è accessibile o il gsheet non è in un folder.
function _gsheetFolder_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let parents;
  try { parents = DriveApp.getFileById(ss.getId()).getParents(); }
  catch (e) { throw new Error('Errore accesso Drive: ' + e.message + '\n(Possibile blocco scope Drive da parte dell\'admin Workspace.)'); }
  if (!parents.hasNext()) throw new Error('Il gsheet non è in un folder Drive accessibile.\nSposta lo Spreadsheet in un folder.');
  return parents.next();
}

// Legge il contenuto testuale del file <fname> dal folder del gsheet. Lancia se
// manca o non sembra JSON.
function _readJsonFile_(fname) {
  const folder = _gsheetFolder_();
  const files = folder.getFilesByName(fname);
  if (!files.hasNext()) {
    throw new Error('File "' + fname + '" non trovato nel folder "' + folder.getName() +
      '".\nEsporta prima con "Esporta JSON", oppure controlla il nome.');
  }
  const text = files.next().getBlob().getDataAsString();
  if (!text || !/^\s*\{/.test(text)) throw new Error('File "' + fname + '" non sembra contenere JSON valido.');
  return text;
}

// Mostra il dialogo HTML che chiede il nome file (pre-compilato col default,
// editabile). mode = 'export' | 'import'.
function _showNameDialog_(mode, title, defName) {
  const html = HtmlService.createHtmlOutput(_nameDialogHtml_(mode, defName))
    .setWidth(470).setHeight(mode === 'import' ? 410 : 300);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

// HTML del dialogo. In export: bottone → exportJsonWithName → mostra esito.
// In import: bottone → peekImportByName → mostra riepilogo → "Conferma import"
// → applyImportByName → mostra esito. Tutta la conferma avviene QUI dentro,
// senza ui.alert annidati (che con un modale già aperto fallirebbero).
function _nameDialogHtml_(mode, defName) {
  const isImport = (mode === 'import');
  const safe = escapeHtml(defName);
  const primaryLabel = isImport ? 'Carica e verifica' : 'Esporta';
  const intro = isImport
    ? 'Nome del file .json da importare. Il campo è già compilato col nome del gsheet: modificalo se vuoi caricare un altro backup.'
    : 'Nome del file .json da creare. Il campo è già compilato col nome del gsheet: modificalo se vuoi un nome diverso.';
  return [
    '<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8">',
    '<style>',
    '  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#202124;margin:0;padding:14px;}',
    '  p.intro{margin:0 0 10px;color:#5f6368;line-height:1.4;}',
    '  .row{display:flex;align-items:center;gap:6px;}',
    '  input#fn{flex:1;font-size:14px;padding:6px 8px;border:1px solid #bbb;border-radius:4px;}',
    '  span.ext{color:#5f6368;}',
    '  .bar{display:flex;gap:8px;margin-top:14px;}',
    '  button{font-size:13px;padding:7px 14px;border-radius:4px;border:1px solid #1967d2;background:#1967d2;color:#fff;cursor:pointer;}',
    '  button.sec{background:#fff;color:#1967d2;}',
    '  button[disabled]{opacity:.5;cursor:default;}',
    '  pre#summary{display:none;white-space:pre-wrap;background:#f1f3f4;border-radius:4px;padding:8px;margin:12px 0 0;max-height:150px;overflow:auto;font-size:12px;}',
    '  div#msg{white-space:pre-wrap;margin-top:12px;max-height:150px;overflow:auto;}',
    '  div#msg.err{color:#c5221f;}',
    '</style></head><body>',
    '<p class="intro">' + escapeHtml(intro) + '</p>',
    '<div class="row"><input id="fn" type="text" value="' + safe + '" spellcheck="false"><span class="ext">.json</span></div>',
    '<pre id="summary"></pre>',
    '<div class="bar">',
    '  <button id="go">' + primaryLabel + '</button>',
    '  <button id="confirm" class="sec" style="display:none">Conferma import</button>',
    '  <button id="close" class="sec" onclick="google.script.host.close()">Chiudi</button>',
    '</div>',
    '<div id="msg"></div>',
    '<script>',
    '  var IMPORT=' + (isImport ? 'true' : 'false') + ', pendingName=null;',
    '  function $(id){return document.getElementById(id);}',
    '  function setMsg(t,err){var m=$("msg");m.textContent=t||"";m.className=err?"err":"";}',
    '  function fn(){return $("fn").value;}',
    '  function busy(b){$("go").disabled=b;$("confirm").disabled=b;}',
    '  $("fn").focus();$("fn").select();',
    '  $("fn").addEventListener("keydown",function(e){if(e.key!=="Enter")return;e.preventDefault();var b=($("confirm").style.display!=="none")?$("confirm"):$("go");if(b.offsetParent!==null&&!b.disabled)b.click();});',
    '  $("go").onclick=function(){',
    '    busy(true);setMsg(IMPORT?"Lettura file…":"Esportazione in corso…");',
    '    if(IMPORT){',
    '      google.script.run.withSuccessHandler(function(r){',
    '        busy(false);setMsg("");pendingName=r.fname;',
    '        var s=$("summary");s.textContent=r.summary;s.style.display="block";',
    '        $("go").style.display="none";$("confirm").style.display="";',
    '      }).withFailureHandler(function(e){busy(false);setMsg((e&&e.message)?e.message:String(e),true);}).peekImportByName(fn());',
    '    }else{',
    '      google.script.run.withSuccessHandler(function(r){',
    '        busy(false);setMsg(r);$("go").style.display="none";',
    '      }).withFailureHandler(function(e){busy(false);setMsg((e&&e.message)?e.message:String(e),true);}).exportJsonWithName(fn());',
    '    }',
    '  };',
    '  $("confirm").onclick=function(){',
    '    busy(true);setMsg("Import in corso… non chiudere la finestra.");',
    '    google.script.run.withSuccessHandler(function(r){',
    '      busy(false);setMsg(r);$("confirm").style.display="none";',
    '    }).withFailureHandler(function(e){busy(false);setMsg((e&&e.message)?e.message:String(e),true);}).applyImportByName(pendingName||fn());',
    '  };',
    '<\/script>',
    '</body></html>'
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT — core logic (chiamato da importFromJson)
// ─────────────────────────────────────────────────────────────────────────────

function applyImportFromJson(jsonText) {
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
