// Verifica i parser di Config.gs: parseMutuazione (codice master via '@') e
// parseDocenti_ (multi-docente in colonna J: separatori, dedup case-insensitive).
const fs = require('fs');
const path = require('path');
const gs = fs.readFileSync(path.join(__dirname, '..', 'src', 'Config.gs'), 'utf8');
function ext(n) {
  const s = gs.indexOf('function ' + n + '(');
  if (s < 0) throw new Error(n + ' non trovata');
  let i = gs.indexOf('{', s), d = 0, e = -1;
  for (let k = i; k < gs.length; k++) { if (gs[k] === '{') d++; else if (gs[k] === '}') { d--; if (d === 0) { e = k + 1; break; } } }
  return gs.slice(s, e);
}
eval(ext('parseMutuazione') + '\n' + ext('parseDocenti_') + '\n' + ext('normalizeDocenti_'));

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  XX  FAIL: ' + n); } }

// --- Mutuazione: il master è la parte PRIMA della '@' ---
let m = parseMutuazione('413BB@WFIR-LM');
check('Mutu @: master = 413BB (prima di @)', m && m.parentCode === '413BB' && m.parentCds === 'WFIR-LM');
m = parseMutuazione(' 413bb @ wfir-lm ');
check('Mutu @: spazi + lowercase → 413BB/WFIR-LM (upper)', m && m.parentCode === '413BB' && m.parentCds === 'WFIR-LM');
m = parseMutuazione('0001B');
check('Mutu senza @: solo codice', m && m.parentCode === '0001B' && m.parentCds === '');
check('Mutu vuota → null', parseMutuazione('') === null && parseMutuazione('   ') === null);

// --- Docenti: separatori newline / "/" / ";" / "," / " e " ; dedup case-insensitive ---
check('Docenti "/" : 1°=titolare', JSON.stringify(parseDocenti_('Rossi / Bianchi')) === '["Rossi","Bianchi"]');
check('Docenti a capo + " e " + ";"', JSON.stringify(parseDocenti_('Rossi\nBianchi e Verdi; Neri')) === '["Rossi","Bianchi","Verdi","Neri"]');
check('Docenti dedup case-insensitive (ROSSI = Rossi)', JSON.stringify(parseDocenti_('Rossi, ROSSI, Bianchi')) === '["Rossi","Bianchi"]');
check('Docenti "Cognome N." (il punto NON è separatore)', JSON.stringify(parseDocenti_('Rossi M. / Bianchi A.')) === '["Rossi M.","Bianchi A."]');
check('Docenti singolo', JSON.stringify(parseDocenti_('Rossi')) === '["Rossi"]');
check('Docenti vuoto → []', JSON.stringify(parseDocenti_('')) === '[]' && JSON.stringify(parseDocenti_(null)) === '[]');

// --- normalizeDocenti_: Title Case, spazi, separatore " / ", iniziale "X." ---
check('Norm: Title Case + spazi ("rossi  m" → "Rossi M.")', normalizeDocenti_('rossi  m') === 'Rossi M.');
check('Norm: separatore " / " + Title Case', normalizeDocenti_('BIANCHI a.  /verdi') === 'Bianchi A. / Verdi');
check('Norm: cognome composto ("de  ROSSI" → "De Rossi")', normalizeDocenti_('de  ROSSI') === 'De Rossi');
check('Norm: vari separatori → " / "', normalizeDocenti_('Rossi; Bianchi e Verdi, Neri G') === 'Rossi / Bianchi / Verdi / Neri G.');
check('Norm: iniziale già puntata invariata', normalizeDocenti_('Rossi M.') === 'Rossi M.');
check('Norm: trim e spazi attorno a "/"', normalizeDocenti_('  rossi   /   bianchi  ') === 'Rossi / Bianchi');
check('Norm: dedup case-insensitive', normalizeDocenti_('Rossi / ROSSI') === 'Rossi');
check('Norm: maiuscola dopo apostrofo ("d\'elia" → "D\'Elia")', normalizeDocenti_("d'elia") === "D'Elia");
check('Norm: apostrofo + iniziale ("d\'angelo m" → "D\'Angelo M.")', normalizeDocenti_("d'angelo m") === "D'Angelo M.");
check('Norm: apostrofo da maiuscole ("DELL\'ORTO" → "Dell\'Orto")', normalizeDocenti_("DELL'ORTO") === "Dell'Orto");
check('Norm: iniziali unite ("Rossi N.M." → "Rossi N.M.")', normalizeDocenti_('Rossi N.M.') === 'Rossi N.M.');
check('Norm: iniziali unite da minuscole ("rossi n.m." → "Rossi N.M.")', normalizeDocenti_('rossi n.m.') === 'Rossi N.M.');
check('Norm: tre iniziali unite ("verdi g.m.l." → "Verdi G.M.L.")', normalizeDocenti_('verdi g.m.l.') === 'Verdi G.M.L.');
check('Norm: iniziali spaziate invariate ("Rossi N. M." → "Rossi N. M.")', normalizeDocenti_('Rossi N. M.') === 'Rossi N. M.');
check('Norm: vuoto → ""', normalizeDocenti_('') === '' && normalizeDocenti_(null) === '');

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
