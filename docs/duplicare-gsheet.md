# Duplicare il gsheet — due procedure

Crei una nuova istanza dell'applicativo (es. orario di un altro CdS, di un altro semestre archiviato, di un'altra unità amministrativa). Lo Spreadsheet Google si duplica facilmente, ma porta con sé un nuovo Apps Script bound vuoto: il codice e la configurazione vanno re-installati.

Due strade alternative:

- **Procedura A — solo browser**: tutto via UI (Drive + Apps Script editor). Niente clasp, niente terminale.
- **Procedura B — VS Code + clasp**: usi questo repository per portare il codice e il file `config/local.json` per memorizzare gli ID. Richiede un primo deploy manuale dall'editor (per scegliere policy di accesso), poi tutti gli aggiornamenti successivi sono `npm run deploy`.

Le due procedure portano allo stesso risultato funzionale.

---

## Procedura A — Solo browser

Adatta a chi non vuole installare strumenti dev. Però perde versionamento git e sincronizzazione fra istanze.

### A1. Duplica il gsheet

1. Apri il gsheet originale in Drive.
2. **File → Make a copy**. Nome e cartella di destinazione.
3. Apri il duplicato. Verifica che ci siano i fogli S1LT/S1LM/S1AULE/PdS e i dati copiati.

### A2. Verifica codice Apps Script

La copia eredita il codice Apps Script come copia statica:

1. Sul gsheet copia: **Estensioni → Apps Script**.
2. Si apre l'editor del nuovo progetto Apps Script bound. Vedrai i file `.gs` e `.html`.
3. Salva (`Ctrl+S`) per sicurezza.

### A3. Crea il deployment Web app

1. Editor Apps Script → **Deploy → New deployment** (in alto a destra).
2. Click sull'**ingranaggio** ⚙ accanto a "Select type" → scegli **Web app**.
3. Nel dialog:
   - **Description**: es. `BozzaOrario CdS XYZ`.
   - **Execute as**: `Me (tuo@unipi.it)`.
   - **Who has access**: `Anyone with Google account` (consigliato).
4. **Deploy**. Al primo deploy ti chiederà di autorizzare gli scope OAuth. Accetta.
5. Apparirà un dialog con due valori — **copiali da qualche parte**:
   - **Deployment ID** (es. `AKfycb...`)
   - **Web app URL** (`https://script.google.com/a/macros/unipi.it/s/.../exec`)

### A4. Pubblica i dati per la web app

1. Sul gsheet copia, ricarica la pagina del browser. Comparirà il menu **🕒 Orario**.
2. **🕒 Orario → 📅 Aggiorna Web Calendar**. Genera lo snapshot iniziale.
3. Apri l'URL `/exec` copiato → vedi il Web Calendar della copia.

### A5. Aggiornamenti futuri

Per modificare il codice: editor Apps Script → modifica file → salva. Le funzioni dei menu sono attive subito.

Per pubblicare modifiche al Web Calendar: **Deploy → Manage deployments → matita sul deployment → New version → Deploy**. Stesso URL, codice nuovo.

---

## Procedura B — VS Code + clasp

Approccio "infrastructure as code": il codice di tutti i gsheet che amministri vive nel repository git. Ogni istanza ha la sua cartella locale con un `config/local.json` che dice "io punto a questo Apps Script + a questo deployment". Gestisci tutto via comandi `npm run *`.

### Cosa farai

1. Clonare il repo in una nuova cartella locale.
2. Duplicare il gsheet dalla UI.
3. Creare il **primo deployment** dall'editor Apps Script (la UI permette di scegliere "Anyone with Google account" che da clasp non sempre funziona).
4. Recuperare 4 ID/valori e farli memorizzare a `npm run setup` in `config/local.json`.
5. Fare il primo `npm run push` (per allineare il codice del nuovo Apps Script al repo) e poi `npm run deploy` (per le modifiche successive).

### B1. Clona il repo (su disco locale, NON Drive)

> ⚠️ Non clonare in `H:\Drive condivisi\…`. `npm` su Drive shared è inaffidabile (vedi `guida-tecnica-completa.md` § 2.1). Usa una cartella locale tipo `C:\Users\<utente>\projects\…`.

```bash
cd C:\Users\<utente>\projects
git clone https://codeberg.org/Sterod76/Admin-GestioneOrario.git orario-XYZ
cd orario-XYZ

# Verifica clasp installato globalmente
clasp --version    # → 3.3.0+
clasp login        # se non gia' fatto, autorizza con l'account Google del nuovo gsheet
```

### B2. Duplica il gsheet (dalla UI Drive)

1. Drive → apri il gsheet originale.
2. **File → Make a copy**.
3. Nome del duplicato e cartella destinazione.

### B3. Crea il deployment Web app dall'editor

Stesso passo di A3 della Procedura A:

