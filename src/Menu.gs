function onOpen() {
  const ui = SpreadsheetApp.getUi();

  const tabelle = ui.createMenu('🛠️ Gestione tabelle')
    .addItem('✨ Normalizza celle calendario', 'fixCalendarEntries')
    .addItem('👤 Normalizza docenti (colonna J)', 'normalizzaDocenti')
    .addItem('🔄 Ricarica formato tabella', 'reloadTableFormat')
    .addItem('💾 Salva formato tabella', 'saveTableFormat')
    .addSeparator()
    .addItem('🎯 Assegna vincoli dalla tabella PdS', 'assegnaVincoliDaPds');

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
