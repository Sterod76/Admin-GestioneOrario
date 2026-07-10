// Verifica roomCapacity / groupDivisor / capacityInfo (estratti da index.html):
// sovraffollamento se E/(n.gruppi) > 80% capienza aula.
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
let data = {};
// coexamE mock (legge data.coexam.perCode) — la logica sotto test è capacityInfo
function coexamE(code) { const pc = (data.coexam || {}).perCode || {}; const C = String(code || '').toUpperCase(); return Object.prototype.hasOwnProperty.call(pc, C) ? pc[C] : null; }
eval(extract('_isFullGroup') + '\n' + extract('_grpLabel') + '\n' + extract('roomCapacity') + '\n' + extract('groupDivisor') + '\n' + extract('capacityInfo'));

data = {
  roomSubtitles: { 'Aula F1': '68', 'Lab M': '16 posti', 'Aula X': 'aula grande' },
  coexam: { perCode: { FIS: 120, CHI: 40 } }
};

let pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  OK  ' + n); } else { fail++; console.log('  XX  FAIL: ' + n); } }

// roomCapacity: primo numero del sottotitolo
check('roomCapacity Aula F1 = 68', roomCapacity('Aula F1') === 68);
check('roomCapacity Lab M = 16 (da "16 posti")', roomCapacity('Lab M') === 16);
check('roomCapacity Aula X = null (nessun numero)', roomCapacity('Aula X') === null);
check('roomCapacity sconosciuta = null', roomCapacity('Aula Z') === null);

// groupDivisor
check('groupDivisor "" = 1', groupDivisor('') === 1);
check('groupDivisor "A" = 2 (lettera)', groupDivisor('A') === 2);
check('groupDivisor "A1" = 4 (lettera+numero)', groupDivisor('A1') === 4);
check('groupDivisor "B2" = 4', groupDivisor('B2') === 4);
check('groupDivisor "A+B" = 1 (intera coorte)', groupDivisor('A+B') === 1);
check('groupDivisor "a + b" = 1 (normalizzato)', groupDivisor('a + b') === 1);
check('groupDivisor "AB" = 1 (accettato come intera coorte)', groupDivisor('AB') === 1);

// _grpLabel: SOLO obbligatori LT → vuoto/AB/A+B mostrati come "A+B"; forchette/opzionali/LM = N.A.
check('_grpLabel("", S1LT, OBB) = "A+B" (obbligatori LT)', _grpLabel('', 'S1LT', 'OBB') === 'A+B');
check('_grpLabel("AB", S1LT, OBB) = "A+B"', _grpLabel('AB', 'S1LT', 'OBB') === 'A+B');
check('_grpLabel("a+b", S1LT, OBB) = "A+B"', _grpLabel('a+b', 'S1LT', 'OBB') === 'A+B');
check('_grpLabel("A", S1LT, OBB) = "A" (gruppo specifico invariato)', _grpLabel('A', 'S1LT', 'OBB') === 'A');
check('_grpLabel("", S1LT, FOR) = "" (forchette LT: N.A.)', _grpLabel('', 'S1LT', 'FOR') === '');
check('_grpLabel("", S1LT, OPZ) = "" (opzionali LT: N.A.)', _grpLabel('', 'S1LT', 'OPZ') === '');
check('_grpLabel("", S1LM, OBB) = "" (LM invariata)', _grpLabel('', 'S1LM', 'OBB') === '');

// capacityInfo: FIS E=120, Aula F1 cap=68 (80% = 54.4)
let ci = capacityInfo({ room: 'Aula F1', code: 'FIS', group: '' });
check('FIS no gruppo: eff 120, OVER (120>54.4)', ci && ci.eff === 120 && ci.over === true);
ci = capacityInfo({ room: 'Aula F1', code: 'FIS', group: 'A' });
check('FIS gruppo A (÷2): eff 60, OVER (60>54.4)', ci && ci.eff === 60 && ci.over === true);
ci = capacityInfo({ room: 'Aula F1', code: 'FIS', group: 'A1' });
check('FIS gruppo A1 (÷4): eff 30, NON over (30<54.4)', ci && ci.eff === 30 && ci.over === false);
ci = capacityInfo({ room: 'Aula F1', code: 'CHI', group: '' });
check('CHI E=40 in Aula F1: NON over (40<54.4)', ci && ci.over === false);
check('capacityInfo null se capienza mancante', capacityInfo({ room: 'Aula X', code: 'FIS', group: '' }) === null);
check('capacityInfo null se E mancante', capacityInfo({ room: 'Aula F1', code: 'ZZZ', group: '' }) === null);

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
