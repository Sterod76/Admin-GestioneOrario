function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🕒 GestioneOrario')
    .addItem('🎯 Assegna vincolo da PdS', 'assegnaVincoliDaPds')
    .addItem('🏛️ Genera tabella aule', 'tabellaAule')
    .addItem('📅 Aggiorna Web Calendar', 'aggiornaWebApp')
    .addSeparator()
    .addItem('✨ Normalizza celle calendario', 'fixCalendarEntries')
    .addItem('🔄 Ricarica formato tabella', 'reloadTableFormat')
    .addItem('💾 Salva formato tabella', 'saveTableFormat')
    .addToUi();
}
