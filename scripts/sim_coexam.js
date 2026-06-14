// Verifica renderCoexamMatrix (estratta da index.html): matrice dei codici
// OBB/FOR, diagonale = E (perCode), fuori-diagonale = N (pairs); OPZ esclusi.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

function extractFn(name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) { console.error(name + ' non trovata'); process.exit(2); }
  let i = html.indexOf('{', start), d = 0, end = -1;
  for (let k = i; k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (d === 0) { end = k + 1; break; } }
  }
  return html.slice(start, end);
}
const fnSrc = extractFn('canon') + '\n' + extractFn('_coexSync') + '\n' + extractFn('coexamN') + '\n' + extractFn('coexamE') + '\n' +
  extractFn('cfuByCode') + '\n' + extractFn('_renderCoexMatrix') + '\n' + extractFn('renderCoexamMatrix') + '\n' +
  extractFn('renderCoexamMatrixLT') + '\n' + extractFn('coexCodeInfoHtml') + '\n' + extractFn('docentiHtml');

const captures = {};
const document = { getElementById: (id) => ({ set innerHTML(v) { captures[id] = v; }, get innerHTML() { return captures[id] || ''; }, addEventListener: function () {}, querySelectorAll: () => [], querySelector: () => null, value: '2' }) };
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
let _cxThresh = 2, _cxThreshLT = 2;
let _cxSel = { LM: null, LT: null };
let _cxActivePds = null;
let _cfuCache = null, _cfuCacheRef = null;
let _coexCache = { ref: null, eref: null, pairs: {}, perCode: {}, codes: new Set() };
let data = {};
eval(fnSrc);

data = {
  vincoloColors: { OBB: '#ffcfc9', FOR: '#ffe5a0', OPZ: '#d4edbc' },
  codesLM: ['AAA', 'BBB', 'DDD'],
  codesLT: ['LTA', 'LTB', 'EEE', '0000B'],
  // ZZZ = OBB nel PdS ma NON nel semestre → escluso. EEE = OBB ma LT → escluso da LM.
  pds: [{ name: 'P1', vincoloByCode: { AAA: 'OBB', BBB: 'FOR', CCC: 'OPZ', ZZZ: 'OBB' } }],
  courses: [
    { code: 'AAA', name: 'Corso A', vincolo: 'OBB', sheet: 'S1LM' },
    { code: 'DDD', name: 'Corso D', vincolo: 'OBB', sheet: 'S1LM' },
    { code: 'CCC', name: 'Opzionale', vincolo: 'OPZ', sheet: 'S1LM' },
    { code: 'EEE', name: 'Corso E LT', vincolo: 'OBB', sheet: 'S1LT' },
    { code: 'LTA', name: 'Opz A LT', vincolo: 'OPZ', sheet: 'S1LT' },
    { code: 'LTB', name: 'Opz B LT', vincolo: 'OPZ', sheet: 'S1LT' },
    { code: '0000B', name: 'Fittizio', vincolo: 'OPZ', sheet: 'S1LT' }
  ],
  sessions: [{ code: 'BBB', name: 'Corso B', sheet: 'S1LM' }],
  // AAA|BBB=30 (≥ soglia 2 → colorato) ; AAA|DDD=1 (< 2 → non colorato) ; BBB|DDD n/d
  // LTA|LTB=10 (matrice LT opzionali)
  coexam: { perCode: { DDD: 200, AAA: 120, BBB: 60, LTA: 50, LTB: 40 }, pairs: { 'AAA|BBB': 30, 'AAA|DDD': 1, 'LTA|LTB': 10 } }
};

renderCoexamMatrix();
const out = captures['coexamBody'] || '';

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  XX  FAIL: ' + n); } }
function count(re) { return (out.match(re) || []).length; }
function idx(s) { return out.indexOf(s); }

