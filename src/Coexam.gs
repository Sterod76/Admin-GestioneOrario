/**
 * Matrice co-esami (foglio SxCOEX) — FORMATO MATRICE QUADRATA.
 *
 *   A1 = etichetta (es. "COEX", ignorata)
 *   Riga 1 (B1→) e Colonna A (A2→): elenco dei codici (stesso insieme)
 *   Cella (riga, colonna):
 *     - DIAGONALE (codice × sé stesso) = numero di ESAMI MEDI/ANNO del codice (E)
 *     - FUORI DIAGONALE = numero di STUDENTI IN COMUNE fra i due codici (N)
 *
 * Simmetrica: basta compilare triangolo superiore + diagonale (se entrambi i
 * triangoli sono compilati e discordano, si tiene il MAX con warning).
 * Cella vuota = n/d. Codici normalizzati (trim+UPPERCASE); i codici mutuati
 * (figli) sono rimappati sul codice padre.
 *
 * Costo collisione (lato client): costo = oreOverlap/settimana * N. Se la coppia
 * è n/d ma esistono E per entrambi i codici, N viene STIMATO = min(Ea, Eb).
 */

function _coexSheetName_(ss) {
  return COEX_SHEET_NAME; // foglio FISSO "MATRICE" (alimentato da IMPORTRANGE)
}

function _findCoexSheet_(ss) {
  const target = _coexSheetName_(ss).toLowerCase();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === target) return sheets[i];
  }
  return null;
}

// Mappa figlio->parent dai mutuati, per esprimere la matrice in codici parent
// (le righe mutuate non generano sessioni: i codici figli non collidono mai).
function _childToParentMap_(ss) {
  const cfg = detectAuleConfigFor_(ss);
  const sources = ss.getSheets().filter(s => {
    const n = s.getName();
    return n.toUpperCase().startsWith(cfg.prefix) && n !== cfg.output;
  });
  const byParent = buildMutuantiMap(sources); // { parent: [{childCode, childCds}] }
  const child2parent = {};
  Object.keys(byParent).forEach(parent => {
    byParent[parent].forEach(m => {
      child2parent[String(m.childCode).toUpperCase()] = String(parent).toUpperCase();
    });
  });
  return child2parent;
}

/**
 * Legge SxCOEX (matrice quadrata) e ritorna:
 *   { pairs:{ "A|B": N }, perCode:{ CODE: E }, codes:[...], count, warnings, generatedAt, source }
 */
function readCoexamMatrix_(ss) {
  const sheetName = _coexSheetName_(ss);
  const empty = { pairs: {}, perCode: {}, codes: [], count: 0, warnings: [], generatedAt: new Date().toISOString(), source: sheetName };
  const sh = _findCoexSheet_(ss);
  if (!sh) return empty;
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return empty;

  const grid = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const c2p = _childToParentMap_(ss);
  function norm(x) { const s = String(x == null ? '' : x).trim().toUpperCase(); return s ? (c2p[s] || s) : ''; }

  // codici di colonna dalla riga 1 (da col 2 in poi)
  const colCode = [];
  for (let c = 1; c < lastCol; c++) colCode[c] = norm(grid[0][c]);

  const pairs = {}, perCode = {}, codeSet = {}, warnings = [];
  for (let r = 1; r < lastRow; r++) {
    const rowCode = norm(grid[r][0]);
    if (!rowCode) continue;
    for (let c = 1; c < lastCol; c++) {
      const cc = colCode[c];
      if (!cc) continue;
      const raw = grid[r][c];
      if (raw === '' || raw == null) continue;
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0) continue;
      if (rowCode === cc) {
        // diagonale → esami/anno
        if (Object.prototype.hasOwnProperty.call(perCode, rowCode)) {
          if (perCode[rowCode] !== v) warnings.push({ code: rowCode, vals: [perCode[rowCode], v] });
          perCode[rowCode] = Math.max(perCode[rowCode], v);
        } else perCode[rowCode] = v;
        codeSet[rowCode] = true;
      } else {
        // fuori diagonale → studenti in comune (chiave canonica, dedup max)
        const key = rowCode <= cc ? (rowCode + '|' + cc) : (cc + '|' + rowCode);
        if (Object.prototype.hasOwnProperty.call(pairs, key)) {
          if (pairs[key] !== v) warnings.push({ key: key, vals: [pairs[key], v] });
          pairs[key] = Math.max(pairs[key], v);
        } else pairs[key] = v;
        codeSet[rowCode] = true; codeSet[cc] = true;
      }
    }
  }
  return {
    pairs: pairs, perCode: perCode,
    codes: Object.keys(codeSet).sort(),
    count: Object.keys(pairs).length,
    warnings: warnings,
    generatedAt: new Date().toISOString(),
    source: sheetName
  };
}
