// Simulazione fedele del drag handler Aule: estrae la funzione REALE
// attachEditHandlers da src/index.html e la esegue in un mock-DOM che traccia
// i listener su document. Verifica l'invariante: ogni pointerup finalizza e
// rimuove i listener (niente "mouse attaccato"), in tutti gli scenari.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

const start = html.indexOf('function attachEditHandlers(block) {');
const end = html.indexOf('function revertBlock(block) {');
if (start < 0 || end < 0) { console.error('estrazione fallita'); process.exit(2); }
const fnSrc = html.slice(start, end).trim();

// ---- Mock DOM ----
let docListeners = {};
const document = {
  addEventListener(type, fn) { (docListeners[type] = docListeners[type] || new Set()).add(fn); },
  removeEventListener(type, fn) { if (docListeners[type]) docListeners[type].delete(fn); },
  body: {
    _children: [],
    appendChild(n) { this._children.push(n); n.parentNode = this; },
    removeChild(n) { const i = this._children.indexOf(n); if (i >= 0) this._children.splice(i, 1); n.parentNode = null; }
  },
  _elementAt: null,
  elementFromPoint() { return this._elementAt; }
};
function docCount() { return Object.values(docListeners).reduce((a, s) => a + s.size, 0); }
// Inietta pointerId di default (1) come farebbe un vero PointerEvent
function fire(type, ev) { ev = Object.assign({ pointerId: 1 }, ev); (docListeners[type] || new Set()).forEach(fn => fn(ev)); }

function mkEl(opts) {
  opts = opts || {};
  const classes = new Set(opts.classes || []);
  const el = {
    dataset: Object.assign({}, opts.dataset || {}),
    style: {},
    parentNode: null,
    isConnected: true,
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      contains: (c) => classes.has(c)
    },
    _listeners: {},
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    getBoundingClientRect() { return opts.rect || { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }; },
    cloneNode() { return mkEl({ classes: [...classes], dataset: Object.assign({}, el.dataset), rect: opts.rect }); },
    querySelector() { return null; },
    querySelectorAll() { return { forEach() {} }; },
    appendChild(n) { n.parentNode = this; },
    closest(sel) {
      let cur = this;
      while (cur) { if (cur._matches && cur._matches(sel)) return cur; cur = cur.parentNode; }
      return null;
    }
  };
  el._matches = (sel) => (sel === '.parking-zone' && classes.has('parking-zone'))
    || (sel === '.room-track' && classes.has('room-track'));
  return el;
}

// ---- Dipendenze esterne (spie) ----
let commits = [], parked = [], unparked = [], reverts = [], pendingUI = 0;
const PX_PER_MIN_AULE = 1.3;
const slotStart = 510, slotEnd = 1170;
const TRACK_PX = (slotEnd - slotStart) * PX_PER_MIN_AULE;
function fmt(m) { const h = Math.floor(m / 60), x = m % 60; return (h < 10 ? '0' : '') + h + ':' + (x < 10 ? '0' : '') + x; }
function recordParked(b, prev) { parked.push({ b, prev }); }
function unrecordParked(b) { unparked.push(b); }
function updatePendingUI() { pendingUI++; }
function commitEdit(b, src, target) { commits.push({ src, target }); }
function revertBlock(b) { reverts.push(b); }
let _activeDrag = null; // registro globale del drag attivo (come in index.html)

eval(fnSrc); // definisce attachEditHandlers nello scope

function makeBlock(dataset, rect) { return mkEl({ classes: ['ablock', 'editable'], dataset, rect }); }
function makeTrack(room, day) {
  return mkEl({ classes: ['room-track'], dataset: { room, day: String(day) },
    rect: { left: 0, top: 0, width: TRACK_PX, height: 20, right: TRACK_PX, bottom: 20 } });
}
function getOnDown(block) { return block._listeners['pointerdown'][0]; }

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  OK  ' + name); } else { fail++; console.log('  XX  FAIL: ' + name); } }
function srcJson() { return JSON.stringify({ sheet: 'S1LT', row: 5, col: 12, idx: 0 }); }

