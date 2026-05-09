# Duplicare il gsheet — due procedure

Ti capita di voler creare una **nuova istanza** dell'applicativo (es. orario di un altro CdS, di un altro semestre archiviato, di un'altra unità amministrativa). Lo Spreadsheet di Google si duplica facilmente, ma porta con sé un Apps Script bound vuoto: il codice va re-installato.

Due strade alternative:

- **Procedura A — solo browser**: tutto via UI (Drive + Apps Script editor). Niente clasp, niente terminale. Lenta ma adatta a chi non vuole strumenti dev.
- **Procedura B — VS Code + clasp**: usi questo repository e gli script `npm run *` per portare il codice e gestire i deploy. Più veloce e ripetibile.

Scegli quella che preferisci. Le due strade portano allo stesso risultato funzionale.

---

## Procedura A — Solo browser

### A1. Duplica il gsheet

1. Apri il gsheet originale.
2. **File → Make a copy** (Crea una copia). Dai un nome al duplicato e scegli la cartella di destinazione.
3. Apri il duplicato. Verifica che ci siano i fogli S1LT/S1LM/S1AULE/PdS ecc. e i dati copiati.

### A2. Sostituisci il codice Apps Script

La copia eredita il codice Apps Script del gsheet originale **come copia statica**: cambiano scriptId e ID dei deployment, ma il codice di partenza è quello dell'originale al momento del copy.

Quindi il codice **è già lì**, ma non è collegato a nessun repository git. Le tue modifiche future al gsheet copia non si propagheranno all'originale e viceversa. Se vuoi mantenere allineamento, vedi Procedura B.

Per ora confermare che il codice è presente:

1. Sul gsheet copia: **Estensioni → Apps Script**.
2. Si apre l'editor del nuovo progetto Apps Script bound. Vedrai i file `.gs` e `.html` come nell'originale.

### A3. Crea il deployment Web app

