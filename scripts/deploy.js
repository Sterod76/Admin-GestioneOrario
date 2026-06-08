#!/usr/bin/env node
/**
 * Deploy: clasp push + clasp deploy sul deploymentId configurato.
 * Legge gli ID da config/local.json (creato da `npm run setup`).
 *
 * Uso:
 *   npm run deploy
 *   npm run deploy "descrizione custom"   # override della description
 *
 * Logica:
 *   1. clasp push -f                                → manda HEAD su Apps Script
 *   2. clasp deploy -i <deploymentId> -d "<descr>"  → nuova versione del
 *                                                     deployment esistente
 *                                                     (stesso URL /exec)
 *
 * Questo script aggiorna SEMPRE un deployment esistente. Per il PRIMO
 * deployment (quando crei una nuova istanza dell'applicativo), serve
 * creare il deployment manualmente dall'editor Apps Script:
 *   Deploy → New deployment → Type: Web app → Who has access: Anyone with
 *   Google account → Deploy.
 * Poi copi deploymentId e Web app URL in config/local.json (via npm run setup
 * o a mano). Vedi docs/duplicare-gsheet.md per la procedura completa.
 *
 * Le policy 'Who has access' e 'Execute as' di un deployment sono fissate
 * solo alla creazione (UI editor) e NON possono essere cambiate da clasp.
 * Per cambiarle: editor → Deploy → Manage deployments → matita.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_PATH = path.join(ROOT, 'config', 'local.json');
const { getLoggedAccount } = require('./whoami');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function run(cmd, args) {
  console.log('> ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: true });
  if (r.status !== 0) {
    console.error('\nERR: comando fallito (exit ' + r.status + ').');
    return false;
  }
  return true;
}

function captureRun(cmd, args) {
  console.log('> ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: ROOT, shell: true });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const combined = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) {
    if (/Requested entity was not found/i.test(combined)) {
      console.error('\nERR: il deploymentId in config/local.json non esiste sul progetto.');
      console.error('Casi tipici:');
      console.error('  - Stai usando un repo clonato per un\'altra istanza: rifai npm run setup.');
      console.error('  - Il deployment e\' stato cancellato dalla UI: ricreane uno');
      console.error('    (editor Apps Script -> Deploy -> New deployment) e poi npm run setup.');
    }
    process.exit(r.status || 1);
  }
  return combined;
}

const cfg = readJson(LOCAL_PATH);
if (!cfg) {
  console.error('ERR: config/local.json non trovato. Esegui prima `npm run setup`.');
  process.exit(1);
}

// Multi-target: se `targets` definito, deploya ciascuno con il proprio
// scriptId/deploymentId. Skippa target senza deploymentId.
if (Array.isArray(cfg.targets) && cfg.targets.length > 0) {
  const CLASP_PATH = path.join(ROOT, '.clasp.json');
  const originalClasp = readJson(CLASP_PATH);
  if (!originalClasp) { console.error('ERR: .clasp.json non trovato.'); process.exit(1); }
  const rootDir = originalClasp.rootDir || 'src';

  // Preflight account
  const loggedAccount = getLoggedAccount();
  const expected = cfg.expectedAccount || '';
  if (!loggedAccount) { console.error('ERR: nessun account clasp loggato.'); process.exit(1); }
  console.log('Account clasp attivo: ' + loggedAccount);
  if (expected && loggedAccount.toLowerCase() !== expected.toLowerCase()) {
    console.error('⚠ ABORT: account loggato ≠ expectedAccount.');
    process.exit(2);
  }

  const cliDesc = process.argv[2];
  const results = [];
  let allOk = true;
  try {
    for (let i = 0; i < cfg.targets.length; i++) {
      const t = cfg.targets[i];
      const label = t.label || ('target #' + i);
      if (!t.scriptId) {
        console.error('SKIP ' + label + ': scriptId mancante');
        allOk = false; results.push({ label, status: 'no-scriptId' }); continue;
      }
      console.log('\n=== Deploy → ' + label + ' ===');
      fs.writeFileSync(CLASP_PATH, JSON.stringify({ scriptId: t.scriptId, rootDir }, null, 2) + '\n', 'utf8');
      if (!run('clasp', ['push', '-f'])) { allOk = false; results.push({ label, status: 'push-fail' }); continue; }
      if (!t.deploymentId) {
        console.log('  (nessun deploymentId: push fatto ma deploy saltato)');
        results.push({ label, status: 'push-only', scriptId: t.scriptId });
        continue;
      }
      const desc = (cliDesc && cliDesc.trim()) || t.deploymentDescription || cfg.deploymentDescription || 'WebApp';
      const out = captureRun('clasp', ['deploy', '-i', t.deploymentId, '-d', '"' + desc.replace(/"/g, '\\"') + '"']);
      const vMatch = out.match(/@(\d+)/);
      results.push({ label, status: 'deployed', scriptId: t.scriptId, deploymentId: t.deploymentId, version: vMatch ? vMatch[1] : '?', url: t.webappUrl || '' });
    }
  } finally {
    fs.writeFileSync(CLASP_PATH, JSON.stringify(originalClasp, null, 2) + '\n', 'utf8');
  }
  console.log('\n======================================================');
  console.log(' Deploy multi-target');
  console.log('------------------------------------------------------');
  results.forEach(r => {
    const tag = r.status === 'deployed' ? ('@' + r.version) : ('[' + r.status + ']');
    console.log('  ' + tag + ' ' + r.label + (r.url ? '  → ' + r.url : ''));
  });
  console.log('======================================================');
  process.exit(allOk ? 0 : 1);
}

if (!cfg.deploymentId) {
  console.error('ERR: deploymentId non impostato in config/local.json.');
  console.error('');
  console.error('Per creare il primo deployment di questa istanza:');
  console.error('  1. npm run open    (apre editor Apps Script)');
  console.error('  2. Editor: Deploy -> New deployment -> Type: Web app');
  console.error('     Execute as: Me, Who has access: Anyone with Google account');
  console.error('  3. Click Deploy. Copia "Deployment ID" e "Web app URL".');
  console.error('  4. npm run setup    (incolla i due valori)');
  console.error('  5. npm run deploy   (ora aggiornera questo deployment)');
  console.error('');
  console.error('Dettagli completi: docs/duplicare-gsheet.md');
  process.exit(1);
}

// Preflight: verifica account clasp
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
  console.error('  Oppure aggiorna expectedAccount in config/local.json.');
  process.exit(2);
}

const cliDesc = process.argv[2];
const desc = (cliDesc && cliDesc.trim()) || cfg.deploymentDescription || 'WebApp';

run('clasp', ['push', '-f']);

const deployOut = captureRun('clasp', [
  'deploy',
  '-i', cfg.deploymentId,
  '-d', '"' + desc.replace(/"/g, '\\"') + '"'
]);

const versionMatch = deployOut.match(/@(\d+)/);
const version = versionMatch ? versionMatch[1] : '?';

console.log('');
console.log('======================================================');
console.log(' Deploy completato');
console.log('------------------------------------------------------');
console.log(' Deployment ID  : ' + cfg.deploymentId);
console.log(' Versione       : @' + version);
console.log(' Descrizione    : ' + desc);
if (cfg.webappUrl) {
  console.log(' Web app URL    : ' + cfg.webappUrl);
} else {
  console.log(' Web app URL    : (non impostato in config/local.json)');
  console.log('                  Aggiungi "webappUrl" per vederlo qui.');
}
console.log('======================================================');
