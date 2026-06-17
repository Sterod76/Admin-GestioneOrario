// Recupero impegni FUORI dipartimento da University Planner (Cineca), dentro l'orario.
// Endpoint PUBBLICO (no auth): POST impegniCalendarioPubblicoDocente, filtra per matricola
// col clienteId UniPi. Semestre = finestra date (S1=ottobre AA, S2=aprile AA+1). Filtra le
// aule Fisica (FIB/FIS/Fibonacci). Le MATRICOLE uniche si leggono dalla colonna C (Matricola)
// della Tabella nativa "SERVIZIO" (popolata la prima volta dai tool in impegni/), poi questa voce
// di menu RIAGGIORNA la tabella da UP per l'AA scelto.
// Richiede: scope script.external_request (UrlFetchApp) e scope spreadsheets pieno +
// servizio avanzato "Sheets" (Tabelle native via Sheets.Spreadsheets.batchUpdate).

const UP_BASE_ = 'https://unipi.prod.up.cineca.it/api';
const UP_CID_ = '628de8b9b63679f193b87046'; // UniPi

// Foglio + header (e nomi colonna) della Tabella nativa Google "SERVIZIO".
const SERVIZIO_SHEET = 'SERVIZIO';
const SERVIZIO_HEADERS = ['Cognome', 'Nome', 'Matricola', 'Giorno', 'Inizio', 'Fine', 'Corso', 'Aula'];

// ── Tabella nativa Google "SERVIZIO" (servizio avanzato Sheets API) ──────────
// NB: il servizio avanzato Sheets agisce sullo stato SERVER-SIDE, mentre le scritture
// SpreadsheetApp sono bufferizzate fino a flush(). Ogni helper fa flush() PRIMA della
// chiamata REST, così legge/scrive su uno stato coerente con le modifiche già fatte.

// Elimina ogni Tabella presente sul foglio dato (serve per ridimensionarla).
function _deleteTablesOnSheet_(ss, sh) {
  SpreadsheetApp.flush();
  const ssId = ss.getId(), sheetId = sh.getSheetId();
  const meta = Sheets.Spreadsheets.get(ssId);
  const reqs = [];
  (meta.sheets || []).forEach(function (s) {
    if (s.properties && s.properties.sheetId === sheetId && s.tables) {
      s.tables.forEach(function (t) { reqs.push({ deleteTable: { tableId: t.tableId } }); });
    }
  });
  if (reqs.length) Sheets.Spreadsheets.batchUpdate({ requests: reqs }, ssId);
}

// Crea la Tabella "SERVIZIO" su header(riga1) + nDataRows righe. Tenta con colonne TEXT
// (matricole con zeri iniziali e orari "HH:MM" come stringhe); se il columnType non è
// accettato, ricrea la Tabella "nuda" — gli zeri restano comunque garantiti dal formato '@'.
function _createServizioTable_(ss, sh, nDataRows) {
  SpreadsheetApp.flush();
  const ssId = ss.getId();
  const rows = Math.max(nDataRows | 0, 1);
  const range = {
    sheetId: sh.getSheetId(),
    startRowIndex: 0, endRowIndex: 1 + rows,
    startColumnIndex: 0, endColumnIndex: SERVIZIO_HEADERS.length
  };
  const colProps = SERVIZIO_HEADERS.map(function (h, i) {
    return { columnIndex: i, columnName: h, columnType: 'TEXT' };
  });
  try {
    Sheets.Spreadsheets.batchUpdate(
      { requests: [{ addTable: { table: { name: SERVIZIO_SHEET, range: range, columnProperties: colProps } } }] }, ssId);
  } catch (e) {
    Sheets.Spreadsheets.batchUpdate(
      { requests: [{ addTable: { table: { name: SERVIZIO_SHEET, range: range } } }] }, ssId);
  }
}

// Ricrea da zero la Tabella "SERVIZIO" dimensionata sui dati attuali del foglio.
function _ensureServizioTable_(ss, sh) {
  _deleteTablesOnSheet_(ss, sh);
  _createServizioTable_(ss, sh, Math.max(sh.getLastRow() - 1, 0));
}

