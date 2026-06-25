# GestioneOrario

Applicativo per comporre e consultare l'**orario didattico** del CdS in Fisica (UniPi):
un gsheet sorgente, codice **Google Apps Script** che genera l'occupazione aule, e una
**web app** di consultazione/editing (Web Calendar). Replicato su più installazioni.

## Documentazione

- 👉 [`docs/USO-RAPIDO.md`](docs/USO-RAPIDO.md) — **da qui**: commit, deploy, target da VS Code (task + flussi tipici).
- [`MANUAL.md`](MANUAL.md) — manuale utente della web app (tab, collisioni, capienza, SERVIZIO).
- [`docs/guida-tecnica-completa.md`](docs/guida-tecnica-completa.md) — architettura, fogli, file `.gs`, concetti.
- [`docs/deploy-webapp.md`](docs/deploy-webapp.md) — HEAD vs versioni, `/exec` vs `/dev`, `clasp deploy`.
- [`docs/duplicare-gsheet.md`](docs/duplicare-gsheet.md) — creare una nuova istanza (2 procedure).
- [`docs/appsscript-manifest.md`](docs/appsscript-manifest.md) — campi di `src/appsscript.json`.

## Prerequisiti

- **Node.js ≥ 18** ([nodejs.org](https://nodejs.org/)) e **clasp** globale: `npm install -g @google/clasp`.
- `clasp login` con l'account Google dello Sheet.

> ⚠️ Se il progetto è su **Drive condiviso** (`H:\Drive condivisi\…`): installa clasp
> **solo globalmente**, **non** fare `npm install` locale (Drive non regge `node_modules/`).

## Quick start (installazione esistente)

```bash
git clone https://codeberg.org/Sterod76/Admin-GestioneOrario.git
cd Admin-GestioneOrario
clasp login
npm run setup     # ID dell'installazione (target singolo)
npm run deploy    # push + aggiorna la web app /exec
```

Nuova istanza (duplicare il gsheet): [`docs/duplicare-gsheet.md`](docs/duplicare-gsheet.md).

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run verify` | sintassi client + `.gs` + sim (lancialo prima di deployare) |
| `npm run deploy` | `push` + aggiorna il deployment di **tutti** i target (`/exec`) |
| `npm run push` | invia `src/` ad Apps Script (solo `@HEAD` / `/dev`) |
| `npm run pull` | scarica il codice remoto in `src/` |
| `npm run setup` | scrive `.clasp.json` + `config/local.json` (target singolo) |
| `npm run deployments` / `open` / `logs` / `whoami` | diagnostica / editor / log / account |

In VS Code i comandi sono **task** pronti (`Ctrl+Shift+P → Run Task`): vedi [`docs/USO-RAPIDO.md`](docs/USO-RAPIDO.md).

## Aggiornare i target (più installazioni)

Le installazioni vivono nell'array **`targets[]`** di `config/local.json` (gitignorato);
`npm run deploy` itera su tutte. Template: [`config/local.multitarget.example.json`](config/local.multitarget.example.json).
Per aggiungere/modificare un'installazione **edita `config/local.json`** (task
**🎯 Apri config target**) — non usare `npm run setup`, che gestisce solo il target
singolo e si rifiuta sul multi-target. Procedura: [`docs/USO-RAPIDO.md`](docs/USO-RAPIDO.md) §3.

## Struttura

```
src/        codice Apps Script (.gs + index.html) — vedi guida-tecnica
scripts/    setup/push/deploy/verify (.js) + sim_*.js + build_manual_screens.js
config/     local.json (gitignored) + esempi
matrice/    pipeline Python della matrice co-esami
docs/       documentazione + img/ (screenshot del MANUAL)
```

## Troubleshooting

- **`clasp push`: "Could not read API credentials"** → `clasp login`.
- **Web app: "Snapshot non ancora pubblicato"** → menu `📅 Vai al Web Calendar`.
- **Modifiche non visibili su `/exec`** → hai fatto solo `push`; serve `deploy`.
- Altri casi: [`docs/deploy-webapp.md`](docs/deploy-webapp.md), [`docs/duplicare-gsheet.md`](docs/duplicare-gsheet.md).
