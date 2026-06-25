# Deploy della Web App

Come funziona la pubblicazione della web app. Per i comandi quotidiani vedi
[`USO-RAPIDO.md`](USO-RAPIDO.md).

## Web app in Apps Script

Endpoint HTTP servito da Google: a una GET sull'URL, esegue `doGet(e)` e ritorna
HTML o JSON. Niente server/hosting tuoi. Vincoli: solo `doGet`/`doPost`, una web app
per progetto, nessun routing per path (eventuale "routing" via `e.parameter` in `doGet`).

## HEAD vs deployment versionato — `/dev` vs `/exec`

| URL | Serve | Chi accede |
|---|---|---|
| `…/dev` | **HEAD** = ultimo `clasp push` | solo il proprietario |
| `…/exec` | il **deployment versionato** attivo | secondo la policy "Who has access" |

- Le funzioni da **menu Sheet** (e `onOpen`) usano sempre **HEAD** → bastano un push.
- `/exec` **non** cambia finché non fai `clasp deploy`: gli utenti vedono la versione
  precedente. Per questo `push` (test) e `deploy` (pubblicazione) sono distinti.

## Cos'è `clasp deploy`

```
clasp deploy -i <deploymentId> -d "<descr>"
```

1. crea una **nuova versione** da HEAD; 2. punta il deployment (stesso `deploymentId`,
stesso URL `/exec`) alla nuova versione. **Senza `-i`** crea un deployment **nuovo**
(URL diverso) — quasi mai voluto.

Un **deployment** ha: `deploymentId` (`AKfycb…`, fisso), version number (`@26`),
description, e policy *Who has access* / *Execute as* (fissate alla creazione).

## Script del repo

- `scripts/setup.js` (`npm run setup`) — prompt per `scriptId`, `deploymentId`,
  description, `webappUrl`, `spreadsheetId`; scrive `.clasp.json` + `config/local.json`
  (gitignored). ⚠ Solo target singolo: si rifiuta su `config/local.json` multi-target.
- `scripts/deploy.js` (`npm run deploy`) — per ogni target: `clasp push -f` +
  `clasp deploy -i`; preflight account (`expectedAccount`). **Non** crea nuovi
  deployment né cambia le policy. Override descrizione: `npm run deploy "testo"`.

Il **primo** deployment di una nuova istanza va creato dall'editor (Deploy → New
deployment → Web app), perché lì le policy del Workspace si applicano in modo
prevedibile. Vedi [`duplicare-gsheet.md`](duplicare-gsheet.md).

## `src/index.html`

Template HtmlService (non file statico): `doGet` fa
`HtmlService.createTemplateFromFile('index')`, inietta `tpl.bootstrap = json`, e le
scriptlet lo emettono. Sintassi: `<?= x ?>` (con escaping), `<?!= x ?>` (senza, per
JSON/HTML), `<? code ?>` (server-side). Usiamo `<?!= bootstrap ?>` perché è già JSON.
CSS+JS sono **inline**, nessuna libreria esterna.

## Troubleshooting

- **Modifiche non visibili su `/exec`** → hai fatto solo `push`; serve `deploy`.
- **`Requested entity was not found`** → `deploymentId` in `config/local.json` non
  esiste più (cancellato, o config di un'altra istanza): ricrea il deployment
  dall'editor → `npm run setup`.
- **`/exec` dà 403** → policy troppo restrittiva: editor → Deploy → Manage deployments
  → matita → "Who has access: Anyone with Google account".
- **`Permission denied`** → l'account `clasp login` non è editor del progetto.
