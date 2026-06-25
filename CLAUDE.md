# Istruzioni progetto — Orario CdS

Web app Google Apps Script (bound) per l'orario didattico. Vedi **`MANUAL.md`** per
l'uso completo (utente finale), **`README.md`** §Comandi e **`docs/USO-RAPIDO.md`**
per il tooling (commit/deploy/target da VS Code).

## Regole operative

- **Aggiorna `MANUAL.md` a ogni modifica che ne cambia uso o aspetto.** Se è
  cambiata l'interfaccia, rigenera anche gli screenshot:
  `node scripts/build_manual_screens.js` → cattura i tab con Edge headless in
  `docs/img/` (procedura in §10 del manuale).
- **Deploy = `npm run deploy`**, non `npm run push`. `push` aggiorna solo `@HEAD`
  (URL `/dev`); solo `deploy` aggiorna la web app pubblica `/exec`. I target sono
  nell'array `targets[]` di `config/local.json` (4 installazioni); `deploy.js` itera
  su tutti. **Non** usare/scrivere `npm run setup` su quel file (è multi-target, lo
  romperebbe).
- **Prima di deployare**, verifica con **`npm run verify`** (= `scripts/verify.js`:
  client `<script>` + tutti i `.gs` + tutte le sim — devono essere tutte verdi).
  Aggiorna le sim quando cambi la logica che coprono. A mano: estrai `<script>` da
  `src/index.html` (sostituendo `<?!= ?>`/`<?= ?>`) → `node --check`; `.gs` → copia in
  `.js` temp → `node --check`.
- **Flusso canonico quando l'utente lo chiede**: `npm run verify` → `npm run deploy`
  → commit → `git push origin main` (remote `origin` = **Codeberg**). Commit/push git
  e deploy **solo se richiesti** dall'utente.
- **Gotcha commit (Windows)**: il path del repo contiene `[ ]`, e `git commit -m`
  lungo/multilinea può far scattare un falso positivo del sandbox. Scrivi il messaggio
  in un file temp (es. `C:\Users\...\Temp\msg.txt`) e usa `git commit -F <file>`.

## Mappa file

- `src/index.html` — client (UI, render, editing). `BOOTSTRAP` = dati iniettati dal server. Mappa: **`WEBAPP.md`**.
- `src/WebApp.gs` — `doGet`, `getOrarioData`, snapshot bucket LT/LM/PDS, Carica/Salva.
- `src/Config.gs` — costanti colonne, parser (`parseDocenti_`, `parseMutuazione`).
- `src/TabellaAule.gs`, `src/Coexam.gs`, `src/Menu.gs` — aule, lettura `MATRICE`, menu.
- `matrice/` — tool Python della matrice co-esami (+ README).
- `scripts/` — `push.js`/`deploy.js` (multi-target), `sim_*.js`, `build_manual_screens.js`.

## Note tecniche

- Foglio `MATRICE` = sola lettura (IMPORTRANGE dal gsheet fisso). La web app conserva
  l'**intero** `perCode`/`pairs` (tutti i codici, LT inclusi); il tab Co-esami mostra
  solo il sottoinsieme LM OBB/FOR.
- Classi di equivalenza (`canon`/`data.equiv`, `buildEquivMap_` in `Mutuazione.gs`) =
  **mutuazioni** (col D) **+** foglio `CORRISPONDENZE` (`readCorrispondenze_`, import del
  CSV `matrice/equivalenze_codici.csv`): `E`/`N` co-esami sommate sulla classe. Matrice
  letta coi codici **grezzi** (`readCoexamMatrix_`), fusione a valle nel client.
- Colonna **J = "docenti"**: 1° = titolare, gli altri co-docenti (parser `parseDocenti_`).
- Funzione di costo: `ore_overlap × N`. Capienza: `E / n.gruppi > 80% posti`.
- PowerShell: i path con `[` `]` vanno trattati con `-LiteralPath` (le parentesi sono
  wildcard); per copiare file usa `[System.IO.File]::Copy`.
