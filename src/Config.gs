const TABLE_FORMAT_PROP = 'tableFormat';
const CALENDAR_COLS_START = 12;  // L (giorni)
const CALENDAR_COLS_END = 17;    // Q
const COL_CODICE = 3;       // C
const COL_MUTUATO = 4;      // D
const COL_NOMECORSO = 5;    // E
const COL_TIPO = 6;         // F
const COL_VINCOLO = 7;      // G
const COL_GRUPPO = 8;       // H
const COL_TITOLARE = 10;    // J
const COL_SSD = 11;         // K
const COL_PERIODO = 18;     // R (dopo SAB)
const ROW_DATA_LAST_COL = COL_PERIODO;
const VINCOLO_DEFAULT_COLOR = '#ffffff';
const VINCOLO_FALLBACK_COLORS = {
  'OBB': '#ffcfc9',
  'FOR': '#ffe5a0',
  'OPZ': '#d4edbc'
};

const TIPO_LABELS = {
  'LEZ': 'lezione',
  'ES': 'esercitazione',
  'LEZ/ES': 'lezione/esercitazione',
  'LAB': 'laboratorio'
};

function tipoLabel(tipo) {
  if (!tipo) return '';
  const k = String(tipo).trim().toUpperCase();
  return TIPO_LABELS[k] || tipo;
}

function isWhiteOrEmpty(c) {
  if (!c) return true;
  const s = String(c).toLowerCase();
  return s === '' || s === '#ffffff' || s === '#fff' || s === 'white';
}

// Parse "Codice mutuato": <CODE_MASTER> [ @<cds> ]?  → { parentCode, parentCds }
// Il codice master è SEMPRE la parte prima della '@' (es. "413BB@WFIR-LM" → 413BB);
// spazi opzionali attorno alla '@' sono tollerati.
function parseMutuazione(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const m = s.match(/^(\S+?)(?:\s*@\s*(\S+))?$/);
  if (!m) return null;
  const code = m[1].toUpperCase();
  if (code.charAt(0) === '@') return null; // sola @cds senza codice → ignora
  return { parentCode: code, parentCds: m[2] ? m[2].toUpperCase() : '' };
}

// Estrae il "CdS suffix" dal nome di un foglio sorgente: S1LT → LT, S1WNN → WNN
function sheetCdsSuffix(sheetName) {
  return String(sheetName || '').replace(/^S\d+/i, '').toUpperCase() || sheetName;
}

// Normalizza la cella "docenti" per la TABELLA (riscrittura nel gsheet):
//  1) ogni parola in Title Case (1ª lettera maiuscola, resto minuscolo);
//  2) separatore fra docenti = " / ";
//  3) spazi normalizzati (singolo spazio fra parole, niente spazi spurî);
//  4) una lettera singola → iniziale puntata ("M" → "M.").
// Dedup case-insensitive, ordine preservato (1° = titolare).
function normalizeDocenti_(raw) {
  if (raw === null || raw === undefined) return '';
  const parts = String(raw).split(/[\n\r\/;,]|\s+e\s+/i);
  const out = [], seen = {};
  for (let i = 0; i < parts.length; i++) {
    const words = parts[i].trim().split(/\s+/).filter(function (w) { return w.length > 0; });
    if (!words.length) continue;
    const name = words.map(function (w) {
      let c = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      // maiuscola anche dopo l'apostrofo (dritto o tipografico): d'elia → D'Elia
      c = c.replace(/(['’])([a-zà-ÿ])/g, function (m, ap, ch) { return ap + ch.toUpperCase(); });
      if (/^[A-Za-zÀ-ÿ]$/.test(w)) c += '.'; // lettera singola → iniziale "X."
      return c;
    }).join(' ');
    const k = name.toUpperCase();
    if (seen[k]) continue;
    seen[k] = true;
    out.push(name);
  }
  return out.join(' / ');
}

// Spezza la cella "docenti" (più nomi per riga) in lista [titolare, co-docente, ...].
// Separatori: newline, "/", ";", "," e " e ". Trim, scarta vuoti, dedup (ordine preservato).
function parseDocenti_(raw) {
  if (raw === null || raw === undefined) return [];
  const parts = String(raw).split(/[\n\r\/;,]|\s+e\s+/i);
  const out = [];
  const seen = {};
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i].trim();
    if (!t) continue;
    const k = t.toUpperCase();
    if (seen[k]) continue;
    seen[k] = true;
    out.push(t);
  }
  return out;
}

/**
 * Rileva il semestre attivo guardando se esiste un foglio di output per S1 o S2.
 * Ritorna { prefix, output } da usare per filtrare le sorgenti.
 * Default S1 se nessuno o entrambi esistono.
 */
function detectAuleConfig() {
  return detectAuleConfigFor_(SpreadsheetApp.getActiveSpreadsheet());
}

function detectAuleConfigFor_(ss) {
  if (!ss) return { prefix: 'S1', output: 'S1AULE' };
  const hasS1 = !!ss.getSheetByName('S1AULE');
  const hasS2 = !!ss.getSheetByName('S2AULE');
  if (hasS2 && !hasS1) return { prefix: 'S2', output: 'S2AULE' };
  return { prefix: 'S1', output: 'S1AULE' };
}

// Foglio FISSO della matrice esami (unico, non per-semestre). Popolato via
// IMPORTRANGE da un gsheet esterno; la Web App lo legge in sola lettura.
const COEX_SHEET_NAME = 'MATRICE';
const HEADER_ROWS = 1;

function getTableFormat() {
  const raw = PropertiesService.getScriptProperties().getProperty(TABLE_FORMAT_PROP);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    Logger.log('tableFormat malformato: ' + e);
    return [];
  }
}

function setTableFormat(arr) {
  PropertiesService.getScriptProperties().setProperty(TABLE_FORMAT_PROP, JSON.stringify(arr));
}
