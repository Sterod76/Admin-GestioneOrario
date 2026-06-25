# WEBAPP.md — com'è organizzata la web app (`src/index.html`)

Riferimento per chi mette mano al **client**. Tutto il client sta in **un solo file**,
`src/index.html` (~6500 righe): niente librerie esterne, niente build. I numeri di riga
sono indicativi. Lato server vedi [`docs/guida-tecnica-completa.md`](docs/guida-tecnica-completa.md).

## Struttura del file

| Righe | Cosa |
|---|---|
| `8–1115` | `<style>` — CSS inline (variabili tema, griglia, slot, tab, stampa) |
| `1117–1238` | `<body>` — HTML statico (header, tab, contenitori vista, log/parking, overlay feedback) |
| `1239–6513` | `<script>` — un'unica **IIFE** con tutta la logica |

Il server (`WebApp.gs doGet`) carica `index.html` come **template HtmlService** e
inietta le variabili via scriptlet `<?!= … ?>` ([src/index.html:1240](src/index.html#L1240)):
`BOOTSTRAP` (lo snapshot JSON), `EDIT_MODE`, `ROLE` (`editor`/`auditor`/`public`),
`DRAFT`, `FEEDBACK_ON`, `USER_EMAIL`, `WEBAPP_URL`, `EDIT_HOLDER`. Tutto il resto gira
client-side: la pagina **non** rilegge il foglio.

## Flusso dati

```
WebApp.gs getOrarioData → snapshot JSON  →  <?!= bootstrap ?>  →  var BOOTSTRAP
   → IIFE: const data = BOOTSTRAP (+ default difensivi)  →  applyFilters() → render della vista attiva
```

L'oggetto **`data`** ([src/index.html:1275](src/index.html#L1275)) è il modello unico:

| Campo | Cosa |
|---|---|
| `sessions` | tutte le sessioni (slot): `{sheet,row,col,idx, code,name,room,day,start,end,group,...}` |
| `rooms`, `roomSubtitles` | aule (ordine) + capienze |
| `sheets`, `tipi`, `gruppi`, `titolari` | valori per filtri/legenda |
| `codesLT`, `codesLM`, `pds` | codici per livello + piani di studio (curriculum → codici) |
| `coexam` | `{perCode, pairs}` matrice co-esami (E per codice, N per coppia) |
| `vincoloColors` | colori OBB/FOR/OPZ |
| `rawSheets` | dati grezzi per le schede "specchio" |
| `pendingEdits` | modifiche non ancora salvate |
| `days`, `slotStartMin/EndMin/StepMin` | config griglia |

## Le 7 viste (tab)

Tab in `.view-tabs` ([src/index.html:1157](src/index.html#L1157)); `data-view` →
contenitore + funzione di render. Stato in **`currentView`**
([src/index.html:1597](src/index.html#L1597)); il click sul tab lo aggiorna e chiama
il render ([src/index.html:1597–1640](src/index.html#L1597)).

| Tab (`data-view`) | Contenitore | Render |
|---|---|---|
| Calendario (`sessions`) | `#grid` | `renderCalendarSessions()` ([5215](src/index.html#L5215)) |
| Aule (`rooms`) | `#viewRooms` | `buildAuleView()` + `renderAuleSessions()` ([4111](src/index.html#L4111)/[4259](src/index.html#L4259)) |
| Slot (`slots`) | `#slotGrid` | `buildSlotView()` + `renderSlotsSessions()` ([1669](src/index.html#L1669)/[3483](src/index.html#L3483)) |
| Collisioni (`collisions`) | `#collisionsBody` | `renderCollisions()` ([2335](src/index.html#L2335)) |
| Docenti (`ubiquity`) | `#ubiquityBody` | `renderUbiquity()` ([2944](src/index.html#L2944)) |
| Co-esami LM/LT (`coexam`/`coexamlt`) | `#coexamBody[LT]` | `renderCoexamMatrix[LT]()` ([3307](src/index.html#L3307)) |
| Specchio S\*LT/S\*LM | (creati a runtime) | `renderSheetMirror()` ([3332](src/index.html#L3332)) |

## Filtri

**`applyFilters()`** ([src/index.html:5605](src/index.html#L5605)) è il cuore: applica
ricerca/PdS/anno/gruppo/aule alle sessioni, poi richiama il render della vista attiva.
Regole di **override**: una ricerca ≥2 caratteri o una selezione aule bypassano
PdS/anno/gruppo; le viste grafiche (Aule/Slot) bypassano sempre i selettori (la ricerca
resta). Parser ricerca: `tokenizeQuery`/`parseQuery` ([6300](src/index.html#L6300)).

## Rendering della griglia

Calendario/Aule/Slot sono **griglie CSS** con le sessioni in **posizionamento assoluto**:
`top/height = (min − slotStart) × PX_PER_MIN`. Le sovrapposizioni nello stesso giorno
sono disposte in **lane** (come Google Calendar): `relayoutVisible()`
([1385](src/index.html#L1385)) / `_layoutOverlaps()` ([1766](src/index.html#L1766)).

## Editing (solo in EDIT)

- **EDIT/VIEW + lock**: un solo editor per volta, gestito via server
  ([src/index.html:6434](src/index.html#L6434)); RPC `rpcEditStatus`/`rpcRenewEdit`.
- **Drag/resize**: handler per vista — Slot `attachSlotEditHandlers` ([3888](src/index.html#L3888)),
  Aule `attachEditHandlers` ([4331](src/index.html#L4331)), indisponibilità
  `attachUnavailDrag` ([5097](src/index.html#L5097)), nuovo slot `attachTemplateDrag` ([4887](src/index.html#L4887)).
- **Applica + commit**: `applyEditLocally` ([4669](src/index.html#L4669)) →
  `commitEdit`/`commitSlotEdit` → `rerenderAfterEdit` ([4802](src/index.html#L4802)).
  Crea/elimina: `createSlot` ([4850](src/index.html#L4850)) / `deleteSlot` ([4824](src/index.html#L4824)).
- **Pending + Parking + Log**: le modifiche restano locali in `data.pendingEdits`;
  `updatePendingUI` ([5856](src/index.html#L5856)), `renderModLog` ([6085](src/index.html#L6085)),
  parking in `sessionStorage` ([1304](src/index.html#L1304)), tante `revert*`.
- **Carica/Salva**: RPC `rpcLoadFromSheet` / `rpcSaveToSheet` (→ `WebApp.gs`).

## Collisioni e costo

`costo = overlapMin × N`. Helper: `canon` (collassa i mutuati) ([2130](src/index.html#L2130)),
`coexamN`/`coexamE` ([2153](src/index.html#L2153)), `overlapMin` ([2168](src/index.html#L2168)),
`costCellHtml` ([2173](src/index.html#L2173)). Selezione/drag mostrano overlay live:
`_dragShowTeacherBusy` (lineette docente rossa=Fisica/viola=servizio, [3655](src/index.html#L3655)),
`_dragShowCoex` (pallini co-esame, [3797](src/index.html#L3797)),
`_dragShowDropPreview` ([3861](src/index.html#L3861)), `_dragShowCostBox` ([3878](src/index.html#L3878)).
Selezione slot: `toggleSlotSelection` ([2075](src/index.html#L2075)) → `renderSelectionInfo` ([2233](src/index.html#L2233)).

## PDF e Feedback

- **Save view as PDF**: `savePdf()` ([5391](src/index.html#L5391)) →
  `_savePdfSingle` / `_savePdfCalendarSet` (set multipagina del calendario) +
  helper `_pdfHead`/`_buildSlotBands`/`_fitPages`.
- **Feedback**: overlay ([6362](src/index.html#L6362)), RPC `rpcFeedbackSubmit/List/Update/Delete`.

## Convenzioni

- **Tutto in una IIFE** → scope globale condiviso (Apps Script non ha `import`/`export`).
- Le funzioni con prefisso **`_`** sono helper interni.
- Le funzioni "pure" (costo, capienza, parser, collisioni…) sono **testate offline** dai
  `scripts/sim_*.js` senza Google (vedi [`scripts/README.md`](scripts/README.md)) — quando
  cambi una di quelle, **aggiorna la sim**.
