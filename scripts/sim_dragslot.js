// Verifica _teacherBusyIntervals (vista Slot, evidenziazione drag): intervalli del
// giorno in cui il docente del corso trascinato è già impegnato. Estrae le funzioni
// REALI da src/index.html (sigOf, teachersOfSess, canon, _teacherBusyIntervals).
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

function extractFn(name) {
  const s = html.indexOf('function ' + name + '(');
  if (s < 0) { console.error('non trovata:', name); process.exit(2); }
  let i = html.indexOf('{', s), d = 0;
  for (let k = i; k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (d === 0) return html.slice(s, k + 1); }
  }
  console.error('brace non chiusa:', name); process.exit(2);
}

let data = {};
let _coexRoleCtxCache = null;
const fnSrc = [extractFn('sigOf'), extractFn('teachersOfSess'), extractFn('canon'),
  extractFn('_teacherBusySessions'), extractFn('_teacherBusyIntervals'),
  extractFn('_coexRoleCtx'), extractFn('_coexPairType'),
  extractFn('_isFullGroup'), extractFn('_annoOverlap'), extractFn('_gCompatCost'), extractFn('_ltCoexHit'),
  extractFn('_normTok'), extractFn('_teacherKey'), extractFn('_extKey'),
  extractFn('_externalBusyIntervals')].join('\n');
eval(fnSrc);

function S(code, docenti, day, start, end, row) {
  return { code, docenti, day, start, end, src: { sheet: 'S1LM', row: row || 0, col: 13, idx: 0 } };
}
// Dragged: 401B di VERDI, MAR (day 1), 14-16. src row 2.
const dragged = S('401B', ['VERDI'], 1, 840, 960, 2);
const sessions = [
  dragged,                                   // se stesso → escluso (stesso sig)
  S('405B', ['VERDI'], 1, 840, 960, 6),      // VERDI, giorno 1, codice diverso → BUSY
  S('402B', ['NERI'], 1, 840, 960, 3),       // altro docente → no
  S('403B', ['GIALLI', 'VERDI'], 1, 900, 1020, 4), // co-docente VERDI → BUSY
  S('401B', ['VERDI'], 1, 870, 990, 9),      // STESSO codice (401B) → escluso (falso positivo)
  S('406B', ['VERDI'], 0, 900, 1020, 7)      // giorno diverso (LUN) → escluso
];

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  XX  FAIL: ' + n); } }

data.equiv = {};
const iv = _teacherBusyIntervals(dragged, sessions, 1);
const codes = iv.map(x => x.code).sort();
check('Busy: solo 405B e 403B (VERDI, giorno 1, codice diverso)', codes.length === 2 && codes[0] === '403B' && codes[1] === '405B');
check('Busy: escluso se stesso (sig)', !iv.some(x => x.start === 840 && x.end === 960 && x.code === '401B'));
check('Busy: escluso stesso codice 401B (falso positivo)', !iv.some(x => x.code === '401B'));
check('Busy: escluso altro docente (402B/NERI)', !iv.some(x => x.code === '402B'));
check('Busy: escluso altro giorno (406B su LUN)', !iv.some(x => x.code === '406B'));
check('Busy: intervallo 405B = 840-960', iv.some(x => x.code === '405B' && x.start === 840 && x.end === 960));
check('Busy: co-docente conta (403B via VERDI)', iv.some(x => x.code === '403B'));

// _teacherBusySessions: stesse sorgenti ma con l'oggetto sessione completo (per cerchiare i blocchi)
const bsess = _teacherBusySessions(dragged, sessions, 1);
check('BusySessions: 2 sorgenti, tutte con src', bsess.length === 2 && bsess.every(o => o.src));
check('BusySessions: righe src = {4,6} (403B, 405B)', bsess.map(o => o.src.row).sort((a, b) => a - b).join(',') === '4,6');
check('BusySessions: esclude se stesso e stesso codice', !bsess.some(o => o.src.row === 2 || o.src.row === 9));

// Docente assente → nessun intervallo
check('Busy: corso senza docenti → nessun intervallo', _teacherBusyIntervals(S('999B', [], 1, 840, 960, 1), sessions, 1).length === 0);

// Mutuazione: il codice trascinato e un altro slot condividono la classe (canon) →
// stesso esame → NON è collisione anche se docente uguale.
data.equiv = { '0024B': '405B' }; // 0024B mutua 405B
const dr2 = S('0024B', ['VERDI'], 1, 840, 960, 2);
check('Busy: stesso CANON (mutuazione) escluso anche con codice diverso',
  !_teacherBusyIntervals(dr2, sessions, 1).some(x => x.code === '405B'));

