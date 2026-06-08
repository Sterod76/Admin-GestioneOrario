// Costruisce una versione STANDALONE della Web App (src/index.html) con dati
// mock realistici, per generare gli screenshot del MANUAL.md senza dover
// autenticarsi sul deployment Google. Sostituisce i 5 scriptlet GAS, stub di
// google.script.run, e attiva il tab indicato in location.hash.
//   node scripts/build_manual_screens.js   →  .manual_preview/index.html
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUTDIR = path.join(ROOT, '.manual_preview');

const SC_LT = '#1a73e8', SC_LM = '#e8710a';
const VC = { OBB: '#ffcfc9', FOR: '#ffe5a0', OPZ: '#d4edbc' };

function S(sheet, row, code, name, tipo, vinc, grp, anno, tit, ssd, day, start, end, room) {
  const lm = /LM$/.test(sheet);
  return {
    sheet, sheetColor: lm ? SC_LM : SC_LT, anno: String(anno),
    src: { sheet, row, col: 12 + day, idx: 0 },
    code, name, tipo, tipoLabel: tipo, vincolo: vinc, vincoloColor: VC[vinc] || '#fff',
    group: grp, titolare: tit, docenti: tit ? tit.split(/\s*\/\s*/) : [],
    ssd, day, start, end, room, periodo: '1° semestre'
  };
}
function C(sheet, row, code, name, tipo, vinc, grp, anno, tit) {
  const lm = /LM$/.test(sheet);
  return {
    sheet, sheetColor: lm ? SC_LM : SC_LT, row, code, name, tipo, tipoLabel: tipo,
    group: grp, anno: String(anno), titolare: tit, docenti: tit ? tit.split(/\s*\/\s*/) : [],
    vincolo: vinc, vincoloColor: VC[vinc] || '#fff'
  };
}

const sessions = [
  // ---- Triennale (S1LT) ----
  S('S1LT', 2, '001AB', 'Analisi Matematica I', 'LEZ', 'OBB', '', 1, 'Rossi', 'MAT/05', 0, 540, 660, 'Aula A'),
  S('S1LT', 2, '001AB', 'Analisi Matematica I', 'LEZ', 'OBB', '', 1, 'Rossi', 'MAT/05', 2, 540, 660, 'Aula A'),
  S('S1LT', 3, '002AB', 'Fisica Generale I', 'LEZ', 'OBB', '', 1, 'Bianchi', 'FIS/01', 1, 660, 780, 'Aula A'),
  S('S1LT', 3, '002AB', 'Fisica Generale I', 'LEZ', 'OBB', '', 1, 'Bianchi', 'FIS/01', 3, 660, 780, 'Aula A'),
  S('S1LT', 4, '003AB', 'Chimica Generale', 'LEZ', 'OBB', '', 1, 'Rossi', 'CHIM/03', 0, 540, 660, 'Aula B'),
  // ---- Magistrale (S1LM) ----
  S('S1LM', 2, '401B', 'Fisica Teorica', 'LEZ', 'OBB', '', 1, 'Verdi', 'FIS/02', 1, 840, 960, 'Aula A'),
  S('S1LM', 2, '401B', 'Fisica Teorica', 'LEZ', 'OBB', '', 1, 'Verdi', 'FIS/02', 2, 900, 1020, 'Aula A'),
  S('S1LM', 3, '402B', 'Meccanica Statistica', 'LEZ', 'OBB', '', 1, 'Neri', 'FIS/02', 1, 840, 960, 'Aula B'),
  S('S1LM', 4, '403B', 'Teoria dei Campi', 'LEZ', 'FOR', '', 1, 'Gialli', 'FIS/02', 1, 900, 1020, 'Aula C'),
  S('S1LM', 4, '403B', 'Teoria dei Campi', 'LEZ', 'FOR', '', 1, 'Gialli', 'FIS/02', 2, 900, 1020, 'Aula C'),
  S('S1LM', 5, '404B', 'Astrofisica', 'LEZ', 'FOR', '', 1, 'Grigi', 'FIS/05', 1, 900, 1020, 'Aula D'),
  // Opzionali LM (per la 3ª matrice Collisioni OPZIONALI × TUTTI): sovrapposti
  // a obblighi/forchette e fra loro.
  S('S1LM', 6, '405B', 'Cosmologia', 'LEZ', 'OPZ', '', 1, 'Verdi', 'FIS/05', 1, 840, 960, 'Aula C'),
  S('S1LM', 7, '406B', 'Onde Gravitazionali', 'LEZ', 'OPZ', '', 1, 'Grigi', 'FIS/05', 1, 900, 1020, 'Aula D')
];

