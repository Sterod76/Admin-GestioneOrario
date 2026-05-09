const SNAPSHOT_PROP_PREFIX = 'orarioSnap:';
const SNAPSHOT_META_KEY = 'orarioSnap:meta';
const PROP_CHUNK_SIZE = 4000; // chars; safe sotto il limite byte 9 KB anche con UTF-8 a 2 byte

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  const json = getSnapshot_();
  if (!json) {
    if (action === 'data') {
      return ContentService.createTextOutput(JSON.stringify({ error: 'snapshot_missing' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bozza Orario CdS</title>' +
      '<style>body{font-family:system-ui,sans-serif;padding:48px;text-align:center;color:#444}' +
      'h1{margin-bottom:8px}p{color:#888}</style></head><body>' +
      '<h1>📅 Bozza Orario CdS</h1>' +
      '<p>Snapshot non ancora pubblicato.</p>' +
      '<p style="font-size:12px">Riprova fra qualche minuto.</p>' +
      '</body></html>'
    ).setTitle('Bozza Orario CdS');
  }
  if (action === 'data') {
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }
  const tpl = HtmlService.createTemplateFromFile('index');
  tpl.bootstrap = json;
  let semester = 'S1';
  try { semester = JSON.parse(json).semester || 'S1'; } catch (e) {}
  return tpl.evaluate()
    .setTitle('Bozza Orario ' + semester)
    .setFaviconUrl('https://www.df.unipi.it/wp-content/uploads/2025/03/cropped-favf-192x192.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function aggiornaWebApp() {
  const json = JSON.stringify(getOrarioData());
  saveSnapshot_(json);
  const data = JSON.parse(json);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Sessioni ${data.sessions.length} • indisp. ${data.unavail.length} • ${Math.round(json.length / 1024)} KB`,
    '✅ Web Calendar aggiornato',
    6
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
        parsed.list.forEach(s => {
          roomSet[s.room] = true;
          // Anno: estrai tutte le cifre. "1"→"1", "12"→"12", "1 e 2"→"12"
          const annoDigits = String(anno == null ? '' : anno).replace(/[^0-9]/g, '');
          const mutLista = mutuantiByParent[codeStr.toUpperCase()] || [];
          sessions.push({
            sheet: sheetName,
            sheetColor: tabColor,
            anno: annoDigits,
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

  // PdS: lista curricula → codici
  const pdsList = [];
  const pdsSheet = ss.getSheetByName(PDS_SHEET_NAME);
  if (pdsSheet) {
    const lr = pdsSheet.getLastRow();
    if (lr >= 2) {
      const lc = Math.max(pdsSheet.getLastColumn(), PDS_COL_FOR_LAST + 1);
      const pdsData = pdsSheet.getRange(2, 1, lr - 1, lc).getValues();
      pdsData.forEach(row => {
        const name = String(row[0] || '').trim();
        if (!name) return;
        const codes = {};
        for (let c = 1; c < row.length; c++) {
          extractPdsCodes(row[c]).forEach(code => codes[code] = true);
        }
        pdsList.push({ name: name, codes: Object.keys(codes) });
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
