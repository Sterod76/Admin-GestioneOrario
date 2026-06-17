// ─────────────────────────────────────────────────────────────────────────────
// Costanti — solo EDIT_EMAILS è strettamente necessaria per il funzionamento.
// Lo snapshot ScriptProperty è una cache che accelera il page load (doGet).
// ─────────────────────────────────────────────────────────────────────────────

const PROP_CHUNK_SIZE = 4000;            // chars per chunk; safe sotto i 9KB byte limit
const SNAP_BUCKETS = ['LT', 'LM', 'PDS']; // nomi dei bucket snapshot

// ─────────────────────────────────────────────────────────────────────────────
// AUTH: whitelist editor letta dalla colonna C (riga 3 in giù) del foglio PdS.
// La cella C2 può essere un header descrittivo (es. "Editor abilitati").
// Una cella vuota non interrompe la lettura: filtra solo per valori con "@".
// ─────────────────────────────────────────────────────────────────────────────

const EDIT_EMAILS_SHEET = 'CONFIG';  // foglio di configurazione UI
const EDIT_EMAILS_COL   = 3;         // C
const VISIBILITY_PROP   = 'publicVisibility'; // 'published' (default) | 'draft'
const FEEDBACK_SHEET    = 'FEEDBACK';         // foglio segnalazioni utenti
const FEEDBACK_PROP     = 'feedbackEnabled';  // 'on' | 'off' (default off)
const EDIT_LOCK_PROP    = 'editLock';            // JSON {email, ts}: chi tiene l'EDIT
const EDIT_LOCK_TTL_MS  = 24 * 60 * 60 * 1000;  // lease 24h (il client la rinnova con heartbeat finché la scheda è aperta)

// Trova il foglio CONFIG in modo case-insensitive (CONFIG / Config / config).
function _findConfigSheet_(ss) {
  const target = String(EDIT_EMAILS_SHEET).toLowerCase();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === target) return sheets[i];
  }
  return null;
}

// Legge il foglio CONFIG a GRUPPI: nella colonna B etichette di sezione
// ("WebEditors", "WebAuditors", ...); nella colonna C, sotto ciascuna etichetta
// (stessa riga + righe successive con B vuota), le email del gruppo.
//   - WebEditors  → editano come prima (drag, Carica/Salva).
//   - WebAuditors → vedono tutti i tab ma in sola lettura (niente drag/Carica/Salva).
// Retro-compatibilità: se non c'è NESSUNA etichetta di gruppo, tutte le email in
// colonna C valgono come editor (vecchio formato).
// Parser PURO (testabile): vals = righe [colB, colC]. Ritorna {editors, auditors}.
function parseRoles_(vals) {
  const res = { editors: [], auditors: [] };
  let group = null, sawLabel = false;
  const allC = [];
  for (let i = 0; i < (vals || []).length; i++) {
    const label = String(vals[i][0] || '').trim().toLowerCase().replace(/\s+/g, '');
    if (label) {
      if (label.indexOf('webeditor') !== -1) { group = 'editors'; sawLabel = true; }
      else if (label.indexOf('webaudit') !== -1 || label.indexOf('webrevisor') !== -1 || label.indexOf('webreview') !== -1) { group = 'auditors'; sawLabel = true; }
      else group = null; // es. "WebCalendar" o altre sezioni
    }
    const email = String(vals[i][1] || '').trim().toLowerCase();
    if (email.indexOf('@') > 0) {
      allC.push(email);
      if (group) res[group].push(email);
    }
  }
  if (!sawLabel) res.editors = allC; // vecchio formato: tutta la colonna C = editor
  return res;
}

function getRoles_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = _findConfigSheet_(ss);
    if (!sh) return { editors: [], auditors: [] };
    const lastRow = sh.getLastRow();
    if (lastRow < 1) return { editors: [], auditors: [] };
    return parseRoles_(sh.getRange(1, 2, lastRow, 2).getValues()); // colonne B e C
  } catch (e) {
    Logger.log('getRoles_ errore: ' + e);
    return { editors: [], auditors: [] };
  }
}

function getEditorEmails_() { return getRoles_().editors; }