1. Editor Apps Script → **Deploy → New deployment** (icona blu in alto a destra).
2. Click sull'**ingranaggio** ⚙ accanto a "Select type" → scegli **Web app**.
3. Compila il dialog:
   - **Description**: es. `BozzaOrario CdS XYZ`.
   - **Execute as**: `Me (tuo@unipi.it)`.
   - **Who has access**: scegli **Anyone with Google account** (se l'admin Workspace lo permette; altrimenti "Anyone within unipi.it").
4. Click **Deploy**. Al primo deploy ti chiederà di autorizzare gli scope OAuth (Spreadsheet, ecc.). Accetta.
5. Apparirà:
   - **Deployment ID** (es. `AKfycb...`)
   - **Web app URL** del tipo `https://script.google.com/a/macros/unipi.it/s/.../exec`.
6. **Copia entrambi**.

### A4. Pubblica i dati per la web app

Sul gsheet copia, ricarica la pagina. Comparirà il menu **🕒 Orario** (o come l'hai rinominato).

1. **🕒 Orario → 📅 Aggiorna Web Calendar**. Genera lo snapshot iniziale in `DocumentProperties` di QUESTO gsheet.
2. Apri l'URL `/exec` copiato → vedi il Web Calendar della copia.

### A5. Aggiornamenti futuri

Per modificare il codice: editor Apps Script → modifica i file `.gs` o `index.html` direttamente nell'editor → salva (`Ctrl+S`). Le funzioni dei menu sono attive immediatamente.

Per pubblicare modifiche al Web Calendar: **Deploy → Manage deployments → matita sul deployment → New version → Deploy**. Stesso URL, codice nuovo.

**Limiti procedura A:**
- Niente versionamento git.
- Niente sincronizzazione tra istanze (se aggiorni il codice nell'originale, la copia non lo riceve).
- Editor Apps Script web non ha tutti i comfort di VS Code (intellisense limitato, niente find-and-replace cross-project, ecc.).

Se vuoi superare questi limiti, vai con la Procedura B.

---

## Procedura B — VS Code + clasp

Approccio "infrastructure as code": il codice di tutti i gsheet che amministri vive nel repository git. Ogni gsheet ha un suo `config/local.json` che dice "io punto a quale Apps Script + quale deployment". Cambiare istanza = cambiare config.

### B1. Duplica il gsheet (stesso come A1)

Da Drive: **File → Make a copy**. Apri la copia.

### B2. Procurati gli ID necessari

Hai bisogno di **due ID** per partire:

- **`spreadsheetId`** (opzionale, vedi sotto)
- **`scriptId`** del progetto Apps Script bound alla copia.

Recuperarli dalla UI:

#### `spreadsheetId`

Lo trovi nell'URL del gsheet copia:

```
https://docs.google.com/spreadsheets/d/THIS-IS-THE-ID/edit
                                       ^^^^^^^^^^^^^^^^^^^^
```

Lo copi e lo metti da parte. Serve solo se la web app deve aprire lo Spreadsheet via `openById` (caso non bound — vedi `WebApp.gs > getBoundSpreadsheetId_`). In caso bound non è strettamente necessario perché lo script accede al gsheet via `getActiveSpreadsheet()`.

#### `scriptId`

1. Sul gsheet copia: **Estensioni → Apps Script**. Si apre l'editor.
2. In alto a sinistra: icona ingranaggio ⚙ (Project Settings).
3. Sezione **IDs** → campo **Script ID**. Es: `1Cqyiq1mKWko0cZiiBXSjePTwEXLx9XeQsnI5G2_P0nWsXOaCqRYBEID-`.
4. Click sull'icona "Copy" accanto.

### B3. Clona il repo e configura

```bash
# Su disco LOCALE (non Drive condiviso, vedi guida-tecnica-completa.md § 2.1)
cd C:\Users\<utente>\projects     # o dove tieni i progetti
git clone https://codeberg.org/Sterod76/Admin-GestioneOrario.git orario-copia
cd orario-copia

# Verifica clasp installato globalmente (npm install -g @google/clasp)
clasp --version    # → 3.3.0
clasp login        # se non gia' fatto: usa l'account Google con accesso al gsheet copia

# Setup ID specifici della copia
npm run setup
```

Il setup ti chiederà:
- **Apps Script ID**: incolla il `scriptId` del passo B2.
- **Web app deployment ID**: lascia vuoto (lo creerai al primo deploy).
- **Deployment description**: es. `BozzaOrario Copia XYZ`.
- **Web app URL**: lascia vuoto (lo recupererai dopo il primo deploy).
- **Spreadsheet ID**: incollalo se hai il valore di B2, altrimenti vuoto.

### B4. Pull (opzionale) o push immediato

Hai due scenari:

**Scenario B4a**: il progetto Apps Script bound alla copia ha già il codice (perché il duplicato del gsheet ha portato con sé la copia statica del codice). Vuoi PARTIRE da quel codice e poi aggiornarlo via repo:

```bash
clasp pull            # scarica codice esistente in src/ (sovrascrive locale!)
git status            # vedi le differenze rispetto al codice del repo
# se le differenze ti vanno bene, le committi; altrimenti scarti e fai push
```

**Scenario B4b** (consigliato): vuoi che la copia adotti **esattamente** il codice del repo — il codice del gsheet originale era stale o obsoleto e vuoi rifare partire dalla baseline:

```bash
npm run push          # pusha src/ del repo, sovrascrive il codice della copia
```

A questo punto il progetto Apps Script bound alla copia ha lo stesso codice del repository.

### B5. Primo deploy

```bash
npm run deploy
```

Lo script fa:
1. `clasp push -f` (no-op se hai appena pushato).
2. Vedendo `deploymentId` vuoto in `config/local.json`, esegue `clasp deploy` (senza `-i`) → CREA un nuovo deployment usando le policy di `src/appsscript.json` (sezione `webapp`: `USER_DEPLOYING` + `ANYONE`).
3. Estrae il nuovo `deploymentId` dalla output e lo **scrive automaticamente** in `config/local.json`.

L'output ti dirà:

```
Nuovo deploymentId salvato in config/local.json:
  AKfycb...
======================================================
 Deploy completato
 Deployment ID  : AKfycb...
 Versione       : @1
 Descrizione    : BozzaOrario Copia XYZ
 Web app URL    : (non impostato in config/local.json)
```

### B6. Verifica policy access (Workspace)

Su Workspace `unipi.it` la policy `ANYONE` da manifest a volte viene ignorata. Verifica e (se serve) correggi:

1. `npm run open` → apre l'editor Apps Script.
2. **Deploy → Manage deployments**.
3. Click sul deployment appena creato.
4. Verifica:
   - **Who has access**: deve essere `Anyone with Google account`. Se è "Only myself" → click matita → cambia → Update.
   - **Web app URL**: copialo.

### B7. Salva il Web app URL in config

```bash
npm run setup
```

Rilancialo e popola il campo `webappUrl` con l'URL copiato in B6. Da quel momento `npm run deploy` te lo stamperà a fine deploy.

In alternativa, edita direttamente `config/local.json`:

```json
{
  "scriptId": "...",
  "deploymentId": "AKfyc...",
  "deploymentDescription": "BozzaOrario Copia XYZ",
  "webappUrl": "https://script.google.com/a/macros/unipi.it/s/AKfyc.../exec",
  "spreadsheetId": "..."
}
```

### B8. Pubblica i dati

Sul gsheet copia, ricarica la pagina e lancia **🕒 Orario → 📅 Aggiorna Web Calendar**.

Apri l'URL `/exec` (anche in incognito loggato con un account Google qualunque, non per forza unipi.it se hai messo `ANYONE`): dovresti vedere il Web Calendar della copia.

### B9. Aggiornamenti futuri

```bash
# Modifichi src/Foo.gs
npm run push           # test su /dev (loggato con tuo account)
npm run deploy         # pubblica su /exec (URL invariato, codice nuovo)
git add . && git commit -m "..."
git push               # codice versionato su Codeberg
```

Se mantieni più gsheet (originale + copia): tieni cartelle separate, ognuna con il suo `config/local.json`. Le modifiche al codice (commit) vivono nel repo unico; per applicarle a un'istanza specifica fai `git pull` nella cartella di quell'istanza, poi `npm run deploy`.

---

## Quale procedura scegliere?

| Scenario | Procedura suggerita |
|---|---|
| Una tantum, non collaborativa, vuoi cose semplici | A |
| Più gsheet (più CdS, più semestri archivio, più sezioni) | B |
| Vuoi versionamento git delle modifiche | B |
| Vuoi propagare un fix a tutte le copie con `git pull` | B |
| Non hai Node.js/clasp/VS Code installati e non vuoi installarli | A |
| Lavori in team con altri sviluppatori | B |

---

## Risoluzione problemi comuni

**"Le funzioni dei menu non funzionano sulla copia"** — l'autorizzazione OAuth è per-progetto. Apri uno qualsiasi degli eseguibili del menu sulla copia: ti chiederà l'autorizzazione, accetta. Da quel punto in poi funzionano.

**"Il primo `clasp push` dà 'Conflicting files found'"** — il pull che hai fatto in B4a ha portato file `.js` accanto ai `.gs`. Cancella i `.js` doppi (`rm src/*.js`) e ripeti il push.

**"L'URL `/exec` dà 403 anche dopo aver settato `ANYONE`"** — la policy Workspace `unipi.it` blocca pubblicazioni esterne. Prova con `ANYONE_ANONYMOUS` (anche se più restrittiva nel manifest, a volte la UI la accetta diversamente). Se non funziona neanche così, l'admin del dominio ha disabilitato i Web App pubblici — chiedi un'eccezione o usa `DOMAIN`.

**"Vorrei propagare a una copia un fix fatto sull'originale"** — solo con la procedura B. Nella cartella della copia: `git pull origin main`, poi `npm run push` e `npm run deploy`. Le modifiche del fix saranno applicate.
