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
const fnSrc = [extractFn('sigOf'), extractFn('teachersOfSess'), extractFn('canon'),
  extractFn('_teacherBusyIntervals')].join('\n');
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

// Docente assente → nessun intervallo
check('Busy: corso senza docenti → nessun intervallo', _teacherBusyIntervals(S('999B', [], 1, 840, 960, 1), sessions, 1).length === 0);

// Mutuazione: il codice trascinato e un altro slot condividono la classe (canon) →
// stesso esame → NON è collisione anche se docente uguale.
data.equiv = { '0024B': '405B' }; // 0024B mutua 405B
const dr2 = S('0024B', ['VERDI'], 1, 840, 960, 2);
check('Busy: stesso CANON (mutuazione) escluso anche con codice diverso',
  !_teacherBusyIntervals(dr2, sessions, 1).some(x => x.code === '405B'));

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
