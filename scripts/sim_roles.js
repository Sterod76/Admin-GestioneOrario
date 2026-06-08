// Verifica parseRoles_ (estratta da src/WebApp.gs): legge il foglio CONFIG a
// gruppi (WebEditors / WebAuditors in colonna B, email in colonna C) e classifica
// gli accessi. Retro-compatibile col vecchio formato (solo email in C = editor).
const fs = require('fs');
const path = require('path');
const gs = fs.readFileSync(path.join(__dirname, '..', 'src', 'WebApp.gs'), 'utf8');

function extract(name) {
  const s = gs.indexOf('function ' + name + '(');
  if (s < 0) throw new Error(name + ' non trovata');
  let i = gs.indexOf('{', s), d = 0, e = -1;
  for (let k = i; k < gs.length; k++) { if (gs[k] === '{') d++; else if (gs[k] === '}') { d--; if (d === 0) { e = k + 1; break; } } }
  return gs.slice(s, e);
}
eval(extract('parseRoles_'));
function role(vals, email) {
  const r = parseRoles_(vals); const e = String(email).toLowerCase();
  if (r.editors.indexOf(e) !== -1) return 'editor';
  if (r.auditors.indexOf(e) !== -1) return 'auditor';
  return 'public';
}

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  XX  FAIL: ' + n); } }

// Nuovo formato: B=etichette sezione, C=email (l'etichetta è sulla stessa riga
// della prima email). La sezione "WebCalendar" (link in C) NON è un gruppo.
const cfg = [
  ['', 'AKfyc...deploylink...'],            // WebCalendar (col B vuota qui) → ignorato
  ['WebCalendar', ''],                       // etichetta senza email
  ['WebEditors', 'stefano.roddaro@unipi.it'],
  ['', 'costantino.budroni@unipi.it'],
  ['', 'alessandro.vichi@unipi.it'],
  ['WebAuditors', 'riccardo.mannella@unipi.it'],
  ['', 'marco.sozzi@unipi.it']
];
const r = parseRoles_(cfg);
check('Editors: 3 (roddaro, budroni, vichi)', r.editors.length === 3 && r.editors.indexOf('stefano.roddaro@unipi.it') !== -1 && r.editors.indexOf('alessandro.vichi@unipi.it') !== -1);
check('Auditors: 2 (mannella, sozzi)', r.auditors.length === 2 && r.auditors.indexOf('riccardo.mannella@unipi.it') !== -1 && r.auditors.indexOf('marco.sozzi@unipi.it') !== -1);
check('Editor non finisce fra gli auditor', r.auditors.indexOf('stefano.roddaro@unipi.it') === -1);
check('Auditor non finisce fra gli editor', r.editors.indexOf('riccardo.mannella@unipi.it') === -1);
check('ROLE editor', role(cfg, 'stefano.roddaro@unipi.it') === 'editor');
check('ROLE auditor', role(cfg, 'MARCO.SOZZI@unipi.it') === 'auditor');     // case-insensitive
check('ROLE public (utente qualsiasi)', role(cfg, 'mario.rossi@studenti.unipi.it') === 'public');
check('ROLE public (email vuota)', role(cfg, '') === 'public');

// Alias "WebRevisori" = stesso gruppo di WebAuditors (sola lettura).
const cfgRev = [['WebEditors', 'ed@unipi.it'], ['WebRevisori', 'rev@unipi.it'], ['', 'rev2@unipi.it']];
const rr = parseRoles_(cfgRev);
check('Alias WebRevisori → auditors (2)', rr.auditors.length === 2 && rr.auditors.indexOf('rev@unipi.it') !== -1 && rr.auditors.indexOf('rev2@unipi.it') !== -1);
check('Alias WebRevisori: ruolo auditor', role(cfgRev, 'rev@unipi.it') === 'auditor' && role(cfgRev, 'ed@unipi.it') === 'editor');
check('Alias WebReviewers → auditors', (function () { var x = parseRoles_([['WebReviewers', 'rv@unipi.it']]); return x.auditors.indexOf('rv@unipi.it') !== -1; })());

// Vecchio formato (nessuna etichetta di gruppo): tutta la colonna C = editor
const oldCfg = [['', 'Editor abilitati'], ['', 'a@unipi.it'], ['', 'b@unipi.it']];
const ro = parseRoles_(oldCfg);
check('Retro-compat: senza etichette, C = editor', ro.editors.length === 2 && ro.auditors.length === 0);
check('Retro-compat: ruolo editor', role(oldCfg, 'a@unipi.it') === 'editor');

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
