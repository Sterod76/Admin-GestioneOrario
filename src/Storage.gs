/**
 * Export/Import JSON dei fogli sorgente SxLT / SxLM (e qualsiasi altro
 * sheet che inizia per S<n> escluso SxAULE). Il file vive nello STESSO
 * folder del gsheet, con nome fisso "orarioS1.json" o "orarioS2.json"
 * a seconda del semestre attivo.
 *
 * Il foglio PdS NON è incluso nell'export e viene ignorato in import
 * (anche se presente nel JSON per qualche ragione).
 *
 * Formato JSON (invariato rispetto alla versione precedente, meno PdS):
 *   {
 *     "version": 1,
 *     "semester": "S1" | "S2",
 *     "exportedAt": "2026-05-13T20:30:00.000Z",
 *     "S1LT": {
 *       "tabColor": "#ffff00",
 *       "header": ["Anno","Sem","Codice", ...],
 *       "rows": [ { "Anno":"1", "Sem":"1", "Codice":"0044B", ... }, ... ]
 *     },
 *     "S1LM": { ... }
 *   }
 *
 * Import:
 *   - se data.semester == "S1" → vengono cancellati tutti i fogli S2*
 *   - se data.semester == "S2" → cancellati tutti i fogli S1*
 *   - i fogli del semestre importato vengono creati/sovrascritti.
 *   - PdS NON viene mai toccato.
 */

const STORAGE_VERSION = 1;

function exportToJson() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = detectAuleConfig();
  const ui = SpreadsheetApp.getUi();

  const sources = ss.getSheets().filter(s => {
    const n = s.getName();
    return n.toUpperCase().startsWith(cfg.prefix) && n !== cfg.output;
  });
  if (!sources.length) {
    ui.alert('Export', 'Nessun foglio "' + cfg.prefix + '*" trovato da esportare.', ui.ButtonSet.OK);
    return;
  }

  const out = {
    version: STORAGE_VERSION,
    semester: cfg.prefix,
    exportedAt: new Date().toISOString()
  };
  sources.forEach(sh => out[sh.getName()] = serializeSheet_(sh));
  // PdS NON incluso

  const json = JSON.stringify(out, null, 2);
  const fname = 'orario' + cfg.prefix + '.json';

  // Trova il folder parent del gsheet
  let folder;
  try {
    const ssFile = DriveApp.getFileById(ss.getId());
    const parents = ssFile.getParents();
    if (!parents.hasNext()) {
      ui.alert('Export', 'Il gsheet non è in un folder Drive accessibile (es. root drive).\n' +
        'Sposta lo Spreadsheet in un folder per usare l\'export.', ui.ButtonSet.OK);
      return;
    }
    folder = parents.next();
  } catch (e) {
    ui.alert('Export', 'Errore accesso Drive: ' + e.message, ui.ButtonSet.OK);
    return;
  }

  // Sovrascrivi se esiste, altrimenti crea
  const existing = folder.getFilesByName(fname);
  let action;
  if (existing.hasNext()) {
    const file = existing.next();
    file.setContent(json);
    action = 'sovrascritto';
  } else {
    folder.createFile(fname, json, MimeType.PLAIN_TEXT);
    action = 'creato';
  }
  const sizeKb = Math.round(json.length / 1024);
  ui.alert('Export completato',
    'File ' + action + ':\n  ' + fname +
    '\nFolder: ' + folder.getName() +
    '\nFogli: ' + sources.length + '  (' + sources.map(s => s.getName()).join(', ') + ')' +
    '\nDimensione: ' + sizeKb + ' KB',
    ui.ButtonSet.OK);
}

function serializeSheet_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const tabColor = (function () {
    try { return sh.getTabColor() || null; } catch (e) { return null; }
  })();
  if (lastRow < 1 || lastCol < 1) return { tabColor: tabColor, header: [], rows: [] };
  const all = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const header = all[0].map(h => String(h == null ? '' : h));
  const rows = all.slice(1).map(row => {
    const obj = {};
    header.forEach((h, i) => {
      const v = row[i];
      obj[h] = (v === null || v === undefined) ? '' : (typeof v === 'string' ? v : String(v));
    });
    return obj;
  });
  return { tabColor: tabColor, header: header, rows: rows };
}