function isEditor_(email) {
  if (!email) return false;
  return getRoles_().editors.indexOf(String(email).trim().toLowerCase()) !== -1;
}
function isAuditor_(email) {
  if (!email) return false;
  return getRoles_().auditors.indexOf(String(email).trim().toLowerCase()) !== -1;
}
// Ruolo dell'utente: 'editor' | 'auditor' | 'public'.
function userRole_(email) {
  const r = getRoles_();
  const e = String(email || '').trim().toLowerCase();
  if (r.editors.indexOf(e) !== -1) return 'editor';
  if (r.auditors.indexOf(e) !== -1) return 'auditor';
  return 'public';
}


function currentEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Visibilità pubblica del Web Calendar (menu 🕒 Orario → 👁️ Visibilità).
//   'published' → l'utente generico vede il calendario;
//   'draft'     → l'utente generico vede solo "Calendario in fase di redazione".
// Editor e auditor vedono SEMPRE (devono poter lavorare).
// ─────────────────────────────────────────────────────────────────────────────
function getVisibility_() {
  try {
    return PropertiesService.getScriptProperties().getProperty(VISIBILITY_PROP) === 'draft' ? 'draft' : 'published';
  } catch (e) { return 'published'; }
}
// Regola pura (testabile): l'utente generico è bloccato solo se draft.
function _isDraftBlocked_(role, visibility) {
  return role === 'public' && visibility === 'draft';
}
function setVisibilityPublished() { _setVisibility_('published'); }
function setVisibilityDraft() { _setVisibility_('draft'); }
function _setVisibility_(v) {
  try { PropertiesService.getScriptProperties().setProperty(VISIBILITY_PROP, v); } catch (e) {}
  try { onOpen(); } catch (e) {} // rinfresca le spunte nel menu
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      v === 'draft'
        ? 'IN REDAZIONE: l\'utente generico vede solo l\'avviso. Editor/auditor vedono tutto.'
        : 'PUBBLICATO: il Web Calendar è visibile agli utenti UniPi.',
      'Visibilità Web Calendar', 6);
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Feedback utenti (foglio FEEDBACK). Menu 🕒 Orario → 💬 Feedback (attivo/non
// attivo) abilita il tasto nella web app. Colonne: A Timestamp · B email ·
// C Feedback · D Risposta · E Stato · F Commenti. L'utente vede/edita solo i
// PROPRI feedback (filtro per email). Inserimento/aggiornamento → Stato = PENDING.
// ─────────────────────────────────────────────────────────────────────────────
function getFeedbackEnabled_() {
  try { return PropertiesService.getScriptProperties().getProperty(FEEDBACK_PROP) === 'on' ? 'on' : 'off'; }
  catch (e) { return 'off'; }
}
function setFeedbackOn() { _setFeedback_('on'); }
function setFeedbackOff() { _setFeedback_('off'); }
function _setFeedback_(v) {
  try { PropertiesService.getScriptProperties().setProperty(FEEDBACK_PROP, v); } catch (e) {}
  try { onOpen(); } catch (e) {} // rinfresca le spunte nel menu
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      v === 'on' ? 'Feedback ATTIVO: il tasto è visibile nella web app.' : 'Feedback NON ATTIVO: tasto nascosto.',
      'Feedback', 5);
  } catch (e) {}
}

