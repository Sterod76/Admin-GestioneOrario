// Recupero impegni FUORI dipartimento da University Planner (Cineca), dentro l'orario.
// Endpoint PUBBLICO (no auth): POST impegniCalendarioPubblicoDocente, filtra per matricola
// col clienteId UniPi. Semestre = finestra date (S1=ottobre AA, S2=aprile AA+1). Filtra le
// aule Fisica (FIB/FIS/Fibonacci). Le MATRICOLE si leggono dalla colonna "Matricola" del
// foglio "ImpegniEsterni" (popolata la prima volta dai tool in impegni/), poi questa voce di
// menu RIAGGIORNA il foglio da UP per l'AA scelto. Richiede lo scope script.external_request.

const UP_BASE_ = 'https://unipi.prod.up.cineca.it/api';
const UP_CID_ = '628de8b9b63679f193b87046'; // UniPi

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

// Voce di menu: ricostruisce il foglio "ImpegniEsterni" da UP per le matricole già presenti.
function recuperaImpegniEsterniDaUP() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('ImpegniEsterni');
  if (!sh) {
    ui.alert('Impegni esterni',
      'Manca il foglio "ImpegniEsterni". Usa prima "🌐 Prepara foglio Impegni Esterni" e ' +
      'incolla almeno la colonna Matricola dei docenti.', ui.ButtonSet.OK);
    return;
  }
  const HEADERS = ['Cognome', 'Nome', 'Matricola', 'Giorno', 'Inizio', 'Fine', 'Corso', 'Aula'];
  const lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), HEADERS.length);
  if (lastRow < 2) { ui.alert('Impegni esterni', 'Nessuna matricola nel foglio: incolla prima i dati.', ui.ButtonSet.OK); return; }
  const vals = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const hdr = vals[0].map(h => String(h || '').trim().toLowerCase());
  const mi = hdr.indexOf('matricola'), ci = hdr.indexOf('cognome'), ni = hdr.indexOf('nome');
  if (mi < 0) { ui.alert('Impegni esterni', 'Colonna "Matricola" non trovata nel foglio.', ui.ButtonSet.OK); return; }

  // matricola → (cognome, nome) dai dati già presenti (no UP se già noti)
  const info = {};
  for (let r = 1; r < vals.length; r++) {
    const m = String(vals[r][mi] || '').trim();
    if (!m) continue;
    if (!info[m]) info[m] = { cog: ci >= 0 ? String(vals[r][ci] || '').trim() : '', nom: ni >= 0 ? String(vals[r][ni] || '').trim() : '' };
  }
  const mats = Object.keys(info);
  if (!mats.length) { ui.alert('Impegni esterni', 'Nessuna matricola valida nel foglio.', ui.ButtonSet.OK); return; }

  // 1) prompt AA
  const now = new Date();
  const aaDef = (now.getMonth() + 1) >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const resp = ui.prompt('Recupera impegni da University Planner',
    mats.length + ' docenti.\nAnno accademico di indagine (S1=ott AA, S2=apr AA+1).\nDefault ' +
    aaDef + ' (= AA ' + aaDef + '/' + (aaDef + 1) + '):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const txt = String(resp.getResponseText() || '').trim();
  const aa = txt ? parseInt(txt, 10) : aaDef;
  if (!aa || aa < 2000 || aa > 2100) { ui.alert('Impegni esterni', 'AA non valido.', ui.ButtonSet.OK); return; }

  // 2) semestre di QUESTO gsheet → finestra (ottobre AA / aprile AA+1)
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

  // 4) riscrivi il foglio (header + dati)
  sh.clearContents();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#e8f0fe');
  if (rows.length) sh.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  sh.setFrozenRows(1);
  SpreadsheetApp.flush();

  ui.alert('Recupero completato',
    'AA ' + aa + '/' + (aa + 1) + ' · semestre ' + sem + ': ' + mats.length + ' docenti, ' +
    rows.length + ' impegni esterni' + (errors ? ' (' + errors + ' errori di rete)' : '') + '.\n\n' +
    'Ora fai "Carica / Pubblica" nel Web Calendar per applicarli.', ui.ButtonSet.OK);
}