check('Tabella matrice presente', out.indexOf('cx-table') !== -1);
check('Codici del semestre presenti (AAA,BBB,DDD)', idx('>AAA<') !== -1 && idx('>BBB<') !== -1 && idx('>DDD<') !== -1);
check('OPZ escluso (CCC assente)', idx('>CCC<') === -1);
check('OBB fuori semestre escluso (ZZZ assente)', idx('>ZZZ<') === -1);
check('LT escluso, solo LM (EEE assente)', idx('>EEE<') === -1);
check('Testo descrittivo = "Matrice di co-esami" (e basta)', out.indexOf('Matrice di co-esami') !== -1 && out.indexOf('obbligatori/forchetta') === -1);
check('Tab rinominato "Co-esami LM"', html.indexOf('📊 Co-esami LM') !== -1);
check('Input soglia colore presente (cxThresh, default 2)', out.indexOf('id="cxThresh"') !== -1 && out.indexOf('value="2"') !== -1);
check('Ordine per E decrescente: DDD < AAA < BBB', idx('>DDD<') < idx('>AAA<') && idx('>AAA<') < idx('>BBB<'));
check('Diagonale: 3 celle cx-diag', count(/cx-diag/g) === 3);
check('Diagonale DDD = 200 (top-left)', out.indexOf('>200<') !== -1);
check('Diagonale AAA = 120 e BBB = 60', idx('>120<') !== -1 && idx('>60<') !== -1);
check('N≥2 (AAA×BBB=30) colorato (background rgba)', out.indexOf('background:rgba(179,89,0') !== -1);
check('N<2 (AAA×DDD=1) NON colorato (cx-n-low)', out.indexOf('cx-n-low') !== -1);
check('n/d presente (cx-na)', count(/class="cx-na"/g) >= 1);
check('Header: SFONDO colorato per vincolo (FOR giallo #ffe5a0)', out.indexOf('background:#ffe5a0') !== -1);
check('Header: SFONDO colorato per vincolo (OBB rosso #ffcfc9)', out.indexOf('background:#ffcfc9') !== -1);
check('Header: niente più linea laterale (border 3px)', out.indexOf('border-bottom:3px') === -1 && out.indexOf('border-right:3px') === -1);
// CSS: celle quadrate + header ruotati + corner quadrato + sotto-soglia bianco
check('CSS: celle quadrate 28px', html.indexOf('.cx-table td { width: 28px; min-width: 28px; max-width: 28px; height: 28px; }') !== -1);
check('CSS: header colonne ruotati (writing-mode su span cx-chl)', html.indexOf('writing-mode: vertical-rl') !== -1 && out.indexOf('class="cx-chl"') !== -1);
check('CSS: label header centrate orizz. + in basso', html.indexOf('text-align: center; vertical-align: bottom') !== -1);
check('CSS: header band height = 54 (corner quadrato)', html.indexOf('height: 54px;') !== -1 && html.indexOf('th.cx-corner') !== -1);
check('CSS: sotto soglia sfondo BIANCO pieno', html.indexOf('td.cx-n-low { background: #fff') !== -1);
// Hover dettagli corso sui codici della matrice
check('Header con data-code (per hover)', out.indexOf('data-code="AAA"') !== -1);
check('Setup popover Co-esami presente', html.indexOf('setupCoexamPopover') !== -1);
const info = coexCodeInfoHtml('AAA');
check('coexCodeInfoHtml: titolo del corso (Corso A)', info.indexOf('Corso A') !== -1 && info.indexOf('cxpop-name') !== -1);
check('coexCodeInfoHtml: codice + E', info.indexOf('AAA') !== -1 && info.indexOf('120') !== -1);
check('coexCodeInfoHtml codice ignoto = solo codice', coexCodeInfoHtml('ZZZ').indexOf('cxpop-name') === -1);

