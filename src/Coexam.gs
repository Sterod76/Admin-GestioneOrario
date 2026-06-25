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
 * Cella vuota = n/d. Codici normalizzati (trim+UPPERCASE) e lasciati GREZZI: le classi
 * di equivalenza (mutuazioni + foglio CORRISPONDENZE) le fonde il client (canon),
 * sommando E/N su tutta la classe.
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

// Legge il foglio CORRISPONDENZE (import del CSV equivalenze_codici): una riga per
// classe, col A = TITOLO (ignorata), col B.. = codici equivalenti. Ritorna un array
// di classi (array di codici UPPER, almeno 2). Foglio assente/vuoto → [].
function readCorrispondenze_(ss) {
  let sh = null;
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toUpperCase() === CORRISP_SHEET_NAME) { sh = sheets[i]; break; }
  }
  if (!sh) return [];
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 2) return [];
  const grid = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const classes = [];
  for (let r = 0; r < grid.length; r++) {
    const codes = [];
    for (let c = 1; c < grid[r].length; c++) {   // salta col A (TITOLO)
      const v = String(grid[r][c] == null ? '' : grid[r][c]).trim().toUpperCase();
      if (v) codes.push(v);
    }
    if (codes.length >= 2) classes.push(codes);   // serve almeno una coppia per fare classe
  }
  return classes;
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
  // Codici GREZZI (trim+UPPER): le classi di equivalenza (mutuazioni + CORRISPONDENZE)
  // vengono fuse a valle dal client (canon), che SOMMA E/N su tutta la classe.
  function norm(x) { return String(x == null ? '' : x).trim().toUpperCase(); }

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
