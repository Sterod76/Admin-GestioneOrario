# Deploy della Web App — guida operativa

Cosa significa "deploy" su Apps Script, come funzionano `/exec` e `/dev`, gli script di supporto del repo, il ruolo di `index.html`, e come pubblicare più pagine HTML diverse.

---

## 1. Cos'è una Web App in Apps Script

Una **web app** è un endpoint HTTP servito da Google a partire dal tuo progetto Apps Script. Quando un browser fa una `GET` all'URL della web app, Google esegue server-side la funzione speciale `doGet(e)` del progetto e restituisce ciò che ritorna (HTML o JSON).

Niente server tuo, niente hosting: tutto gira sui server di Google sotto un dominio del tipo `script.google.com/macros/...` con autenticazione/sandbox automatici. Vincoli rilevanti:

- Solo `doGet(e)` (per richieste GET) e `doPost(e)` (per POST). Niente sub-routing nativo via path.
- Una web app per progetto Apps Script. Stesso URL → stesso `doGet`.
- Il "routing" tra più pagine si fa **lato `doGet`** leggendo `e.parameter` (vedi §6).

Il file HTML servito non sta mai "su disco" — viene assemblato a ogni richiesta dal codice Apps Script via `HtmlService`.

---

## 2. HEAD vs Versioned Deployments

Apps Script tiene due piani separati per ogni progetto:

### HEAD = il codice "live"

È quello che hai pushato come ultima cosa con `clasp push`. Lo vedi nell'editor (script.google.com). Si aggiorna ogni volta che fai push. Le funzioni chiamate **dal menu dello Spreadsheet** (es. `tabellaAule`) e **dal trigger onOpen** usano sempre HEAD.

### Versioned Deployment = uno snapshot pubblicato

È un fotogramma di HEAD a un certo istante, marcato con un numero di versione (es. `@25`). Apps Script sceglie di servire questo snapshot — non HEAD — sull'URL pubblico. Anche se modifichi HEAD dopo, il deploy continua a servire la sua versione finché non la aggiorni.

Ogni deployment ha:

- Un **deployment ID** (`AKfycbx…`) — fisso, identifica quel "punto di ingresso" web.
- Un **version number** (`@25`) — che codice serve.
- Una **description** (es. `BozzaOrario`) — etichetta libera.
- Configurazioni: chi può accedere (`Anyone` / `Anyone with Google account` / `Only myself`) e con quale identità eseguire (`Me` o `User accessing`).

L'URL pubblico è del tipo: `https://script.google.com/macros/s/<deploymentId>/exec`.

**Cambiare versione di un deploy esistente** = aggiornare il "version number" senza cambiare deployment ID → stesso URL, codice nuovo.

**Creare un nuovo deployment** = un altro deployment ID, un altro URL → utile se vuoi pubblicare versioni parallele (es. test vs prod) servite da URL diversi.

---

## 3. Le due URL: `/exec` e `/dev`

Ogni progetto Apps Script ha **due** URL web:

| URL | Cosa serve | Chi può accedere |
|---|---|---|
| `…/exec` | Il deployment versioned attivo | Chiunque, in base alla policy "Who has access" del deploy (di solito `Anyone`) |
| `…/dev` | Sempre HEAD (il codice appena pushato) | Solo il proprietario dello script |

Implicazioni:

- Mentre sviluppi puoi testare modifiche su `/dev` senza pubblicarle. Push → ricarica `/dev` → vedi il nuovo codice. Niente deploy intermedio.
- `/exec` non riflette le tue modifiche finché non fai un `clasp deploy`. Gli utenti continuano a vedere lo snapshot precedente. È per questo che il flusso normale separa "test" (push) da "pubblicazione" (deploy).

---

## 4. Cos'è veramente un `clasp deploy`

Concettualmente:

```
clasp deploy -i <deploymentId> -d "<descr>"
```

fa due cose:

1. Chiede ad Apps Script di **creare una nuova versione** dal codice corrente di HEAD. Genera un version number nuovo (es. da `@25` a `@26`) e un blob immutabile di codice.
2. **Aggiorna il deployment** (identificato da `deploymentId`) per puntare alla nuova versione.

Risultato:
- L'URL `/exec` di quel deployment ora serve il codice nuovo.
- Le versioni precedenti restano (Apps Script tiene uno storico) ma non sono più servite.
- Altri deployment dello stesso script (se esistono) non sono toccati.

Se lanci `clasp deploy` **senza** `-i`, ne crea uno **nuovo** (deployment ID diverso) → URL diverso. Quasi mai quello che vuoi: in genere si gestisce un singolo deployment di produzione e lo si aggiorna in place.

---

## 5. Gli script di supporto in `scripts/`

### `scripts/setup.js`

Setup interattivo. Prompts per:

- `scriptId` (obbligatorio) — identifica il progetto Apps Script su cui pushare.
- `deploymentId` (opzionale) — identifica il deployment di produzione da aggiornare con `npm run deploy`.
- `deploymentDescription` — etichetta del deploy (default `BozzaOrario`).
- `spreadsheetId` (opzionale) — solo se la web app deve aprire uno Spreadsheet via `openById` (caso non bound).

Scrive due file gitignored:

- `.clasp.json` — letto da `clasp` per sapere su quale progetto pushare.
- `config/local.json` — letto dagli script Node del repo per `deploymentId`, ecc.

Idempotente: rilanciandolo, i valori correnti diventano i default per i prompts.

### `scripts/deploy.js`

Eseguito da `npm run deploy`. Logica:

```
1. Legge config/local.json
2. Verifica che deploymentId sia impostato (errore altrimenti)
3. Esegue: clasp push -f      → manda HEAD su Google
4. Esegue: clasp deploy -i <id> -d <descr>  → aggiorna versione
```

Niente magia: è uno wrapper che evita di dover ricordare il `deploymentId` ogni volta. Se preferisci puoi sempre chiamare i comandi `clasp` direttamente.

### Niente altro

Non servono builder, transpiler, bundler. Apps Script accetta JavaScript ES6+ così com'è (runtime V8). I file `.gs` sono JavaScript con estensione diversa per convenzione — Apps Script li tratta come `.js`.

---

## 6. Il ruolo di `src/index.html`

`index.html` è il **template HTML** della web app. Non è "servito statico": Apps Script lo elabora ad ogni request.

### Come arriva al browser

In `src/WebApp.gs` la funzione `doGet`:

```javascript
const tpl = HtmlService.createTemplateFromFile('index');
tpl.bootstrap = json;          // variabile iniettata nel template
return tpl.evaluate()
  .setTitle('Bozza Orario S1')
  .setFaviconUrl('https://...');
```

`createTemplateFromFile('index')` carica `index.html` come template. Le scriptlet `<?!= bootstrap ?>` dentro l'HTML vengono sostituite dal valore di `tpl.bootstrap` (in questo caso il JSON dello snapshot).

`evaluate()` produce un `HtmlOutput` finale, che Apps Script wrappa in un iframe sandbox e serve al browser.

### Cosa contiene

- **CSS embedded** — variabili tema, stili griglia, stili sessioni e filtri.
- **HTML statico** — header con filtri, contenitore `#grid`, legenda, footer.
- **`<script>` inline** che riceve `var BOOTSTRAP = <?!= bootstrap ?>;` con tutti i dati e costruisce dinamicamente la griglia, le sessioni, i filtri, il layout overlap-aware.

Niente `<script src="...">`, nessuna libreria esterna. Tutto autocontenuto in un singolo file.

### Il `<?!= ... ?>`

È la sintassi delle scriptlet di HtmlService:

| Sintassi | Effetto |
|---|---|
| `<?= expr ?>` | Output stringa con escaping HTML (sicuro contro XSS) |
| `<?!= expr ?>` | Output stringa **senza** escaping (per JSON o HTML pre-formattato) |
| `<? code; ?>` | Codice JavaScript server-side senza output |

Usiamo `<?!= bootstrap ?>` perché `bootstrap` è già una stringa JSON valida e l'escaping HTML rovinerebbe le virgolette.

---

## 7. Si possono pubblicare più pagine HTML?

Sì, ma con vincoli. Apps Script **non** ha routing per path. Hai sempre un singolo URL `/exec`. Le strategie:

### A) Più file HTML, un solo doGet che fa "routing" via query

Aggiungi più file HTML al progetto (es. `home.html`, `aule.html`, `report.html`) e in `doGet` decidi cosa servire in base al parametro `e.parameter.page`:

