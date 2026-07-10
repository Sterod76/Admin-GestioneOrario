// Verifica suggestMoves (singolo spostamento) + pairCountsForCost, estratti da
// index.html: propone posizioni che abbassano il costo, rispettando i vincoli
// (aula libera, NON DISPONIBILE, 1 slot/giorno/riga, conflitti docente).
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

function extract(name) {
  const s = html.indexOf('function ' + name + '(');
  if (s < 0) throw new Error(name + ' non trovata');
  let i = html.indexOf('{', s), d = 0, e = -1;
  for (let k = i; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (d === 0) { e = k + 1; break; } } }
  return html.slice(s, e);
}
const FNS = ['slotLevelOf', 'canon', '_coexSync', 'coexamN', 'effN', 'coexamE', 'roomCapacity', '_isFullGroup', 'groupDivisor',
  'capacityInfo', '_annoOverlap', '_gCompatCost', '_pdsVincSets', '_sharePdsVinc', 'pairCountsForCost', 'teachersOfSess',
  '_marginalCost', '_roomFreeAt', '_rowFreeOnDay', '_teacherFreeAt', 'suggestMoves',
  'fmtCost', 'sessBySig', 'collisionSuggHtml'];

// globali richieste dalle funzioni
let data = {};
let slotStart = 540, slotEnd = 720;
let _coexCache = { ref: null, pairs: {}, perCode: {}, codes: new Set() };
let _pdsSetsCache = { ref: null, sets: [] };
function sigOf(src) { return src.sheet + '|' + src.row + '|' + src.col + '|' + src.idx; }
function fmt(min) { const h = Math.floor(min / 60), m = min % 60; return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m); }
function esc(s) { return String(s == null ? '' : s); }
eval(FNS.map(extract).join('\n'));

function S(code, vincolo, anno, group, day, start, end, room, row, tit) {
  return { code, sheet: 'S1LT', vincolo, anno: String(anno), group, day, start, end, room,
    src: { sheet: 'S1LT', row, col: 12 + day, idx: 0 }, titolare: tit };
}
data = {
  days: ['LUN', 'MAR'], rooms: ['R1', 'R2'], slotStepMin: 60, unavail: [],
  pds: [],
  coexam: { pairs: { 'A1B|B1B': 10 }, perCode: {}, codes: ['A1B', 'B1B'] },
  sessions: [
    S('A1B', 'OBB', 1, '', 0, 540, 600, 'R1', 5, 'Prof X'),   // S (selezionato)
    S('B1B', 'OBB', 1, '', 0, 540, 600, 'R2', 6, 'Prof Y'),   // O: collide con S (cost 1h×10=10)
    S('C1B', 'OBB', 1, '', 1, 540, 600, 'R1', 7, 'Prof X')    // T: stesso docente di S, MAR 540-600
  ]
};
const Sel = data.sessions[0];

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  XX  FAIL: ' + n); } }

// pairCountsForCost
check('pairCounts: S↔O collidono (LT OBB stesso anno, overlap)', pairCountsForCost(data.sessions[0], data.sessions[1]) === true);
check('pairCounts: S↔T NON (giorni diversi)', pairCountsForCost(data.sessions[0], data.sessions[2]) === false);

const sugg = suggestMoves(Sel);
check('Suggerimenti presenti', sugg.length > 0);
check('Tutti riducono il costo (delta<0)', sugg.every(m => m.delta < 0));
check('Miglior delta = −10 (rimuove la collisione)', Math.abs(sugg[0].delta + 10) < 1e-9);
// vincoli rispettati:
check('Esclusa l\'aula occupata R2/LUN/540 (O presente)', !sugg.some(m => m.room === 'R2' && m.day === 0 && m.start === 540));
check('Escluso conflitto docente MAR 540 (Prof X in T)', !sugg.some(m => m.day === 1 && m.start === 540));
check('Esiste un\'alternativa valida (es. LUN più tardi o MAR 600)', sugg.some(m => (m.day === 0 && m.start > 540) || (m.day === 1 && m.start >= 600)));
check('Posizione attuale non suggerita', !sugg.some(m => m.room === 'R1' && m.day === 0 && m.start === 540));

// popover collisione (hover sulla cella costo nel tab Collisioni)
const O = data.sessions[1];
check('sessBySig ritrova la sessione', sessBySig(sigOf(Sel.src)) === Sel);
const popHtml = collisionSuggHtml(Sel, O);
check('Popover: header "Spostamenti che riducono il costo"', popHtml.indexOf('Spostamenti') !== -1);
check('Popover: contiene un delta negativo (−)', popHtml.indexOf('−') !== -1);
check('Popover: cita un codice coinvolto (A1B o B1B)', popHtml.indexOf('A1B') !== -1 || popHtml.indexOf('B1B') !== -1);

// se non c'è collisione → nessun suggerimento
const lone = S('Z9B', 'OBB', 1, '', 1, 660, 720, 'R2', 9, 'Prof Z');
data.sessions.push(lone);
check('Slot senza collisioni → nessun suggerimento', suggestMoves(lone).length === 0);
check('Popover senza collisione → "Nessuno spostamento"', collisionSuggHtml(lone, null).indexOf('Nessuno') !== -1);

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
