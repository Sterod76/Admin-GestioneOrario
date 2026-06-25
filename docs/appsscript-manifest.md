# `src/appsscript.json` — manifest

Manifest del progetto Apps Script: timezone, runtime, scope OAuth, advanced services.

> ⚠️ **Niente commenti** (né `//` né campi `_doc`): lo schema è strict. Documenta qui.
> Riferimento: [developers.google.com/apps-script/manifest](https://developers.google.com/apps-script/manifest).

## Campi in uso

| Campo | Valore | Significato |
|---|---|---|
| `timeZone` | `Europe/Rome` | TZ del runtime (IANA) |
| `runtimeVersion` | `V8` | motore JS ES6+ (non `DEPRECATED_ES5`) |
| `exceptionLogging` | `STACKDRIVER` | eccezioni in Cloud Logging / `clasp logs` |
| `oauthScopes` | `spreadsheets`, `script.container.ui`, `userinfo.email`, `script.scriptapp`, `drive`, `script.external_request` | scope espliciti |
| `dependencies.enabledAdvancedServices` | `Sheets v4` | servizio avanzato Sheets (Tabelle native `SERVIZIO`) |

Lo scope `spreadsheets` **pieno** + `script.external_request` servono per le Tabelle
native e il fetch da University Planner. **Cambiare gli scope richiede ri-autorizzazione**
dopo il deploy (vedi MANUAL §4 "Autorizzazione").

## `webapp` (policy deployment)

Non è nel manifest di questo repo: il primo deployment si crea dall'editor (policy via
UI). Riferimento dei valori, se mai servisse `clasp deploy` senza `-i`:

- **`executeAs`**: `USER_DEPLOYING` (gira come chi ha deployato — usato per web app
  pubblica in lettura) · `USER_ACCESSING` (gira come il visitatore — per scrittura su dati propri).
- **`access`**: `MYSELF` · `DOMAIN` (solo `@unipi.it`) · `ANYONE` (qualsiasi account
  Google, login richiesto) · `ANYONE_ANONYMOUS` (no login).

⚠️ Su Workspace `unipi.it`, `ANYONE_ANONYMOUS` via manifest spesso → 403; usa `ANYONE`
o crea il deployment dall'editor.

## Cambiare le policy di un deployment esistente

Il manifest vale solo per i deployment creati **dopo**. Per uno esistente: editor →
Deploy → Manage deployments → matita → cambia → Update.