```javascript
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'home';
  switch (page) {
    case 'home':   return render_('home');
    case 'aule':   return render_('aule');
    case 'report': return render_('report');
    default:       return HtmlService.createHtmlOutput('404');
  }
}

function render_(name) {
  return HtmlService.createTemplateFromFile(name).evaluate()
    .setTitle('Pagina ' + name)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

URL d'accesso:
- `…/exec` → home
- `…/exec?page=aule` → pagina aule
- `…/exec?page=report` → report

I file HTML possono includere altri file via `<?!= HtmlService.createHtmlOutputFromFile('header').getContent() ?>` — pattern utile per condividere CSS o navigation bar tra pagine.

**Pro**: tutto in un singolo deploy, un singolo URL base, link interni semplici (`<a href="?page=aule">`).
**Contro**: se hai pagine pesanti, sono tutte servite dallo stesso `doGet` quindi il codice cresce.

### B) Più file HTML serviti come "frammenti" via include

Se le "pagine" sono in realtà sezioni di un'unica web app SPA, le includi in `index.html` con `<?!= include('aule') ?>` e gestisci il "routing" lato client (history API, hash routing). Non sono pagine separate per Apps Script — è un'unica pagina con sezioni.

### C) Più deployment dello stesso progetto

Crei più deployment dell'**stesso** progetto Apps Script con descrizioni diverse (es. "BozzaOrario - Pubblico" e "BozzaOrario - Admin"). Ogni deployment ha il suo `deploymentId` e il suo URL `/exec`, ma servono lo **stesso** `doGet`. Utile solo se vuoi:

- Politiche di accesso diverse (es. uno `Anyone`, uno `Anyone with Google account`).
- Versioni stabili distinte (es. il pubblico è alla v25, l'admin alla v28 dove stai testando).

Aggiornare un deployment con `clasp deploy -i <idA>` non tocca l'altro.

### D) Più progetti Apps Script

Progetti separati, scriptId diversi, repository diversi (o stesso repo con .clasp.json switchabile). Ogni progetto ha il suo `doGet` indipendente. Massima separazione, più overhead.

### Raccomandazione

Per il caso normale: **opzione A** (multiple HTML + routing via `e.parameter`). Se le viste condividono molto codice/dati: opzione B. Le opzioni C e D solo se hai esigenze precise di policy o isolamento.

---

## 8. Esempio pratico: aggiungere una seconda pagina

Diciamo che vogliamo una pagina `/exec?page=aule` che mostri solo la tabella aule in HTML.

### Step 1 — crea `src/aule.html`

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Aule</title></head>
<body>
  <h1>Tabella aule</h1>
  <pre><?!= datiAule ?></pre>
</body>
</html>
```

### Step 2 — modifica `src/WebApp.gs`

```javascript
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  const page = (e && e.parameter && e.parameter.page) || '';

  if (action === 'data') {
    return ContentService.createTextOutput(JSON.stringify(getOrarioData()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (page === 'aule') {
    const tpl = HtmlService.createTemplateFromFile('aule');
    tpl.datiAule = JSON.stringify(getAuleData(), null, 2);
    return tpl.evaluate()
      .setTitle('Aule')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // default: index
  const json = getSnapshot_();
  if (!json) return /* ... */;
  const tpl = HtmlService.createTemplateFromFile('index');
  tpl.bootstrap = json;
  return tpl.evaluate().setTitle('Bozza Orario S1');
}
```

### Step 3 — push e deploy

```
npm run push      ← /exec?page=aule disponibile su /dev (test)
npm run deploy    ← attivo anche su /exec
```

### Step 4 — link

Dalla pagina principale puoi linkare con `<a href="?page=aule">` (relativo, mantiene il `/exec`). Oppure dare il link esterno `…/exec?page=aule`.

---

## 9. Riepilogo comandi

| Cosa fare | Comando | Effetto |
|---|---|---|
| Salvare codice su Google (test) | `npm run push` | HEAD aggiornato. Visibile su `/dev` e dal menu Sheet. |
| Pubblicare codice su `/exec` | `npm run deploy` | Push + nuova versione del deploy → `/exec` aggiornato. |
| Aprire l'editor Apps Script | `npm run open` | Apre `script.google.com` sul progetto corrente. |
| Vedere i log delle ultime esecuzioni | `npm run logs` | Stampa stack di errori e Logger.log. |
| Elencare i deployment | `npm run deployments` | Lista deployment ID + versione + descrizione. |
| Cambiare il deployment di destinazione | `npm run setup` | Reimposta `config/local.json` con un nuovo deploymentId. |
| Eliminare un deployment | `clasp delete-deployment <id>` | Rimuove deployment numerato (HEAD non eliminabile). |
| Creare un nuovo deployment | Apps Script editor → Deploy → New deployment | Genera nuovo `deploymentId` e URL. Da copiare in `setup.js`. |

---

## 10. Cosa ricordare

- Push e Deploy sono cose distinte: push aggiorna HEAD (test); deploy aggiorna l'URL pubblico `/exec`.
- L'`index.html` è un template HtmlService, non un file statico. Il bootstrap dei dati avviene server-side via `<?!= ... ?>`.
- Per più pagine: un solo `doGet` che fa routing via `e.parameter.page` e seleziona quale file HTML rendere. Gli URL diventano `/exec?page=foo`.
- I file `.gs` e `.html` di Apps Script vivono in `src/` e sono tutti pushati insieme. Non c'è differenza di tooling tra un file `.gs` e un `.html`.
- Niente bundler/build step. JavaScript ES6+ accettato direttamente. Niente moduli `import`/`export` però — usa il global scope (Apps Script fa ricarica e link cross-file automaticamente).
