const SNAPSHOT_PROP_PREFIX = 'orarioSnap:';
const SNAPSHOT_META_KEY = 'orarioSnap:meta';
const PROP_CHUNK_SIZE = 4000; // chars; safe sotto il limite byte 9 KB anche con UTF-8 a 2 byte
const EDIT_EMAILS_PROP = 'EDIT_EMAILS';

/**
 * Restituisce array di email autorizzate alla modalita' editor.
 * Letto da DocumentProperty EDIT_EMAILS (formato JSON array).
 * Es. ["stefano.roddaro@unipi.it", "altro.docente@unipi.it"]
 */
function getEditorEmails_() {
  const raw = PropertiesService.getDocumentProperties().getProperty(EDIT_EMAILS_PROP);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(s => String(s || '').trim().toLowerCase()).filter(s => s.length);
  } catch (e) { return []; }
}

function isEditor_(email) {
  if (!email) return false;
  const e = String(email).trim().toLowerCase();
  return getEditorEmails_().indexOf(e) !== -1;
}

/**
 * Utility eseguibile dall'editor Apps Script per popolare la whitelist.
 * Esempio: setEditorEmails(["stefano.roddaro@unipi.it", "altro@unipi.it"]);
 */
function setEditorEmails(emails) {
  if (!Array.isArray(emails)) {
    throw new Error('Passa un array di email, es. ["a@b.it","c@d.it"]');
  }
  const cleaned = emails.map(s => String(s || '').trim().toLowerCase()).filter(s => s.length);
  PropertiesService.getDocumentProperties().setProperty(EDIT_EMAILS_PROP, JSON.stringify(cleaned));
  return 'EDIT_EMAILS salvate: ' + cleaned.length + ' (' + cleaned.join(', ') + ')';
}

function getEditorEmailsList() {
  return getEditorEmails_();
}

/**
 * Endpoint editor: applica modifica a uno slot orario.
 * Payload:
 *   src    = { sheet, row, col, idx }     (identifica univocamente lo slot)
 *   target = { sheet, row, col, room, start, end }
 * Vincoli:
 *   - src.sheet === target.sheet (la sessione resta nello stesso foglio)
 *   - src.row   === target.row   (resta nello stesso corso/riga)
 *   - target.col puo' differire (cambio giorno LUN..SAB)
 *   - target.room puo' differire
 *   - target.start/end espressi in minuti dalla mezzanotte
 * Controllo conflitti: lo slot non puo' sovrapporsi ad altra sessione sulla
 * stessa (aula, giorno). Lo slot stesso (src) e' escluso dal check.
 * Ritorna il NUOVO snapshot JSON (stringa) che il client puo' usare per
 * aggiornare entrambe le viste in tempo reale.
 */
