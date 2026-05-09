#!/usr/bin/env node
/**
 * Deploy: clasp push + clasp deploy.
 * Legge gli ID da config/local.json (creato da `npm run setup`).
 *
 * Uso:
 *   npm run deploy
 *   npm run deploy "descrizione custom"   # override della description
 *
 * Comportamento:
 *   1. clasp push -f                                → manda HEAD su Apps Script
 *   2a. Se config.deploymentId E' impostato:
 *       clasp deploy -i <deploymentId> -d "<descr>"
 *       → crea una nuova versione del deployment esistente
 *         (stesso URL /exec, codice nuovo)
 *   2b. Se config.deploymentId E' VUOTO (primo deploy):
 *       clasp deploy -d "<descr>"
 *       → crea un nuovo deployment con le policy lette da
 *         src/appsscript.json (sezione "webapp")
 *       → estrae il nuovo deploymentId e lo salva in config/local.json
 *       → te lo riproponi al prossimo deploy come stesso URL
 *
 * Le policy 'Who has access' e 'Execute as' provengono da
 * src/appsscript.json -> "webapp": {"executeAs": ..., "access": ...}.
 * Per cambiare:
 *   - access: "ANYONE_ANONYMOUS" | "ANYONE" | "DOMAIN" | "MYSELF"
 *   - executeAs: "USER_DEPLOYING" | "USER_ACCESSING"
 *
 * Per un secondo deployment con policy diverse:
 *   - editor Apps Script -> Deploy -> New deployment (UI per scegliere policy)
 *
 * NB: 'Who has access' e 'Execute as' di un deployment esistente NON
 *     possono essere cambiate via clasp dopo la creazione.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_PATH = path.join(ROOT, 'config', 'local.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
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
      console.error('Probabilmente e stato cancellato. Per ricreare: svuota');
      console.error('"deploymentId": "" in config/local.json e rilancia: lo script creera un nuovo deployment.');
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

const cliDesc = process.argv[2];
const desc = (cliDesc && cliDesc.trim()) || cfg.deploymentDescription || 'WebApp';

run('clasp', ['push', '-f']);

let isFirstDeploy = !cfg.deploymentId;
let deployArgs;
if (isFirstDeploy) {
  console.log('\nNessun deploymentId in config. Creo un NUOVO deployment...');
  console.log('Policy lette da src/appsscript.json -> "webapp" (executeAs, access).');
  deployArgs = ['deploy', '-d', '"' + desc.replace(/"/g, '\\"') + '"'];
} else {
  deployArgs = ['deploy', '-i', cfg.deploymentId, '-d', '"' + desc.replace(/"/g, '\\"') + '"'];
}

const deployOut = captureRun('clasp', deployArgs);

// Estrai deploymentId dalla output (es. "- AKfycbX... @1 - BozzaOrario" o "Deployed AKfycbX... @1")
const idMatch = deployOut.match(/(AKfyc[A-Za-z0-9_\-]{50,})/);
const versionMatch = deployOut.match(/@(\d+|HEAD)/);
const newDeploymentId = idMatch ? idMatch[1] : null;
const version = versionMatch ? versionMatch[1] : '?';

// Se era il primo deploy, salva il nuovo deploymentId in config
if (isFirstDeploy && newDeploymentId) {
  cfg.deploymentId = newDeploymentId;
  writeJson(LOCAL_PATH, cfg);
  console.log('\nNuovo deploymentId salvato in config/local.json:');
  console.log('  ' + newDeploymentId);
  console.log('Al prossimo `npm run deploy` aggiornera la versione di questo stesso deployment.');
  console.log('\nIMPORTANT: ora apri editor Apps Script -> Deploy -> Manage deployments,');
  console.log('clicca sul nuovo deployment, copia "Web app URL" e mettilo in');
  console.log('config/local.json -> "webappUrl".');
}

const finalDeployId = cfg.deploymentId || newDeploymentId || '?';

console.log('');
console.log('======================================================');
console.log(' Deploy completato');
console.log('------------------------------------------------------');
console.log(' Deployment ID  : ' + finalDeployId);
console.log(' Versione       : @' + version);
console.log(' Descrizione    : ' + desc);
if (cfg.webappUrl) {
  console.log(' Web app URL    : ' + cfg.webappUrl);
} else {
  console.log(' Web app URL    : (non impostato in config/local.json)');
  console.log('                  Aggiungi "webappUrl" per vederlo qui.');
}
console.log('======================================================');
