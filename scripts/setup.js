#!/usr/bin/env node
/**
 * Setup interattivo: chiede gli ID del progetto e genera
 * - .clasp.json
 * - config/local.json
 *
 * Idempotente: se i file esistono mostra i valori correnti come default
 * e li tiene se l'utente preme Invio senza inserire nulla.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const CLASP_PATH = path.join(ROOT, '.clasp.json');
const LOCAL_PATH = path.join(ROOT, 'config', 'local.json');
const EXAMPLE_PATH = path.join(ROOT, 'config', 'local.example.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function prompt(rl, q, def) {
  return new Promise(resolve => {
    const suffix = def ? ` [${def}]` : '';
    rl.question(`${q}${suffix}: `, ans => {
      ans = (ans || '').trim();
      resolve(ans || def || '');
    });
  });
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const example = readJson(EXAMPLE_PATH) || {};
  const current = readJson(LOCAL_PATH) || {};
  const claspCur = readJson(CLASP_PATH) || {};

  console.log('\nSetup progetto Orario CdS\n=========================\n');

  const scriptId = await prompt(rl, 'Apps Script ID', current.scriptId || claspCur.scriptId || example.scriptId);
  const deploymentId = await prompt(rl, 'Web app deployment ID (opzionale)', current.deploymentId || example.deploymentId);
  const deploymentDescription = await prompt(rl, 'Deployment description', current.deploymentDescription || example.deploymentDescription || 'BozzaOrario');
  const spreadsheetId = await prompt(rl, 'Spreadsheet ID (opzionale)', current.spreadsheetId || example.spreadsheetId);

  rl.close();

  if (!scriptId || /^</.test(scriptId)) {
    console.error('\nERR: Apps Script ID obbligatorio.');
    process.exit(1);
  }

  writeJson(CLASP_PATH, { scriptId, rootDir: 'src' });
  writeJson(LOCAL_PATH, {
    scriptId,
    deploymentId: deploymentId || '',
    deploymentDescription: deploymentDescription || 'BozzaOrario',
    spreadsheetId: spreadsheetId || ''
  });

  console.log('\nOK:');
  console.log('  ' + path.relative(ROOT, CLASP_PATH));
  console.log('  ' + path.relative(ROOT, LOCAL_PATH));
  console.log('\nProssimi passi:');
  console.log('  npm run pull   # scarica codice esistente (se questo progetto remoto non è vuoto)');
  console.log('  npm run push   # invia src/ a Apps Script');
  console.log('  npm run deploy # aggiorna il web app deployment\n');
})();