const courses = [
  C('S1LT', 2, '001AB', 'Analisi Matematica I', 'LEZ', 'OBB', '', 1, 'Rossi'),
  C('S1LT', 3, '002AB', 'Fisica Generale I', 'LEZ', 'OBB', '', 1, 'Bianchi'),
  C('S1LT', 4, '003AB', 'Chimica Generale', 'LEZ', 'OBB', '', 1, 'Rossi'),
  C('S1LM', 2, '401B', 'Fisica Teorica', 'LEZ', 'OBB', '', 1, 'Verdi'),
  C('S1LM', 3, '402B', 'Meccanica Statistica', 'LEZ', 'OBB', '', 1, 'Neri'),
  C('S1LM', 4, '403B', 'Teoria dei Campi', 'LEZ', 'FOR', '', 1, 'Gialli'),
  C('S1LM', 5, '404B', 'Astrofisica', 'LEZ', 'FOR', '', 1, 'Grigi'),
  C('S1LM', 6, '405B', 'Cosmologia', 'LEZ', 'OPZ', '', 1, 'Verdi'),
  C('S1LM', 7, '406B', 'Onde Gravitazionali', 'LEZ', 'OPZ', '', 1, 'Grigi'),
  // Opzionali Triennale (per la matrice Co-esami LT)
  C('S1LT', 6, '111AB', 'Fisica Computazionale', 'LEZ', 'OPZ', '', 3, 'Verdi'),
  C('S1LT', 7, '112AB', 'Storia della Fisica', 'LEZ', 'OPZ', '', 3, 'Neri'),
  C('S1LT', 8, '113AB', 'Astronomia', 'LEZ', 'OPZ', '', 3, 'Grigi'),
  C('S1LT', 9, '114AB', 'Elettronica', 'LEZ', 'OPZ', '', 3, 'Gialli')
];

function gridRow(code, name, tipo, vinc, tit, ssd, cfu) {
  return ['', '', code, '', name, tipo, vinc, '', '', tit, ssd, cfu];
}
const HDR = ['', '', 'Codice', 'Mutuato', 'Insegnamento', 'Tipo', 'Vincolo', 'Gruppo', '—', 'Docenti', 'SSD', 'CFU', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'Periodo'];

