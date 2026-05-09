#!/usr/bin/env node
/**
 * Deploy: clasp push + clasp deploy sul deploymentId configurato.
 * Legge gli ID da config/local.json (creato da `npm run setup`).
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
const desc = cfg.deploymentDescription || 'WebApp';

run('clasp', ['push', '-f']);
run('clasp', ['deploy', '-i', cfg.deploymentId, '-d', '"' + desc.replace(/"/g, '\\"') + '"']);

console.log('\nDeploy completato. URL /exec invariato.');