function applyEditSlot(payload) {
  const email = (function(){
    try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
  })();
  if (!isEditor_(email)) {
    throw new Error('Non autorizzato (email: ' + (email || 'anonimo') + ').');
  }
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Lock fallito (un\'altra modifica e\' in corso). Riprova.');
  }
  try {
    return applyEditSlot_(payload);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function applyEditSlot_(payload) {
  if (!payload || !payload.src || !payload.target) {
    throw new Error('Payload incompleto');
  }
  const src = payload.src;
  const target = payload.target;
  if (src.sheet !== target.sheet || src.row !== target.row) {
    throw new Error('Spostamento cross-sheet o cross-row non supportato.');
  }
  const tStart = parseInt(target.start, 10);
  const tEnd = parseInt(target.end, 10);
  if (!isFinite(tStart) || !isFinite(tEnd) || tEnd <= tStart) {
    throw new Error('Orario non valido (start=' + target.start + ', end=' + target.end + ').');
  }
  if (tStart < SLOT_START_MIN || tEnd > SLOT_END_MIN) {
    throw new Error('Orario fuori range consentito (' +
      fmtMin_(SLOT_START_MIN) + '-' + fmtMin_(SLOT_END_MIN) + ').');
  }
  if ((tStart % SLOT_STEP_MIN) !== 0 || (tEnd % SLOT_STEP_MIN) !== 0) {
    throw new Error('Gli slot devono essere allineati a multipli di ' + SLOT_STEP_MIN + ' minuti.');
  }
  if (!target.room || !String(target.room).trim()) {
    throw new Error('Aula target mancante.');
  }
  const targetRoom = String(target.room).trim();

  const ss = SpreadsheetApp.openById(getBoundSpreadsheetId_());
  const sh = ss.getSheetByName(src.sheet);
  if (!sh) throw new Error('Foglio sorgente non trovato: ' + src.sheet);

  // Conflict check (escludendo self)
  const conflict = findConflict_(ss, { col: target.col, room: targetRoom, start: tStart, end: tEnd }, src);
  if (conflict) {
    throw new Error('Conflitto: ' + conflict);
  }

  // Leggi la cella sorgente, modifica/sposta il slot
  const srcCell = sh.getRange(src.row, src.col);
  const srcText = String(srcCell.getValue() || '');
  const srcList = extractSessions(srcText).list;
  if (src.idx < 0 || src.idx >= srcList.length) {
    throw new Error('idx sessione non valido nella cella sorgente (idx=' +
      src.idx + ', presenti=' + srcList.length + ').');
  }

  const newSession = { start: tStart, end: tEnd, room: targetRoom };

  if (src.col === target.col) {
    // Stessa cella: rimpiazza la sessione idx
    srcList[src.idx] = newSession;
    srcCell.setValue(renderSessions_(srcList));
  } else {
    // Diversa cella (cambio giorno): rimuovi da source, aggiungi a target
    srcList.splice(src.idx, 1);
    srcCell.setValue(renderSessions_(srcList));
    const tgtCell = sh.getRange(src.row, target.col);
    const tgtList = extractSessions(String(tgtCell.getValue() || '')).list;
    tgtList.push(newSession);
    tgtCell.setValue(renderSessions_(tgtList));
  }

  // Modifica scritta sul foglio. Ritorna lo snapshot fresco al client
  // (non serve cachare: doGet legge sempre live ad ogni page load).
  return JSON.stringify(getOrarioData());
}

function renderSessions_(sessions) {
  return sessions.map(s => fmtMin_(s.start) + '-' + fmtMin_(s.end) + '\n' + s.room).join('\n');
}

function fmtMin_(min) {
  const h = Math.floor(min / 60), m = min % 60;
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return pad(h) + ':' + pad(m);
}

/**
 * Scansiona TUTTI i fogli source con il prefisso del semestre attivo
 * (S1 o S2) e ritorna una stringa descrittiva del primo conflitto trovato
 * per (aula, giorno col, intervallo [start,end)), escludendo lo slot src.
 * Ritorna null se nessun conflitto.
 */
function findConflict_(ss, target, srcExclude) {
  const cfg = detectAuleConfigFor_(ss);
  const sheets = ss.getSheets().filter(s => {
    const n = s.getName();
    return n.toUpperCase().startsWith(cfg.prefix) && n !== cfg.output;
  });
  const dayIdx = target.col - CALENDAR_COLS_START;
  for (let si = 0; si < sheets.length; si++) {
    const sh = sheets[si];
    const lastRow = sh.getLastRow();
    if (lastRow < HEADER_ROWS + 1) continue;
    const colVals = sh.getRange(HEADER_ROWS + 1, target.col, lastRow - HEADER_ROWS, 1).getValues();
    for (let r = 0; r < colVals.length; r++) {
      const cellText = colVals[r][0];
      if (!cellText) continue;
      const sheetRow = HEADER_ROWS + 1 + r;
      const list = extractSessions(String(cellText)).list;
      for (let i = 0; i < list.length; i++) {
        // Skip self
        if (sh.getName() === srcExclude.sheet &&
            sheetRow === srcExclude.row &&
            target.col === srcExclude.col &&
            i === srcExclude.idx) continue;
        const s = list[i];
        if (s.room !== target.room) continue;
        if (target.start < s.end && target.end > s.start) {
          return DAYS_LABELS[dayIdx] + ' ' + fmtMin_(s.start) + '-' + fmtMin_(s.end) +
                 ' aula ' + s.room + ' (' + sh.getName() + ' riga ' + sheetRow + ')';
        }
      }
    }
  }
  return null;
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  // Sempre live: ogni page load rilegge lo stato attuale dello Spreadsheet.
  // Niente snapshot cached, niente "pubblicazione" intermedia → vista
  // sempre allineata col foglio.
  const data = getOrarioData();
  const json = JSON.stringify(data);
  if (action === 'data') {
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }
  const tpl = HtmlService.createTemplateFromFile('index');
  tpl.bootstrap = json;
  const semester = data.semester || 'S1';
  let userEmail = '';
  try { userEmail = Session.getActiveUser().getEmail() || ''; } catch (e) {}
  tpl.editMode = isEditor_(userEmail);
  tpl.userEmail = userEmail;
  return tpl.evaluate()
    .setTitle('Bozza Orario ' + semester)
    .setFaviconUrl('https://www.df.unipi.it/wp-content/uploads/2025/03/cropped-favf-192x192.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Deprecato: il Web Calendar e' ora sempre live (legge lo Spreadsheet
 * ad ogni page load). Non c'e' piu' uno snapshot da aggiornare.
 * Lasciato per backward-compat se qualche flusso esterno lo invocava;
 * non e' nel menu.
 */
function aggiornaWebApp() {
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Non serve piu\': il Web Calendar e\' sempre allineato live al foglio.',
    'Web Calendar', 5
  );
}

function saveSnapshot_(json) {
  const props = PropertiesService.getDocumentProperties();
  // Cancella chunk precedenti
  const all = props.getProperties();
  Object.keys(all).forEach(k => {
    if (k.indexOf(SNAPSHOT_PROP_PREFIX) === 0) props.deleteProperty(k);
  });
  // Split + write
  const chunks = [];
  for (let i = 0; i < json.length; i += PROP_CHUNK_SIZE) {
    chunks.push(json.slice(i, i + PROP_CHUNK_SIZE));
  }
  const meta = { n: chunks.length, len: json.length, ts: Date.now() };
  const toSet = {};
  toSet[SNAPSHOT_META_KEY] = JSON.stringify(meta);
  chunks.forEach((c, i) => { toSet[SNAPSHOT_PROP_PREFIX + i] = c; });
  props.setProperties(toSet);
}

function getSnapshot_() {
  const props = PropertiesService.getDocumentProperties();
  const metaRaw = props.getProperty(SNAPSHOT_META_KEY);
  if (!metaRaw) return null;
  let meta;
  try { meta = JSON.parse(metaRaw); } catch (e) { return null; }
  const keys = [];
  for (let i = 0; i < meta.n; i++) keys.push(SNAPSHOT_PROP_PREFIX + i);
  let out = '';
  for (let i = 0; i < meta.n; i++) {
    const c = props.getProperty(keys[i]);
    if (c == null) return null;
    out += c;
  }
  if (out.length !== meta.len) return null;
  return out;
}

function clearSnapshot() {
  const props = PropertiesService.getDocumentProperties();
  const all = props.getProperties();
  let n = 0;
  Object.keys(all).forEach(k => {
    if (k.indexOf(SNAPSHOT_PROP_PREFIX) === 0) {
      props.deleteProperty(k);
      n++;
    }
  });
  SpreadsheetApp.getActiveSpreadsheet().toast(`Rimosse ${n} chiavi snapshot.`, 'Web app', 3);
}

function getOrarioData() {
  const ss = SpreadsheetApp.openById(getBoundSpreadsheetId_());
  const { prefix: AULE_PREFIX, output: AULE_OUTPUT } = detectAuleConfigFor_(ss);
  const semester = AULE_PREFIX; // 'S1' o 'S2'
  const sources = ss.getSheets().filter(s => {
    const n = s.getName();
    return n.toUpperCase().startsWith(AULE_PREFIX) && n !== AULE_OUTPUT;
  });

  // Phase 1: mappa mutuanti per codice padre
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
    const bgs = fullRange.getBackgrounds();
    data.forEach((row, rIdx) => {
      const code = row[COL_CODICE - 1];
      if (!code) return;
      const codeUpper = String(code).trim().toUpperCase();
      if (sheetIsLT) codesLT[codeUpper] = true;
      if (sheetIsLM) codesLM[codeUpper] = true;
      // Riga mutuata: salta, non genera sessioni
      if (parseMutuazione(row[COL_MUTUATO - 1])) return;
      const anno = row[0];
      const name = row[COL_NOMECORSO - 1];
      const tipo = row[COL_TIPO - 1];
      const vincoloRaw = row[COL_VINCOLO - 1];
      const vincoloKey = vincoloRaw ? String(vincoloRaw).trim().toUpperCase() : '';
      const staticBg = bgs[rIdx][COL_VINCOLO - 1];
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
        const sheetRow = HEADER_ROWS + 1 + rIdx;       // 1-indexed
        const sheetCol = CALENDAR_COLS_START + d;      // 1-indexed
        parsed.list.forEach((s, sessionIdx) => {
          roomSet[s.room] = true;
          // Anno: estrai tutte le cifre. "1"→"1", "12"→"12", "1 e 2"→"12"
          const annoDigits = String(anno == null ? '' : anno).replace(/[^0-9]/g, '');
          const mutLista = mutuantiByParent[codeStr.toUpperCase()] || [];
          sessions.push({
            sheet: sheetName,
            sheetColor: tabColor,
            anno: annoDigits,
            src: {
              sheet: sheetName,
              row: sheetRow,
              col: sheetCol,
              idx: sessionIdx
            },
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

  // Unavailability from S1AULE
  const slots = [];
  for (let m = SLOT_START_MIN; m + SLOT_STEP_MIN <= SLOT_END_MIN; m += SLOT_STEP_MIN) slots.push(m);
  const unavail = [];
  const aule = ss.getSheetByName(AULE_OUTPUT);
  const orderedRooms = [];
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
    // Ordine aule da col A del foglio AULE (un blocco di nDays righe per aula)
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
      }
    }
  }

  // PdS: lista curricula → codici + classificazione per-codice (OBB/FOR/OPZ)
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
        pdsList.push({
          name: name,
          codes: Object.keys(codes),
          vincoloByCode: vincoloByCode
        });
      });
    }
  }

  return {
    semester: semester,
    days: DAYS_LABELS,
    slotStartMin: SLOT_START_MIN,
    slotEndMin: SLOT_END_MIN,
    slotStepMin: SLOT_STEP_MIN,
    sheets: sheetsInfo,
    rooms: mergeRoomOrder_(orderedRooms, Object.keys(roomSet)),
    tipi: Object.keys(tipoSet).sort(),
    gruppi: Object.keys(groupSet).sort(),
    titolari: Object.keys(titolareSet).sort(),
    codesLT: Object.keys(codesLT),
    codesLM: Object.keys(codesLM),
    pds: pdsList,
    vincoloColors: VINCOLO_FALLBACK_COLORS,
    sessions: sessions,
    unavail: unavail,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Combina l'ordine "ufficiale" del foglio AULE con le aule scoperte nei sources.
 * Le aule presenti in AULE_OUTPUT mantengono l'ordine; quelle eventualmente in piu
 * (sessioni in fogli S1 o S2 di aule non in AULE) sono accodate ordinate.
 */
function mergeRoomOrder_(orderedRooms, discoveredRooms) {
  const seen = {};
  const out = [];
  orderedRooms.forEach(r => { if (!seen[r]) { seen[r] = true; out.push(r); } });
  const extras = discoveredRooms.filter(r => !seen[r]).sort(roomCompare);
  return out.concat(extras);
}

function getBoundSpreadsheetId_() {
  const id = PropertiesService.getDocumentProperties().getProperty('spreadsheetId');
  if (id) return id;
  // Fallback: bound script
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss.getId();
  } catch (e) {}
  throw new Error('Spreadsheet ID non trovato. Esegui setSpreadsheetId() dall\'editor con l\'ID.');
}

function setSpreadsheetIdFromActive() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Esegui dall\'editor del foglio');
  PropertiesService.getDocumentProperties().setProperty('spreadsheetId', ss.getId());
  SpreadsheetApp.getActiveSpreadsheet().toast('Spreadsheet ID salvato.', 'Web app', 3);
}