1. Sul gsheet duplicato: **Estensioni → Apps Script**.
2. Editor Apps Script → **Deploy → New deployment** → ingranaggio → **Web app**.
3. Description: es. `BozzaOrario Copia XYZ`.
4. Execute as: `Me`.
5. Who has access: `Anyone with Google account`.
6. **Deploy** → autorizza scope OAuth → ottieni **Deployment ID** + **Web app URL**.

### B4. Recupera gli ID che ti servono

Per lavorare via VS Code/clasp ti servono in totale **4 valori**:

| Cosa | Dove lo prendi |
|---|---|
| **Apps Script ID** (`scriptId`) | Editor Apps Script → ingranaggio ⚙ "Project Settings" (in alto a sinistra) → sezione "IDs" → campo **Script ID**. Es. `1Cqyiq1mKWko0…`. |
| **Spreadsheet ID** (opzionale) | URL del gsheet: `https://docs.google.com/spreadsheets/d/<ID>/edit`. Tutto fra `/d/` e `/edit`. Serve solo se la web app usa `openById` (vedi `WebApp.gs`). |
| **Deployment ID** | Già ottenuto in B3. Anche recuperabile dopo da editor → Deploy → Manage deployments → click sul deployment → "Deployment ID". |
| **Web app URL** | Già ottenuto in B3. Anche recuperabile da Manage deployments → click → "Web app URL". |

### B5. `npm run setup`: incolla i 4 valori

Questo è **il modo standard** per registrare gli ID nel progetto locale. Da terminale, dentro la cartella del repo clonato:

```bash
npm run setup
```

Lo script ti farà 5 prompt:

```
Apps Script ID:                 ← incolla scriptId
Web app deployment ID:          ← incolla deploymentId
Deployment description:         ← lascia "BozzaOrario" o personalizza
Web app URL /exec:              ← incolla webappUrl (l'URL completo)
Spreadsheet ID:                 ← opzionale, incolla spreadsheetId
```

#### Dove finiscono questi dati

Lo script `scripts/setup.js` scrive **due file gitignored** (cioè locali alla tua copia, non vanno su Codeberg):

**`.clasp.json`** — letto da `clasp` per sapere su quale progetto Apps Script pushare:
```json
{
  "scriptId": "1Cqyiq1mKWko0…",
  "rootDir": "src"
}
```

**`config/local.json`** — letto da `scripts/deploy.js` per sapere quale deployment aggiornare:
```json
{
  "scriptId": "1Cqyiq1mKWko0…",
  "deploymentId": "AKfycb…",
  "deploymentDescription": "BozzaOrario Copia XYZ",
  "webappUrl": "https://script.google.com/a/macros/unipi.it/s/AKfycb…/exec",
  "spreadsheetId": "1asd…"
}
```

Entrambi sono in `.gitignore` quindi non vengono versionati né condivisi su Codeberg. Ogni installazione ha i suoi valori, e il template `.clasp.json.example` + `config/local.example.json` sono lì come reference.

### B6. Allinea il codice della copia con il repo

Il gsheet duplicato ha una copia statica del codice Apps Script al momento della duplicazione. Per essere sicuro di partire dal codice **del repo aggiornato** (che è la "verità"):

```bash
npm run push
```

Questo sovrascrive il codice del nuovo Apps Script con quello in `src/` del repo. Output:

```
> clasp push -f
Pushed 10 files at HH:MM:SS.
└─ src\Config.gs
└─ src\FixCalendar.gs
…
```

### B7. (Opzionale) Verifica policy nel manage deployments

Su Workspace `unipi.it` la policy può essere stata interpretata diversamente da quanto richiesto. Verifica:

```bash
npm run open
```

Si apre l'editor Apps Script. Vai su **Deploy → Manage deployments** → click sul deployment → controlla:
- **Who has access**: dev'essere `Anyone with Google account`. Se è "Only myself" → matita → cambia → Update.
- **Web app URL**: confronta con quello in `config/local.json`. Se diverso, ri-incollalo via `npm run setup` o a mano.

### B8. Pubblica i dati per la web app

Sul gsheet duplicato (browser), ricarica la pagina, lancia menu **🕒 Orario → 📅 Aggiorna Web Calendar**.

Apri l'URL `/exec`: dovresti vedere il Web Calendar della copia.

### B9. Aggiornamenti futuri (workflow consolidato)

```bash
# Modifichi src/Foo.gs
npm run push        # test su /dev (URL legato a HEAD, solo proprietario)
# verifichi sul gsheet che le funzioni del menu vanno

npm run deploy      # pubblica su /exec (URL pubblico, codice nuovo, stesso URL)
# stampa: "Deployment ID, Versione @N, Descrizione, Web app URL"

git add . && git commit -m "..."
git push            # versioni il codice su Codeberg (da terminale tuo)
```

