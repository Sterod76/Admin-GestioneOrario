// Verifica renderSheetMirror (card per codice): ordinamenti (Codice / Ore-CFU),
// filtro "Cerca", semaforo h/CFU (rosso<2/3, nero=, verde>) e font-size aula.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

function extract(name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' non trovata');
  let i = html.indexOf('{', start), d = 0, end = -1;
  for (let k = i; k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (d === 0) { end = k + 1; break; } }
  }
  return html.slice(start, end);
}
const src = extract('_hh') + '\n' + extract('docentiHtml') + '\n' + extract('shortTitle') + '\n' + extract('renderSheetMirror');

const captures = {};
let qValue = '';
const document = { getElementById: (id) => {
  if (id === 'q') return { get value() { return qValue; } };
  return { set innerHTML(v) { captures[id] = v; }, get innerHTML() { return captures[id] || ''; } };
} };
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmt(min) { const h = Math.floor(min / 60), m = min % 60; return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m); }
function parseQuery(q) { const t = (q || '').split(/\s+/).filter(Boolean).slice(0, 2); return { terms: t, op: 'or' }; }
const _mirrorSheets = ['S1LT'];
let _mirrorSort = {};
let data = {};
let _isPublic = false;   // ramo tabella semplificata (utente standard)
eval(src);

const H  = ['Anno','CFU','Codice','Mutuato','Nome','Tipo','Vincolo','Gruppo','','Titolare','SSD','LUN','MAR','MER','GIO','VEN','SAB','Periodo'];
const r2 = ['1','9','FIS001','','Fisica Generale','LEZ','OBB','','','Rossi','FIS/01','','','','','','','I'];   // 6h / 9CFU = 0.667 (= 2/3 → nero)
const r3 = ['1','','FIS001','','Fisica Generale','LAB','OBB','A','','','FIS/01','','','','','','','I'];
const r4 = ['1','6','FIS002','FIS001','Mutuato X','LEZ','OBB','','','Verdi','FIS/01','','','','','','','I']; // mutuato escluso
const r5 = ['1','6','FIS003','','Meccanica','LEZ','FOR','','','Neri','MAT/05','','','','','','','I'];          // 2h / 6CFU = 0.333 (< 2/3 → rosso)
const r6 = ['1','3','FIS004','','Termo','LEZ','FOR','','','Blu','FIS/02','','','','','','','I'];                // 4h / 3CFU = 1.333 (> 2/3 → verde)

data = {
  days: ['LUN','MAR','MER','GIO','VEN','SAB'],
  vincoloColors: { OBB: '#ffcfc9', FOR: '#ffe5a0', OPZ: '#d4edbc' },
  rawSheets: { S1LT: { name: 'S1LT', color: '#1a73e8', headerRows: 1, grid: [H, r2, r3, r4, r5, r6] } },
  sessions: [
    { src: { sheet: 'S1LT', row: 2, col: 12, idx: 0 }, day: 0, start: 540, end: 660, room: 'Aula B' }, // FIS001 2h
    { src: { sheet: 'S1LT', row: 3, col: 14, idx: 0 }, day: 2, start: 840, end: 960, room: 'Lab Fis' }, // FIS001 2h
    { src: { sheet: 'S1LT', row: 3, col: 15, idx: 0 }, day: 3, start: 840, end: 960, room: 'Lab Fis' }, // FIS001 2h
    { src: { sheet: 'S1LT', row: 5, col: 13, idx: 0 }, day: 1, start: 540, end: 660, room: 'Aula C' },  // FIS003 2h
    { src: { sheet: 'S1LT', row: 6, col: 12, idx: 0 }, day: 0, start: 540, end: 780, room: 'Aula D' }   // FIS004 4h
  ],
  pendingEdits: []
};

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  XX  FAIL: ' + n); } }
function render(sortState) { _mirrorSort = sortState ? { S1LT: sortState } : {}; renderSheetMirror('S1LT'); return captures['viewMirror0'] || ''; }
function order(out, a, b) { return out.indexOf('>' + a + '<') < out.indexOf('>' + b + '<'); }

// --- Ordinamenti ---
let out = render(null); // default code asc
check('Toolbar Codice + Ore/CFU', out.indexOf('msort-btn') !== -1 && out.indexOf('Ore/CFU') !== -1);
check('Vecchia scritta rimossa', out.indexOf('una card per insegnamento') === -1);
check('Default Codice ASC (FIS001<FIS003<FIS004)', order(out, 'FIS001', 'FIS003') && order(out, 'FIS003', 'FIS004'));
out = render({ key: 'code', dir: -1 });
check('Codice DESC (FIS004<FIS003<FIS001)', order(out, 'FIS004', 'FIS001'));
out = render({ key: 'orecfu', dir: 1 });
check('Ore/CFU ASC: FIS003<FIS001<FIS004', order(out, 'FIS003', 'FIS001') && order(out, 'FIS001', 'FIS004'));
out = render({ key: 'orecfu', dir: -1 });
check('Ore/CFU DESC: FIS004<FIS001<FIS003', order(out, 'FIS004', 'FIS001') && order(out, 'FIS001', 'FIS003'));

