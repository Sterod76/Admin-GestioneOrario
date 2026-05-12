function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🕒 Orario')
    .addItem('🎯 Assegna vincolo da PdS', 'assegnaVincoliDaPds')
    .addItem('🏛️ Genera tabella aule', 'tabellaAule')
    .addSeparator()
    .addItem('✨ Normalizza celle calendario', 'fixCalendarEntries')
    .addItem('🔄 Ricarica formato tabella', 'reloadTableFormat')
    .addItem('💾 Salva formato tabella', 'saveTableFormat')
    .addSeparator()
    .addItem('📤 Esporta JSON', 'exportToJson')
    .addItem('📥 Importa JSON', 'importFromJson')
    .addToUi();
}
