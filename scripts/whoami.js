#!/usr/bin/env node
/**
 * Stampa l'account Google attualmente loggato in clasp.
 * Legge ~/.clasprc.json e decodifica l'id_token JWT.
 * Confronta con `expectedAccount` di config/local.json (se presente) e
 * stampa un warning se non coincidono.
 *
 * Exit code:
 *   0  account ok (o nessun expectedAccount configurato)
 *   1  nessun account loggato
 *   2  account loggato ma diverso da expectedAccount
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_PATH = path.join(ROOT, 'config', 'local.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

/**
 * Estrae l'account loggato chiedendolo a `clasp show-authorized-user`.
 * clasp 3.x non scrive piu' l'id_token in .clasprc.json, quindi non
 * possiamo decodificare il JWT direttamente.
 */
function getLoggedAccount() {
  const r = spawnSync('clasp', ['show-authorized-user'], { encoding: 'utf8', shell: true });
  if (r.status !== 0) return null;
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/logged in as\s+([^\s,]+@[^\s,]+\.[^\s,.]+)/i);
  return m ? m[1] : null;
}

function main() {
  const account = getLoggedAccount();
  const cfg = readJson(LOCAL_PATH) || {};
  const expected = cfg.expectedAccount || '';

  if (!account) {
    console.error('clasp: nessun account loggato. Esegui: clasp login');
    if (expected) console.error('(atteso: ' + expected + ')');
    process.exit(1);
  }
  console.log('Account clasp: ' + account);
  if (expected && account.toLowerCase() !== expected.toLowerCase()) {
    console.error('');
    console.error('⚠ ATTENZIONE: account loggato (' + account + ') diverso da expectedAccount (' + expected + ').');
    console.error('  → clasp logout && clasp login    e seleziona ' + expected);
    process.exit(2);
  }
  if (expected) console.log('(coincide con expectedAccount in config/local.json)');
}

if (require.main === module) main();

module.exports = { getLoggedAccount };