Se gestisci più gsheet (originale + copie + altri CdS): **una cartella locale per ognuno**, con il suo `config/local.json`. Le modifiche al codice sono nel repo unico; per propagare a un'istanza specifica:

```bash
cd <cartella istanza>
git pull origin main
npm run deploy
```

---

## Riepilogo dei comandi e file

### Comandi `npm run *`

| Comando | Cosa fa | Quando usarlo |
|---|---|---|
| `npm run setup` | Prompt interattivo, scrive `.clasp.json` + `config/local.json` | Una volta per ogni nuova istanza, o per cambiare ID |
| `npm run push` | `clasp push -f` — invia `src/` al progetto Apps Script | Dopo ogni modifica di `.gs` o `.html` per testare |
| `npm run deploy` | `npm run push` + aggiorna versione del deployment esistente | Quando vuoi pubblicare le modifiche su URL pubblico |
| `npm run pull` | `clasp pull` — scarica codice remoto in `src/` | Per recuperare codice esistente dal progetto remoto (raro) |
| `npm run open` | Apre editor Apps Script nel browser | Per modificare policy o vedere Manage deployments |
| `npm run deployments` | Elenca i deployment del progetto | Diagnostica |
| `npm run logs` | Stampa gli ultimi log d'esecuzione | Debug errori runtime |
| `npm run status` | Mostra cosa verrebbe pushato | Diagnostica |

### File di configurazione

| File | Versionato su git? | Contenuto | Letto da |
|---|---|---|---|
| `.clasp.json` | **No (gitignored)** | `scriptId`, `rootDir` | `clasp` (push, pull, deploy) |
| `.clasp.json.example` | Sì | template per `.clasp.json` | umani |
| `config/local.json` | **No (gitignored)** | `scriptId`, `deploymentId`, `deploymentDescription`, `webappUrl`, `spreadsheetId` | `scripts/deploy.js`, `scripts/setup.js` |
| `config/local.example.json` | Sì | template per `config/local.json` | umani |
| `src/appsscript.json` | Sì | manifest Apps Script (timezone, runtime) | Apps Script |

### Cosa serve per ogni istanza

- 1 cartella locale con `git clone` del repo.
- 1 `.clasp.json` con il `scriptId` di quella istanza.
- 1 `config/local.json` con `deploymentId` + `webappUrl` di quella istanza.
- Niente altro.

Se cambi istanza (es. lavorare su un'altra copia): **cambi cartella**. Niente "switch" complicati nel singolo terminale — un terminale aperto in `orario-LM-2026` lavora su LM-2026, un altro in `orario-LT-2026` lavora su LT-2026.

---

## Quale procedura scegliere?

| Scenario | Procedura suggerita |
|---|---|
| Una tantum, non collaborativa, vuoi cose semplici | A |
| Più gsheet (più CdS, più semestri archivio, più sezioni) | B |
| Vuoi versionamento git delle modifiche | B |
| Vuoi propagare un fix a tutte le copie con `git pull` + `npm run deploy` | B |
| Non hai Node.js/clasp/VS Code installati e non vuoi installarli | A |
| Lavori in team con altri sviluppatori | B |

---

## Risoluzione problemi comuni

**"Le funzioni dei menu non funzionano sulla copia"** — l'autorizzazione OAuth è per-progetto. Apri uno qualsiasi degli eseguibili del menu sulla copia: ti chiederà l'autorizzazione, accetta. Da quel punto in poi funzionano.

**"`clasp push` dice 'Conflicting files found'"** — `clasp pull` ha portato file `.js` accanto ai `.gs`. Cancella i `.js` doppi (`rm src/*.js` da bash, o `Remove-Item src\*.js` da PowerShell) e ripeti il push.

**"L'URL `/exec` dà 403"** — la policy del deployment è troppo restrittiva. Vai su Apps Script editor → Deploy → Manage deployments → matita → cambia "Who has access" a `Anyone with Google account` → Update.

**"`npm run deploy` dice 'Requested entity was not found'"** — il `deploymentId` in `config/local.json` non corrisponde a un deployment esistente. Cause: hai cancellato il deployment dalla UI, o stai usando un `config/local.json` di un'altra istanza. Ricrea il deployment dall'editor → `npm run setup` con il nuovo deploymentId.

**"Vorrei propagare a una copia un fix fatto sull'originale"** — solo con la procedura B. Nella cartella della copia: `git pull origin main`, poi `npm run deploy`. Il fix sarà applicato.

**"Più collaboratori sullo stesso gsheet?"** — ognuno clona il repo, fa `clasp login` con il proprio account, condivide gli stessi `scriptId` + `deploymentId` (uno copia/incolla i valori dell'altro). Ognuno ha il proprio `config/local.json` (uguale ai colleghi tranne magari `spreadsheetId` se differisce). Modifiche al codice via PR su Codeberg.
