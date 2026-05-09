# Orario CdS

Apps Script per la gestione di orario didattico, tabella aule e Web Calendar pubblico, con strumenti pensati per essere riusati come scaffolding per altri Google Sheet ad uso amministrativo.

Documentazione tecnica completa: [`docs/Orario CdS - Guida tecnica completa.docx`](docs/Orario%20CdS%20-%20Guida%20tecnica%20completa.docx).

## Caratteristiche

- Normalizzazione delle celle calendario (formato orari, capitalizzazione titoli) con un clic.
- Generazione automatica del foglio aule (`S1AULE` o `S2AULE`) aggregando tutti i fogli sorgente del semestre.
- Rilevamento conflitti (corso vs corso, corso vs indisponibilità manuale).
- Gestione mutuazioni e periodi diversi nello stesso slot.
- Web Calendar pubblico con filtri (PdS, foglio, gruppo gerarchico, anno, aule/labs).
- Assegnazione automatica del vincolo (OBB/FOR/OPZ) dai Piani di Studio.

## Prerequisiti

- **Node.js >= 18** ([download](https://nodejs.org/)).
- **clasp** (CLI ufficiale di Google):
  ```bash
  npm install -g @google/clasp
  ```
- Login una tantum:
  ```bash
  clasp login
  ```
- Account Google con accesso allo Spreadsheet bersaglio.
- (Opzionale, per rigenerare i .docx in `docs/`):
  ```bash
  npm install -g docx
  ```

## Quick start su un'installazione esistente

```bash
git clone https://codeberg.org/<utente>/<repo>.git
cd <repo>
npm run setup    # interattivo: chiede gli ID
npm run pull     # opzionale: scarica codice attuale di quel progetto
npm run push     # invia src/ ad Apps Script
npm run deploy   # aggiorna l'URL /exec del web app
```

Il setup chiede:
- **Apps Script ID** (`scriptId`) — visibile da Apps Script editor → Project settings.
- **Web app deployment ID** — ottenuto dopo aver creato un primo deployment dall'editor (**Deploy → New deployment → Web app**) o lasciato vuoto e popolato in seguito.
- **Deployment description** — etichetta libera del deploy (default `BozzaOrario`).
- **Spreadsheet ID** — l'ID dello Sheet bersaglio (da URL: `/spreadsheets/d/<ID>/edit`). Necessario solo se la web app deve essere standalone (no container-bound).

I valori vengono scritti in `config/local.json` e `.clasp.json` (entrambi gitignorati).

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run setup` | Setup interattivo, scrive `.clasp.json` + `config/local.json`. Idempotente. |
| `npm run pull` | `clasp pull` — scarica i file remoti in `src/`. |
| `npm run push` | `clasp push -f` — invia `src/` al progetto Apps Script. |
| `npm run deploy` | `push` + aggiorna il deployment configurato. URL `/exec` invariato. |
| `npm run deployments` | `clasp list-deployments` — elenca i deployment del progetto. |
| `npm run status` | `clasp status` — mostra cosa verrebbe pushato. |
| `npm run open` | Apre l'editor Apps Script nel browser. |
| `npm run logs` | Stampa gli ultimi log d'esecuzione. |
| `npm run build:docs` | Rigenera i file in `docs/` (richiede modulo `docx` globale). |

## Struttura del repository

```
.
├── README.md                  questo file
├── .gitignore                 esclude .clasp.json, config/local.json, ID.txt, ...
├── .clasp.json.example        template; viene copiato in .clasp.json da setup
├── package.json               npm scripts
├── config/
│   ├── local.example.json     template; viene copiato in local.json da setup
│   └── (local.json)           gitignored, contiene gli ID della tua installazione
├── scripts/
│   ├── setup.js               setup interattivo
│   ├── deploy.js              push + deploy
│   └── build-docs.js          rigenera docx
├── src/
│   ├── appsscript.json        manifest Apps Script
│   ├── Config.gs              costanti + helper
│   ├── Menu.gs                menu Sheet "🕒 Orario"
│   ├── FixCalendar.gs         normalizzazione celle calendario + title-case
│   ├── TabellaAule.gs         generazione S1AULE / S2AULE
│   ├── TableFormat.gs         save/restore formato colonne
│   ├── Mutuazione.gs          mappa mutuanti → padre
│   ├── Vincoli.gs             assegna OBB/FOR/OPZ da PdS
│   ├── WebApp.gs              web app, snapshot, doGet
│   └── index.html             UI web app
└── docs/
    ├── Orario CdS - Documentazione tecnica.docx
    └── Orario CdS - Guida tecnica completa.docx
```

## Workflow operativo (utente del foglio)

1. Edita un foglio sorgente (`S1LT`, `S1LM`, `S2LT`, …) con corsi, orari, aule.
2. Menu **🕒 Orario → ✨ Normalizza celle calendario** — uniforma orari/aule e applica title-case ai nomi corso.
3. Menu **🎯 Assegna vincolo da PdS** — popola la colonna Vincolo di tutti i fogli LM dai dati del foglio `PdS`.
4. Menu **🏛 Genera tabella aule** — costruisce `S1AULE` / `S2AULE`. Se rileva conflitti dipinge le celle sorgenti di rosso e blocca.
5. Menu **📅 Aggiorna Web Calendar** — pubblica lo snapshot per il web. Toast di conferma con conteggio.
6. (Solo dopo modifiche al codice) `npm run deploy` — aggiorna l'URL `/exec` con il codice nuovo.

## VS Code (consigliato per sviluppo)

Apri la cartella in VS Code. Trovi già configurato:

- `.vscode/tasks.json` — i comandi npm sono accessibili da **Ctrl+Shift+P → "Run Task"** o da Terminal → Run Task. Il task **"Push (clasp)"** è impostato come build di default → **Ctrl+Shift+B** lo lancia.
- `.vscode/settings.json` — i file `.gs` sono trattati come JavaScript (syntax highlighting, autocomplete).
- `.vscode/extensions.json` — VS Code suggerirà ESLint, Prettier, GitLens, Google Cloud Tools.
- `.vscode/keybindings.example.json` — shortcut consigliati. Copia il contenuto in **File → Preferences → Keyboard Shortcuts (JSON)** per avere `Ctrl+Alt+P` (push) e `Ctrl+Alt+D` (deploy).

Workflow tipico in VS Code:

1. Modifica un file in `src/`.
2. **Ctrl+Shift+B** (o `Ctrl+Alt+P` se hai copiato le keybindings) → push immediato.
3. Ricarica lo Spreadsheet → testa il menu.
4. Quando vuoi pubblicare al pubblico: Run Task → **Deploy (push + redeploy webapp)** (o `Ctrl+Alt+D`).
5. Commit & push verso Codeberg con il pannello Source Control di VS Code (Ctrl+Shift+G).

Niente `.bat` o `.ps1`: tutto passa per `npm run`, che funziona uguale su Windows/Mac/Linux.

## Workflow di sviluppo (collaboratore via Codeberg)

```bash
git clone <repo>
cd <repo>
npm run setup
git checkout -b mia-feature
# modifica file in src/
npm run push                      # test sul progetto Apps Script
# ricarica lo Spreadsheet → testa il menu
npm run deploy                    # quando vuoi aggiornare il pubblico
git add . && git commit -m "..."
git push origin mia-feature
# apri pull request su Codeberg
```

## Riadattare per un altro Google Sheet

Schema replicabile per altri progetti amministrativi:

1. Crea un nuovo Google Sheet di destinazione.
2. Apri **Estensioni → Apps Script** sul nuovo Sheet — Apps Script crea un progetto bound vuoto.
3. Copia il `scriptId` dal nuovo progetto (Project settings).
4. Clona questo repo (o un fork) in una nuova cartella.
5. `npm run setup` — incolla il nuovo `scriptId`. Lascia vuoti `deploymentId` per ora.
6. Adatta i file `src/` al dominio (rinomina costanti, cambia regex, ecc.).
7. `npm run push` — il codice arriva sul nuovo progetto Apps Script.
8. Ricarica il nuovo Sheet → comparirà il menu.
9. (Se serve web app) Apps Script editor → **Deploy → New deployment → Web app**, copia il deployment ID, `npm run setup` di nuovo per memorizzarlo, poi `npm run deploy` per i prossimi aggiornamenti.

## Aspetti chiave del codice

- **Multi-semestre automatico**: lo script rileva se sta operando in modalità S1 o S2 dal foglio `S1AULE` / `S2AULE` esistente. Vedi `detectAuleConfig()` in `src/Config.gs`.
- **Persistenza**: tutto lo stato vive in `DocumentProperties` dello Sheet. Snapshot del web calendar split in chunk (`orarioSnap:meta` + `orarioSnap:N`).
- **Conflict detection**: corso vs corso (stessa aula+slot+periodo) e corso vs indisponibilità (`NON DISPONIBILE` mergiato a mano). Se trova, evidenzia rosso e blocca.
- **Mutuazioni**: la colonna `Codice mutuato` (col D di ogni foglio sorgente) collega un corso al "padre". Le righe mutuate non occupano slot e il padre vede i suoi figli nell'hover.
- **Periodi**: la colonna `Periodo` (col R) consente a due corsi di coesistere nella stessa aula+slot se i periodi differiscono.
- **Web app**: `index.html` è un template HtmlService con bootstrap JSON iniettato lato server. Filtri, layout overlap-aware, lane recalculation a ogni filtro.

## Troubleshooting

**`clasp push` dice "Could not read API credentials"** → esegui `clasp login`.

**Web app mostra "Sorry, unable to open the file"** → l'utente è loggato con un account diverso da quello del deploy. Apri in incognito.

**Web app mostra "Snapshot non ancora pubblicato"** → menu `📅 Aggiorna Web Calendar` per generare lo snapshot.

**Modifiche al codice non visibili sull'URL `/exec`** → `npm run deploy` (le modifiche pushate vivono solo su HEAD finché non riallinei il deployment).

**`clasp deploy` errore "Read-only deployments may not be deleted"** → il deployment `@HEAD` non è gestibile da clasp; lavora solo su quelli con ID numerato.

## Licenza

Da definire (placeholder MIT consigliato per condivisione interna).