const data = {
  semester: 'S1',
  spreadsheetName: 'Orario Fisica 2025/26 — DEMO',
  days: ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'],
  slotStartMin: 480, slotEndMin: 1140, slotStepMin: 60,
  sheets: [{ name: 'S1LT', color: SC_LT }, { name: 'S1LM', color: SC_LM }],
  rooms: ['Aula A', 'Aula B', 'Aula C', 'Aula D', 'Lab Info'],
  roomSubtitles: { 'Aula A': '120', 'Aula B': '80', 'Aula C': '60', 'Aula D': '45', 'Lab Info': '24 · informatica' },
  tipi: ['LEZ', 'LAB'],
  gruppi: [],
  titolari: ['Bianchi', 'Gialli', 'Grigi', 'Neri', 'Rossi', 'Verdi'],
  codesLT: ['001AB', '002AB', '003AB', '111AB', '112AB', '113AB', '114AB'],
  codesLM: ['401B', '402B', '403B', '404B', '405B', '406B'],
  pds: [
    { name: 'Curr. Teorico', codes: ['401B', '402B', '403B', '404B', '405B', '406B'], vincoloByCode: { '401B': 'OBB', '402B': 'OBB', '403B': 'FOR', '404B': 'FOR', '405B': 'OPZ', '406B': 'OPZ' } },
    { name: 'Curr. Astrofisico', codes: ['401B', '404B', '406B'], vincoloByCode: { '401B': 'OBB', '404B': 'FOR', '406B': 'OPZ' } }
  ],
  coexam: {
    perCode: { '401B': 45, '402B': 38, '403B': 22, '404B': 15, '405B': 18, '406B': 12, '001AB': 160, '002AB': 150, '003AB': 90, '111AB': 55, '112AB': 40, '113AB': 28, '114AB': 16 },
    pairs: { '401B|402B': 18, '401B|403B': 9, '401B|404B': 5, '402B|403B': 12, '402B|404B': 4, '403B|404B': 3, '401B|405B': 11, '402B|405B': 7, '403B|405B': 6, '401B|406B': 8, '404B|406B': 5, '405B|406B': 4, '001AB|003AB': 14, '111AB|112AB': 12, '111AB|113AB': 6, '112AB|113AB': 4, '113AB|114AB': 2 },
    codes: ['401B', '402B', '403B', '404B', '405B', '406B', '001AB', '002AB', '003AB', '111AB', '112AB', '113AB', '114AB'],
    count: 13
  },
  courses,
  vincoloColors: VC,
  ownerEmail: 'demo@unipi.it',
  sessions,
  unavail: [{ room: 'Aula D', day: 4, start: 840, end: 1080, label: 'Manutenzione', note: 'Manutenzione' }],
  rawSheets: {
    S1LT: {
      color: SC_LT, headerRows: 1, grid: [HDR,
        gridRow('001AB', 'Analisi Matematica I', 'LEZ', 'OBB', 'Rossi', 'MAT/05', '9'),
        gridRow('002AB', 'Fisica Generale I', 'LEZ', 'OBB', 'Bianchi', 'FIS/01', '9'),
        gridRow('003AB', 'Chimica Generale', 'LEZ', 'OBB', 'Rossi', 'CHIM/03', '6')]
    },
    S1LM: {
      color: SC_LM, headerRows: 1, grid: [HDR,
        gridRow('401B', 'Fisica Teorica', 'LEZ', 'OBB', 'Verdi', 'FIS/02', '6'),
        gridRow('402B', 'Meccanica Statistica', 'LEZ', 'OBB', 'Neri', 'FIS/02', '6'),
        gridRow('403B', 'Teoria dei Campi', 'LEZ', 'FOR', 'Gialli', 'FIS/02', '6'),
        gridRow('404B', 'Astrofisica', 'LEZ', 'FOR', 'Grigi', 'FIS/05', '6')]
    }
  },
  generatedAt: '2026-06-06T10:00:00.000Z'
};

let html = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
const stub = [
  'window.onerror = function (m, s, l, c) { var d = document.createElement("pre"); d.style.cssText = "background:#fdd;color:#900;padding:8px;font:12px monospace;white-space:pre-wrap"; d.textContent = "JS ERROR: " + m + " @" + l + ":" + c; document.body.insertBefore(d, document.body.firstChild); };',
  'window.google = { script: {} };',
  'window.google.script.run = new Proxy({}, { get: function () { return function () { return window.google.script.run; }; } });',
  'window.google.script.host = { close: function () {}, setHeight: function () {} };',
  'window.google.script.url = { getLocation: function (cb) { if (cb) cb({ parameter: {} }); } };'
].join('\n');