// ===== Matrice Co-esami LT (solo opzionali) =====
renderCoexamMatrixLT();
const outLT = captures['coexamBodyLT'] || '';
check('LT: titolo "Matrice di co-esami LT (opzionali)"', outLT.indexOf('co-esami LT (opzionali)') !== -1);
check('LT: opzionali LTA e LTB presenti', outLT.indexOf('>LTA<') !== -1 && outLT.indexOf('>LTB<') !== -1);
check('LT: EEE (OBB LT) ESCLUSO (solo opzionali)', outLT.indexOf('>EEE<') === -1);
check('LT: 0000B (fittizio) ESCLUSO', outLT.indexOf('>0000B<') === -1);
check('LT: AAA (LM) ESCLUSO dalla matrice LT', outLT.indexOf('>AAA<') === -1);
check('LT: diagonale E (50 e 40)', outLT.indexOf('>50<') !== -1 && outLT.indexOf('>40<') !== -1);
check('LT: N=10 (LTA×LTB) colorato', outLT.indexOf('background:rgba(179,89,0') !== -1 && outLT.indexOf('>10<') !== -1);
check('LT: header sfondo OPZ (#d4edbc)', outLT.indexOf('background:#d4edbc') !== -1);
check('LT: input soglia separato (cxThreshLT)', outLT.indexOf('id="cxThreshLT"') !== -1);
check('LM: LTA/LTB NON nella matrice LM', out.indexOf('>LTA<') === -1 && out.indexOf('>LTB<') === -1);

// ===== Pannello dettaglio (cella selezionata = coppia) =====
check('Celle/header cliccabili (cx-pick)', out.indexOf('cx-pick') !== -1);
check('Pannello laterale (clm-wrap/clm-side)', out.indexOf('clm-wrap') !== -1 && out.indexOf('clm-side') !== -1);
_cxSel.LM = { type: 'cell', r: 'AAA', c: 'BBB' };
renderCoexamMatrix();
const outCell = captures['coexamBody'] || '';
check('Detail cella: "30 studenti hanno sostenuto"', outCell.indexOf('30</b> studenti hanno sostenuto') !== -1);
check('Detail cella: chip AAA e BBB (codice)', outCell.indexOf('cxd-code">AAA<') !== -1 && outCell.indexOf('cxd-code">BBB<') !== -1);
check('Detail cella: cella evidenziata (cx-csel)', outCell.indexOf('cx-csel') !== -1);
// ===== Pannello dettaglio (codice/header selezionato) =====
_cxSel.LM = { type: 'code', code: 'AAA' };
renderCoexamMatrix();
const outCode = captures['coexamBody'] || '';
check('Detail codice: E "Esami sostenuti: 120"', outCode.indexOf('Esami sostenuti: <b>120</b>') !== -1);
check('Detail codice: "anche sostenuto" + lista co-esami (cxd-n)', outCode.indexOf('anche sostenuto') !== -1 && outCode.indexOf('cxd-n') !== -1);
check('Detail codice: header evidenziato (cx-hsel)', outCode.indexOf('cx-hsel') !== -1);
_cxSel.LM = null;

// ===== Classi di equivalenza (mutuazione): AAA fuso in DDD =====
data.equiv = { 'AAA': 'DDD' }; // AAA mutua DDD → canon(AAA)=DDD
renderCoexamMatrix();
const outEq = captures['coexamBody'] || '';
check('Equiv: mostrato col codice del PIANO AAA (citato in P1), non il capostipite DDD', outEq.indexOf('>AAA<') !== -1 && outEq.indexOf('>DDD<') === -1);
check('Equiv: E aggregata sul codice del piano = 200+120 = 320', outEq.indexOf('>320<') !== -1);
check('Equiv: N(AAA×BBB) = 30 (somma classe)', outEq.indexOf('>30<') !== -1);
data.equiv = {};