// S1: move cross-room
(function () {
  docListeners = {}; commits = []; document.body._children = [];
  const block = makeBlock({ room: 'A', day: '0', start: '600', end: '720', src: srcJson() },
    { left: (600 - slotStart) * PX_PER_MIN_AULE, top: 0, width: 120 * PX_PER_MIN_AULE, height: 20 });
  const trackB = makeTrack('B', 0);
  attachEditHandlers(block);
  const onDown = getOnDown(block);
  onDown({ button: 0, target: block, clientX: 50, clientY: 10, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  check('S1: listener doc aggiunti dopo down', docCount() > 0);
  document._elementAt = trackB;
  fire('pointermove', { clientX: 200, clientY: 10 });
  fire('pointerup', { clientX: 200, clientY: 10 });
  check('S1: commit chiamato una volta', commits.length === 1);
  check('S1: commit verso room B', !!commits[0] && commits[0].target.room === 'B');
  check('S1: nessun ghost residuo', document.body._children.length === 0);
  check('S1: listener doc rimossi (no leak)', docCount() === 0);
})();

// S2: release fuori da ogni zona (simula rilascio fuori iframe)
(function () {
  docListeners = {}; commits = []; document.body._children = [];
  const block = makeBlock({ room: 'A', day: '0', start: '600', end: '720', src: srcJson() }, { left: 117, top: 0, width: 156, height: 20 });
  attachEditHandlers(block);
  getOnDown(block)({ button: 0, target: block, clientX: 50, clientY: 10, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  document._elementAt = null;
  fire('pointermove', { clientX: 5000, clientY: 5000 });
  fire('pointerup', { clientX: 5000, clientY: 5000 });
  check('S2: nessun commit (drop non valido)', commits.length === 0);
  check('S2: nessun ghost residuo', document.body._children.length === 0);
  check('S2: listener doc rimossi (NO stuck)', docCount() === 0);
})();

// S3: click puro
(function () {
  docListeners = {}; commits = []; document.body._children = [];
  const block = makeBlock({ room: 'A', day: '0', start: '600', end: '720', src: srcJson() }, { left: 117, top: 0, width: 156, height: 20 });
  attachEditHandlers(block);
  getOnDown(block)({ button: 0, target: block, clientX: 50, clientY: 10, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  fire('pointerup', { clientX: 51, clientY: 10 });
  check('S3: click -> nessun ghost', document.body._children.length === 0);
  check('S3: click -> nessun commit', commits.length === 0);
  check('S3: click -> listener rimossi', docCount() === 0);
})();

// S4: pointercancel a meta drag
(function () {
  docListeners = {}; commits = []; reverts = []; document.body._children = [];
  const block = makeBlock({ room: 'A', day: '0', start: '600', end: '720', src: srcJson() }, { left: 117, top: 0, width: 156, height: 20 });
  const trackB = makeTrack('B', 0);
  attachEditHandlers(block);
  getOnDown(block)({ button: 0, target: block, clientX: 50, clientY: 10, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  document._elementAt = trackB;
  fire('pointermove', { clientX: 200, clientY: 10 });
  fire('pointercancel', {});
  check('S4: cancel -> revert chiamato', reverts.length === 1);
  check('S4: cancel -> ghost rimosso', document.body._children.length === 0);
  check('S4: cancel -> listener rimossi', docCount() === 0);
})();

// S5: parking
(function () {
  docListeners = {}; commits = []; parked = []; document.body._children = [];
  const block = makeBlock({ room: 'A', day: '0', start: '600', end: '720', src: srcJson() }, { left: 117, top: 0, width: 156, height: 20 });
  const parking = mkEl({ classes: ['parking-zone'] });
  parking.querySelector = (sel) => sel === '.pbody' ? mkEl({ classes: ['pbody'] }) : null;
  attachEditHandlers(block);
  getOnDown(block)({ button: 0, target: block, clientX: 50, clientY: 10, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  document._elementAt = parking;
  fire('pointermove', { clientX: 900, clientY: 300 });
  fire('pointerup', { clientX: 900, clientY: 300 });
  check('S5: parking -> recordParked chiamato', parked.length === 1);
  check('S5: parking -> nessun commit', commits.length === 0);
  check('S5: parking -> in-parking sul blocco', block.classList.contains('in-parking'));
  check('S5: parking -> listener rimossi', docCount() === 0);
})();

// S6: 20 drag falliti consecutivi non accumulano listener/ghost
(function () {
  docListeners = {}; document.body._children = [];
  for (let i = 0; i < 20; i++) {
    const block = makeBlock({ room: 'A', day: '0', start: '600', end: '720', src: srcJson() }, { left: 117, top: 0, width: 156, height: 20 });
    attachEditHandlers(block);
    getOnDown(block)({ button: 0, target: block, clientX: 50, clientY: 10, pointerId: 1, preventDefault() {}, stopPropagation() {} });
    document._elementAt = null;
    fire('pointermove', { clientX: 9999, clientY: 9999 });
    fire('pointerup', { clientX: 9999, clientY: 9999 });
  }
  check('S6: dopo 20 drag, 0 listener residui (no accumulo)', docCount() === 0);
  check('S6: dopo 20 drag, 0 ghost residui', document.body._children.length === 0);
})();

// S7: rilascio FUORI dall'iframe (pointerup mai ricevuto) -> orphan; il gesto
// successivo (purgeGhosts -> _activeDrag.abort()) deve ripulire tutto.
(function () {
  docListeners = {}; commits = []; document.body._children = []; _activeDrag = null;
  const block = makeBlock({ room: 'A', day: '0', start: '600', end: '720', src: srcJson() }, { left: 117, top: 0, width: 156, height: 20 });
  const trackB = makeTrack('B', 0);
  attachEditHandlers(block);
  getOnDown(block)({ button: 0, target: block, clientX: 50, clientY: 10, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  document._elementAt = trackB;
  fire('pointermove', { clientX: 200, clientY: 10 });
  // NIENTE pointerup (rilascio fuori dall'iframe)
  check('S7: orphan -> _activeDrag registrato', !!_activeDrag);
  check('S7: orphan -> listener ancora attivi (atteso)', docCount() > 0);
  check('S7: orphan -> ghost ancora presente (atteso)', document.body._children.length === 1);
  // Gesto successivo: purgeGhosts chiamerebbe _activeDrag.abort()
  _activeDrag.abort(); _activeDrag = null;
  check('S7: dopo abort -> listener rimossi', docCount() === 0);
  check('S7: dopo abort -> ghost rimosso', document.body._children.length === 0);
  check('S7: dopo abort -> _activeDrag nullo', _activeDrag === null);
})();

function srcJson2() { return JSON.stringify({ sheet: 'S1LT', row: 6, col: 12, idx: 0 }); }

// S8: avvio un secondo drag mentre il primo è ancora attivo → il primo va
// abortito, nessun accumulo di listener.
(function () {
  docListeners = {}; commits = []; document.body._children = []; _activeDrag = null;
  const A = makeBlock({ room: 'A', day: '0', start: '600', end: '720', src: srcJson() }, { left: 117, top: 0, width: 156, height: 20 });
  const B = makeBlock({ room: 'B', day: '0', start: '600', end: '720', src: srcJson2() }, { left: 300, top: 0, width: 156, height: 20 });
  attachEditHandlers(A); attachEditHandlers(B);
  getOnDown(A)({ button: 0, target: A, clientX: 50, clientY: 10, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  document._elementAt = null;
  fire('pointermove', { clientX: 60, clientY: 25 }); // A avviato (ghost)
  check('S8: A attivo → 3 listener doc', docCount() === 3);
  // Avvio B senza concludere A
  getOnDown(B)({ button: 0, target: B, clientX: 310, clientY: 10, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  check('S8: dopo onDown B → ancora 3 listener (A abortito, no accumulo)', docCount() === 3);
  check('S8: ghost di A rimosso', document.body._children.length === 0);
  document._elementAt = makeTrack('B', 0);
  fire('pointermove', { clientX: 330, clientY: 10 });
  fire('pointerup', { clientX: 330, clientY: 10 });
  check('S8: dopo fine B → 0 listener', docCount() === 0);
})();

// S9: eventi di un ALTRO puntatore (pointerId diverso) ignorati.
(function () {
  docListeners = {}; commits = []; document.body._children = []; _activeDrag = null;
  const A = makeBlock({ room: 'A', day: '0', start: '600', end: '720', src: srcJson() }, { left: 117, top: 0, width: 156, height: 20 });
  attachEditHandlers(A);
  getOnDown(A)({ button: 0, target: A, clientX: 50, clientY: 10, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  fire('pointermove', { clientX: 999, clientY: 999, pointerId: 2 }); // altro dito
  check('S9: pointermove pid2 ignorato (0 ghost)', document.body._children.length === 0);
  fire('pointerup', { clientX: 999, clientY: 999, pointerId: 2 });   // up altro dito
  check('S9: pointerup pid2 ignorato (A ancora attivo, 3 listener)', docCount() === 3);
  document._elementAt = makeTrack('B', 0);
  fire('pointermove', { clientX: 200, clientY: 10, pointerId: 1 });
  fire('pointerup', { clientX: 200, clientY: 10, pointerId: 1 });
  check('S9: con pid1 il drag completa (0 listener)', docCount() === 0);
})();

// S10: onDown su un blocco staccato dal DOM (post re-render) viene ignorato.
(function () {
  docListeners = {}; document.body._children = []; _activeDrag = null;
  const A = makeBlock({ room: 'A', day: '0', start: '600', end: '720', src: srcJson() }, { left: 117, top: 0, width: 156, height: 20 });
  A.isConnected = false;
  attachEditHandlers(A);
  getOnDown(A)({ button: 0, target: A, clientX: 50, clientY: 10, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  check('S10: onDown su blocco staccato ignorato (0 listener)', docCount() === 0);
})();

console.log('\nRISULTATO: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