html = html.replace('var BOOTSTRAP = <?!= bootstrap ?>;', stub + '\nvar BOOTSTRAP = ' + JSON.stringify(data) + ';');
const ROLE_ARG = process.argv[2] || 'editor'; // 'editor' | 'auditor' | 'public' | 'draft'
const DRAFT = ROLE_ARG === 'draft';           // 'draft' = utente generico, sito in redazione
const ROLE = DRAFT ? 'public' : ROLE_ARG;
html = html.replace('var EDIT_MODE = <?!= editMode ?>;', 'var EDIT_MODE = ' + (ROLE === 'editor' ? 'true' : 'false') + ';');
html = html.replace('var ROLE = <?!= JSON.stringify(role || \'public\') ?>;', 'var ROLE = "' + ROLE + '";');
html = html.replace('var DRAFT = <?!= JSON.stringify(draft || false) ?>;', 'var DRAFT = ' + (DRAFT ? 'true' : 'false') + ';');
html = html.replace('var FEEDBACK_ON = <?!= JSON.stringify(feedback || false) ?>;', 'var FEEDBACK_ON = false;');
html = html.replace('var EDIT_HOLDER = <?!= JSON.stringify(editHolder || \'\') ?>;', 'var EDIT_HOLDER = "";');
html = html.replace('var EDIT_DENIED = <?!= JSON.stringify(editDenied || false) ?>;', 'var EDIT_DENIED = false;');
html = html.replace('var USER_EMAIL = <?!= JSON.stringify(userEmail || \'\') ?>;', 'var USER_EMAIL = "demo@unipi.it";');
html = html.replace('var WEBAPP_URL = <?!= JSON.stringify(webAppUrl || \'\') ?>;', 'var WEBAPP_URL = "";');
html = html.replace('var DIAG = <?!= diag ?>;', 'var DIAG = {};');

// attiva il tab da location.hash (es. #collisions, #coexam, #mirror1) sull'evento load
// #collisions!opz → matrice OPZIONALI×TUTTI: seleziona una cella e la porta in cima.
const activator = '<script>(function(){function opz(){var secs=[].slice.call(document.querySelectorAll("#collisionsBody .cl-section"));var s=secs.filter(function(x){var h=x.querySelector("h3");return h&&/OPZIONALI/.test(h.textContent);})[0];if(!s)return;var c=s.querySelector(".clm-cell.clm-opz");if(c){c.click();s=[].slice.call(document.querySelectorAll("#collisionsBody .cl-section")).filter(function(x){var h=x.querySelector("h3");return h&&/OPZIONALI/.test(h.textContent);})[0];}if(s)s.scrollIntoView({block:"start"});window.scrollBy(0,-12);}function a(){var raw=(location.hash||"").replace("#","");if(!raw)return;var p=raw.split("!");var t=document.querySelector(\'.view-tab[data-view="\'+p[0]+\'"]\');if(t)t.click();if(p[1]==="list"){var lb=document.querySelector(\'.cl-vbtn[data-cv="list"]\');if(lb)lb.click();}if(p[1]==="matrix"){var mb=document.querySelector(\'.cl-vbtn[data-cv="matrix"]\');if(mb)mb.click();if(p[2]==="sel"){var c=document.querySelector(".clm-cell");if(c)c.click();}}if(p[1]==="opz"){var mb2=document.querySelector(\'.cl-vbtn[data-cv="matrix"]\');if(mb2)mb2.click();opz();}if(p[1]==="cell"){var cn=document.querySelector(".cx-n");if(cn)cn.click();}if(p[1]==="code"){var rh=document.querySelector(".cx-rh");if(rh)rh.click();}}window.addEventListener("load",a);if(document.readyState==="complete")a();})();</script>';
html = html.replace('</body>', activator + '\n</body>');

if ([...html.matchAll(/<\?!?=/g)].length) {
  console.error('ATTENZIONE: scriptlet GAS non sostituiti rimasti nel file.');
}
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'index.html'), html, 'utf8');

// Verifica sintassi di OGNI blocco <script> generato (cattura iniezioni rotte).
const { execSync } = require('child_process');
let synErr = 0;
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
  const f = path.join(OUTDIR, '_chk' + i + '.js');
  fs.writeFileSync(f, m[1]);
  try { execSync('node --check "' + f + '"', { stdio: 'pipe' }); }
  catch (e) { synErr++; console.error('SCRIPT BLOCK ' + i + ' SYNTAX ERROR:\n' + (e.stderr || e.stdout || e.message).toString().split('\n').slice(0, 4).join('\n')); }
  fs.unlinkSync(f);
});
console.log((synErr ? '✗ ' + synErr + ' blocchi con errori. ' : '✓ sintassi OK. ') + 'Scritto ' + path.join(OUTDIR, 'index.html') + ' (' + html.length + ' bytes)');
