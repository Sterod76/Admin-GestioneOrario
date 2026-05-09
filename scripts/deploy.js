#!/usr/bin/env node
/**
 * Deploy: clasp push + clasp deploy sul deploymentId configurato.
 * Legge gli ID da config/local.json (creato da `npm run setup`).
 *
 * Uso:
 *   npm run deploy
 *   npm run deploy "descrizione custom"   # override della description
 *
 * Cosa fa esattamente:
 *   1. clasp push -f                                → manda HEAD su Apps Script
 *   2. clasp deploy -i <deploymentId> -d "<descr>"  → crea nuova versione
 *      del deployment esistente (stesso URL /exec, codice nuovo)
 *
 * NB: questo script aggiorna SEMPRE un deployment esistente. Per crearne
 *     uno nuovo (con policy diverse o per esporre più endpoint), passa
 *     dall'editor Apps Script: Deploy → New deployment.
 *
 * NB: 'Who has access' e 'Execute as' di un deployment sono fissati una
 *     sola volta alla creazione e NON possono essere cambiati da clasp.
 *     Per modificarli: editor → Deploy → Manage deployments → matita.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_PATH = path.join(ROOT, 'config', 'local.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function run(cmd, args) {
  console.log('> ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: true });
  if (r.status !== 0) {
    console.error('\nERR: comando fallito (exit ' + r.status + ').');
    process.exit(r.status || 1);
  }
}

function captureRun(cmd, args) {
  console.log('> ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: ROOT, shell: true });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const combined = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) {
    if (/Requested entity was not found/i.test(combined)) {
      console.error('\nERR: il deploymentId in config/local.json non esiste piu sul progetto.');
      console.error('Probabilmente e stato cancellato. Crea un nuovo deployment:');
      console.error('  1. Apps Script editor (npm run open) -> Deploy -> New deployment');
      console.error('  2. Tipo: Web app, Execute as: Me, Who has access: Anyone');
      console.error('  3. Copia il nuovo Deployment ID e la URL /exec');
      console.error('  4. npm run setup -> incollali');
      console.error('  5. Riprova npm run deploy');
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
if (!cfg.deploymentId) {
  console.error('ERR: deploymentId non impostato in config/local.json.');
  console.error('Apri Apps Script editor → Deploy → New deployment per crearne uno,');
  console.error('poi `npm run setup` e incolla il deployment ID.');
  process.exit(1);
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
  console.log('                  Aggiungi "webappUrl": "https://script.google.com/.../exec"');
  console.log('                  per vederlo qui dopo ogni deploy.');
}
console.log('======================================================');
