# `src/appsscript.json` — guida ai campi del manifest

Il file `appsscript.json` è il *manifest* del progetto Apps Script. Definisce timezone, runtime, scope OAuth, e le policy della web app.

> ⚠️ **Niente commenti consentiti.** Apps Script verifica il manifest con uno schema strict: rifiuta sia commenti `//` o `/* */` (errore "Comments are not allowed in the script manifest file(s).") sia campi sconosciuti come `_doc` o `_comment` (errore "Invalid manifest: unknown fields"). Per documentazione, fai riferimento sempre a questo file `.md`.

Documentazione ufficiale: [developers.google.com/apps-script/manifest](https://developers.google.com/apps-script/manifest).

---

## Struttura attuale del file

```json
{
  "timeZone": "Europe/Rome",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
```

> Nota: la sezione **`webapp`** (`executeAs` + `access`) **non è presente** nel manifest di questo repo. Il primo deployment di una nuova istanza viene creato dall'editor Apps Script (Deploy → New deployment) dove le policy sono scelte via UI; gli aggiornamenti successivi sono `npm run deploy -i <id>` che NON modifica le policy. La sezione `webapp` resta documentata sotto come riferimento per chi volesse usare `clasp deploy` senza `-i` (sconsigliato su Workspace).

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

**Usato qui**: `ANYONE` — il Web Calendar è accessibile a chiunque abbia un account Google. Login richiesto, ma nessun vincolo di dominio.

⚠️ **Su Workspace**: la policy `ANYONE_ANONYMOUS` viene spesso silenziosamente downgradata dal Workspace policy admin (anche se il manifest lo richiede). Su `unipi.it` abbiamo riscontrato che `ANYONE_ANONYMOUS` settato via manifest produce 403 alla URL `/exec`. La policy `ANYONE` (login Google richiesto) di solito passa. Per uso completamente anonimo serve eventualmente intervento dell'admin Workspace, oppure crea il deployment manualmente dalla UI editor (Deploy → New deployment → Anyone) che a volte aggira il filtro.

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

- Per la web app **pubblica con account Google** (Web Calendar, sola lettura, login leggero): `USER_DEPLOYING` + `ANYONE` (il default di questo repo).
- Per la web app **completamente anonima** (no login): `USER_DEPLOYING` + `ANYONE_ANONYMOUS`. Su Workspace può non funzionare (vedi nota sopra).
- Per una web app **interna** dipartimentale: `USER_DEPLOYING` + `DOMAIN`.
- Per una web app **multi-utente con scrittura** (CRUD su dati privati): `USER_ACCESSING` + `ANYONE` (login forzato).
- Per **debug personale**: `USER_DEPLOYING` + `MYSELF`.
