# GestioneOrario 

Questo è un repository contenente il codice per fare funzionare l'applicativo di composizione e gestione dell'orario del CdS in Fisica del Dipartimento di Fisica. Componenti:

* un gsheet in cui possono essere inserite manualmente le singole entries di un dato semestre
* una serie di codici AppScript che possono generare l'occupazione delle aulee e generare una webapp che permette di consultare la bozza del calendario
* una webapp di consultazione

## Caratteristiche

- Normalizzazione delle celle calendario (formato orari, capitalizzazione titoli) con un clic.
- Generazione automatica del foglio aule (`S1AULE` o `S2AULE`) aggregando tutti i fogli sorgente del semestre.
- Rilevamento conflitti (corso vs corso, corso vs indisponibilità manuale).
- Gestione mutuazioni e periodi diversi nello stesso slot.
- Web Calendar pubblico con filtri (PdS, foglio, gruppo gerarchico, anno, aule/labs).
- Assegnazione automatica del vincolo (OBB/FOR/OPZ) dai Piani di Studio.

## Documentazione

- 👉 [`docs/USO-RAPIDO.md`](docs/USO-RAPIDO.md) — **scheda operativa**: come fare commit, deploy, aggiornare i target ecc. **da soli in VS Code** (task pronti + i 3 flussi tipici). Parti da qui per l'uso quotidiano.
- [`docs/guida-tecnica-completa.md`](docs/guida-tecnica-completa.md) — guida tecnica completa: architettura, struttura dello Spreadsheet, file Apps Script uno per uno, mutuazioni, vincoli, conflict detection.
- [`docs/deploy-webapp.md`](docs/deploy-webapp.md) — deploy della web app: HEAD vs versioned deployments, URL `/exec` e `/dev`, cosa fa `clasp deploy`, ruolo di `index.html`, come pubblicare più pagine HTML.
- [`docs/appsscript-manifest.md`](docs/appsscript-manifest.md) — riferimento ai campi di `src/appsscript.json` (timezone, runtime, `webapp.executeAs`, `webapp.access`, ecc.) con tutti i valori possibili e esempi.
- [`docs/duplicare-gsheet.md`](docs/duplicare-gsheet.md) — duplicare il gsheet per un nuovo CdS / semestre / istanza: due procedure (solo browser oppure VS Code+clasp), passo-passo.
- [`docs/Orario CdS - Documentazione tecnica.docx`](docs/Orario%20CdS%20-%20Documentazione%20tecnica.docx) — versione storica breve (panoramica iniziale del progetto).

## Prerequisiti

- **Node.js >= 18** ([download](https://nodejs.org/)). Verifica con `node --version`.
- **clasp** installato globalmente:
  ```
  npm install -g @google/clasp
  ```
  Verifica con `clasp --version`.
- Account Google con accesso allo Spreadsheet bersaglio.

> ⚠️ **Se la cartella del progetto è su Google Drive condiviso** (es. `H:\Drive condivisi\…`): installa clasp **solo globalmente** come sopra. Non eseguire `npm install` locale dentro la cartella Drive — fallisce con errori `tar TAR_ENTRY_ERROR / TAR_BAD_ARCHIVE` perché Drive non regge il sync di migliaia di file simultanei. Vedi [`docs/guida-tecnica-completa.md`](docs/guida-tecnica-completa.md) § 2.1 per dettagli e workaround.

## Quick start su un'installazione esistente

```bash
git clone https://codeberg.org/<utente>/<repo>.git
cd <repo>
clasp login        # una tantum: autorizza l'account Google (usa quello del Sheet)
npm run setup      # interattivo: chiede gli ID
npm run pull       # opzionale: scarica codice attuale di quel progetto
npm run push       # invia src/ ad Apps Script
npm run deploy     # aggiorna l'URL /exec del web app (o lo crea al primo run)
```

## Primo deploy su un nuovo gsheet

Se hai duplicato il gsheet o creato un nuovo progetto Apps Script, **il primo deployment va creato manualmente dall'editor** (UI più affidabile delle policy via clasp). Sintesi:

1. Sul nuovo Sheet → **Estensioni → Apps Script**.
2. Editor Apps Script → **Deploy → New deployment** → Type: **Web app** → Who has access: **Anyone with Google account** → Deploy.
3. Copia **Deployment ID** + **Web app URL**.
4. Anche **Project Settings → IDs → Script ID**, copialo.
5. Da terminale nella cartella locale del repo: `npm run setup` → incolla `scriptId`, `deploymentId`, `webappUrl`.
6. Da ora in poi `npm run deploy` aggiorna il deployment (stesso URL).

Procedura completa passo-passo: [`docs/duplicare-gsheet.md`](docs/duplicare-gsheet.md).

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

## Aggiornare i target (più installazioni)

Questo progetto pubblica su **più installazioni** in un solo `npm run deploy`. Le
installazioni vivono nell'array **`targets[]`** di `config/local.json` (gitignorato);
`deploy.js` itera su ciascuna (push del codice sul suo `scriptId` + redeploy sul suo
`deploymentId`). Template completo: [`config/local.multitarget.example.json`](config/local.multitarget.example.json).

Per aggiungere/modificare un'installazione **edita `config/local.json` a mano** (task
VS Code **🎯 Apri config target**) aggiungendo un blocco all'array:

```json
{
  "label": "Nome leggibile",
  "scriptId": "ID Apps Script",
  "spreadsheetId": "ID Google Sheet",
  "deploymentId": "ID deployment web app (/exec)",
  "deploymentDescription": "BozzaOrario",
  "webappUrl": "https://script.google.com/.../exec"
}
```

> ⚠ **`npm run setup` gestisce solo il formato a target singolo**: se il file è già
> multi-target, si **rifiuta** di sovrascriverlo (per non cancellare le installazioni).
> Usalo solo per creare da zero una nuova istanza separata. Procedura passo-passo per
> aggiungere un target / istanza: [`docs/USO-RAPIDO.md`](docs/USO-RAPIDO.md) §3.

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
│   └── deploy.js              push + deploy
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
    └── guida-tecnica-completa.md
```

## Workflow operativo (utente del foglio)

1. Edita un foglio sorgente (`S1LT`, `S1LM`, `S2LT`, …) con corsi, orari, aule.
2. Menu **🕒 Orario → ✨ Normalizza celle calendario** — uniforma orari/aule e applica title-case ai nomi corso.
3. Menu **🎯 Assegna vincolo da PdS** — popola la colonna Vincolo di tutti i fogli LM dai dati del foglio `PdS`.
4. Menu **🏛 Genera tabella aule** — costruisce `S1AULE` / `S2AULE`. Se rileva conflitti dipinge le celle sorgenti di rosso e blocca.
5. Menu **📅 Vai al Web Calendar** — pubblica lo snapshot per il web. Toast di conferma con conteggio.
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

**Web app mostra "Snapshot non ancora pubblicato"** → menu `📅 Vai al Web Calendar` per generare lo snapshot.

**Modifiche al codice non visibili sull'URL `/exec`** → `npm run deploy` (le modifiche pushate vivono solo su HEAD finché non riallinei il deployment).

**`clasp deploy` errore "Read-only deployments may not be deleted"** → il deployment `@HEAD` non è gestibile da clasp; lavora solo su quelli con ID numerato.

## Licenza

Da definire (placeholder MIT consigliato per condivisione interna).
