// Verifica che renderModLog (reale, estratto da index.html) mostri le voci
// NON DISPONIBILE (create/move/delete) e le modifiche sessione.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

const start = html.indexOf('function renderModLog() {');
if (start < 0) { console.error('renderModLog non trovata'); process.exit(2); }
let i = html.indexOf('{', start), d = 0, end = -1;
for (let k = i; k < html.length; k++) {
  if (html[k] === '{') d++;
  else if (html[k] === '}') { d--; if (d === 0) { end = k + 1; break; } }
}
const fnSrc = html.slice(start, end);

let captured = '';
const document = { getElementById: () => ({ set innerHTML(v) { captured = v; }, get innerHTML() { return captured; } }) };
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function sigOf(src) { return src.sheet + '|' + src.row + '|' + src.col + '|' + src.idx; }
const parkedItems = {};
let data = {};
eval(fnSrc);

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  XX  FAIL: ' + n); } }
function has(s) { return captured.indexOf(s) !== -1; }

// Scenario: una NON DISPONIBILE creata + una sessione spostata + nessun crash.
data = {
  days: ['LUN','MAR','MER','GIO','VEN','SAB'],
  sessions: [{ src: { sheet: 'S1LT', row: 5, col: 12, idx: 0 }, code: 'X1', name: 'Fisica' }],
  pendingEdits: [
    { unavail: true, op: 'create', uid: 'u1', room: 'Aula A', day: 2, start: 600, end: 660, text: 'NON DISPONIBILE' },
    { src: { sheet: 'S1LT', row: 5, col: 12, idx: 0 }, target: { col: 13, room: 'Aula B', start: 600, end: 720 }, original: { col: 12, room: 'Aula A', start: 540, end: 660 } }
  ]
};

renderModLog();

check('Log NON vuoto', !has('Nessuna modifica pendente'));
check('Voce NON DISPONIBILE presente', has('NON DISPONIBILE'));
check('NON DISPONIBILE marcata "nuova"', has('nuova'));
check('NON DISPONIBILE mostra aula/giorno/orario', has('Aula A') && has('MER') && has('10:00'));
check('data-kind unavail con data-uid', has('data-kind="unavail"') && has('data-uid="u1"'));
check('Modifica sessione (move) presente', has('🔀') && has('X1'));

// Scenario delete unavail
data.pendingEdits = [{ unavail: true, op: 'delete', uid: 'u2', orig: { room: 'Aula C', day: 0, start: 540 }, text: 'NON DISPONIBILE' }];
renderModLog();
check('Delete NON DISPONIBILE: "rimossa"', has('rimossa') && has('Aula C'));

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
