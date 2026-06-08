// Verifica la regola di visibilità pubblica (_isDraftBlocked_ in WebApp.gs):
// l'utente generico (public) è bloccato SOLO se il calendario è 'draft';
// editor e auditor vedono sempre.
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
eval(ext('_isDraftBlocked_'));

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  XX  FAIL: ' + n); } }

check('public + draft → BLOCCATO', _isDraftBlocked_('public', 'draft') === true);
check('public + published → visibile', _isDraftBlocked_('public', 'published') === false);
check('editor + draft → visibile (lavora)', _isDraftBlocked_('editor', 'draft') === false);
check('auditor + draft → visibile (revisiona)', _isDraftBlocked_('auditor', 'draft') === false);
check('editor + published → visibile', _isDraftBlocked_('editor', 'published') === false);

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
