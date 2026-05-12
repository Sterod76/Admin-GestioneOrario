/**
 * Export/Import JSON dei fogli sorgente (S1LT/S1LM/... o S2LT/S2LM/...).
 *
 * Formato JSON:
 *   {
 *     "version": 1,
 *     "semester": "S1" | "S2",
 *     "exportedAt": "2026-05-09T20:30:00.000Z",
 *     "S1LT": {
 *       "tabColor": "#ffff00",
 *       "header": ["Anno","Sem","Codice","Codice mutuato","Nome corso",...],
 *       "rows": [
 *         { "Anno": "1", "Sem": "1", "Codice": "0044B", ..., "LUN": "14:30-18:30\nAula E", ... },
 *         ...
 *       ]
 *     },
 *     "S1LM": { ... },
 *     "PdS":  { ... }   (sempre incluso se presente)
 *   }
 *
 * Import:
 *   - se data.semester == "S1" → vengono CANCELLATI tutti i fogli che iniziano per "S2*"
 *   - se data.semester == "S2" → idem ma per "S1*"
 *   - per ogni foglio in data (es. S1LT): se esiste viene clearato e
 *     riscritto da zero; se non esiste viene creato.
 *   - PdS viene sempre clearato e riscritto.
 *   - eventuale tabColor viene ripristinato.
 *
 * NB: l'import preserva solo VALORI di cella. Background colors, conditional
 * formatting, data validation, merge, formule ecc. sono lasciati al re-run dei
 * tool standard (es. "Assegna vincolo da PdS", "Genera tabella aule").
 */

const STORAGE_VERSION = 1;

function exportToJson() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = detectAuleConfig();
  const sources = ss.getSheets().filter(s => {
    const n = s.getName();
    return n.toUpperCase().startsWith(cfg.prefix) && n !== cfg.output;
  });

  const out = {
    version: STORAGE_VERSION,
    semester: cfg.prefix,
    exportedAt: new Date().toISOString()
  };

  sources.forEach(sh => out[sh.getName()] = serializeSheet_(sh));

  const pdsSheet = ss.getSheetByName(PDS_SHEET_NAME);
  if (pdsSheet) out[PDS_SHEET_NAME] = serializeSheet_(pdsSheet);

  const json = JSON.stringify(out, null, 2);

  const ts = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd_HHmmss");
  const fname = 'orario-' + cfg.prefix + '-export-' + ts + '.json';
  const sizeKb = Math.round(json.length / 1024);
  const sheetCount = Object.keys(out).length - 3;

  const escaped = escapeHtml(json);
  const html =
    '<div style="font-family:system-ui,sans-serif;font-size:13px;padding:10px">' +
    '<p>✓ Export ' + cfg.prefix + ' completato.</p>' +
    '<ul style="margin:6px 0">' +
    '<li>Fogli esportati: <b>' + sheetCount + '</b></li>' +
    '<li>Dimensione JSON: <b>' + sizeKb + ' KB</b></li>' +
    '<li>Nome file suggerito: <code>' + fname + '</code></li>' +
    '</ul>' +
    '<p style="margin:6px 0">Seleziona tutto col cursore (Ctrl-A nel textarea) e copia (Ctrl-C). Salva poi in un file <code>.json</code>.</p>' +
    '<textarea id="exp" readonly style="width:100%;height:280px;font-family:monospace;font-size:10px;white-space:pre">' + escaped + '</textarea>' +
    '<div style="text-align:right;margin-top:8px">' +
    '<button onclick="copyAll()" style="padding:6px 12px;background:#1a73e8;color:#fff;border:none;border-radius:4px;cursor:pointer">Copia tutto</button> ' +
    '<button onclick="google.script.host.close()" style="padding:6px 12px">Chiudi</button>' +
    '</div>' +
    '<script>function copyAll(){var t=document.getElementById("exp");t.focus();t.select();document.execCommand("copy");}</script>' +
    '</div>';
  const dlg = HtmlService.createHtmlOutput(html).setWidth(760).setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(dlg, 'Export JSON');
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
  const html =
    '<div style="font-family:system-ui,sans-serif;font-size:13px;padding:10px">' +
    '<p>Incolla qui sotto il JSON precedentemente esportato. Click "Importa" per applicare.</p>' +
    '<p style="color:#c00">⚠ <b>Attenzione</b>: l\'import sovrascrive i fogli del semestre indicato. ' +
    'Se importi <b>S1</b> vengono <b>cancellati tutti i fogli S2*</b>, e viceversa. ' +
    'Il foglio <b>PdS</b> viene riscritto.</p>' +
    '<textarea id="jsonInput" placeholder=\'{ "version": 1, "semester": "S1", ... }\' style="width:100%;height:280px;font-family:monospace;font-size:10px"></textarea>' +
    '<div id="status" style="margin-top:8px;font-size:12px;color:#888"></div>' +
    '<div style="text-align:right;margin-top:8px">' +
    '<button onclick="google.script.host.close()" style="padding:6px 12px">Annulla</button> ' +
    '<button id="btnImport" onclick="doImport()" style="padding:6px 12px;background:#c00;color:#fff;border:none;border-radius:4px;cursor:pointer">Importa (sovrascrive)</button>' +
    '</div>' +
    '<script>' +
    'function doImport(){' +
    '  var j=document.getElementById("jsonInput").value;' +
    '  if(!j.trim()){alert("Incolla il JSON prima.");return;}' +
    '  if(!confirm("Confermi l\\u0027import? I fogli esistenti verranno sovrascritti.")) return;' +
    '  var b=document.getElementById("btnImport");' +
    '  b.disabled=true; b.textContent="Importing...";' +
    '  document.getElementById("status").textContent="Esecuzione in corso, attendi...";' +
    '  google.script.run' +
    '    .withSuccessHandler(function(msg){alert("✓ "+msg);google.script.host.close();})' +
    '    .withFailureHandler(function(err){alert("Errore: "+err.message);b.disabled=false;b.textContent="Importa (sovrascrive)";document.getElementById("status").textContent="";})' +
    '    .applyImportFromJson(j);' +
    '}' +
    '</script>' +
    '</div>';
  const dlg = HtmlService.createHtmlOutput(html).setWidth(760).setHeight(540);
  SpreadsheetApp.getUi().showModalDialog(dlg, 'Import JSON');
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
    // Non eliminare se e' l'unico foglio (Sheets richiede almeno uno)
    if (ss.getSheets().length === 1) return;
    ss.deleteSheet(sh);
    deleted++;
  });

  // 2. Per ogni foglio in data (esclusi i campi meta), import.
  const metaKeys = ['version', 'semester', 'exportedAt'];
  let written = 0;
  const written_names = [];
  Object.keys(data).forEach(key => {
    if (metaKeys.indexOf(key) !== -1) return;
    const sd = data[key];
    if (!sd || typeof sd !== 'object') return;
    if (!Array.isArray(sd.header) || !Array.isArray(sd.rows)) return;
    let sh = ss.getSheetByName(key);
    if (!sh) sh = ss.insertSheet(key);
    // Smerge + clear totale
    try {
      sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
    } catch (e) {}
    sh.clear();
    sh.clearNotes();
    const header = sd.header.map(h => String(h == null ? '' : h));
    if (header.length === 0) { written_names.push(key); written++; return; }
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
    written_names.push(key);
    written++;
  });

  return 'Cancellati ' + deleted + ' fogli "' + oppositePrefix + '*", '
       + 'importati ' + written + ' fogli "' + newPrefix + '*"+PdS: ' + written_names.join(', ');
}
