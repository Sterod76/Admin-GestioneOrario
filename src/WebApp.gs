// ─────────────────────────────────────────────────────────────────────────────
// Costanti — solo EDIT_EMAILS è strettamente necessaria per il funzionamento.
// Lo snapshot ScriptProperty è una cache che accelera il page load (doGet).
// ─────────────────────────────────────────────────────────────────────────────

const EDIT_EMAILS_PROP = 'EDIT_EMAILS';
const PROP_CHUNK_SIZE = 4000;            // chars per chunk; safe sotto i 9KB byte limit
const SNAP_BUCKETS = ['LT', 'LM', 'PDS']; // nomi dei bucket snapshot

// ─────────────────────────────────────────────────────────────────────────────
// AUTH: EDIT_EMAILS whitelist
// ─────────────────────────────────────────────────────────────────────────────

function getEditorEmails_() {
  const raw = PropertiesService.getScriptProperties().getProperty(EDIT_EMAILS_PROP);
  if (!raw) return [];
  return String(raw).split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(s => s.indexOf('@') > 0);
}

function isEditor_(email) {
  if (!email) return false;
  return getEditorEmails_().indexOf(String(email).trim().toLowerCase()) !== -1;
}

function setEditorEmails(emails) {
  if (!Array.isArray(emails)) throw new Error('Passa un array di email');
  const cleaned = emails.map(s => String(s || '').trim().toLowerCase()).filter(s => s.length);
  PropertiesService.getScriptProperties().setProperty(EDIT_EMAILS_PROP, cleaned.join(', '));
  return 'EDIT_EMAILS: ' + cleaned.join(', ');
}

