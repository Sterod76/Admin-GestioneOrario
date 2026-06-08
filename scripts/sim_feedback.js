// Verifica _feedbackRows_ (WebApp.gs): filtra le righe FEEDBACK per email (case-
// insensitive), numero riga corretto (offset +2), più recenti in alto.
const fs = require('fs');
const path = require('path');
const gs = fs.readFileSync(path.join(__dirname, '..', 'src', 'WebApp.gs'), 'utf8');
function ext(n) {
  const s = gs.indexOf('function ' + n + '(');
  if (s < 0) throw new Error(n + ' non trovata');
  let i = gs.indexOf('{', s), d = 0, e = -1;
  for (let k = i; k < gs.length; k++) { if (gs[k] === '{') d++; else if (gs[k] === '}') { d--; if (d === 0) { e = k + 1; break; } } }
  return gs.slice(s, e);
}
eval(ext('_feedbackRows_'));

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  XX  FAIL: ' + n); } }

// [Timestamp, email, Feedback, Risposta, Stato, Commenti]
const vals = [
  ['2026-01-01', 'a@unipi.it', 'primo',   '',      'PENDING', ''],   // riga 2
  ['2026-01-02', 'b@unipi.it', 'altro',   '',      'CLOSED',  ''],   // riga 3
  ['2026-01-03', 'A@UNIPI.IT', 'secondo', 'rispo', 'CLOSED',  'cc']  // riga 4 (stessa email, maiusc.)
];

const r = _feedbackRows_(vals, 'a@unipi.it');
check('Filtra solo le righe dell\'email (2 su 3)', r.length === 2);
check('Più recenti in alto: prima riga 4 poi riga 2', r[0].row === 4 && r[1].row === 2);
check('Match email case-insensitive (A@UNIPI.IT)', r[0].feedback === 'secondo');
check('Campi mappati (risposta/stato)', r[0].risposta === 'rispo' && r[0].stato === 'CLOSED');
check('Numero riga = indice + 2', r[1].row === 2 && r[1].feedback === 'primo');
check('Email vuota → []', _feedbackRows_(vals, '').length === 0);
check('Email senza match → []', _feedbackRows_(vals, 'z@unipi.it').length === 0);
check('vals nullo → []', _feedbackRows_(null, 'a@unipi.it').length === 0);

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