// ===== Mutuante: codice in codesLM + OBB nel PdS ma SENZA riga-corso/slot =====
// (es. 0024B mutuato da ZED, su cui cadono gli esami) → deve comparire via canonico.
data.equiv = { '0024B': 'ZED' };
data.codesLM = ['AAA', 'BBB', 'DDD', '0024B'];
data.coexam = { perCode: { DDD: 200, AAA: 120, BBB: 60, ZED: 70 }, pairs: {}, codes: ['AAA', 'BBB', 'DDD', 'ZED'] };
data.pds = [{ name: 'P1', vincoloByCode: { AAA: 'OBB', BBB: 'FOR', CCC: 'OPZ', ZZZ: 'OBB', '0024B': 'OBB' } }];
renderCoexamMatrix();
const outMut = captures['coexamBody'] || '';
check('Mutuante: mostrato col CODICE DEL PIANO 0024B (non il capostipite), E aggregata 70', outMut.indexOf('>0024B<') !== -1 && outMut.indexOf('>70<') !== -1);
check('Mutuante: capostipite-sorgente ZED NON mostrato come codice', outMut.indexOf('>ZED<') === -1);

// ===== Zeri → cella vuota (non "0") =====
// codes include AAA,BBB,DDD; solo AAA|BBB ha pair → AAA-DDD e BBB-DDD = 0 (noti, 0 in comune).
data.equiv = {};
data.codesLM = ['AAA', 'BBB', 'DDD'];
data.coexam = { perCode: { DDD: 200, AAA: 120, BBB: 60 }, pairs: { 'AAA|BBB': 30 }, codes: ['AAA', 'BBB', 'DDD'] };
data.pds = [{ name: 'P1', vincoloByCode: { AAA: 'OBB', BBB: 'FOR', DDD: 'OBB' } }];
renderCoexamMatrix();
const outZ = captures['coexamBody'] || '';
check('Zeri: nessuna cella mostra "0" (>0<)', outZ.indexOf('>0<') === -1);
check('Zeri: coppia a 0 fra codici noti → cella vuota (cx-na)', (outZ.match(/class="cx-na"/g) || []).length >= 2);
check('Zeri: AAA×BBB=30 resta visibile', outZ.indexOf('>30<') !== -1);

// ===== Cross-livello: 366BB è FOR sul foglio LT ma OPZ in LM → NON in matrice LM =====
data.equiv = {};
data.codesLM = ['AAA', 'BBB', 'DDD', '366BB']; // 366BB anche su foglio LM (mutuante) → in codesLM
data.coexam = { perCode: { AAA: 120, BBB: 60, DDD: 200, '366BB': 40 }, pairs: { 'AAA|BBB': 30 }, codes: ['AAA', 'BBB', 'DDD', '366BB'] };
data.pds = [{ name: 'P1', vincoloByCode: { AAA: 'OBB', BBB: 'FOR', DDD: 'OBB', '366BB': 'OPZ' } }]; // OPZ in LM
data.courses = [
  { code: 'AAA', name: 'A', vincolo: 'OBB', sheet: 'S1LM' },
  { code: 'DDD', name: 'D', vincolo: 'OBB', sheet: 'S1LM' },
  { code: '366BB', name: 'Forchetta LT', vincolo: 'FOR', sheet: 'S1LT' } // FOR sul foglio LT
];
renderCoexamMatrix();
const out366 = captures['coexamBody'] || '';
check('366BB (FOR sul foglio LT, OPZ in LM) NON nella matrice LM', out366.indexOf('>366BB<') === -1);
check('366BB: gli altri (AAA/BBB/DDD) restano in matrice LM', out366.indexOf('>AAA<') !== -1 && out366.indexOf('>DDD<') !== -1 && out366.indexOf('>BBB<') !== -1);

// ===== Mutuazione: docenti/nome dal corso MASTER anche per il codice mutuante =====
data.equiv = { '0024B': 'ZED' };
data.courses = (data.courses || []).concat([
  { code: 'ZED', name: 'Fluidodinamica', titolare: 'Rossi / Bianchi', anno: '', tipo: '', vincolo: 'FOR', sheet: 'S1LT' }
]);
const infoMut = coexCodeInfoHtml('0024B'); // codice mutuante (no corso proprio)
check('Mutuazione: docenti dal master (Rossi, sottolineato)', infoMut.indexOf('<u>Rossi</u>') !== -1);
check('Mutuazione: co-docente dal master (Bianchi)', infoMut.indexOf('Bianchi') !== -1);
check('Mutuazione: nome dal master (Fluidodinamica)', infoMut.indexOf('Fluidodinamica') !== -1);
check('Mutuazione: header mostra il codice mostrato (0024B)', infoMut.indexOf('0024B') !== -1);