function upImpegni_(mat, fromISO, toISO) {
  const body = {
    matricolaDocente: String(mat).trim(), provvisorio: false,
    dataInizio: fromISO, dataFine: toISO, clienteId: UP_CID_, pianificazioneTemplate: false
  };
  const resp = UrlFetchApp.fetch(UP_BASE_ + '/Impegni/impegniCalendarioPubblicoDocente', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
    muteHttpExceptions: true, headers: { 'Accept': 'application/json' }
  });
  const code = resp.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('UP HTTP ' + code);
  const json = JSON.parse(resp.getContentText());
  return Array.isArray(json) ? json : [];
}

function upGetUtente_(mat) {
  try {
    const resp = UrlFetchApp.fetch(UP_BASE_ + '/Utenti/getUtenteByMatricola?matricola=' + encodeURIComponent(mat),
      { muteHttpExceptions: true, headers: { 'Accept': 'application/json' } });
    if (resp.getResponseCode() !== 200) return null;
    return JSON.parse(resp.getContentText());
  } catch (e) { return null; }
}

function isFisicaEvent_(e) {
  const aule = (e && e.aule) || [];
  for (let i = 0; i < aule.length; i++) {
    const a = aule[i] || {};
    const c = String(a.codice || '').toUpperCase(), d = String(a.descrizione || '').toUpperCase();
    if (c.indexOf('FIB') === 0 || c.indexOf('FIS') === 0 || d.indexOf('FIB') === 0 || d.indexOf('FIS') === 0) return true;
    if (String((a.edificio || {}).descrizione || '').toUpperCase().indexOf('FIBONACCI') !== -1) return true;
  }
  return false;
}