// ── _coexPairType: tipo collisione di vincolo (OO/OF/FF valorizzati + PO/PF/PP con ─
//    opzionale, informativi), priorità OO>OF>FF>PO>PF>PP, valutato PER PdS; ripiego
//    sul vincolo di corso per i codici fuori da ogni PdS.
_coexRoleCtxCache = null;
data.equiv = { 'A1X': 'A1' }; // A1X mutua A1 (stessa classe di equivalenza)
data.pds = [
  { vincoloByCode: { A1: 'OBB', A2: 'OBB', B2: 'FOR', C1: 'FOR', C2: 'FOR', P: 'FOR', Q: 'FOR', Z: 'OPZ', Z2: 'OPZ', G: 'OPZ', H: 'OPZ' } },
  { vincoloByCode: { D1: 'OBB', C1: 'FOR', C2: 'OBB', P: 'OBB', Q: 'OBB', G: 'FOR', H: 'FOR' } }
];
data.courses = [
  { code: 'LT1', vincolo: 'FOR' }, { code: 'LT2', vincolo: 'FOR' }, { code: 'LT3', vincolo: 'OBB' }
];
check('Coex: OBB-OBB stesso PdS → OO', _coexPairType('A1', 'A2') === 'OO');
check('Coex: OBB-FOR stesso PdS → OF', _coexPairType('A1', 'B2') === 'OF');
check('Coex: FOR-FOR stesso PdS → FF', _coexPairType('B2', 'C1') === 'FF');
check('Coex: priorità OF>FF (FF in PdS1, OF in PdS2) → OF', _coexPairType('C1', 'C2') === 'OF');
check('Coex: priorità OO>FF (FF in PdS1, OO in PdS2) → OO', _coexPairType('P', 'Q') === 'OO');
check('Coex: due OBB in PdS DIVERSI (mai insieme) → null', _coexPairType('A1', 'D1') === null);
check('Coex: OPZ×OBB → PO (informativo)', _coexPairType('Z', 'A1') === 'PO');
check('Coex: OPZ×FOR → PF', _coexPairType('Z', 'B2') === 'PF');
check('Coex: OPZ×OPZ → PP', _coexPairType('Z', 'Z2') === 'PP');
check('Coex: priorità OBB/FOR > OPZ (PP in PdS1, FF in PdS2) → FF', _coexPairType('G', 'H') === 'FF');
check('Coex: stessa classe equiv. (A1X≡A1) → null', _coexPairType('A1X', 'A1') === null);
check('Coex: case-insensitive (a1 × a2) → OO', _coexPairType('a1', 'a2') === 'OO');
check('Coex: Triennale (fuori PdS) FOR-FOR via vincolo corso → FF', _coexPairType('LT1', 'LT2') === 'FF');
check('Coex: Triennale OBB-FOR via vincolo corso → OF', _coexPairType('LT3', 'LT1') === 'OF');
check('Coex: codici ignoti → null', _coexPairType('XXX', 'YYY') === null);

// Fix review (major): chiavi CANON — il PdS cita un MEMBRO, lo slot porta il CAPOSTIPITE.
data.equiv = { '0024B': '289BB' };                 // 0024B (membro) → 289BB (capostipite)
data.pds = [{ vincoloByCode: { '0024B': 'OBB', 'M2': 'OBB' } }];
data.courses = [];
check('Coex: PdS cita membro 0024B, slot porta canon 289BB → OO', _coexPairType('289BB', 'M2') === 'OO');
check('Coex: simmetrico (M2 × 289BB) → OO', _coexPairType('M2', '289BB') === 'OO');
// Fix review (major): cache invalidata al cambio di reference di data.pds (senza reset manuale).
data.pds = [{ vincoloByCode: { '289BB': 'FOR', 'M2': 'FOR' } }]; // nuovo reference, ruoli diversi
check('Coex: cache invalidata su nuovo data.pds → FF', _coexPairType('289BB', 'M2') === 'FF');

