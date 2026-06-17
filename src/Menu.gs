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
    .addItem('🌐 Prepara foglio Impegni Esterni', 'preparaImpegniEsterni');

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
 * Crea/prepara il foglio "ImpegniEsterni" (impegni di docenza FUORI dal dipartimento)
 * con header intelligibili + formato "smart table" (header in grassetto, riga fissa,
 * banding). I dati si incollano dai CSV generati dai tool in impegni/ (un semestre per
 * gsheet), poi si caricano nel Web Calendar con "Carica/Pubblica".
 */
function preparaImpegniEsterni() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const HEADERS = ['Cognome', 'Nome', 'Matricola', 'Giorno', 'Inizio', 'Fine', 'Corso', 'Aula'];
  let sh = ss.getSheetByName('ImpegniEsterni');
  const created = !sh;
  if (!sh) sh = ss.insertSheet('ImpegniEsterni');
  const cur = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0].map(x => String(x || '').trim().toLowerCase());
  if (cur.join('|') !== HEADERS.join('|').toLowerCase()) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#e8f0fe');
  sh.setFrozenRows(1);
  try {
    sh.getBandings().forEach(b => b.remove());
    const lastRow = Math.max(sh.getLastRow(), 2);
    sh.getRange(1, 1, lastRow, HEADERS.length)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);  // showHeader=false: tiene l'azzurro custom
  } catch (e) {}
  try { sh.autoResizeColumns(1, HEADERS.length); } catch (e) {}
  ui.alert('Impegni esterni',
    (created ? 'Creato' : 'Aggiornato') + ' il foglio "ImpegniEsterni".\n\n' +
    'Incolla qui (dalla riga 2) i dati del semestre giusto generati dai tool in impegni/\n' +
    '(ImpegniEsterni_S1.csv nel gsheet S1, ImpegniEsterni_S2.csv nel gsheet S2),\n' +
    'rispettando gli header: ' + HEADERS.join(', ') + '.\n\n' +
    'Poi nel Web Calendar fai "Carica / Pubblica" per caricarli.',
    ui.ButtonSet.OK);
}
