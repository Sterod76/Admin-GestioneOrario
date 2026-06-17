#!/usr/bin/env node
// Verifica pre-deploy (la stessa che si fa a mano): sintassi del CLIENT (gli <script> di
// src/index.html, con gli scriptlet GAS neutralizzati), sintassi di tutti i .gs, e tutte
// le sim in scripts/sim_*.js. Esce 1 se qualcosa fallisce.
// Uso: npm run verify   (o la task VS Code "Verifica (sintassi + sim)").
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const SCRIPTS = __dirname;
const tmp = os.tmpdir();
let fail = 0;

const ok = m => console.log('  OK   ' + m);
const bad = (m, detail) => { fail++; console.log('  FAIL ' + m + (detail ? '\n' + detail : '')); };

function nodeCheck(file, label) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); ok(label); }
  catch (e) { bad(label, (e.stderr || e.message || '').toString().trim()); }
}

// 1) Sintassi client: estrai gli <script> (senza src=) e neutralizza gli scriptlet <?..?>.
console.log('— Sintassi client (index.html)');
try {
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  let m, re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, js = '';
  while ((m = re.exec(html))) js += m[1] + '\n;\n';
  js = js.replace(/<\?!=([\s\S]*?)\?>/g, 'null').replace(/<\?=([\s\S]*?)\?>/g, 'null').replace(/<\?([\s\S]*?)\?>/g, '');
  const f = path.join(tmp, '_verify_client.js');
  fs.writeFileSync(f, js);
  nodeCheck(f, 'index.html (<script>)');
} catch (e) { bad('index.html', e.message); }

// 2) Sintassi dei .gs (copia in .js temporaneo e node --check).
console.log('— Sintassi .gs');
fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort().forEach(f => {
  const dst = path.join(tmp, '_verify_' + f.replace(/\.gs$/, '') + '.js');
  fs.copyFileSync(path.join(SRC, f), dst);
  nodeCheck(dst, f);
});

// 3) Tutte le sim.
console.log('— Sim (scripts/sim_*.js)');
fs.readdirSync(SCRIPTS).filter(f => /^sim_.*\.js$/.test(f)).sort().forEach(f => {
  try { execFileSync(process.execPath, [path.join(SCRIPTS, f)], { stdio: 'pipe' }); ok(f); }
  catch (e) {
    const out = (e.stdout || e.message || '').toString().trim().split('\n').slice(-6).join('\n');
    bad(f, out);
  }
});

console.log('\n' + (fail ? ('✗ ' + fail + ' verifiche FALLITE') : '✓ tutte le verifiche superate'));
process.exit(fail ? 1 : 0);
