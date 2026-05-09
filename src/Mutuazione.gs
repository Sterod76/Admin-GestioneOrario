/**
 * Phase 1 helper: itera tutti i fogli S1* e ritorna
 * { mutuantiByParent: {parentCode: [{childCode, childCds}, ...]} }
 * Usato sia da TabellaAule che da WebApp per evitare duplicazione.
 */
function buildMutuantiMap(sources) {
  const mutuantiByParent = {};
  sources.forEach(sheet => {
    const lastRow = sheet.getLastRow();
    if (lastRow < HEADER_ROWS + 1) return;
    const data = sheet.getRange(HEADER_ROWS + 1, 1, lastRow - HEADER_ROWS, ROW_DATA_LAST_COL).getValues();
    const childCds = sheetCdsSuffix(sheet.getName());
    data.forEach(row => {
      const code = row[COL_CODICE - 1];
      if (!code) return;
      const childCode = String(code).trim().toUpperCase();
      const mut = parseMutuazione(row[COL_MUTUATO - 1]);
      if (!mut) return;
      if (!mutuantiByParent[mut.parentCode]) mutuantiByParent[mut.parentCode] = [];
      mutuantiByParent[mut.parentCode].push({ childCode: childCode, childCds: childCds });
    });
  });
  return mutuantiByParent;
}

function formatMutuanti(list) {
  if (!list || !list.length) return '';
  return list.map(m => m.childCds ? `${m.childCode} @${m.childCds}` : m.childCode).join(', ');
}
