# `src/appsscript.json` — guida ai campi del manifest

Il file `appsscript.json` è il *manifest* del progetto Apps Script. Definisce timezone, runtime, scope OAuth, e le policy della web app. È **JSON strict** (non supporta commenti `//` o `/* */`), quindi questa guida sostituisce i commenti in-file.

Documentazione ufficiale: [developers.google.com/apps-script/manifest](https://developers.google.com/apps-script/manifest).

---

## Struttura attuale del file

```json
{
  "timeZone": "Europe/Rome",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

---

## Campi principali

### `timeZone`

Timezone usato dal runtime (per `Utilities.formatDate`, `Date`, ecc.). Stringa nel formato IANA.

| Valore | Effetto |
|---|---|
| `"Europe/Rome"` | Timezone italiana (con DST) — usato in questo progetto |
| `"UTC"` | Tempo coordinato universale |
| `"America/New_York"` | NY |
| `"GMT"` | GMT senza DST |

Lista completa: [tz database](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).

---

### `runtimeVersion`

Quale versione del motore JavaScript usa Apps Script.

| Valore | Effetto |
|---|---|
| `"V8"` | Motore V8 (ES6+, classi, arrow functions, template literals, ecc.) — **consigliato e usato qui** |
| `"DEPRECATED_ES5"` | Motore vecchio Rhino (solo ES5) — legacy, evitare |

---

### `exceptionLogging`

Dove vengono loggate le eccezioni non gestite.

| Valore | Effetto |
|---|---|
| `"STACKDRIVER"` | Cloud Logging (console GCP / `clasp logs`) — usato qui |
| `"NONE"` | Nessun log automatico delle eccezioni |

---

### `dependencies`

Librerie Apps Script importate nel progetto (Add-ons, advanced services).

```json
"dependencies": {
  "enabledAdvancedServices": [
    {
      "userSymbol": "Sheets",
      "version": "v4",
      "serviceId": "sheets"
    }
  ],
  "libraries": [
    {
      "userSymbol": "MyLib",
      "libraryId": "1abc...",
      "version": "5"
    }
  ]
}
```

In questo progetto è **vuoto**: usiamo solo le API built-in `SpreadsheetApp`, `HtmlService`, `PropertiesService`, `UrlFetchApp` che non richiedono dichiarazione.

---

### `webapp`

Policy applicate ai deployment di tipo "Web app" creati **da clasp** (non dall'editor UI). Vale solo al momento della **creazione** del deployment — modifiche successive al manifest non si propagano ai deployment già creati.

#### `webapp.executeAs`

Determina con quale identità gira il codice della web app quando un visitatore fa GET sull'URL.

| Valore | Effetto |
|---|---|
| `"USER_DEPLOYING"` | Lo script gira **come l'account che ha creato il deployment** ("Execute as: Me" nell'UI). I permessi sono i tuoi: lo script può leggere/scrivere il tuo Sheet anche se il visitatore è anonimo o senza permessi. **Usato qui.** |
| `"USER_ACCESSING"` | Lo script gira **come il visitatore** ("Execute as: User accessing the web app"). Richiede che il visitatore sia loggato e abbia accesso allo Sheet. Sicuro per dati privati ma blocca utenti anonimi. |

**Quando usare `USER_DEPLOYING`**: web app pubblica che mostra dati in sola lettura aggregati dal tuo Sheet. È il caso del Web Calendar.

**Quando usare `USER_ACCESSING`**: web app che deve scrivere sui dati del visitatore (es. Google Form custom). Richiede login forzato.

#### `webapp.access`

Chi può aprire l'URL `/exec` della web app.

| Valore | Effetto | Login richiesto? |
|---|---|---|
| `"MYSELF"` | Solo l'account che ha creato il deployment | Sì, e specifico account |
| `"DOMAIN"` | Solo utenti del dominio Workspace di chi ha creato (es. tutti `@unipi.it`) | Sì, account del dominio |
| `"ANYONE"` | Chiunque abbia un account Google | Sì, ma qualsiasi account |
| `"ANYONE_ANONYMOUS"` | Chiunque, anche senza login | No |

**Usato qui**: `ANYONE_ANONYMOUS` — il Web Calendar è pubblico, niente login richiesto.

⚠️ **Su Workspace**: gli admin possono **bloccare** `ANYONE_ANONYMOUS` o `ANYONE` come policy globale. In quel caso il deployment viene creato ma l'URL `/exec` restituisce "Sorry, unable to open the file". Vedi `docs/deploy-webapp.md` per la diagnostica.

---

## Altri campi opzionali (non usati qui ma documentati per riferimento)

### `oauthScopes`

Lista esplicita di scope OAuth richiesti. Apps Script di solito li auto-rileva dall'analisi del codice, ma puoi forzarli:

```json
"oauthScopes": [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.external_request"
]
```

Utile se Apps Script non riesce a indovinare correttamente o se vuoi limitare gli scope.

### `addOns`

Per progetti che si presentano come Add-on di Workspace (Google Docs/Sheets/Slides). Definisce trigger di apertura, eventi, ecc. Non usato qui (siamo container-bound, non add-on).

### `urlFetchWhitelist`

Whitelist di domini che `UrlFetchApp` può chiamare (per audit/sicurezza). Non usato qui.

### `sheets`

Configurazione di trigger per onEdit/onChange specifici dello Sheet (custom functions, macro). Non usato qui.

---

## Modificare le policy del deployment esistente

⚠️ **Il manifest si applica solo ai deployment creati DOPO la modifica.** I deployment già esistenti continuano con le policy fissate alla loro creazione.

Per cambiare policy di un deployment esistente:

1. **UI editor**: Deploy → Manage deployments → click matita → cambia "Who has access" o "Execute as" → Update deployment.
2. **Cancella e ricrea**:
   ```bash
   clasp delete-deployment <vecchio-id>
   ```
   Svuota `deploymentId` in `config/local.json`, modifica `webapp` in `appsscript.json`, poi `npm run deploy` (crea nuovo deployment con le nuove policy).

---

## Regola pratica

- Per la web app **pubblica** (Web Calendar, sola lettura, dati non sensibili): `USER_DEPLOYING` + `ANYONE_ANONYMOUS` (il default di questo repo).
- Per una web app **interna** dipartimentale: `USER_DEPLOYING` + `DOMAIN`.
- Per una web app **multi-utente con scrittura** (CRUD su dati privati): `USER_ACCESSING` + `ANYONE` (login forzato).
- Per **debug personale**: `USER_DEPLOYING` + `MYSELF`.
