// Simulazione della logica reale renderCollisions(): estrae la funzione da
// src/index.html e la esegue su dati costruiti ad hoc, verificando le regole.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

// Estrai la funzione con brace-matching
const startIdx = html.indexOf('function renderCollisions() {');
if (startIdx < 0) { console.error('renderCollisions non trovata'); process.exit(2); }
let i = html.indexOf('{', startIdx), depth = 0, end = -1;
for (let k = i; k < html.length; k++) {
  if (html[k] === '{') depth++;
  else if (html[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
}
const fnSrc = html.slice(startIdx, end);

// Estrai anche il blocco helper costo (coexamN, costCellHtml, ...) — funzioni
// reali a scope di modulo usate da renderCollisions.
const hStart = html.indexOf('// ── Costo collisioni');
const hEnd = html.indexOf('// Riga di uno slot:');
if (hStart < 0 || hEnd < 0) { console.error('helper costo non trovati'); process.exit(2); }
const helperSrc = html.slice(hStart, hEnd);

// Estrai renderUbiquity (conflitti docente)
const uStart = html.indexOf('function renderUbiquity() {');
if (uStart < 0) { console.error('renderUbiquity non trovata'); process.exit(2); }
let ui = html.indexOf('{', uStart), ud = 0, uEnd = -1;
for (let k = ui; k < html.length; k++) {
  if (html[k] === '{') ud++;
  else if (html[k] === '}') { ud--; if (ud === 0) { uEnd = k + 1; break; } }
}
const ubiqSrc = html.slice(uStart, uEnd);

// Mock: cattura per-id (collisionsBody vs ubiquityBody)
const captures = {};
const document = { getElementById: (id) => ({ set innerHTML(v) { captures[id] = v; }, get innerHTML() { return captures[id] || ''; }, querySelectorAll: () => [] }) };
function esc(s) { return String(s == null ? '' : s); }
function fmt(m) { const h = Math.floor(m / 60), x = m % 60; return (h < 10 ? '0' : '') + h + ':' + (x < 10 ? '0' : '') + x; }
let data = {};
let currentView = 'collisions';
let _collView = 'list';
let _collSel = { of: null, ff: null, opz: null };

// helper + renderCollisions + renderUbiquity nello STESSO scope
eval(helperSrc + '\n' + fnSrc + '\n' + ubiqSrc);

function S(code, sheet, vincolo, anno, group, day, start, end, titolare) {
  return { code, sheet, vincolo, anno: String(anno), group, day, start, end, room: 'R', name: code + 'n', titolare: titolare || '' };
}

data = {
  days: ['LUN','MAR','MER','GIO','VEN','SAB'],
  sessions: [
    // LT OBB, LUN 09:00-11:00 (540-660)
    S('X1','S1LT','OBB','1','A',0,540,660),
    S('X2','S1LT','OBB','1','A1',0,540,660), // A vs A1 → collide con X1
    S('X3','S1LT','OBB','1','A2',0,540,660), // A vs A2 → collide con X1; A1 vs A2 → no
    S('X4','S1LT','OBB','2','A',0,540,660),  // anno diverso → nessuna
    S('X5','S1LT','OBB','1','B',0,540,660),  // gruppo B → nessuna con A*
    // LM, MAR 14:00-16:00 (840-960)
    S('M1','S1LM','OBB','','',1,840,960),
    S('M2','S1LM','OBB','','',1,840,960),
    S('M3','S1LM','FOR','','',1,840,960),
    S('M4','S1LM','FOR','','',1,840,960),
    // Seconda istanza M1×M3 (GIO) → la coppia M1×M3 ha 2 varianti (raggruppate)
    S('M1','S1LM','OBB','','',3,840,960),
    S('M3','S1LM','FOR','','',3,840,960),
    // Stesso docente "Rossi" in due slot sovrapposti MER (fallback su titolare)
    S('D1','S1LT','OBB','1','A',2,540,600,'Rossi'),
    S('D2','S1LM','OBB','','',2,570,630,'Rossi'),
    // Multi-docente (array docenti): D3 co-tenuto Verdi+Neri overlappa D4 (Neri)
    // GIO 09:00-10:00 vs 09:30-10:30 → conflitto NERI (co-docente conta).
    { code:'D3', sheet:'S1LM', vincolo:'OBB', anno:'', group:'', day:3, start:540, end:600, room:'R', name:'D3n', titolare:'Verdi / Neri', docenti:['Verdi','Neri'] },
    { code:'D4', sheet:'S1LM', vincolo:'OBB', anno:'', group:'', day:3, start:570, end:630, room:'R', name:'D4n', titolare:'Neri', docenti:['Neri'] },
    // Stesso CODICE (D5) col medesimo docente, sovrapposti → falsa collisione: ESCLUSA
    { code:'D5', sheet:'S1LM', vincolo:'OBB', anno:'', group:'', day:4, start:540, end:600, room:'R', name:'D5n', titolare:'Gialli', docenti:['Gialli'] },
    { code:'D5', sheet:'S1LM', vincolo:'OBB', anno:'', group:'A', day:4, start:570, end:630, room:'R', name:'D5n', titolare:'Gialli', docenti:['Gialli'] }
  ],
  pds: [
    { name: 'P1', codes: ['M1','M2','M3','M4'],
      vincoloByCode: { M1: 'OBB', M2: 'OBB', M3: 'FOR', M4: 'FOR' } }
  ],
  // Matrice co-esami. X1-X3=8 (ordine naturale DOPO X1-X2 ma costo MAGGIORE →
  // testa l'ordinamento), X1-X2=3. M1/M2 noti senza coppia → 0; M3/M4 fuori matrice → n/d.
  coexam: { pairs: { 'X1|X2': 3, 'X1|X3': 8 }, perCode: { M1: 10, M2: 8 }, codes: ['X1','X2','X3','M1','M2'], count: 2 }
};

renderCollisions();
const out = captures['collisionsBody'] || '';
renderUbiquity();
const outU = captures['ubiquityBody'] || '';

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  OK  ' + name); } else { fail++; console.log('  XX  FAIL: ' + name); } }
function has(s) { return out.indexOf(s) !== -1; }
function hasU(s) { return outU.indexOf(s) !== -1; }
// Nuovo formato a "chip": ogni codice è in <span class="cl-code"...>CODE [grp]</span>.
const lis = out.match(/<li\b[\s\S]*?<\/li>/g) || [];
// Il codice nel chip è ora <span class="cl-code">CODE</span> (senza gruppo).
function codeTok(c) { return '>' + c + '</span>'; }
function hasPair(a, b) {
  return lis.some(li => li.indexOf(codeTok(a)) !== -1 && li.indexOf(codeTok(b)) !== -1);
}

// ===== Vista LISTA: raggruppata per Piano di Studi =====
// Triennale (LT OBB): coppie da anno+gruppo
check('Triennale: X1 ✕ X2 presente (A vs A1)', hasPair('X1', 'X2'));
check('Triennale: X1 ✕ X3 presente (A vs A2)', hasPair('X1', 'X3'));
check('Triennale: X2 ✕ X3 ASSENTE (A1 vs A2 non compat)', !hasPair('X2', 'X3'));
check('Triennale: X4 (anno 2) ASSENTE', !has(codeTok('X4')));
check('Triennale: X5 (gruppo B) ASSENTE', !has(codeTok('X5')));
// PdS P1: OBB-OBB, OBB-FOR, FOR-FOR insieme nello stesso gruppo
check('P1: M1 ✕ M2 (OBB-OBB) presente', hasPair('M1', 'M2'));
check('P1: M1 ✕ M3 (OBB-FOR) presente', hasPair('M1', 'M3'));
check('P1: M2 ✕ M4 (OBB-FOR) presente', hasPair('M2', 'M4'));
check('P1: M3 ✕ M4 (FOR-FOR) presente', hasPair('M3', 'M4'));

// Sezioni: una per Piano di Studi (header h3), niente OBBLIGHI/OBB-FOR/FF
check('Sezione "Triennale" (h3)', has('<h3>Triennale'));
check('Sezione PdS "P1" (h3)', has('<h3>P1'));
check('Niente sezione OBBLIGHI (h3)', !has('<h3>OBBLIGHI'));
// Niente sotto-blocchi varianti né vecchi sotto-header
check('Niente box varianti (cl-group assente)', !has('cl-group'));
check('Niente vecchio sotto-header cl-pds', !has('<div class="cl-pds">'));
// Le 2 varianti M1×M3 sono righe SEPARATE (non raggruppate)
check('M1×M3: 2 righe separate (varianti non raggruppate)',
  lis.filter(li => li.indexOf(codeTok('M1')) !== -1 && li.indexOf(codeTok('M3')) !== -1).length >= 2);
// Include costo 0 e n/d (come richiesto)
check('Include costo 0 (M1✕M2 → cl-cost-zero)', has('cl-cost-zero'));
check('Include n/d (M-M3/M4 → cl-cost-na)', has('cl-cost-na'));

// Costi e ordinamento
check('COSTO: X1✕X3 = 16 (cl-cost-val 16)', has('cl-cost-val">16<'));
check('COSTO: X1✕X2 = 6 (cl-cost-val 6)', has('cl-cost-val">6<'));
check('N>=5 → cella ROSSA (cl-cost-hi), solo X1✕X3', (out.match(/cl-cost-hi/g) || []).length === 1);
check('ORDINE costo desc in Triennale (X1✕X3 prima di X1✕X2)', out.indexOf('>X3<') < out.indexOf('>X2<'));
check('NIENTE stima: nessun cl-cost-est', !has('cl-cost-est'));
check('NIENTE stima: nessun marker ~N=', !has('~N='));
check('BANNER: funzione di costo presente', has('Funzione di costo'));
check('BANNER: totale 22 (16+6)', has('<b>22</b>'));
check('Chip con tooltip (title)', has('class="cl-chip" title='));

// Colori: obbligo rosso prima di forchetta gialla nelle coppie miste
const ofLis = lis.filter(li => li.indexOf('#ffcfc9') !== -1 && li.indexOf('#ffe5a0') !== -1);
check('OBB-FOR: rosso(obbligo) prima di giallo(forchetta)',
  ofLis.length > 0 && ofLis.every(li => li.indexOf('#ffcfc9') < li.indexOf('#ffe5a0')));
check('FF: M3×M4 due chip gialle', lis.some(li => (li.match(/background:#ffe5a0/g) || []).length === 2));
check('CSS: chip a larghezza fissa (allineamento ✕)', html.indexOf('.cl-list li .cl-chip { flex: 0 0 300px') !== -1);

// Tab Obiquità: Rossi in D1 e D2 sovrapposti (fallback su titolare)
check('OBIQUITÀ: docente ROSSI elencato', hasU('ROSSI'));
check('DOCENTI: marker ⚠ collisione docente', hasU('⚠ collisione docente'));
check('OBIQUITÀ: contiene i codici D1/D2', hasU('>D1</span>') && hasU('>D2</span>'));
// Multi-docente (array s.docenti): il co-docente NERI genera conflitto D3/D4
check('OBIQUITÀ multi-docente: NERI (co-docente) in conflitto', hasU('NERI'));
check('OBIQUITÀ multi-docente: D3 e D4 elencati', hasU('>D3</span>') && hasU('>D4</span>'));
check('OBIQUITÀ: VERDI senza overlap non elencato', !hasU('VERDI'));
check('OBIQUITÀ: stesso codice escluso (GIALLI non elencato)', !hasU('GIALLI'));
check('COLLISIONI non contiene più DOCENTI inline', !has('⚠ docente'));

// ===== Vista MATRICE collisioni =====
// (dopo le asserzioni lista: ora aggiungo dati co-esami per M1×M3 con N≥5 e
//  passo alla vista matrice; M4 resta fuori matrice → celle n/d)
// M1×M3 (N=6) e M2×M4 (N=5) costo>0 (OBB-FOR); M3×M4 (N=3) costo>0 (FF).
// M1×M4 e M2×M3 = 0 (coppia assente fra codici noti) → casella VUOTA.
data.coexam = { codes: ['X1', 'X2', 'X3', 'M1', 'M2', 'M3', 'M4'], perCode: { M1: 10, M2: 8, M3: 5, M4: 4 }, pairs: { 'X1|X2': 3, 'X1|X3': 8, 'M1|M3': 6, 'M2|M4': 5, 'M3|M4': 3 }, count: 5 };
_collView = 'matrix';
renderCollisions();
const mout = captures['collisionsBody'];
function hasM(s) { return mout.indexOf(s) !== -1; }
check('MATRICE: toggle "solo liste"/"matrice forchette"', hasM('Mostra solo liste') && hasM('Mostra matrice forchette'));
check('MATRICE: obblighi SEMPRE a lista (sezioni h3 + costo, niente matrice obblighi)', hasM('<h3>') && hasM('cl-list'));
check('MATRICE: due tabelle (OBB-FOR + FF)', (mout.match(/clm-table/g) || []).length >= 2);
check('MATRICE: celle cliccabili (clm-cell)', hasM('clm-cell'));
check('MATRICE: costo>0 colorato e ROSSO (N≥5)', hasM('clm-hi'));
check('MATRICE: NIENTE n/d (clm-nd assente)', mout.indexOf('clm-nd') === -1);
check('MATRICE: NIENTE celle a 0 (>0</td> assente)', mout.indexOf('>0</td>') === -1);
check('MATRICE: caselle vuote presenti (cx-na) per costo 0', mout.indexOf('cx-na') !== -1);
check('MATRICE: dettaglio a DESTRA (clm-wrap + clm-side)', hasM('clm-wrap') && hasM('clm-side'));
// selezione cella → drill-down varianti (a destra)
_collSel.of = { r: 'M1', c: 'M3' };
renderCollisions();
const mout2 = captures['collisionsBody'];
check('MATRICE: selezione cella → drill-down (clm-detail)', mout2.indexOf('clm-detail') !== -1);
check('MATRICE: drill-down M1×M3 con 2 varianti', mout2.indexOf('2 varianti') !== -1);
check('MATRICE: costo per esteso (ore·studente/settimana + overlap storico)', mout2.indexOf('ore·studente/settimana') !== -1 && mout2.indexOf('in overlap storico per') !== -1);
check('MATRICE: PdS a destra dopo il costo (clm-var-pds)', mout2.indexOf('clm-var-pds') !== -1);
check('MATRICE: i 2 slot su righe distinte (clm-slot ×2 per variante)', (mout2.match(/clm-slot"/g) || []).length >= 4);

// ===== Vista MATRICE: terza matrice OPZIONALI × TUTTI (NON valorizzata) =====
// PdS con opzionali: O1, O2 (OPZ) su MAR 14-16, sovrapposti a M1/M2 (OBB),
// M3/M4 (FOR) e fra loro (OPZ-OPZ). La matrice deve mostrare SOLO la presenza
// delle collisioni (●/numero), niente costo.
data.pds = [
  { name: 'P1', codes: ['M1', 'M2', 'M3', 'M4', 'O1', 'O2'],
    vincoloByCode: { M1: 'OBB', M2: 'OBB', M3: 'FOR', M4: 'FOR', O1: 'OPZ', O2: 'OPZ' } }
];
data.sessions = data.sessions.concat([
  S('O1', 'S1LM', 'OPZ', '', '', 1, 840, 960), // MAR 14-16 → overlappa M1..M4
  S('O2', 'S1LM', 'OPZ', '', '', 1, 900, 960)  // MAR 15-16 → overlappa O1 (OPZ-OPZ) e M1..M4
]);
_collSel = { of: null, ff: null, opz: null };
_collView = 'matrix';
renderCollisions();
const oout = captures['collisionsBody'];
function hasO(s) { return oout.indexOf(s) !== -1; }
check('OPZ MATRICE: sezione "OPZIONALI – TUTTI" presente', hasO('OPZIONALI'));
check('OPZ MATRICE: tre tabelle clm-table (OF + FF + OPZ)', (oout.match(/clm-table/g) || []).length >= 3);
check('OPZ MATRICE: celle verdi non valorizzate (clm-opz)', hasO('clm-opz'));
check('OPZ MATRICE: badge totale per colonna (clm-coltot)', hasO('clm-coltot'));
check('OPZ MATRICE: marker presenza ● (niente costo)', hasO('>●</td>'));
// O1/O2 (colonne OPZ) intestate; M1..M4 (righe) presenti come intestazioni di riga
check('OPZ MATRICE: colonne O1 e O2 (opzionali)', hasO('>O1</span>') && hasO('>O2</span>'));
check('OPZ MATRICE: righe M1/M3 (obbligo/forchetta) presenti', oout.indexOf('cx-rh') !== -1);
// Selezione cella OPZ → drill-down varianti a destra (riuso renderVariantCard)
_collSel = { of: null, ff: null, opz: { r: 'M1', c: 'O1' } };
renderCollisions();
const oout2 = captures['collisionsBody'];
check('OPZ MATRICE: selezione cella → drill-down (clm-detail)', oout2.indexOf('clm-detail') !== -1);
check('OPZ MATRICE: drill-down M1 ✕ O1', oout2.indexOf('M1 ✕ O1') !== -1);

// ===== Mutuazione: le sessioni del CAPOSTIPITE (su foglio LT) partecipano alle
// collisioni del PdS LM che cita il codice mutuante. Regressione: prima sparivano
// i casi obbligo-obbligo e forchetta-forchetta che coinvolgono codici mutuati. =====
data.equiv = { K2: 'KM', F2: 'FM' };                 // K2→KM, F2→FM (capostipiti)
data.pds = [{ name: 'P2', codes: ['K1', 'K2', 'F1', 'F2'],
  vincoloByCode: { K1: 'OBB', K2: 'OBB', F1: 'FOR', F2: 'FOR' } }];
data.sessions = data.sessions.concat([
  S('K1', 'S1LM', 'OBB', '', '', 5, 540, 660),       // obbligo reale LM
  S('KM', 'S1LT', 'FOR', '1', 'A', 5, 540, 660),     // capostipite di K2: lezioni sul foglio LT, overlap K1
  S('F1', 'S1LM', 'FOR', '', '', 5, 840, 960),       // forchetta reale LM
  S('FM', 'S1LT', 'OBB', '1', 'A', 5, 840, 960)      // capostipite di F2: lezioni sul foglio LT, overlap F1
]);
_collView = 'list';
renderCollisions();
const outMut = captures['collisionsBody'] || '';
const lisMut = outMut.match(/<li\b[\s\S]*?<\/li>/g) || [];
function hasPairMut(a, b) { return lisMut.some(li => li.indexOf(codeTok(a)) !== -1 && li.indexOf(codeTok(b)) !== -1); }
check('Mutuazione: OBB-OBB K1×KM (capostipite su LT) presente in lista', hasPairMut('K1', 'KM'));
check('Mutuazione: FOR-FOR F1×FM (capostipite su LT) presente in lista', hasPairMut('F1', 'FM'));
check('Mutuazione: K1×KM colorato obbligo (rosso ×2)',
  lisMut.some(li => li.indexOf(codeTok('K1')) !== -1 && li.indexOf(codeTok('KM')) !== -1 && (li.match(/#ffcfc9/g) || []).length === 2));

// ===== Sopra-diagonale: FF e blocco OPZ×OPZ mostrano SOLO la metà superiore =====
// (la metà inferiore è il duplicato speculare e va nascosta). Dataset dedicato:
// 3 forchette G1/G2/G3 tutte in collisione (LUN); 1 obbligo H0 + 3 opzionali
// HA/HB/HC tutti in collisione (MAR). Estraggo le celle renderizzate via data-k.
data.equiv = {};
data.pds = [{ name: 'P3',
  codes: ['G1', 'G2', 'G3', 'H0', 'HA', 'HB', 'HC'],
  vincoloByCode: { G1: 'FOR', G2: 'FOR', G3: 'FOR', H0: 'OBB', HA: 'OPZ', HB: 'OPZ', HC: 'OPZ' } }];
data.sessions = [
  S('G1', 'S1LM', 'FOR', '', '', 0, 540, 660),
  S('G2', 'S1LM', 'FOR', '', '', 0, 540, 660),
  S('G3', 'S1LM', 'FOR', '', '', 0, 540, 660),
  S('H0', 'S1LM', 'OBB', '', '', 1, 840, 960),
  S('HA', 'S1LM', 'OPZ', '', '', 1, 840, 960),
  S('HB', 'S1LM', 'OPZ', '', '', 1, 840, 960),
  S('HC', 'S1LM', 'OPZ', '', '', 1, 840, 960)
];
data.coexam = { codes: ['G1', 'G2', 'G3'], perCode: { G1: 5, G2: 5, G3: 5 },
  pairs: { 'G1|G2': 4, 'G1|G3': 4, 'G2|G3': 4 }, count: 3 };
_collSel = { of: null, ff: null, opz: null };
_collView = 'matrix';
renderCollisions();
const tout = captures['collisionsBody'];
function cellsOf(htmlStr, k) {
  const re = /data-k="([^"]*)" data-r="([^"]*)" data-c="([^"]*)"/g; let m; const arr = [];
  while ((m = re.exec(htmlStr))) { if (m[1] === k) arr.push(m[2] + '>' + m[3]); }
  return arr;
}
const ffCells = cellsOf(tout, 'ff');
check('FF triangolo: esattamente 3 celle (sopra-diagonale di 3 forchette)', ffCells.length === 3);
check('FF triangolo: nessuna coppia speculare',
  ffCells.every(p => { const x = p.split('>'); return ffCells.indexOf(x[1] + '>' + x[0]) === -1; }));
const opzCells = cellsOf(tout, 'opz');
const opzSet = { HA: 1, HB: 1, HC: 1 };
const oo = opzCells.filter(p => { const x = p.split('>'); return opzSet[x[0]] && opzSet[x[1]]; });
check('OPZ×OPZ triangolo: 3 celle (sopra-diagonale di 3 opzionali)', oo.length === 3);
check('OPZ×OPZ triangolo: nessuna coppia speculare opz-opz',
  oo.every(p => { const x = p.split('>'); return oo.indexOf(x[1] + '>' + x[0]) === -1; }));
check('OPZ: riga OBB resta INTERA (H0 collide con HA/HB/HC)',
  opzCells.filter(p => p.split('>')[0] === 'H0').length === 3);
check('OPZ: badge colonna = totale reale (HA collide con 3 esami, incl. H0)',
  tout.indexOf('HA collide con 3 esami') !== -1);

// ===== Additività fra sezioni: una collisione contata in OBB-FORCHETTE non va
// ripetuta in FORCHETTE-FORCHETTE. Caso: codice AA è OBB nel PdS PA e FOR nel PdS
// PB; BB è FOR in entrambi. AA×BB collidono (LUN 9-11). Deve comparire SOLO nella
// matrice OBB-FOR, non nella FF, e il banner deve contarla UNA volta. =====
data.equiv = {};
data.pds = [
  { name: 'PA', codes: ['AA', 'BB'], vincoloByCode: { AA: 'OBB', BB: 'FOR' } },
  { name: 'PB', codes: ['AA', 'BB'], vincoloByCode: { AA: 'FOR', BB: 'FOR' } }
];
data.sessions = [
  S('AA', 'S1LM', 'OBB', '', '', 0, 540, 660),
  S('BB', 'S1LM', 'FOR', '', '', 0, 540, 660)
];
data.coexam = { codes: ['AA', 'BB'], perCode: { AA: 5, BB: 5 }, pairs: { 'AA|BB': 4 }, count: 1 };
_collSel = { of: null, ff: null, opz: null };
_collView = 'matrix';
renderCollisions();
const aout = captures['collisionsBody'];
const ofC = cellsOf(aout, 'of'), ffC = cellsOf(aout, 'ff');
const isAB = p => { const x = p.split('>'); return x.indexOf('AA') !== -1 && x.indexOf('BB') !== -1; };
check('Additività: AA×BB presente nella matrice OBB-FORCHETTE', ofC.some(isAB));
check('Additività: AA×BB ASSENTE nella matrice FF (già contata in OBB-FOR)', !ffC.some(isAB));
check('Additività: il banner conta la collisione UNA sola volta (su 1 collision)', aout.indexOf('su 1 collision') !== -1);

// ===== Accorpamento varianti per-gruppo: lo STESSO clash (giorno|orario|coppia)
// in due gruppi diversi ha la stessa N → va contato UNA volta nella cella, così la
// somma delle celle = totale del banner. XO obbligo con gruppi A e B entrambi su
// LUN 9-11; YF forchetta su LUN 9-11. Costo atteso 2h × N=4 = 8 (NON 16). =====
data.equiv = {};
data.pds = [{ name: 'PG', codes: ['XO', 'YF'], vincoloByCode: { XO: 'OBB', YF: 'FOR' } }];
data.sessions = [
  S('XO', 'S1LM', 'OBB', '', 'A', 0, 540, 660),
  S('XO', 'S1LM', 'OBB', '', 'B', 0, 540, 660),
  S('YF', 'S1LM', 'FOR', '', '', 0, 540, 660)
];
data.coexam = { codes: ['XO', 'YF'], perCode: { XO: 5, YF: 5 }, pairs: { 'XO|YF': 4 }, count: 1 };
_collSel = { of: null, ff: null, opz: null };
_collView = 'matrix';
renderCollisions();
const gout = captures['collisionsBody'];
check('Per-gruppo: cella OBB-FOR conta il clash UNA volta (costo 8, non 16)',
  gout.indexOf('>8</td>') !== -1 && gout.indexOf('>16</td>') === -1);
check('Per-gruppo: drill-down accorpa le varianti (1 clash, non 2)', (function () {
  _collSel = { of: { r: 'XO', c: 'YF' }, ff: null, opz: null };
  renderCollisions();
  const d = captures['collisionsBody'];
  return d.indexOf('— 1 variante') !== -1 && d.indexOf('clm-detail') !== -1;
})());
check('Per-gruppo: banner conta 1 collisione (non 2)', gout.indexOf('su 1 collision') !== -1);

// ===== FF matrice QUADRATA: F1-F2 e F3-F4 collidono, nient'altro. Gli stessi
// codici compaiono su entrambi gli assi (4×4), ma è valorizzata SOLO la
// sopra-diagonale (2 celle: F1>F2, F3>F4). La prima colonna e l'ultima riga
// restano senza celle valorizzate, ma le intestazioni ci sono comunque. =====
data.equiv = {};
data.pds = [{ name: 'PS', codes: ['F1', 'F2', 'F3', 'F4'], vincoloByCode: { F1: 'FOR', F2: 'FOR', F3: 'FOR', F4: 'FOR' } }];
data.sessions = [
  S('F1', 'S1LM', 'FOR', '', '', 0, 540, 660), S('F2', 'S1LM', 'FOR', '', '', 0, 540, 660),
  S('F3', 'S1LM', 'FOR', '', '', 1, 540, 660), S('F4', 'S1LM', 'FOR', '', '', 1, 540, 660)
];
data.coexam = { codes: ['F1', 'F2', 'F3', 'F4'], perCode: { F1: 5, F2: 5, F3: 5, F4: 5 }, pairs: { 'F1|F2': 4, 'F3|F4': 4 }, count: 2 };
_collSel = { of: null, ff: null, opz: null };
_collView = 'matrix';
renderCollisions();
const sout = captures['collisionsBody'];
const sff = cellsOf(sout, 'ff');
check('FF quadrata: solo 2 celle valorizzate (sopra-diagonale: F1>F2, F3>F4)', sff.length === 2 && sff.indexOf('F1>F2') !== -1 && sff.indexOf('F3>F4') !== -1);
// Isola la sezione FF in modo robusto: è il chunk che contiene celle data-k="ff".
const ffSec = (sout.split('<div class="cl-section">').find(s => s.indexOf('data-k="ff"') !== -1)) || '';
// NB: /cx-ch"/ per non matchare anche "cx-chl" (lo span interno dell'header).
const nRh = (ffSec.match(/cx-rh"/g) || []).length, nCh = (ffSec.match(/cx-ch"/g) || []).length;
check('FF quadrata: stessi codici su entrambi gli assi (4 righe, 4 colonne)', nRh === 4 && nCh === 4);

// ===== Bipartita OBB-FOR speculare: AA è OBB nel PdS PA e FOR nel PdS PB; BB è
// FOR in PA e OBB in PB. Lo stesso clash AA-BB compare sia in (AA-obbligo,
// BB-forchetta) sia in (BB-obbligo, AA-forchetta): vengono mostrate ENTRAMBE le
// caselle, ciascuna marcata "/2" (metà), così la somma resta additiva ma si vede
// la collisione in entrambe le posizioni. Il banner la conta una volta. =====
data.equiv = {};
data.pds = [
  { name: 'PA', codes: ['AA', 'BB'], vincoloByCode: { AA: 'OBB', BB: 'FOR' } },
  { name: 'PB', codes: ['AA', 'BB'], vincoloByCode: { AA: 'FOR', BB: 'OBB' } }
];
data.sessions = [S('AA', 'S1LM', 'OBB', '', '', 0, 540, 660), S('BB', 'S1LM', 'OBB', '', '', 0, 540, 660)];
data.coexam = { codes: ['AA', 'BB'], perCode: { AA: 5, BB: 5 }, pairs: { 'AA|BB': 4 }, count: 1 };
_collSel = { of: null, ff: null, opz: null };
_collView = 'matrix';
renderCollisions();
const bout = captures['collisionsBody'];
const bof = cellsOf(bout, 'of').filter(p => { const x = p.split('>'); return x.indexOf('AA') !== -1 && x.indexOf('BB') !== -1; });
check('Bipartita: AA-BB mostrata in DUE celle speculari', bof.length === 2 && bof.indexOf('AA>BB') !== -1 && bof.indexOf('BB>AA') !== -1);
check('Bipartita: entrambe le celle marcate "/2" (clm-half ×2)', (bout.match(/clm-half/g) || []).length === 2);
check('Bipartita: entrambe le celle "dup" (clm-dup ×2)', (bout.match(/clm-dup/g) || []).length === 2);
check('Bipartita: banner conta la collisione UNA sola volta (su 1 collision)', bout.indexOf('su 1 collision') !== -1);
// Drill-down condiviso: selezionando AA×BB compaiono le varianti di ENTRAMBE le
// caselle speculari (stessa collisione vista dai due PdS) con la nota dup.
_collSel = { of: { r: 'AA', c: 'BB' }, ff: null, opz: null };
renderCollisions();
const bout2 = captures['collisionsBody'];
check('Bipartita: drill-down mostra le 2 orientazioni assieme (2 varianti + nota)',
  bout2.indexOf('2 varianti') !== -1 && bout2.indexOf('clm-dupnote') !== -1);

// ===== Additività END-TO-END: la somma dei valori delle celle (OBB-FOR + FF)
// eguaglia il totale del banner. Dataset senza OBB-OBB così che banner = of+ff.
// AA-BB compare anche al rovescio (PA/PB) e CC-DD è una FF: niente doppi conteggi. =====
data.equiv = {};
data.pds = [
  { name: 'PA', codes: ['AA', 'BB'], vincoloByCode: { AA: 'OBB', BB: 'FOR' } },
  { name: 'PB', codes: ['AA', 'BB'], vincoloByCode: { AA: 'FOR', BB: 'OBB' } },
  { name: 'PC', codes: ['CC', 'DD'], vincoloByCode: { CC: 'FOR', DD: 'FOR' } }
];
data.sessions = [
  S('AA', 'S1LM', 'OBB', '', '', 0, 540, 660), S('BB', 'S1LM', 'OBB', '', '', 0, 540, 660),
  S('CC', 'S1LM', 'FOR', '', '', 1, 540, 660), S('DD', 'S1LM', 'FOR', '', '', 1, 540, 660)
];
data.coexam = { codes: ['AA', 'BB', 'CC', 'DD'], perCode: { AA: 5, BB: 5, CC: 5, DD: 5 }, pairs: { 'AA|BB': 4, 'CC|DD': 4 }, count: 2 };
_collSel = { of: null, ff: null, opz: null };
_collView = 'matrix';
renderCollisions();
const eout = captures['collisionsBody'];
// Somma dup-aware: le celle speculari (clm-dup) contano METÀ ("/2"), le altre intere.
let cellSum = 0, mm, cre = /<td class="([^"]*clm-cell[^"]*)" data-k="(?:of|ff)"[^>]*?>(\d+)/g;
while ((mm = cre.exec(eout))) { const v = parseInt(mm[2], 10); cellSum += /clm-dup/.test(mm[1]) ? v / 2 : v; }
const bm = eout.match(/overlap totale\):[\s\S]*?<b>(\d+)<\/b>/);
const bannerTot = bm ? parseInt(bm[1], 10) : -1;
check('Additività E2E: somma celle (' + cellSum + ') = totale banner (' + bannerTot + ')', cellSum === bannerTot && bannerTot === 16);

// ===== Somme di riga/colonna + totale generale (angolo) sulle matrici di costo.
// Ogni matrice (OBB-FOR, FF) ha un totale (cx-grand); la loro somma = banner. =====
const grands = []; let gm; const gre = /cx-grand[^>]*>([\d.]+)<\/td>/g;
while ((gm = gre.exec(eout))) grands.push(parseFloat(gm[1]));
check('Somme: presenti i totali di riga/colonna (cx-sum) e generale (cx-grand)',
  (eout.match(/cx-sum/g) || []).length >= 2 && grands.length === 2);
check('Somme: i totali delle matrici (OF+FF) sommano al banner (' + grands.join('+') + '=' + bannerTot + ')',
  grands.reduce((a, b) => a + b, 0) === bannerTot);

// ===== OBB-OBB vuoto: quando non ci sono collisioni obbligo-obbligo, la vista
// matrice scrive esplicitamente "OBBLIGHI – OBBLIGHI · — nessuna collisione —"
// (il dataset E2E non ha coppie OBB-OBB). =====
check('OBB-OBB vuoto: sezione "OBBLIGHI – OBBLIGHI" con "nessuna collisione"',
  /<h3>OBBLIGHI[^<]*OBBLIGHI<\/h3><div class="cl-none">[^<]*nessuna collisione/.test(eout));

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