// ── _ltCoexHit: collisione Triennale = OBB+OBB, stesso anno, gruppi-prefisso ──────
const LT = (vincolo, anno, group) => ({ vincolo, anno, group });
check('LT: A↔B (gruppi disgiunti) → no', _ltCoexHit(LT('OBB', '1', 'A'), LT('OBB', '1', 'B')) === false);
check('LT: A↔A1 (padre/figlio) → sì', _ltCoexHit(LT('OBB', '1', 'A'), LT('OBB', '1', 'A1')) === true);
check('LT: A↔A2 → sì', _ltCoexHit(LT('OBB', '1', 'A'), LT('OBB', '1', 'A2')) === true);
check('LT: A1↔A2 (fratelli) → no', _ltCoexHit(LT('OBB', '1', 'A1'), LT('OBB', '1', 'A2')) === false);
check('LT: stesso gruppo A↔A → sì', _ltCoexHit(LT('OBB', '1', 'A'), LT('OBB', '1', 'A')) === true);
check('LT: gruppo vuoto ↔ A (stesso anno) → sì', _ltCoexHit(LT('OBB', '1', ''), LT('OBB', '1', 'A')) === true);
check('LT: A+B ↔ B (intera coorte) → sì', _ltCoexHit(LT('OBB', '1', 'A+B'), LT('OBB', '1', 'B')) === true);
check('LT: A+B ↔ A1 → sì', _ltCoexHit(LT('OBB', '1', 'A+B'), LT('OBB', '1', 'A1')) === true);
check('LT: anni diversi → no', _ltCoexHit(LT('OBB', '1', 'A'), LT('OBB', '2', 'A')) === false);
check('LT: uno non-OBB (FOR×OBB) → no', _ltCoexHit(LT('FOR', '1', 'A'), LT('OBB', '1', 'A')) === false);
check('LT: entrambi FOR → no', _ltCoexHit(LT('FOR', '1', 'A'), LT('FOR', '1', 'A')) === false);

// ── Impegni esterni (fuori dip.): match docente cognome+iniziale + intervalli/giorno ──
check('Ext: _teacherKey "Toncelli A." → TONCELLI/A', _teacherKey('TONCELLI A.').surname === 'TONCELLI' && _teacherKey('TONCELLI A.').initial === 'A');
check('Ext: _extKey Toncelli/Alessandra → TONCELLI/A', _extKey('Toncelli', 'Alessandra').surname === 'TONCELLI' && _extKey('Toncelli', 'Alessandra').initial === 'A');
check('Ext: cognome composto Di Bello ↔ DI BELLO', _teacherKey('Di Bello F.').surname === _extKey('Di Bello', 'Francesco').surname);
check('Ext: accenti Nicolò ↔ NICOLO', _teacherKey('Nicolò D.').surname === _extKey('Nicolò', 'Donato').surname && _teacherKey('Nicolò D.').initial === _extKey('Nicolò', 'Donato').initial);
const Sd = (doc, day) => ({ code: 'ZZZ', docenti: doc, day: day, start: 900, end: 960, src: { sheet: 'S1LT', row: 99, col: 13, idx: 0 } });
data.impegniEsterni = [
  { cognome: 'Toncelli', nome: 'Alessandra', day: 0, start: 600, end: 660, corso: 'X', aula: 'CHI A' },
  { cognome: 'Mazza', nome: 'Andrea', day: 0, start: 600, end: 660, corso: 'Y', aula: 'DST C' }
];
check('Ext: docente con impegno esterno nel giorno → 1', _externalBusyIntervals(Sd(['Toncelli A.'], 0), 0).length === 1);
check('Ext: stesso docente, altro giorno → 0', _externalBusyIntervals(Sd(['Toncelli A.'], 1), 1).length === 0);
check('Ext: omonimo iniziale diversa (Mazza G. ≠ Mazza A.) → 0', _externalBusyIntervals(Sd(['Mazza G.'], 0), 0).length === 0);
check('Ext: docente senza impegni esterni → 0', _externalBusyIntervals(Sd(['Rossi M.'], 0), 0).length === 0);
// cognomi con apostrofo (fix review): D'Elia non deve spezzarsi né perdere l'iniziale
check("Ext: D'Elia (dritto) → surname DELIA, initial M", _teacherKey("D'Elia M.").surname === 'DELIA' && _teacherKey("D'Elia M.").initial === 'M');
check('Ext: apostrofo tipografico ↔ dritto combaciano', _teacherKey('D' + String.fromCharCode(0x2019) + 'Elia M.').surname === _extKey("D'Elia", 'Mario').surname);
check("Ext: match D'Elia orario↔esterno", (function () { data.impegniEsterni = [{ cognome: "D'Elia", nome: 'Mario', day: 2, start: 600, end: 660, corso: 'Z', aula: 'X' }]; return _externalBusyIntervals(Sd(["D'Elia M."], 2), 2).length === 1; })());

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