function _fmtTs_(v) {
  if (!v) return '';
  try {
    if (Object.prototype.toString.call(v) === '[object Date]') {
      return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Europe/Rome', 'dd/MM/yyyy HH:mm');
    }
  } catch (e) {}
  return String(v);
}
// Filtro PURO (testabile): righe FEEDBACK dell'email data, più recenti in alto.
function _feedbackRows_(vals, email) {
  const e = String(email || '').trim().toLowerCase();
  const out = [];
  if (!e) return out;
  for (let i = 0; i < (vals || []).length; i++) {
    const r = vals[i] || [];
    if (String(r[1] || '').trim().toLowerCase() !== e) continue;
    // Commenti (col F) NON inclusi: sono note riservate agli amministratori.
    out.push({ row: i + 2, timestamp: r[0], feedback: String(r[2] || ''), risposta: String(r[3] || ''), stato: String(r[4] || '') });
  }
  out.reverse(); // più recenti in alto
  return out;
}
function _feedbackForEmail_(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(FEEDBACK_SHEET);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = _feedbackRows_(sh.getRange(2, 1, last - 1, 6).getValues(), email);
  rows.forEach(r => { r.timestamp = _fmtTs_(r.timestamp); });
  return rows;
}
function rpcFeedbackList() {
  return JSON.stringify(_feedbackForEmail_(currentEmail_()));
}
function rpcFeedbackSubmit(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Il feedback è vuoto.');
  const email = String(currentEmail_() || '').trim();
  if (!email) throw new Error('Utente non identificato: accedi con un account UniPi.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(FEEDBACK_SHEET);
  if (!sh) throw new Error('Foglio FEEDBACK non trovato.');
  const lock = LockService.getDocumentLock();
  try { lock.waitLock(15000); } catch (e) {}
  try {
    const row = Math.max(sh.getLastRow() + 1, 2);
    // A Timestamp · B email · C Feedback · D Risposta(vuoto) · E Stato=Aperta · F Commenti(vuoto)
    sh.getRange(row, 1, 1, 5).setValues([[new Date(), email, t, '', 'Aperta']]);
  } finally { try { lock.releaseLock(); } catch (e) {} }
  return rpcFeedbackList();
}
function rpcFeedbackUpdate(row, text) {
  const r = parseInt(row, 10);
  const t = String(text || '').trim();
  if (!(r >= 2)) throw new Error('Riga non valida.');
  if (!t) throw new Error('Il feedback è vuoto.');
  const email = String(currentEmail_() || '').trim().toLowerCase();
  if (!email) throw new Error('Utente non identificato.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(FEEDBACK_SHEET);
  if (!sh) throw new Error('Foglio FEEDBACK non trovato.');
  const lock = LockService.getDocumentLock();
  try { lock.waitLock(15000); } catch (e) {}
  try {
    if (r > sh.getLastRow()) throw new Error('Riga inesistente.');
    const owner = String(sh.getRange(r, 2).getValue() || '').trim().toLowerCase();
    if (owner !== email) throw new Error('Non puoi modificare questo feedback.');
    sh.getRange(r, 1).setValue(new Date()); // A Timestamp aggiornato
    sh.getRange(r, 3).setValue(t);          // C Feedback
    sh.getRange(r, 5).setValue('Aperta');   // E Stato
  } finally { try { lock.releaseLock(); } catch (e) {} }
  return rpcFeedbackList();
}
function rpcFeedbackDelete(row) {
  const r = parseInt(row, 10);
  if (!(r >= 2)) throw new Error('Riga non valida.');
  const email = String(currentEmail_() || '').trim().toLowerCase();
  if (!email) throw new Error('Utente non identificato.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(FEEDBACK_SHEET);
  if (!sh) throw new Error('Foglio FEEDBACK non trovato.');
  const lock = LockService.getDocumentLock();
  try { lock.waitLock(15000); } catch (e) {}
  try {
    if (r > sh.getLastRow()) throw new Error('Riga inesistente.');
    const owner = String(sh.getRange(r, 2).getValue() || '').trim().toLowerCase();
    if (owner !== email) throw new Error('Non puoi eliminare questo feedback.');
    sh.deleteRow(r);
  } finally { try { lock.releaseLock(); } catch (e) {} }
  return rpcFeedbackList();
}

// ─────────────────────────────────────────────────────────────────────────────
// Lock EDIT: un solo editor per volta. Lo stato sta in ScriptProperty 'editLock'
// = JSON {email, ts}. Lease di EDIT_LOCK_TTL_MS rinnovato dal client (heartbeat);
// se scade (tab chiuso senza rilascio) il lock è libero. Menu "Sconnetti editor"
// forza il rilascio. Default: nessuno edita → gli editor partono in VIEW.
// ─────────────────────────────────────────────────────────────────────────────
// PURA (testabile): ritorna l'email del detentore valido, o '' se assente/scaduto.
function _parseEditLock_(raw, nowMs, ttlMs) {
  if (!raw) return '';
  let o; try { o = JSON.parse(raw); } catch (e) { return ''; }
  if (!o || !o.email) return '';
  if (nowMs - (Number(o.ts) || 0) > ttlMs) return ''; // lease scaduto
  return String(o.email).trim().toLowerCase();
}
function _editHolder_() {
  try {
    return _parseEditLock_(PropertiesService.getScriptProperties().getProperty(EDIT_LOCK_PROP), Date.now(), EDIT_LOCK_TTL_MS);
  } catch (e) { return ''; }
}
function rpcEditStatus() {
  const me = String(currentEmail_() || '').trim().toLowerCase();
  const holder = _editHolder_();
  return JSON.stringify({ holder: holder, me: me, mine: !!holder && holder === me, canEdit: isEditor_(me) });
}
function rpcAcquireEdit() {
  const me = String(currentEmail_() || '').trim().toLowerCase();
  if (!isEditor_(me)) throw new Error('Non sei un editor.');
  const props = PropertiesService.getScriptProperties();
  const lk = LockService.getScriptLock();
  try { lk.waitLock(10000); } catch (e) {}
  try {
    const holder = _parseEditLock_(props.getProperty(EDIT_LOCK_PROP), Date.now(), EDIT_LOCK_TTL_MS);
    if (holder && holder !== me) return JSON.stringify({ ok: false, holder: holder });
    props.setProperty(EDIT_LOCK_PROP, JSON.stringify({ email: me, ts: Date.now() }));
    return JSON.stringify({ ok: true, holder: me });
  } finally { try { lk.releaseLock(); } catch (e) {} }
}
function rpcRenewEdit() {
  const me = String(currentEmail_() || '').trim().toLowerCase();
  const props = PropertiesService.getScriptProperties();
  const holder = _parseEditLock_(props.getProperty(EDIT_LOCK_PROP), Date.now(), EDIT_LOCK_TTL_MS);
  if (me && holder === me) props.setProperty(EDIT_LOCK_PROP, JSON.stringify({ email: me, ts: Date.now() }));
  return JSON.stringify({ ok: holder === me });
}
function rpcReleaseEdit() {
  const me = String(currentEmail_() || '').trim().toLowerCase();
  const props = PropertiesService.getScriptProperties();
  const holder = _parseEditLock_(props.getProperty(EDIT_LOCK_PROP), Date.now(), EDIT_LOCK_TTL_MS);
  if (holder === me) props.deleteProperty(EDIT_LOCK_PROP);
  return JSON.stringify({ ok: true, holder: _editHolder_() });
}
// Menu 🕒 Orario → 🔓 Sconnetti editor: forza il rilascio del lock (per sbloccare
// un EDIT rimasto appeso, es. tab chiuso senza salvare).
function forceReleaseEdit() {
  const ui = SpreadsheetApp.getUi();
  let prev = '';
  try { prev = _editHolder_(); } catch (e) {}
  try { PropertiesService.getScriptProperties().deleteProperty(EDIT_LOCK_PROP); } catch (e) {}
  ui.alert('Sconnetti editor',
    prev ? ('Edit liberato (era di ' + prev + ').\nOra chiunque può entrare in EDIT.')
         : 'Nessun editor attivo: l\'edit era già libero.',
    ui.ButtonSet.OK);
}

// ─────────────────────────────────────────────────────────────────────────────
// doGet: legge lo snapshot dalle ScriptProperties (3 bucket LT/LM/PDS).
// Se non esiste, fa un bootstrap one-shot leggendo il foglio.
// ─────────────────────────────────────────────────────────────────────────────

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  let userEmail = '';
  try { userEmail = Session.getActiveUser().getEmail() || ''; } catch (err) {}
  const role = userRole_(userEmail); // 'editor' | 'auditor' | 'public'
  const vis = getVisibility_();
  const draft = _isDraftBlocked_(role, vis); // utente generico + "in redazione"

  let data = _readSnapshot_();
  if (!data) {
    // Primo accesso o snapshot corrotto: bootstrap dal foglio.
    data = getOrarioData();
    data.pendingEdits = [];
    _writeSnapshot_(data);
  } else {
    data.pendingEdits = [];
  }
  // In redazione: all'utente generico arriva l'header (titolo + controlli disattivati)
  // ma NON i contenuti dell'orario → svuoto sessioni/fogli/PdS/corsi (niente fuga dati).
  if (draft) data = Object.assign({}, data, { sessions: [], rawSheets: {}, pds: [], courses: [], impegniEsterni: [] });

  const json = JSON.stringify(data);
  if (action === 'data') {
    return ContentService.createTextOutput(draft ? '{}' : json).setMimeType(ContentService.MimeType.JSON);
  }
  const tpl = HtmlService.createTemplateFromFile('index');
  tpl.bootstrap = json;
  const semester = data.semester || 'S1';
  // Transizione EDIT/VIEW via ?m=edit|view (navigazione SINCRONA dal toggle): il
  // lock si acquisisce/rilascia QUI, così il reload non dipende da una callback
  // asincrona (che perderebbe l'attivazione utente → top-navigation bloccata).
  const meLc = String(userEmail || '').trim().toLowerCase();
  const mParam = (e && e.parameter && e.parameter.m) || '';
  let editDenied = false;
  if (isEditor_(userEmail)) {
    if (mParam === 'edit') {
      let rr = {}; try { rr = JSON.parse(rpcAcquireEdit()); } catch (er) {}
      if (!rr.ok) editDenied = true; // il lock è di un altro
    } else if (mParam === 'view') {
      try { rpcReleaseEdit(); } catch (er) {}
    }
  }
  const editHolder = _editHolder_();
  // EDIT attivo SOLO se l'utente è editor E tiene il lock (default: VIEW).
  tpl.editMode = isEditor_(userEmail) && !!editHolder && editHolder === meLc;
  tpl.role = role;
  tpl.editHolder = editHolder; // email di chi sta editando (per lo status), '' se nessuno
  tpl.editDenied = editDenied;
  tpl.draft = draft;
  // In redazione il feedback è automaticamente chiuso (per tutti i ruoli).
  tpl.feedback = (getFeedbackEnabled_() === 'on') && (vis === 'published');
  tpl.userEmail = userEmail;
  // URL pubblico iniettato nel client: dalla ScriptProperty 'webappUrl' (impostata da
  // "Vai al Web Calendar" leggendo CONFIG!C2 = l'URL VERO del deployment). Fallback a
  // getService().getUrl(), ma è solo un ripiego: restituisce un URL HEAD/legacy
  // diverso dal deployment (formato …/a/unipi.it/macros/s/…/exec), spesso non valido.
  let webAppUrl = '';
  try { webAppUrl = PropertiesService.getScriptProperties().getProperty('webappUrl') || ''; } catch (err) {}
  if (!webAppUrl) { try { webAppUrl = ScriptApp.getService().getUrl() || ''; } catch (err) {} }
  tpl.webAppUrl = webAppUrl;
  tpl.diag = JSON.stringify({
    activeEmail: userEmail,
    editEmails: getEditorEmails_(),
    isEditorResult: tpl.editMode,
    ts: new Date().toISOString()
  });
  return tpl.evaluate()
    .setTitle(data.spreadsheetName || ('Orario ' + semester)) // scheda Chrome = nome del gsheet
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
  const me = String(currentEmail_() || '').trim().toLowerCase();
  if (!isEditor_(me)) throw new Error('Non autorizzato.');
  // Deve tenere ANCORA il lock EDIT: se è stato forzato lo sblocco (o l'ha preso un
  // altro), il salvataggio è rifiutato per non sovrascrivere il lavoro altrui.
  if (_editHolder_() !== me) {
    throw new Error('Non sei più l\'editor attivo: qualcuno ha forzato lo sblocco (o ha preso l\'EDIT). Ricarica la pagina e riapplica le modifiche non salvate.');
  }
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) throw new Error('Lock fallito (altra scrittura in corso).');
  try {
    const all = (payload && Array.isArray(payload.pendingEdits)) ? payload.pendingEdits : [];
    const courseEdits = all.filter(e => !e.unavail);
    const unavailEdits = all.filter(e => e.unavail);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (courseEdits.length) applyEditsBatch_(ss, courseEdits);
    // Edit NON DISPONIBILE → passati a tabellaAule che li scrive su SxAULE.
    // op: 'create' (add), 'delete' (remove orig), 'move' (remove orig + add new).
    const extraUnavail = [];
    const removedUnavail = [];
    unavailEdits.forEach(e => {
      if (e.op === 'delete') {
        const o = e.orig || e;
        removedUnavail.push({ room: o.room, day: o.day, start: o.start });
      } else if (e.op === 'move') {
        if (e.orig) removedUnavail.push({ room: e.orig.room, day: e.orig.day, start: e.orig.start });
        extraUnavail.push({ room: e.room, day: e.day, start: e.start, end: e.end, text: e.text || 'NON DISPONIBILE' });
      } else { // create
        extraUnavail.push({ room: e.room, day: e.day, start: e.start, end: e.end, text: e.text || 'NON DISPONIBILE' });
      }
    });
    // Rigenera SxAULE (non-interactive: throw su conflitti, auto-accept new rooms)
    tabellaAule({ ss: ss, interactive: false, extraUnavail: extraUnavail, removedUnavail: removedUnavail });
    // Re-read foglio + scrivi 3 bucket
    const data = getOrarioData();
    data.pendingEdits = [];
    _writeSnapshot_(data);
    return JSON.stringify(data);
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet menu: 📅 Vai al Web Calendar
//   1) Se non c'è un deployment Web app (/exec) → avvisa che va creato dall'editor.
//   2) Se c'è → pubblica (rigenera SxAULE + scrive i 3 bucket dello snapshot), salva
//      l'URL del deployment più recente in CONFIG!C2 e apre il sito.
// NIENTE Apps Script API: l'URL arriva da ScriptApp.getService().getUrl().
// ─────────────────────────────────────────────────────────────────────────────

function vaiAlWebCalendar() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = _findConfigSheet_(ss);
  const url = sh ? String(sh.getRange('C2').getValue() || '').trim() : '';

  // 1. L'URL del deployment è considerato valido SOLO se c'è in CONFIG!C2.
  //    ScriptApp.getService().getUrl() NON è affidabile dal menu: restituisce un URL
  //    /exec anche SENZA un deployment reale (→ pagina fasulla). C2 invece viene
  //    riempita da doGet quando il sito /exec reale viene aperto, o a mano.
  if (!/^https:\/\/script\.google\.com\/.*\/exec\b/.test(url)) {
    ui.alert('Web App non ancora pubblicata',
      'In CONFIG!C2 non c\'è un URL /exec valido: il deployment non risulta attivo.\n\n' +
      'Per attivarlo (una volta sola):\n' +
      '1. Estensioni → Apps Script → Deploy → New deployment → ⚙ Web app\n' +
      '   Execute as: Me · Who has access: Anyone within unipi.it → Deploy\n' +
      '2. Copia il "Web app URL" del deployment (formato\n' +
      '   …/a/macros/unipi.it/s/…/exec) dal dialog e INCOLLALO in CONFIG!C2.\n' +
      '3. Poi rilancia "Vai al Web Calendar".', ui.ButtonSet.OK);
    return;
  }

  // 2. Memorizza l'URL VERO (da C2) per iniettarlo nel client a ogni doGet.
  try { PropertiesService.getScriptProperties().setProperty('webappUrl', url); } catch (e) {}
  // Pubblica: rigenera SxAULE + riscrive lo snapshot (3 bucket).
  tabellaAule({ ss: ss, interactive: true });
  const data = getOrarioData();
  data.pendingEdits = [];
  _writeSnapshot_(data);

  // 3. Dialog con riepilogo + link cliccabile (niente apertura automatica).
  const safeUrl = String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:13px;padding:6px 4px">' +
    '<p style="margin:0 0 8px">✅ Web Calendar pubblicato (' + data.sessions.length + ' sessioni, ' +
    (data.rooms || []).length + ' aule).</p>' +
    '<a href="' + safeUrl + '" target="_blank" rel="noopener" ' +
    'style="display:inline-block;margin-top:6px;padding:9px 16px;background:#1a73e8;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">↗ Apri il Web Calendar</a>' +
    '</div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(440).setHeight(170), '📅 Vai al Web Calendar');
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
    // DELETE: rimuove lo slot dalla cella sorgente, nessuna aggiunta.
    if (e.deleted) {
      ensure(sheet, row, sCol).removals.push(e.src.idx);
      return;
    }
    const tCol = parseInt(e.target.col, 10);
    const slot = { start: e.target.start, end: e.target.end, room: String(e.target.room).trim() };
    // CREATE: aggiunge un nuovo slot alla cella target (nessuna sorgente da togliere).
    if (e.created) {
      ensure(sheet, row, tCol).additions.push(slot);
      return;
    }
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
      coexam: data.coexam || { pairs: {}, perCode: {}, codes: [], count: 0 },
      equiv: data.equiv || {},
      spreadsheetName: data.spreadsheetName || '',
      rawSheets: data.rawSheets || {},
      courses: data.courses || [],
      rooms: data.rooms || [],
      roomSubtitles: data.roomSubtitles || {},
      unavail: data.unavail || [],
      impegniEsterni: data.impegniEsterni || [],
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
    spreadsheetName: PDS.spreadsheetName || '',
    rawSheets: PDS.rawSheets || {},
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
    coexam: PDS.coexam || { pairs: {}, perCode: {}, codes: [], count: 0 },
    equiv: PDS.equiv || {},
    courses: PDS.courses || [],
    vincoloColors: PDS.vincoloColors || {},
    ownerEmail: PDS.ownerEmail || '',
    sessions: [].concat(LT.sessions || [], LM.sessions || []),
    unavail: PDS.unavail || [],
    impegniEsterni: PDS.impegniEsterni || [],
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
// vaiAlWebCalendar. È l'unica funzione che apre lo Spreadsheet.
// ─────────────────────────────────────────────────────────────────────────────

// Legge la tabella "SERVIZIO" (impegni di docenza FUORI dal dipartimento, da
// University Planner). Per nome header (robusto all'ordine): Cognome, Nome, Matricola,
// Giorno, Inizio, Fine, Corso, Aula. Ritorna [{cognome, nome, day(0..5), start, end,
// corso, aula}]. Foglio assente o vuoto → []. Vedi tool in impegni/.
function readImpegniEsterni_(ss) {
  const sh = ss.getSheetByName('SERVIZIO');
  if (!sh) return [];
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const hdr = values[0].map(h => String(h || '').trim().toLowerCase());
  // Accetta header sia italiani (foglio) sia inglesi (output diretto dei tool impegni/).
  const idx = function () {
    for (var i = 0; i < arguments.length; i++) { var j = hdr.indexOf(arguments[i]); if (j >= 0) return j; }
    return -1;
  };
  const ci = idx('cognome'), ni = idx('nome'), gi = idx('giorno', 'weekday'),
        si = idx('inizio', 'start_time', 'start'), fi = idx('fine', 'end_time', 'end'),
        coi = idx('corso', 'course'), ai = idx('aula');
  if (ci < 0 || gi < 0 || si < 0 || fi < 0) return [];
  const DAYMAP = { lun: 0, mar: 1, mer: 2, gio: 3, ven: 4, sab: 5 };
  const toMin = v => {
    if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
    const m = String(v || '').trim().match(/^(\d{1,2})[:.](\d{2})/);
    return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : null;
  };
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const cog = String(row[ci] || '').trim();
    if (!cog) continue;
    const day = DAYMAP[String(row[gi] || '').trim().toLowerCase().slice(0, 3)];
    const start = toMin(row[si]), end = toMin(row[fi]);
    if (day == null || start == null || end == null || end <= start) continue;
    out.push({
      cognome: cog,
      nome: ni >= 0 ? String(row[ni] || '').trim() : '',
      day: day, start: start, end: end,
      corso: coi >= 0 ? String(row[coi] || '').trim() : '',
      aula: ai >= 0 ? String(row[ai] || '').trim() : ''
    });
  }
  return out;
}

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

  // Classi di equivalenza dai gruppi di mutuazione: ogni codice MUTUANTE punta al
  // capostipite (parent). Mappa { codiceMembro(UPPER) → capostipite(UPPER) }, con
  // risoluzione transitiva (catene A→B→C). I codici non mutuati non compaiono
  // (canonico = sé stesso). Usata dal client per fondere E/N (versioni short/long,
  // corso condiviso LT↔LM, ecc.) in matrici co-esami, capienza e collisioni.
  const equivMap = {};
  Object.keys(mutuantiByParent).forEach(parent => {
    const P = String(parent).trim().toUpperCase();
    (mutuantiByParent[parent] || []).forEach(m => {
      const child = String(m.childCode).trim().toUpperCase();
      if (child && child !== P) equivMap[child] = P;
    });
  });
  Object.keys(equivMap).forEach(k => {
    let c = equivMap[k]; const seen = {};
    while (equivMap[c] && equivMap[c] !== c && !seen[c]) { seen[c] = 1; c = equivMap[c]; }
    equivMap[k] = c;
  });

  const sheetsInfo = [];
  const sessions = [];
  const courses = [];   // tutte le righe-corso (anche senza slot), per il popup "crea slot"
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
      // Colonna "docenti" (più nomi per riga): il PRIMO è il titolare, gli altri
      // co-docenti. titolareStr = stringa display (uniti da " / ").
      const docentiArr = parseDocenti_(titolare);
      const titolareStr = docentiArr.join(' / ');
      const annoDigits = String(anno == null ? '' : anno).replace(/[^0-9]/g, '');

      if (tipoStr) tipoSet[tipoStr] = true;
      if (groupStr) groupSet[groupStr] = true;
      docentiArr.forEach(d => { titolareSet[d] = true; });

      // Riga-corso (per il popup "crea slot"): una per ogni riga con codice.
      courses.push({
        sheet: sheetName,
        sheetColor: tabColor,
        row: HEADER_ROWS + 1 + rIdx,
        code: codeStr,
        name: nameStr,
        tipo: tipoStr,
        tipoLabel: tipoLabel(tipoStr),
        group: groupStr,
        anno: annoDigits,
        titolare: titolareStr,
        docenti: docentiArr,
        vincolo: vincoloKey,
        vincoloColor: vincoloBg
      });

      for (let d = 0; d < DAYS_LABELS.length; d++) {
        const cellText = row[CALENDAR_COLS_START - 1 + d];
        if (!cellText) continue;
        const parsed = extractSessions(String(cellText));
        const sheetRow = HEADER_ROWS + 1 + rIdx;
        const sheetCol = CALENDAR_COLS_START + d;
        parsed.list.forEach((s, sessionIdx) => {
          roomSet[s.room] = true;
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
            docenti: docentiArr,
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

  // Mirror grezzo dei fogli sorgente LT/LM, per i tab "S1LT"/"S1LM" (riproducono
  // il contenuto esatto del gsheet). getDisplayValues = stringhe come visualizzate.
  const rawSheets = {};
  sources.forEach(sheet => {
    const nm = sheet.getName();
    if (!/LT$/i.test(nm) && !/LM$/i.test(nm)) return;
    const lr = sheet.getLastRow();
    if (lr < 1) return;
    const grid = sheet.getRange(1, 1, lr, ROW_DATA_LAST_COL).getDisplayValues();
    rawSheets[nm] = {
      name: nm,
      color: readTabColor(sheet) || '#444444',
      headerRows: HEADER_ROWS,
      firstRow: HEADER_ROWS + 1,
      calStart: CALENDAR_COLS_START,
      calEnd: CALENDAR_COLS_END,
      grid: grid
    };
  });

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
    spreadsheetName: ss.getName(),
    rawSheets,
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
    coexam: readCoexamMatrix_(ss),
    equiv: equivMap,
    vincoloColors: VINCOLO_FALLBACK_COLORS,
    ownerEmail,
    sessions,
    courses,
    unavail,
    impegniEsterni: readImpegniEsterni_(ss),
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
