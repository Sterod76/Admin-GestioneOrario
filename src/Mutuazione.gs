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

/**
 * Unisce le MUTUAZIONI (capostipite ↔ mutuanti) e le classi del foglio
 * CORRISPONDENZE in un'unica mappa di equivalenza, via union-find.
 *
 *   mutuantiByParent : { parent: [{childCode, childCds}, ...] }  (da buildMutuantiMap)
 *   corrispClasses   : [[codiceA, codiceB, ...], ...]            (da readCorrispondenze_)
 *
 * Ritorna { codiceMembro(UPPER) → rappresentante(UPPER) }, rappresentante = codice
 * lessicograficamente MINORE del componente (scelta interna: non influenza il display,
 * il client mostra il codice del PdS). I codici "soli" (rappresentante = sé stessi)
 * NON compaiono nella mappa. Usata dal client (canon) per fondere E/N nei co-esami,
 * nella capienza e nelle collisioni — "stesso corso" ovunque.
 */
function buildEquivMap_(mutuantiByParent, corrispClasses) {
  const uf = {};
  function add(x) { if (!(x in uf)) uf[x] = x; }
  function find(x) {
    let r = x; while (uf[r] !== r) r = uf[r];
    while (uf[x] !== r) { const n = uf[x]; uf[x] = r; x = n; }
    return r;
  }
  function union(a, b) { a = find(a); b = find(b); if (a === b) return; if (a < b) uf[b] = a; else uf[a] = b; }

  Object.keys(mutuantiByParent || {}).forEach(parent => {
    const P = String(parent).trim().toUpperCase(); if (!P) return; add(P);
    (mutuantiByParent[parent] || []).forEach(m => {
      const child = String(m.childCode).trim().toUpperCase();
      if (child) { add(child); union(P, child); }
    });
  });
  (corrispClasses || []).forEach(cls => {
    const cc = (cls || []).map(c => String(c).trim().toUpperCase()).filter(Boolean);
    cc.forEach(add);
    for (let i = 1; i < cc.length; i++) union(cc[0], cc[i]);
  });

  const equivMap = {};
  Object.keys(uf).forEach(k => { const r = find(k); if (r !== k) equivMap[k] = r; });
  return equivMap;
}