function _meseWindowISO_(year, monthIdx0) {  // finestra = mese intero (UTC), monthIdx0 0-based
  const start = new Date(Date.UTC(year, monthIdx0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(monthIdx0 === 11 ? year + 1 : year, (monthIdx0 + 1) % 12, 1, 0, 0, 0));
  return { from: start.toISOString(), to: end.toISOString() };
}

// Voce di menu: ricostruisce la Tabella "SERVIZIO" da UP per le matricole già presenti.
function recuperaImpegniEsterniDaUP() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SERVIZIO_SHEET);
  if (!sh) {
    ui.alert('SERVIZIO',
      'Manca la tabella "SERVIZIO". Usa prima "🌐 Prepara tabella SERVIZIO" e ' +
      'incolla almeno la colonna Matricola dei docenti.', ui.ButtonSet.OK);
    return;
  }
  const lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), SERVIZIO_HEADERS.length);
  if (lastRow < 2) { ui.alert('SERVIZIO', 'Nessuna matricola nella tabella: incolla prima i dati.', ui.ButtonSet.OK); return; }
  const vals = sh.getRange(1, 1, lastRow, lastCol).getValues();
  // Colonne FISSE della tabella SERVIZIO: A=Cognome, B=Nome, C=Matricola. Le MATRICOLE
  // UNICHE si leggono dalla colonna C (riga 1 = header → si parte dalla riga 2).
  const ci = 0, ni = 1, mi = 2;
  const info = {};
  for (let r = 1; r < vals.length; r++) {
    const m = String(vals[r][mi] || '').trim();
    if (!m) continue;
    if (!info[m]) info[m] = { cog: String(vals[r][ci] || '').trim(), nom: String(vals[r][ni] || '').trim() };
  }
  const mats = Object.keys(info);   // matricole UNICHE citate in colonna C
  if (!mats.length) { ui.alert('SERVIZIO', 'Nessuna matricola in colonna C (Matricola).', ui.ButtonSet.OK); return; }

  // 1) prompt AA
  const now = new Date();
  const aaDef = (now.getMonth() + 1) >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const resp = ui.prompt('Recupera impegni da University Planner',
    mats.length + ' docenti.\nAnno accademico di indagine (S1=ott AA, S2=apr AA+1).\nDefault ' +
    aaDef + ' (= AA ' + aaDef + '/' + (aaDef + 1) + '):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const txt = String(resp.getResponseText() || '').trim();
  const aa = txt ? parseInt(txt, 10) : aaDef;
  if (!aa || aa < 2000 || aa > 2100) { ui.alert('SERVIZIO', 'AA non valido.', ui.ButtonSet.OK); return; }

  // 2) semestre di QUESTO gsheet (dai nomi dei tab) → finestra: S1 = settimane di OTTOBRE,
  //    altrimenti S2 = settimane di APRILE (AA+1). Il mese intero copre tutte le settimane,
  //    e il join dedup (sotto) riduce le occorrenze ripetute al singolo impegno settimanale.
  let sem = 'S1';
  try { sem = String(detectAuleConfigFor_(ss).prefix || 'S1').toUpperCase(); } catch (e) {}
  const win = (sem.indexOf('S2') === 0) ? _meseWindowISO_(aa + 1, 3) : _meseWindowISO_(aa, 9);

  // 3) fetch + filtra fuori-Fisica per ogni matricola
  const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven'];
  const seen = {}, rows = [];
  let errors = 0;
  mats.forEach(mat => {
    try {
      if (!info[mat].cog) {  // incollate solo le matricole → recupera Cognome/Nome da UP
        const u = upGetUtente_(mat);
        if (u) { info[mat].cog = String(u.cognome || '').trim(); info[mat].nom = String(u.nome || '').trim(); }
      }
      const events = upImpegni_(mat, win.from, win.to);
      events.forEach(e => {
        if (e.indisponibilita === true || !e.dataInizio || !e.dataFine) return;
        if (isFisicaEvent_(e)) return;
        const di = new Date(e.dataInizio), df = new Date(e.dataFine);
        if (!(di < df)) return;
        const dow = parseInt(Utilities.formatDate(di, 'Europe/Rome', 'u'), 10); // 1=Lun..7=Dom
        if (dow < 1 || dow > 5) return;
        const aula = (e.aule || [{}])[0] || {};
        const row = [info[mat].cog, info[mat].nom, mat, DOW[dow - 1],
          Utilities.formatDate(di, 'Europe/Rome', 'HH:mm'),
          Utilities.formatDate(df, 'Europe/Rome', 'HH:mm'),
          String(e.codiceAttivita || e.nome || '').trim(),
          String(aula.codice || aula.descrizione || '').trim()];
        const k = row.join('|');
        if (!seen[k]) { seen[k] = 1; rows.push(row); }
      });
      Utilities.sleep(150);
    } catch (err) { errors++; }
  });

  // ordina per cognome, giorno, ora
  const ord = { Lun: 0, Mar: 1, Mer: 2, Gio: 3, Ven: 4 };
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || (ord[a[3]] - ord[b[3]]) || String(a[4]).localeCompare(String(b[4])));

  // 4) riscrivi la Tabella SERVIZIO: elimina la Tabella, pulisci, scrivi come TESTO (per non
  //    perdere zeri iniziali matricola/orari), ELIMINA le righe in eccesso (niente righe libere
  //    in fondo), poi ricrea la Tabella dimensionata esattamente su header + dati.
  const cols = SERVIZIO_HEADERS.length;
  let tableErr = '';
  try { _deleteTablesOnSheet_(ss, sh); } catch (e) { tableErr = String(e); }
  sh.clearContents();
  sh.getRange(1, 1, 1 + rows.length, cols).setNumberFormat('@');
  sh.getRange(1, 1, 1, cols).setValues([SERVIZIO_HEADERS]);
  if (rows.length) sh.getRange(2, 1, rows.length, cols).setValues(rows);
  sh.setFrozenRows(1);
  // niente righe vuote in fondo: tieni solo header + dati (la Tabella richiede >=1 riga corpo)
  SpreadsheetApp.flush();
  try {
    const keep = 1 + Math.max(rows.length, 1);
    const extra = sh.getMaxRows() - keep;
    if (extra > 0) sh.deleteRows(keep + 1, extra);
  } catch (e) {}
  if (!tableErr) { try { _createServizioTable_(ss, sh, rows.length); } catch (e) { tableErr = String(e); } }
  SpreadsheetApp.flush();

  ui.alert('Recupero completato',
    'AA ' + aa + '/' + (aa + 1) + ' · semestre ' + sem + ': ' + mats.length + ' docenti, ' +
    rows.length + ' impegni esterni' + (errors ? ' (' + errors + ' errori di rete)' : '') +
    (tableErr ? '\n\n⚠️ Tabella nativa non creata: ' + tableErr : '') + '.\n\n' +
    'Ora fai "Carica / Pubblica" nel Web Calendar per applicarli.', ui.ButtonSet.OK);
}