// --- Semaforo h/CFU (espresso in terzi: ore/3CFU, soglia 2) ---
out = render(null);
check('Formato 2h/3CFU per FIS001 (=2 → nero)', out.indexOf('2h/3CFU') !== -1 && out.indexOf('mhcfu-eq') !== -1);
check('Formato 1h/3CFU per FIS003 (<2 → rosso)', out.indexOf('1h/3CFU') !== -1 && out.indexOf('mhcfu-low') !== -1);
check('Formato 4h/3CFU per FIS004 (>2 → verde)', out.indexOf('4h/3CFU') !== -1 && out.indexOf('mhcfu-high') !== -1);
check('Niente più formato decimale "0.7 h/CFU"', out.indexOf(' h/CFU') === -1);

// --- Ricerca attiva ---
qValue = 'meccanica'; out = render(null);
check('Search "meccanica" → solo FIS003', out.indexOf('FIS003') !== -1 && out.indexOf('FIS001') === -1);
qValue = 'FIS004'; out = render(null);
check('Search "FIS004" → solo FIS004', out.indexOf('FIS004') !== -1 && out.indexOf('FIS001') === -1 && out.indexOf('FIS003') === -1);
qValue = 'zzz'; out = render(null);
check('Search senza match → messaggio', out.indexOf('Nessun risultato') !== -1);
qValue = ''; out = render(null);
check('Search vuoto → tutte le card', out.indexOf('FIS001') !== -1 && out.indexOf('FIS004') !== -1);

// --- Font-size aula uguale all'orario (CSS) ---
check('CSS .mb-room font-size 11px bold', html.indexOf('.mbadge .mb-room { font-weight: 700; font-size: 11px;') !== -1);

// --- Docenti: 1° (titolare) sottolineato ---
check('docentiHtml: 1° sottolineato (stringa)', docentiHtml('Rossi / Bianchi') === '<u>Rossi</u> / Bianchi');
check('docentiHtml: 1° sottolineato (array)', docentiHtml(['Verdi', 'Neri']) === '<u>Verdi</u> / Neri');
check('docentiHtml: singolo', docentiHtml('Rossi') === '<u>Rossi</u>');
qValue = ''; out = render(null);
check('Mirror card: titolare sottolineato (<u>Rossi</u>)', out.indexOf('<u>Rossi</u>') !== -1);

// --- shortTitle: solo la parte prima della "/" (titolo inglese), trimmed (viste Aule/Slot) ---
check('shortTitle: "English / Italiano" → "English"', shortTitle('English / Italiano') === 'English');
check('shortTitle: trim attorno alla "/" ("  Foo /Bar")', shortTitle('  Foo /Bar') === 'Foo');
check('shortTitle: senza "/" invariato', shortTitle('Meccanica Quantistica') === 'Meccanica Quantistica');
check('shortTitle: più "/" → prima parte', shortTitle('A / B / C') === 'A');
check('shortTitle: vuoto/null → ""', shortTitle('') === '' && shortTitle(null) === '');

// --- Ramo public: tabella semplificata (una riga per codice+gruppo, Lun-Ven) ---
_isPublic = true; qValue = '';
const pub = render(null);
check('public: rende <table class="pubtab">', pub.indexOf('class="pubtab"') !== -1);
check('public: header LUN..VEN, niente SAB', pub.indexOf('>LUN<') !== -1 && pub.indexOf('>VEN<') !== -1 && pub.indexOf('>SAB<') === -1);
check('public: NIENTE totale ore', pub.indexOf('Totale ore') === -1);
check('public: FIS001 gruppo A separato (Gr A)', pub.indexOf('Gr A') !== -1);
check('public: pillola orario+aula (Aula B)', pub.indexOf('pt-pill') !== -1 && pub.indexOf('Aula B') !== -1);
check('public: CFU dopo il codice (9 CFU)', pub.indexOf('9 CFU') !== -1);
check('public: colonna Docenti (Rossi)', pub.indexOf('>Docenti<') !== -1 && pub.indexOf('Rossi') !== -1);

// filtro codici *T e *RI (isolato: griglia temporanea, poi ripristino)
const _gridBak = data.rawSheets.S1LT.grid;
data.rawSheets.S1LT.grid = [H,
  ['1', '6', '099RI', '', 'Riconoscimento', 'LEZ', 'OPZ', '', '', 'Tizio', '', '', '', '', '', '', '', 'I'],
  ['1', '6', '0000T', '', 'Tirocinio', 'LEZ', 'OPZ', '', '', 'Caio', '', '', '', '', '', '', '', 'I'],
  ['1', '6', 'FIS009', '', 'Normale', 'LEZ', 'OBB', '', '', 'Sempronio', '', '', '', '', '', '', '', 'I']];
qValue = '';
const pubF = render(null);
check('public: esclude codici *T (0000T assente)', pubF.indexOf('0000T') === -1);
check('public: esclude codici *RI (099RI assente)', pubF.indexOf('099RI') === -1);
check('public: tiene i codici normali (FIS009 presente)', pubF.indexOf('FIS009') !== -1);
data.rawSheets.S1LT.grid = _gridBak;
_isPublic = false;

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