// ===== PdS attivi (checkbox a destra) + spegnimento codici — matrice LM =====
// P1 cita AAA(OBB) e BBB(FOR); P2 cita BBB(OBB) e DDD(FOR). Disattivando un PdS,
// un codice citato SOLO da PdS spenti diventa grigio (cx-dim) su header/riga/colonna.
data.equiv = {};
data.codesLM = ['AAA', 'BBB', 'DDD'];
data.codesLT = [];
data.courses = [
  { code: 'AAA', name: 'A', vincolo: 'OBB', sheet: 'S1LM' },
  { code: 'BBB', name: 'B', vincolo: 'FOR', sheet: 'S1LM' },
  { code: 'DDD', name: 'D', vincolo: 'OBB', sheet: 'S1LM' }
];
data.sessions = [];
data.coexam = { perCode: { AAA: 120, BBB: 60, DDD: 200 }, pairs: { 'AAA|BBB': 30, 'BBB|DDD': 5 }, codes: ['AAA', 'BBB', 'DDD'] };
data.pds = [
  { name: 'P1', vincoloByCode: { AAA: 'OBB', BBB: 'FOR' } },
  { name: 'P2', vincoloByCode: { BBB: 'OBB', DDD: 'FOR' } }
];
_cxActivePds = null; _cxSel.LM = null;
renderCoexamMatrix();
const outPdsDef = captures['coexamBody'] || '';
check('PdS: pannello checkbox (cx-pds) + lato destro a due colonne (cx-side2)', outPdsDef.indexOf('cx-pds') !== -1 && outPdsDef.indexOf('cx-side2') !== -1);
check('PdS: P1 e P2 come checkbox', outPdsDef.indexOf('data-pds="P1"') !== -1 && outPdsDef.indexOf('data-pds="P2"') !== -1);
check('PdS: default tutti attivi → checked, nessun codice spento',
  outPdsDef.indexOf('cx-dim') === -1 && outPdsDef.indexOf('data-pds="P1" checked') !== -1 && outPdsDef.indexOf('data-pds="P2" checked') !== -1);

_cxActivePds = new Set(['P2']);   // P1 spento
renderCoexamMatrix();
const outP1off = captures['coexamBody'] || '';
check('PdS: P1 spento → AAA (solo P1) grigio su header (cx-dim)', outP1off.indexOf('cx-dim" data-code="AAA"') !== -1);
check('PdS: P1 spento → BBB NON grigio (anche in P2)', outP1off.indexOf('cx-dim" data-code="BBB"') === -1);
check('PdS: P1 spento → DDD NON grigio (in P2)', outP1off.indexOf('cx-dim" data-code="DDD"') === -1);
check('PdS: P1 spento → checkbox P1 non checked, P2 checked', outP1off.indexOf('data-pds="P1" checked') === -1 && outP1off.indexOf('data-pds="P2" checked') !== -1);

_cxActivePds = new Set();          // nessun PdS attivo
renderCoexamMatrix();
const outAllOff = captures['coexamBody'] || '';
check('PdS: nessuno attivo → AAA, BBB, DDD tutti grigi',
  outAllOff.indexOf('cx-dim" data-code="AAA"') !== -1 && outAllOff.indexOf('cx-dim" data-code="BBB"') !== -1 && outAllOff.indexOf('cx-dim" data-code="DDD"') !== -1);
_cxActivePds = null;

check('LT: niente pannello PdS (la matrice LT non usa i Piani di Studio)', outLT.indexOf('cx-pds') === -1 && outLT.indexOf('cx-side2') === -1);

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
