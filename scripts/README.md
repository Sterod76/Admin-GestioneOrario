# `scripts/`

Script Node di supporto. Due gruppi: **operativi** (lanciati da `npm run …` / task VS
Code) e **sim** (test offline). Uso quotidiano: [`../docs/USO-RAPIDO.md`](../docs/USO-RAPIDO.md).

## Operativi

| File | `npm run` | Cosa fa |
|---|---|---|
| `setup.js` | `setup` | Scrive `.clasp.json` + `config/local.json` (installazione **singola**; si rifiuta sul multi-target `targets[]`). |
| `push.js` | `push` | `clasp push` su **tutti i target** — solo `@HEAD` (URL `/dev`), non il pubblico. |
| `deploy.js` | `deploy` | Per ogni target: push + `clasp deploy` → aggiorna la web app `/exec`. Preflight account (`expectedAccount`). |
| `verify.js` | `verify` | Sintassi del client (`<script>` di `index.html`) + di tutti i `.gs`, poi lancia tutte le sim. **Da fare prima del deploy.** |
| `whoami.js` | `whoami` | Account Google loggato in clasp (avvisa se ≠ `expectedAccount`). |
| `build_manual_screens.js` | — | Genera la web app **standalone** con dati mock → `.manual_preview/index.html`, per gli screenshot del `MANUAL.md`. |

## Sim (`sim_*.js`) — test offline

Eseguiti tutti da `verify.js`: estraggono le funzioni reali da `index.html` e le fanno
girare in un DOM finto, **senza** pubblicare su Google. Uno per area:

| Sim | Copre |
|---|---|
| `sim_collisions` | costo collisioni, ordinamento, obiquità, matrice opzionali×tutti |
| `sim_coexam` | matrice co-esami (soglia colore, header, hover) |
| `sim_capacity` | capienza aule (divisori gruppo, soglia 80%) |
| `sim_suggest` | suggerimenti di spostamento + popover |
| `sim_drag` / `sim_dragslot` | drag/parking nel calendario / negli slot |
| `sim_mirror` | schede specchio S*LT/S*LM |
| `sim_modlog` | log modifiche |
| `sim_parse` | parser docenti / mutuazioni |
| `sim_roles` | livelli di accesso (editor/revisore/pubblico) |
| `sim_editlock` | lock EDIT/VIEW |
| `sim_feedback` | feedback / segnalazioni |
| `sim_visibility` | visibilità pubblica (pubblicato / in redazione) |

> Quando cambi la logica coperta da una sim, **aggiorna la sim**.