function importFromJson() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = detectAuleConfig();
  const ui = SpreadsheetApp.getUi();
  const fname = 'orario' + cfg.prefix + '.json';

  // Trova il file nel folder parent del gsheet
  let folder, file;
  try {
    const ssFile = DriveApp.getFileById(ss.getId());
    const parents = ssFile.getParents();
    if (!parents.hasNext()) {
      ui.alert('Import', 'Il gsheet non è in un folder Drive accessibile.', ui.ButtonSet.OK);
      return;
    }
    folder = parents.next();
    const files = folder.getFilesByName(fname);
    if (!files.hasNext()) {
      ui.alert('Import',
        'File "' + fname + '" non trovato nel folder "' + folder.getName() + '".\n\n' +
        'Esegui prima un export per crearlo, oppure copialo manualmente nel folder.',
        ui.ButtonSet.OK);
      return;
    }
    file = files.next();
  } catch (e) {
    ui.alert('Import', 'Errore accesso Drive: ' + e.message, ui.ButtonSet.OK);
    return;
  }

  const json = file.getBlob().getDataAsString();
  const sizeKb = Math.round(json.length / 1024);

  const res = ui.alert('Import',
    'Importare da "' + fname + '" (' + sizeKb + ' KB)?\n\n' +
    '⚠ Verranno CANCELLATI tutti i fogli del semestre opposto e sovrascritti quelli del semestre importato.\n' +
    '(Il foglio PdS non viene toccato.)',
    ui.ButtonSet.OK_CANCEL);
  if (res !== ui.Button.OK) return;

  try {
    const result = applyImportFromJson(json);
    ui.alert('Import completato', result, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Import fallito', e.message, ui.ButtonSet.OK);
  }
}

function applyImportFromJson(jsonText) {
  let data;
  try { data = JSON.parse(jsonText); }
  catch (e) { throw new Error('JSON malformato: ' + e.message); }
  if (!data || typeof data !== 'object') throw new Error('JSON non valido (atteso oggetto).');
  if (!data.version) throw new Error('Campo "version" mancante.');
  if (!data.semester) throw new Error('Campo "semester" mancante (atteso "S1" o "S2").');

  const newPrefix = String(data.semester).toUpperCase();
  if (newPrefix !== 'S1' && newPrefix !== 'S2') {
    throw new Error('semester non valido: "' + data.semester + '" (atteso "S1" o "S2").');
  }
  const oppositePrefix = newPrefix === 'S1' ? 'S2' : 'S1';

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Cancella tutti i fogli del semestre opposto (incluso AULE).
  const toDelete = ss.getSheets().filter(s => s.getName().toUpperCase().startsWith(oppositePrefix));
  let deleted = 0;
  toDelete.forEach(sh => {
    if (ss.getSheets().length === 1) return;
    ss.deleteSheet(sh);
    deleted++;
  });

  // 2. Per ogni foglio in data: skip PdS, meta, e qualsiasi non-Sx*
  const metaKeys = ['version', 'semester', 'exportedAt'];
  let written = 0;
  const writtenNames = [];
  Object.keys(data).forEach(key => {
    if (metaKeys.indexOf(key) !== -1) return;
    if (key === PDS_SHEET_NAME) return;                       // PdS ignorato
    if (key.toUpperCase().indexOf(newPrefix) !== 0) return;   // safety: solo Sx*
    const sd = data[key];
    if (!sd || typeof sd !== 'object') return;
    if (!Array.isArray(sd.header) || !Array.isArray(sd.rows)) return;
    let sh = ss.getSheetByName(key);
    if (!sh) sh = ss.insertSheet(key);
    try {
      sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
    } catch (e) {}
    sh.clear();
    sh.clearNotes();
    const header = sd.header.map(h => String(h == null ? '' : h));
    if (header.length === 0) { writtenNames.push(key); written++; return; }
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    if (sd.rows.length > 0) {
      const values = sd.rows.map(row => header.map(h => {
        const v = row[h];
        return (v === null || v === undefined) ? '' : v;
      }));
      sh.getRange(2, 1, values.length, header.length).setValues(values);
    }
    if (sd.tabColor) {
      try { sh.setTabColor(sd.tabColor); } catch (e) {}
    }
    writtenNames.push(key);
    written++;
  });

  return 'Cancellati ' + deleted + ' fogli "' + oppositePrefix + '*", ' +
         'importati ' + written + ' fogli "' + newPrefix + '*": ' + writtenNames.join(', ') +
         '\n(PdS non toccato.)';
}

// Utility legacy (rimossa da export ma utile se chiamata altrove)
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