function manageEditors() {
  const ui = SpreadsheetApp.getUi();
  const current = getEditorEmails_();
  const res = ui.prompt(
    'Editor web app (EDIT_EMAILS)',
    'Inserisci email autorizzate, separate da virgola o nuova riga.\n\n' +
    'Attuali:\n' + (current.length ? current.join('\n') : '(nessuna)'),
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const raw = res.getResponseText() || '';
  const list = raw.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(s => s.indexOf('@') > 0);
  setEditorEmails(list);
  ui.alert('Salvato. ' + list.length + ' email:\n' + (list.join('\n') || '(vuoto)'));
}

function currentEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

// ─────────────────────────────────────────────────────────────────────────────
// doGet: legge lo snapshot dalle ScriptProperties (3 bucket LT/LM/PDS).
// Se non esiste, fa un bootstrap one-shot leggendo il foglio.
// ─────────────────────────────────────────────────────────────────────────────

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  let data = _readSnapshot_();
  if (!data) {
    // Primo accesso o snapshot corrotto: bootstrap dal foglio.
    data = getOrarioData();
    data.pendingEdits = [];
    _writeSnapshot_(data);
  } else {
    data.pendingEdits = [];
  }
  const json = JSON.stringify(data);
  if (action === 'data') {
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }
  const tpl = HtmlService.createTemplateFromFile('index');
  tpl.bootstrap = json;
  const semester = data.semester || 'S1';
  let userEmail = '';
  try { userEmail = Session.getActiveUser().getEmail() || ''; } catch (err) {}
  tpl.editMode = isEditor_(userEmail);
  tpl.userEmail = userEmail;
  let webAppUrl = '';
  try { webAppUrl = ScriptApp.getService().getUrl() || ''; } catch (err) {}
  tpl.webAppUrl = webAppUrl;
  tpl.diag = JSON.stringify({
    activeEmail: userEmail,
    editEmails: getEditorEmails_(),
    isEditorResult: tpl.editMode,
    ts: new Date().toISOString()
  });
  return tpl.evaluate()
    .setTitle('Bozza Orario ' + semester)
    .setFaviconUrl('https://www.df.unipi.it/wp-content/uploads/2025/03/cropped-favf-192x192.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC: Carica dal gsheet (foglio → snapshot → client)
// ─────────────────────────────────────────────────────────────────────────────

function rpcLoadFromSheet() {
  if (!isEditor_(currentEmail_())) throw new Error('Non autorizzato.');
  const data = getOrarioData();
  data.pendingEdits = [];
  _writeSnapshot_(data);
  return JSON.stringify(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC: Salva sul gsheet (pendingEdits → SxLT/LM celle, rigenera SxAULE,
//                       rebuild snapshot, ritorna data fresco)
// ─────────────────────────────────────────────────────────────────────────────

function rpcSaveToSheet(payload) {
  if (!isEditor_(currentEmail_())) throw new Error('Non autorizzato.');
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) throw new Error('Lock fallito (altra scrittura in corso).');
  try {
    const edits = (payload && Array.isArray(payload.pendingEdits)) ? payload.pendingEdits : [];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (edits.length) applyEditsBatch_(ss, edits);
    // Rigenera SxAULE (non-interactive: throw su conflitti, auto-accept new rooms)
    tabellaAule({ ss: ss, interactive: false });
    // Re-read foglio + scrivi 3 bucket
    const data = getOrarioData();
    data.pendingEdits = [];
    _writeSnapshot_(data);
    return JSON.stringify(data);
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet menu: 📅 Pubblica Web Calendar
// Legge il foglio, rigenera SxAULE, scrive i 3 bucket dello snapshot.
// ─────────────────────────────────────────────────────────────────────────────

function publishWebCalendar() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Rigenera SxAULE (interattivo: dialog su conflitti / new rooms)
  tabellaAule({ ss: ss, interactive: true });
  // Legge il foglio e scrive snapshot
  const data = getOrarioData();
  data.pendingEdits = [];
  _writeSnapshot_(data);
  ui.alert('Pubblicato',
    'Web Calendar aggiornato:\n' +
    '• ' + data.sessions.length + ' sessioni\n' +
    '• ' + (data.rooms || []).length + ' aule\n' +
    '• Bucket: ' + SNAP_BUCKETS.join(', '),
    ui.ButtonSet.OK);
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit batch su SxLT/SxLM
// ─────────────────────────────────────────────────────────────────────────────

function applyEditsBatch_(ss, edits) {
  const cellOps = {};
  const sheetCache = {};
  function getSheet(name) {
    if (!sheetCache[name]) sheetCache[name] = ss.getSheetByName(name);
    return sheetCache[name];
  }
  function ensure(sheet, row, col) {
    const k = sheet + '|' + row + '|' + col;
    if (!cellOps[k]) cellOps[k] = { sheet, row, col, replacements: {}, removals: [], additions: [] };
    return cellOps[k];
  }
  edits.forEach(e => {
    const sheet = e.src.sheet;
    const row = e.src.row;
    const sCol = e.src.col;
    const tCol = parseInt(e.target.col, 10);
    const slot = { start: e.target.start, end: e.target.end, room: String(e.target.room).trim() };
    if (sCol === tCol) {
      ensure(sheet, row, sCol).replacements[e.src.idx] = slot;
    } else {
      ensure(sheet, row, sCol).removals.push(e.src.idx);
      ensure(sheet, row, tCol).additions.push(slot);
    }
  });
  let cellsRead = 0, cellsWritten = 0;
  Object.keys(cellOps).forEach(k => {
    const op = cellOps[k];
    const sh = getSheet(op.sheet);
    if (!sh) throw new Error('Foglio non trovato: ' + op.sheet);
    const cell = sh.getRange(op.row, op.col);
    let list = extractSessions(String(cell.getValue() || '')).list;
    cellsRead++;
    Object.keys(op.replacements).forEach(idx => {
      const i = parseInt(idx, 10);
      if (i >= 0 && i < list.length) list[i] = op.replacements[idx];
    });
    op.removals.sort((a, b) => b - a).forEach(i => {
      if (i >= 0 && i < list.length) list.splice(i, 1);
    });
    op.additions.forEach(s => list.push(s));
    cell.setValue(renderSessions_(list));
    cellsWritten++;
  });
  return { cellsRead, cellsWritten };
}

function renderSessions_(sessions) {
  return sessions.map(s => fmtMin_(s.start) + '-' + fmtMin_(s.end) + '\n' + s.room).join('\n');
}

function fmtMin_(min) {
  const h = Math.floor(min / 60), m = min % 60;
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return pad(h) + ':' + pad(m);
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot storage in 3 bucket: LT, LM, PDS
//
//   ScriptProperties layout:
//     LT_meta     → JSON { n, len, ts }
//     LT_0..LT_N  → chunk JSON (PROP_CHUNK_SIZE chars max each)
//     LM_meta, LM_0..LM_M
//     PDS_meta, PDS_0..PDS_K
//
//   Contenuto per bucket (split logico, ricomposto a doGet):
//     LT:  sessioni da SxLT, codes (LT), sheetsInfo (LT), tipi/gruppi/titolari LT
//     LM:  stesso per SxLM
//     PDS: pds list + rooms + roomSubtitles + unavail + semester + slot meta
//          + vincoloColors + ownerEmail + generatedAt
// ─────────────────────────────────────────────────────────────────────────────

/** Split logico del data in 3 bucket per fonte. */
function _splitBuckets_(data) {
  const sessions = data.sessions || [];
  const sheets = data.sheets || [];

  const ltSessions = sessions.filter(s => /LT$/i.test(s.sheet || ''));
  const lmSessions = sessions.filter(s => /LM$/i.test(s.sheet || ''));

  const ltSheets = sheets.filter(si => /LT$/i.test(si.name || ''));
  const lmSheets = sheets.filter(si => /LM$/i.test(si.name || ''));

  function uniqFromSessions_(arr, key) {
    const seen = {};
    arr.forEach(s => { const v = s[key]; if (v) seen[v] = true; });
    return Object.keys(seen).sort();
  }

  return {
    LT: {
      sessions: ltSessions,
      codes: data.codesLT || [],
      sheetsInfo: ltSheets,
      tipi: uniqFromSessions_(ltSessions, 'tipo'),
      gruppi: uniqFromSessions_(ltSessions, 'group'),
      titolari: uniqFromSessions_(ltSessions, 'titolare')
    },
    LM: {
      sessions: lmSessions,
      codes: data.codesLM || [],
      sheetsInfo: lmSheets,
      tipi: uniqFromSessions_(lmSessions, 'tipo'),
      gruppi: uniqFromSessions_(lmSessions, 'group'),
      titolari: uniqFromSessions_(lmSessions, 'titolare')
    },
    PDS: {
      pds: data.pds || [],
      rooms: data.rooms || [],
      roomSubtitles: data.roomSubtitles || {},
      unavail: data.unavail || [],
      semester: data.semester || 'S1',
      days: data.days || ['LUN','MAR','MER','GIO','VEN','SAB'],
      slotStartMin: data.slotStartMin,
      slotEndMin: data.slotEndMin,
      slotStepMin: data.slotStepMin,
      vincoloColors: data.vincoloColors || {},
      ownerEmail: data.ownerEmail || '',
      generatedAt: data.generatedAt || new Date().toISOString()
    }
  };
}

/** Riassembla i 3 bucket in un oggetto data flat, formato atteso dal client. */
function _assembleBuckets_(buckets) {
  const LT = buckets.LT || {};
  const LM = buckets.LM || {};
  const PDS = buckets.PDS || {};
  function uniq_(a, b) {
    const seen = {};
    (a || []).forEach(x => { seen[x] = true; });
    (b || []).forEach(x => { seen[x] = true; });
    return Object.keys(seen).sort();
  }
  return {
    semester: PDS.semester || 'S1',
    days: PDS.days || ['LUN','MAR','MER','GIO','VEN','SAB'],
    slotStartMin: PDS.slotStartMin,
    slotEndMin: PDS.slotEndMin,
    slotStepMin: PDS.slotStepMin,
    sheets: [].concat(LT.sheetsInfo || [], LM.sheetsInfo || []),
    rooms: PDS.rooms || [],
    roomSubtitles: PDS.roomSubtitles || {},
    tipi: uniq_(LT.tipi, LM.tipi),
    gruppi: uniq_(LT.gruppi, LM.gruppi),
    titolari: uniq_(LT.titolari, LM.titolari),
    codesLT: LT.codes || [],
    codesLM: LM.codes || [],
    pds: PDS.pds || [],
    vincoloColors: PDS.vincoloColors || {},
    ownerEmail: PDS.ownerEmail || '',
    sessions: [].concat(LT.sessions || [], LM.sessions || []),
    unavail: PDS.unavail || [],
    generatedAt: PDS.generatedAt || new Date().toISOString()
  };
}

function _chunkString_(s) {
  const out = [];
  for (let i = 0; i < s.length; i += PROP_CHUNK_SIZE) out.push(s.slice(i, i + PROP_CHUNK_SIZE));
  return out;
}

/** Scrive i 3 bucket + meta in un singolo setProperties batch. */
function _writeSnapshot_(data) {
  const props = PropertiesService.getScriptProperties();
  const buckets = _splitBuckets_(data);

  // Conta chunk vecchi per cleanup orfani
  const oldCounts = {};
  SNAP_BUCKETS.forEach(name => {
    let n = 0;
    try {
      const m = props.getProperty(name + '_meta');
      if (m) n = JSON.parse(m).n || 0;
    } catch (e) {}
    oldCounts[name] = n;
  });

  const toSet = {};
  const newCounts = {};
  SNAP_BUCKETS.forEach(name => {
    const json = JSON.stringify(buckets[name] || {});
    const chunks = _chunkString_(json);
    toSet[name + '_meta'] = JSON.stringify({ n: chunks.length, len: json.length, ts: Date.now() });
    chunks.forEach((c, i) => { toSet[name + '_' + i] = c; });
    newCounts[name] = chunks.length;
  });
  props.setProperties(toSet);

  // Orphan delete (se nuovo snapshot ha meno chunk)
  SNAP_BUCKETS.forEach(name => {
    for (let i = newCounts[name]; i < oldCounts[name]; i++) {
      props.deleteProperty(name + '_' + i);
    }
  });
}

/** Legge i 3 bucket e ritorna data riassemblato. Null se mancante/corrotto. */
function _readSnapshot_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const buckets = {};
  for (let bi = 0; bi < SNAP_BUCKETS.length; bi++) {
    const name = SNAP_BUCKETS[bi];
    const metaRaw = all[name + '_meta'];
    if (!metaRaw) return null;
    let meta;
    try { meta = JSON.parse(metaRaw); } catch (e) { return null; }
    let str = '';
    for (let i = 0; i < meta.n; i++) {
      const c = all[name + '_' + i];
      if (c == null) return null;
      str += c;
    }
    if (str.length !== meta.len) return null;
    try { buckets[name] = JSON.parse(str); } catch (e) { return null; }
  }
  return _assembleBuckets_(buckets);
}

/** Rimuove tutti i chunk + meta dei 3 bucket. */
function _clearSnapshot_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(k => {
    for (let bi = 0; bi < SNAP_BUCKETS.length; bi++) {
      const name = SNAP_BUCKETS[bi];
      if (k === name + '_meta' || k.indexOf(name + '_') === 0) {
        props.deleteProperty(k);
        return;
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// One-shot cleanup chiavi legacy (snap:*, orarioSnap:*, orarioLog,
// ownerEmailCache, spreadsheetId). Esegui dall'editor Apps Script una volta.
// ─────────────────────────────────────────────────────────────────────────────

function cleanupLegacyProperties() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const legacyPrefixes = ['snap:', 'orarioSnap:'];
  const legacyKeys = ['snap:meta', 'orarioSnap:meta', 'orarioLog', 'ownerEmailCache', 'spreadsheetId'];
  let removed = 0;
  Object.keys(all).forEach(k => {
    const hitPrefix = legacyPrefixes.some(p => k.indexOf(p) === 0);
    const hitKey = legacyKeys.indexOf(k) !== -1;
    if (hitPrefix || hitKey) {
      props.deleteProperty(k);
      removed++;
    }
  });
  const msg = 'Rimosse ' + removed + ' chiavi legacy.';
  Logger.log(msg);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Cleanup', 5); } catch (e) {}
  return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// getOrarioData: legge il foglio e costruisce l'oggetto data completo.
// Chiamato da doGet (bootstrap), rpcLoadFromSheet, rpcSaveToSheet,
// publishWebCalendar. È l'unica funzione che apre lo Spreadsheet.
// ─────────────────────────────────────────────────────────────────────────────

function getOrarioData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { prefix: AULE_PREFIX, output: AULE_OUTPUT } = detectAuleConfigFor_(ss);
  const semester = AULE_PREFIX;
  let ownerEmail = '';
  try {
    const o = ss.getOwner();
    if (o) ownerEmail = String(o.getEmail() || '').toLowerCase();
  } catch (e) {}
  const sources = ss.getSheets().filter(s => {
    const n = s.getName();
    return n.toUpperCase().startsWith(AULE_PREFIX) && n !== AULE_OUTPUT;
  });

  const mutuantiByParent = buildMutuantiMap(sources);

  const sheetsInfo = [];
  const sessions = [];
  const roomSet = {};
  const tipoSet = {};
  const groupSet = {};
  const titolareSet = {};
  const codesLT = {};
  const codesLM = {};

  sources.forEach(sheet => {
    const sheetName = sheet.getName();
    const tabColor = readTabColor(sheet) || '#444444';
    sheetsInfo.push({ name: sheetName, color: tabColor });
    const sheetIsLT = /LT$/i.test(sheetName);
    const sheetIsLM = /LM$/i.test(sheetName);
    const lastRow = sheet.getLastRow();
    if (lastRow < HEADER_ROWS + 1) return;
    const fullRange = sheet.getRange(HEADER_ROWS + 1, 1, lastRow - HEADER_ROWS, ROW_DATA_LAST_COL);
    const data = fullRange.getValues();
    const vincoloBgs = sheet.getRange(HEADER_ROWS + 1, COL_VINCOLO, lastRow - HEADER_ROWS, 1).getBackgrounds();
    data.forEach((row, rIdx) => {
      const code = row[COL_CODICE - 1];
      if (!code) return;
      const codeUpper = String(code).trim().toUpperCase();
      if (sheetIsLT) codesLT[codeUpper] = true;
      if (sheetIsLM) codesLM[codeUpper] = true;
      if (parseMutuazione(row[COL_MUTUATO - 1])) return;
      const anno = row[0];
      const name = row[COL_NOMECORSO - 1];
      const tipo = row[COL_TIPO - 1];
      const vincoloRaw = row[COL_VINCOLO - 1];
      const vincoloKey = vincoloRaw ? String(vincoloRaw).trim().toUpperCase() : '';
      const staticBg = vincoloBgs[rIdx][0];
      const vincoloBg = !isWhiteOrEmpty(staticBg)
        ? staticBg
        : (VINCOLO_FALLBACK_COLORS[vincoloKey] || VINCOLO_DEFAULT_COLOR);
      const group = row[COL_GRUPPO - 1];
      const titolare = row[COL_TITOLARE - 1];
      const ssd = row[COL_SSD - 1];
      const periodo = row[COL_PERIODO - 1];
      const periodoStr = periodo
        ? String(periodo).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
        : '';

      const codeStr = String(code).trim();
      const nameStr = name ? String(name).trim() : '';
      const tipoStr = tipo ? String(tipo).trim() : '';
      const groupStr = group ? String(group).trim() : '';
      const titolareStr = titolare ? String(titolare).trim() : '';

      if (tipoStr) tipoSet[tipoStr] = true;
      if (groupStr) groupSet[groupStr] = true;
      if (titolareStr) titolareSet[titolareStr] = true;

      for (let d = 0; d < DAYS_LABELS.length; d++) {
        const cellText = row[CALENDAR_COLS_START - 1 + d];
        if (!cellText) continue;
        const parsed = extractSessions(String(cellText));
        const sheetRow = HEADER_ROWS + 1 + rIdx;
        const sheetCol = CALENDAR_COLS_START + d;
        parsed.list.forEach((s, sessionIdx) => {
          roomSet[s.room] = true;
          const annoDigits = String(anno == null ? '' : anno).replace(/[^0-9]/g, '');
          const mutLista = mutuantiByParent[codeStr.toUpperCase()] || [];
          sessions.push({
            sheet: sheetName,
            sheetColor: tabColor,
            anno: annoDigits,
            src: { sheet: sheetName, row: sheetRow, col: sheetCol, idx: sessionIdx },
            code: codeStr,
            name: nameStr,
            tipo: tipoStr,
            tipoLabel: tipoLabel(tipoStr),
            vincolo: vincoloKey,
            vincoloColor: vincoloBg,
            group: groupStr,
            titolare: titolareStr,
            ssd: ssd ? String(ssd).trim() : '',
            day: d,
            start: s.start,
            end: s.end,
            room: s.room,
            periodo: periodoStr,
            mutuanti: mutLista.length ? formatMutuanti(mutLista) : ''
          });
        });
      }
    });
  });

  const slots = [];
  for (let m = SLOT_START_MIN; m + SLOT_STEP_MIN <= SLOT_END_MIN; m += SLOT_STEP_MIN) slots.push(m);
  const unavail = [];
  const aule = ss.getSheetByName(AULE_OUTPUT);
  const orderedRooms = [];
  const roomSubtitles = {};
  if (aule) {
    const items = readUnavailability(aule, DAYS_LABELS.length, slots.length);
    items.forEach(it => {
      roomSet[it.room] = true;
      unavail.push({
        room: it.room,
        day: it.dayIdx,
        start: slots[it.slotIdx],
        end: slots[Math.min(it.slotIdx + it.span - 1, slots.length - 1)] + SLOT_STEP_MIN,
        text: it.text
      });
    });
    const lr = aule.getLastRow();
    if (lr >= 2) {
      const colA = aule.getRange(2, 1, lr - 1, 1).getValues().map(r => r[0]);
      const blockSize = DAYS_LABELS.length;
      const seen = {};
      for (let i = 0; i < colA.length; i += blockSize) {
        const raw = colA[i];
        if (raw === '' || raw === null) continue;
        const lines = String(raw).split(/\r?\n/).map(s => s.trim()).filter(s => s.length);
        if (!lines.length) continue;
        const name = lines[0];
        if (DAYS_LABELS.indexOf(name) !== -1) continue;
        if (seen[name]) continue;
        seen[name] = true;
        orderedRooms.push(name);
        if (lines.length > 1) {
          roomSubtitles[name] = lines.slice(1).join(' · ');
        }
      }
    }
  }

  const pdsList = [];
  const pdsSheet = ss.getSheetByName(PDS_SHEET_NAME);
  if (pdsSheet) {
    const lr = pdsSheet.getLastRow();
    if (lr >= 2) {
      const lc = Math.max(pdsSheet.getLastColumn(), PDS_COL_OPT);
      const pdsData = pdsSheet.getRange(2, 1, lr - 1, lc).getValues();
      const vincPriority = { OBB: 3, FOR: 2, OPZ: 1 };
      pdsData.forEach(row => {
        const name = String(row[0] || '').trim();
        if (!name) return;
        const codes = {};
        const vincoloByCode = {};
        function set(code, v) {
          codes[code] = true;
          const cur = vincoloByCode[code];
          if (!cur || vincPriority[v] > vincPriority[cur]) vincoloByCode[code] = v;
        }
        extractPdsCodes(row[PDS_COL_OBB - 1]).forEach(c => set(c, 'OBB'));
        for (let c = PDS_COL_FOR_FIRST; c <= PDS_COL_FOR_LAST; c++) {
          extractPdsCodes(row[c - 1]).forEach(code => set(code, 'FOR'));
        }
        extractPdsCodes(row[PDS_COL_OPT - 1]).forEach(code => set(code, 'OPZ'));
        pdsList.push({ name, codes: Object.keys(codes), vincoloByCode });
      });
    }
  }

  return {
    semester,
    days: DAYS_LABELS,
    slotStartMin: SLOT_START_MIN,
    slotEndMin: SLOT_END_MIN,
    slotStepMin: SLOT_STEP_MIN,
    sheets: sheetsInfo,
    rooms: mergeRoomOrder_(orderedRooms, Object.keys(roomSet)),
    roomSubtitles: roomSubtitles,
    tipi: Object.keys(tipoSet).sort(),
    gruppi: Object.keys(groupSet).sort(),
    titolari: Object.keys(titolareSet).sort(),
    codesLT: Object.keys(codesLT),
    codesLM: Object.keys(codesLM),
    pds: pdsList,
    vincoloColors: VINCOLO_FALLBACK_COLORS,
    ownerEmail,
    sessions,
    unavail,
    generatedAt: new Date().toISOString()
  };
}

function mergeRoomOrder_(orderedRooms, discoveredRooms) {
  const seen = {};
  const out = [];
  orderedRooms.forEach(r => { if (!seen[r]) { seen[r] = true; out.push(r); } });
  const extras = discoveredRooms.filter(r => !seen[r]).sort(roomCompare);
  return out.concat(extras);
}
