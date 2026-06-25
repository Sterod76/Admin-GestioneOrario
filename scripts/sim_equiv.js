// Verifica buildEquivMap_ (union-find di mutuazioni + CORRISPONDENZE), estratto da
// src/Mutuazione.gs: codici equivalenti -> stesso componente; rappresentante = codice
// minore; classi disgiunte separate; codici "soli" mappati a se stessi (via canon).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'Mutuazione.gs'), 'utf8');

function extract(name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error(name + ' non trovata in Mutuazione.gs');
  let i = src.indexOf('{', s), d = 0, e = -1;
  for (let k = i; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) { e = k + 1; break; } } }
  return src.slice(s, e);
}
eval(extract('buildEquivMap_'));

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  OK  ' + name); } else { fail++; console.log('  XX  FAIL: ' + name); } }
function canon(map, c) { return map[c] || c; }   // come il client

// 1) Solo mutuazioni: 0024B mutua dal capostipite 289BB.
let m = buildEquivMap_({ '289BB': [{ childCode: '0024B' }] }, []);
check('mutuazione: 289BB e 0024B stessa classe', canon(m, '289BB') === canon(m, '0024B'));
check('mutuazione: rappresentante = codice minore (0024B)', canon(m, '289BB') === '0024B');

// 2) Solo corrispondenze: una classe di 4 codici.
m = buildEquivMap_({}, [['167BB', '215BB', '289BB', '0024B']]);
check('corrisp: i 4 codici nella stessa classe',
  canon(m, '167BB') === canon(m, '215BB') && canon(m, '215BB') === canon(m, '289BB') && canon(m, '289BB') === canon(m, '0024B'));
check('corrisp: rappresentante = 0024B (minore)', canon(m, '167BB') === '0024B');

// 3) Overlap mutuazione + corrispondenza -> un solo componente.
m = buildEquivMap_({ '289BB': [{ childCode: '0024B' }] }, [['167BB', '289BB']]);
check('overlap: 0024B/289BB/167BB un solo componente',
  canon(m, '0024B') === canon(m, '167BB') && canon(m, '289BB') === canon(m, '167BB'));

// 4) Classi disgiunte NON si fondono.
m = buildEquivMap_({}, [['AAA', 'BBB'], ['CCC', 'DDD']]);
check('disgiunte: AAA != CCC', canon(m, 'AAA') !== canon(m, 'CCC'));
check('disgiunte: AAA == BBB', canon(m, 'AAA') === canon(m, 'BBB'));
// 5) Codice non equivalente: canon = se stesso (non in mappa).
check('codice solo: canon = se stesso', canon(m, 'ZZZ') === 'ZZZ');

// 6) Normalizzazione trim + UPPER.
m = buildEquivMap_({}, [[' 167bb ', '289BB']]);
check('trim+upper', canon(m, '167BB') === canon(m, '289BB'));

console.log((fail ? 'FAIL ' : 'OK ') + 'sim_equiv: ' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
