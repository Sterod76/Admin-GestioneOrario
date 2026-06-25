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

  // GUARDIA: questo setup gestisce una SINGOLA installazione (formato flat). Se il
  // config locale è già multi-target (array targets[], es. le 4 installazioni
  // dell'Orario), sovrascriverlo qui le cancellerebbe. Aborta, salvo --force.
  if (Array.isArray(current.targets) && current.targets.length && !process.argv.includes('--force')) {
    rl.close();
    console.error('\n⚠  config/local.json è MULTI-TARGET (' + current.targets.length + ' installazioni).');
    console.error('   `npm run setup` scrive solo il formato a target singolo e le cancellerebbe.');
    console.error('\n   Per aggiungere/modificare un target: edita a mano config/local.json');
    console.error('   (task VS Code "🎯 Apri config target"). Schema in docs/USO-RAPIDO.md.');
    console.error('\n   Se vuoi DAVVERO ripartire da un singolo target: npm run setup -- --force\n');
    process.exit(2);
  }

  console.log('\nSetup progetto Orario CdS\n=========================\n');

  const scriptId = await prompt(rl, 'Apps Script ID', current.scriptId || claspCur.scriptId || example.scriptId);
  const deploymentId = await prompt(rl, 'Web app deployment ID (opzionale)', current.deploymentId || example.deploymentId);
  const deploymentDescription = await prompt(rl, 'Deployment description', current.deploymentDescription || example.deploymentDescription || 'BozzaOrario');
  const webappUrl = await prompt(rl, 'Web app URL /exec (opzionale, solo per echo a fine deploy)', current.webappUrl || example.webappUrl);
  const spreadsheetId = await prompt(rl, 'Spreadsheet ID (opzionale)', current.spreadsheetId || example.spreadsheetId);
  const expectedAccount = await prompt(rl, 'Account Google atteso per clasp (opzionale, per check pre-deploy)', current.expectedAccount || example.expectedAccount);

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
    webappUrl: webappUrl && !/^</.test(webappUrl) ? webappUrl : '',
    spreadsheetId: spreadsheetId || '',
    expectedAccount: expectedAccount || ''
  });

  console.log('\nOK:');
  console.log('  ' + path.relative(ROOT, CLASP_PATH));
  console.log('  ' + path.relative(ROOT, LOCAL_PATH));
  console.log('\nProssimi passi:');
  console.log('  npm run pull   # scarica codice esistente (se questo progetto remoto non è vuoto)');
  console.log('  npm run push   # invia src/ a Apps Script');
  console.log('  npm run deploy # aggiorna il web app deployment\n');
})();
