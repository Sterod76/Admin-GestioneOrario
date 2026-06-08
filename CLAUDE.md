# Istruzioni progetto — Orario CdS

Web app Google Apps Script (bound) per l'orario didattico. Vedi **`MANUAL.md`** per
l'uso completo e gli screenshot.

## Regole operative

- **Aggiorna `MANUAL.md` a ogni modifica che ne cambia uso o aspetto.** Se è
  cambiata l'interfaccia, rigenera anche gli screenshot:
  `node scripts/build_manual_screens.js` → cattura i tab con Edge headless in
  `docs/img/` (procedura in §10 del manuale).
- **Deploy = `npm run deploy`**, non `npm run push`. `push` aggiorna solo `@HEAD`
  (URL `/dev`); solo `deploy` aggiorna la web app pubblica `/exec`. I target sono in
  `config/local.json` (2 installazioni).
- **Prima di deployare**, verifica:
  - sintassi del client: estrai `<script>` da `src/index.html`, sostituisci i
    `<?!= ?>`/`<?= ?>` con valori e fai `node --check`;
  - i `.gs`: copia in `.js` temporaneo e `node --check`;
  - le sim: `node scripts/sim_*.js` (devono essere tutte verdi). Aggiorna le sim
    quando cambi la logica che coprono.
- Commit/push git solo se richiesto dall'utente.

## Mappa file

- `src/index.html` — client (UI, render, editing). `BOOTSTRAP` = dati iniettati dal server.
- `src/WebApp.gs` — `doGet`, `getOrarioData`, snapshot bucket LT/LM/PDS, Carica/Salva.
- `src/Config.gs` — costanti colonne, parser (`parseDocenti_`, `parseMutuazione`).
- `src/TabellaAule.gs`, `src/Coexam.gs`, `src/Menu.gs` — aule, lettura `MATRICE`, menu.
- `matrice/` — tool Python della matrice co-esami (+ README).
- `scripts/` — `push.js`/`deploy.js` (multi-target), `sim_*.js`, `build_manual_screens.js`.

## Note tecniche

- Foglio `MATRICE` = sola lettura (IMPORTRANGE dal gsheet fisso). La web app conserva
  l'**intero** `perCode`/`pairs` (tutti i codici, LT inclusi); il tab Co-esami mostra
  solo il sottoinsieme LM OBB/FOR.
- Colonna **J = "docenti"**: 1° = titolare, gli altri co-docenti (parser `parseDocenti_`).
- Funzione di costo: `ore_overlap × N`. Capienza: `E / n.gruppi > 80% posti`.
- PowerShell: i path con `[` `]` vanno trattati con `-LiteralPath` (le parentesi sono
  wildcard); per copiare file usa `[System.IO.File]::Copy`.
