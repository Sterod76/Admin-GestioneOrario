function onOpen() {
  const ui = SpreadsheetApp.getUi();

  const tabelle = ui.createMenu('🛠️ Gestione tabelle')
    .addItem('✨ Normalizza celle calendario', 'fixCalendarEntries')
    .addItem('👤 Normalizza docenti (colonna J)', 'normalizzaDocenti')
    .addItem('🔄 Ricarica formato tabella', 'reloadTableFormat')
    .addItem('💾 Salva formato tabella', 'saveTableFormat')
    .addSeparator()
    .addItem('🎯 Assegna vincoli dalla tabella PdS', 'assegnaVincoliDaPds')
    .addSeparator()
    .addItem('🌐 Prepara tabella SERVIZIO', 'preparaImpegniEsterni')
    .addItem('🛰️ Recupera SERVIZIO da UP', 'recuperaImpegniEsterniDaUP');

  const io = ui.createMenu('🔁 Import / Export')
    .addItem('📤 Esporta JSON', 'exportToJson')
    .addItem('📥 Importa JSON', 'importFromJson');

  // Visibilità pubblica del Web Calendar: spunta (●) sulla voce attiva.
  const vis = getVisibility_();
  const visMenu = ui.createMenu('👁️ Visibilità')
    .addItem((vis === 'published' ? '● ' : '○ ') + 'Pubblicato', 'setVisibilityPublished')
    .addItem((vis === 'draft' ? '● ' : '○ ') + 'In redazione', 'setVisibilityDraft');

  // Tasto Feedback nella web app: spunta (●) sulla voce attiva.
  const fb = getFeedbackEnabled_();
  const fbMenu = ui.createMenu('💬 Feedback')
    .addItem((fb === 'on' ? '● ' : '○ ') + 'Attivo', 'setFeedbackOn')
    .addItem((fb === 'off' ? '● ' : '○ ') + 'Non attivo', 'setFeedbackOff');

  ui.createMenu('🕒 Orario')
    .addItem('🏛️ Genera tabella aule', 'tabellaAule')
    .addSeparator()
    .addSubMenu(tabelle)
    .addSubMenu(io)
    .addSeparator()
    .addItem('📅 Vai al Web Calendar', 'vaiAlWebCalendar')
    .addSubMenu(visMenu)
    .addSubMenu(fbMenu)
    .addSeparator()
    .addItem('🔓 Sconnetti editor', 'forceReleaseEdit')
    .addToUi();
}

/**
 * Normalizza la colonna J ("Docenti") dei fogli SxLT/SxLM riscrivendo ogni cella:
 * Title Case per parola, separatore " / ", spazi normalizzati, iniziali puntate.
 */
function normalizzaDocenti() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(s => /^S\d+L[TM]$/i.test(s.getName()));
  let scanned = 0, changed = 0;
  sheets.forEach(sheet => {
    const lastRow = sheet.getLastRow();
    if (lastRow < HEADER_ROWS + 1) return;
    const n = lastRow - HEADER_ROWS;
    const rng = sheet.getRange(HEADER_ROWS + 1, COL_TITOLARE, n, 1);
    const vals = rng.getValues();
    let any = false;
    for (let i = 0; i < n; i++) {
      const raw = vals[i][0];
      if (raw === '' || raw === null || raw === undefined) continue;
      scanned++;
      const norm = normalizeDocenti_(raw);
      if (norm !== String(raw)) { vals[i][0] = norm; any = true; changed++; }
    }
    if (any) rng.setValues(vals);
  });
  ui.alert('Normalizza docenti',
    'Celle docenti riscritte: ' + changed + ' su ' + scanned + ' non vuote.\n' +
    'Formato: "Cognome Nome" (Title Case), iniziali con ".", separatore " / ".',
    ui.ButtonSet.OK);
}

/**
 * Crea/prepara la Tabella nativa Google "SERVIZIO" (impegni di docenza FUORI dal
 * dipartimento) con header intelligibili. Tabella vera (filtri + ordinamento sull'header)
 * via servizio avanzato Sheets. I dati si recuperano da University Planner col comando
 * "Recupera SERVIZIO da UP" (un semestre per gsheet); poi "Carica/Pubblica" nel Web Calendar.
 * Non distruttiva: se la tabella esiste già, conserva i dati e ne ridimensiona la Tabella.
 */
function preparaImpegniEsterni() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SERVIZIO_SHEET);
  const created = !sh;
  if (!sh) sh = ss.insertSheet(SERVIZIO_SHEET);
  let tableErr = '';
  try { _deleteTablesOnSheet_(ss, sh); } catch (e) { tableErr = String(e); }
  const nData = Math.max(sh.getLastRow() - 1, 0);                 // righe dati già presenti
  sh.getRange(1, 1, 1 + nData, SERVIZIO_HEADERS.length).setNumberFormat('@');  // TESTO: zeri/orari preservati
  sh.getRange(1, 1, 1, SERVIZIO_HEADERS.length).setValues([SERVIZIO_HEADERS]);
  sh.setFrozenRows(1);
  if (!tableErr) { try { _createServizioTable_(ss, sh, nData); } catch (e) { tableErr = String(e); } }
  try { sh.autoResizeColumns(1, SERVIZIO_HEADERS.length); } catch (e) {}
  ui.alert('SERVIZIO',
    (created ? 'Creata' : 'Aggiornata') + ' la tabella "SERVIZIO".' +
    (tableErr ? '\n\n⚠️ Tabella nativa non creata: ' + tableErr : '') + '\n\n' +
    'Come popolarla:\n' +
    '• incolla solo le Matricole (colonna Matricola) e usa "🛰️ Recupera SERVIZIO da UP";\n' +
    '• oppure incolla (dalla riga 2) righe già pronte con gli header: ' + SERVIZIO_HEADERS.join(', ') + '.\n' +
    'NB: incolla i dati DOPO aver creato la tabella, così le matricole con zeri iniziali\n' +
    'restano intatte (la colonna è già formattata come testo).\n\n' +
    'Poi nel Web Calendar fai "Carica / Pubblica" per caricarli.',
    ui.ButtonSet.OK);
}
