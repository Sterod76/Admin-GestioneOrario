// Verifica _parseEditLock_ (WebApp.gs): detentore valido del lock EDIT, '' se
// assente/malformato/scaduto (lease oltre il TTL). Email normalizzata lowercase.
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
eval(ext('_parseEditLock_'));

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  XX  FAIL: ' + n); } }

const NOW = 1000000, TTL = 8 * 60 * 1000;
check('vuoto/null → ""', _parseEditLock_('', NOW, TTL) === '' && _parseEditLock_(null, NOW, TTL) === '');
check('JSON malformato → ""', _parseEditLock_('{nope', NOW, TTL) === '');
check('senza email → ""', _parseEditLock_(JSON.stringify({ ts: NOW }), NOW, TTL) === '');
check('valido recente → email lowercase', _parseEditLock_(JSON.stringify({ email: 'Stefano@UniPi.it', ts: NOW - 1000 }), NOW, TTL) === 'stefano@unipi.it');
check('al limite del TTL → ancora valido', _parseEditLock_(JSON.stringify({ email: 'a@b.it', ts: NOW - TTL }), NOW, TTL) === 'a@b.it');
check('oltre il TTL → scaduto ("")', _parseEditLock_(JSON.stringify({ email: 'a@b.it', ts: NOW - TTL - 1 }), NOW, TTL) === '');
check('ts mancante → scaduto', _parseEditLock_(JSON.stringify({ email: 'a@b.it' }), NOW, TTL) === '');

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
