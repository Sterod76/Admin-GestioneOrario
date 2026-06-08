#!/usr/bin/env node
/**
 * Push del codice su uno o più Apps Script target.
 *
 * Legge config/local.json:
 *   - se contiene un array `targets`, fa push su ciascuno (in sequenza);
 *   - altrimenti usa il singolo `scriptId` (back-compat).
 *
 * Per ciascun target sovrascrive temporaneamente `.clasp.json` con lo
 * scriptId del target, esegue `clasp push -f`, poi ripristina l'originale.
 *
 * Esempio config con multi-target:
 *   {
 *     "expectedAccount": "stefano.roddaro@unipi.it",
 *     "targets": [
 *       { "label": "Bozza",      "scriptId": "1tPZE-..."           },
 *       { "label": "Production", "scriptId": "1N3i6J...",
 *         "deploymentId": "AKfyc...", "webappUrl": "https://..."   }
 *     ]
 *   }
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLASP_PATH = path.join(ROOT, '.clasp.json');
const LOCAL_PATH = path.join(ROOT, 'config', 'local.json');
const { getLoggedAccount } = require('./whoami');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function run(cmd, args) {
  console.log('> ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: true });
  return r.status === 0;
}

const cfg = readJson(LOCAL_PATH);
if (!cfg) {
  console.error('ERR: config/local.json non trovato. Esegui prima `npm run setup`.');
  process.exit(1);
}

// Targets: array `targets` o fallback singolo scriptId
let targets = [];
if (Array.isArray(cfg.targets) && cfg.targets.length > 0) {
  targets = cfg.targets;
} else if (cfg.scriptId) {
  targets = [{ label: cfg.deploymentDescription || 'default', scriptId: cfg.scriptId }];
} else {
  console.error('ERR: nessun target trovato in config/local.json (né `targets` né `scriptId`).');
  process.exit(1);
}

// Preflight account clasp
const loggedAccount = getLoggedAccount();
const expected = cfg.expectedAccount || '';
if (!loggedAccount) {
  console.error('ERR: nessun account clasp loggato. Esegui: clasp login');
  process.exit(1);
}
console.log('Account clasp attivo: ' + loggedAccount);
if (expected && loggedAccount.toLowerCase() !== expected.toLowerCase()) {
  console.error('');
  console.error('⚠ ABORT: account loggato (' + loggedAccount + ') ≠ expectedAccount (' + expected + ').');
  console.error('  Fix: clasp logout && clasp login   (seleziona ' + expected + ')');
  process.exit(2);
}

// Salva .clasp.json originale per ripristino finale
const originalClasp = readJson(CLASP_PATH);
if (!originalClasp) {
  console.error('ERR: .clasp.json non trovato o malformato.');
  process.exit(1);
}
const rootDir = originalClasp.rootDir || 'src';

let allOk = true;
const results = [];

try {
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.scriptId) {
      console.error('ERR: target #' + i + ' senza scriptId, skip.');
      allOk = false;
      continue;
    }
    const label = t.label || ('target #' + i);
    console.log('');
    console.log('=== Push → ' + label + ' (' + t.scriptId + ') ===');
    writeJson(CLASP_PATH, { scriptId: t.scriptId, rootDir: rootDir });
    const ok = run('clasp', ['push', '-f']);
    results.push({ label: label, scriptId: t.scriptId, ok: ok });
    if (!ok) allOk = false;
  }
} finally {
  // Ripristina sempre .clasp.json originale
  writeJson(CLASP_PATH, originalClasp);
}

console.log('');
console.log('======================================================');
console.log(' Push multi-target');
console.log('------------------------------------------------------');
results.forEach(r => {
  console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.label + ' (' + r.scriptId + ')');
});
console.log('======================================================');
process.exit(allOk ? 0 : 1);
