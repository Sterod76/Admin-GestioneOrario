# Orario CdS — Guida tecnica completa

Documentazione di riferimento del progetto Apps Script "Orario": gestione dell'orario didattico, della tabella delle aule, del Web Calendar pubblico, delle mutuazioni e dei vincoli da Piano di Studio.

Tutto il sorgente si trova in `src/`.

---

## 1. Architettura generale

Il progetto è un Apps Script container-bound a uno Google Spreadsheet con dentro più fogli. Tre tipi di artefatti:

- **Foglio sorgente** (es. `S1LT`, `S1LM`, `S2LT`, …): contiene la lista corsi del semestre con orario settimanale.
- **Foglio output** (`S1AULE` / `S2AULE`): tabella aule generata automaticamente dallo script aggregando le sorgenti.
- **Foglio PdS**: matrice dei piani di studio LM (curriculum × elenco codici corso) usata per assegnare il vincolo (OBB/FOR/OPZ).

Il codice Apps Script (file `.gs`) è gestito con **clasp** e versionato come collezione di file in `src/`. Una **web app pubblica** (HtmlService) espone una vista filtrabile dell'orario settimanale a partire da uno snapshot JSON salvato in `DocumentProperties`.

### 1.1 Componenti

- **clasp** — CLI per push/pull del codice da/verso Apps Script.
- **Apps Script** (V8) — runtime che esegue le funzioni dei file `.gs`.
- **Spreadsheet API** — accesso letture/scritture sui fogli (`SpreadsheetApp`).
- **HtmlService + Templates** — serve la web app come pagina HTML statica con bootstrap JSON iniettato.
- **PropertiesService.DocumentProperties** — storage persistente per snapshot e config.

---

## 2. clasp

### 2.1 Cos'è e come si installa

clasp (Command Line Apps Script) è il tool ufficiale di Google per gestire progetti Apps Script da una macchina locale. Sostituisce l'editor web (script.google.com) con un workflow basato su file system + Git, e permette di pushare/scaricare il codice del progetto, gestire i deployment e leggere i log da terminale.

**Due modi per installarlo**:

> **Cos'è npm.** **npm** = "node package manager" (in pratica: il gestore dei pacchetti di Node.js). Viene installato automaticamente quando installi [Node.js](https://nodejs.org/) e si occupa di leggere `package.json` per scaricare le librerie indicate dentro `node_modules/`. Il file `package.json` di questo repo elenca le sue dipendenze (clasp) e definisce gli script accessoriI (`npm run push` ecc.). Niente `package.json` = niente concetto di "progetto npm" e quindi nessun `npm install` possibile. Se digiti solo `npm` da terminale e non risponde, non hai Node.js installato (o non è in PATH); installa Node prima.

#### A. Install locale al progetto (consigliato in questo repo)

Questo repository dichiara `@google/clasp` come `devDependency` in `package.json`. Quindi un solo comando dopo aver clonato:

```bash
npm install
```

Questo crea `node_modules/` con clasp dentro. Da quel momento:
- `npm run push`, `npm run deploy`, `npm run pull`, `npm run status`, `npm run open`, `npm run logs` funzionano sempre (npm prepende automaticamente `node_modules/.bin/` al PATH dello script che lancia).
- Per chiamare `clasp` ad-hoc fuori dagli script: `npx clasp <comando>`.

**Vantaggio**: nessuna dipendenza dal PATH di sistema. Funziona uguale su qualsiasi terminale (cmd, PowerShell, Git Bash, terminale integrato di VS Code) anche se clasp non è installato globalmente.

#### B. Install globale di sistema

Alternativa, vecchia maniera:

```bash
npm install -g @google/clasp
```

Va aggiunto al PATH il global bin di npm (`%APPDATA%\npm` su Windows, `/usr/local/bin` o simili su Mac/Linux). Su Windows potresti dover **chiudere e riaprire il terminale** dopo l'install perché il PATH non si aggiorna nelle shell già aperte.

Verifica con:
```bash
clasp --version       # se in PATH
where clasp           # Windows: deve stampare il percorso
clasp show-authorized-user
```

Se `clasp` non viene trovato ma l'install globale è andato a buon fine, è un problema di PATH della tua shell. Soluzioni temporanee:
- **PowerShell**: `$env:PATH = "C:\Users\rodda\AppData\Roaming\npm;" + $env:PATH`
- **cmd**: `set PATH=%APPDATA%\npm;%PATH%`
- **bash**: `export PATH="$APPDATA/npm:$PATH"`

Su Windows il path tipico è `C:\Users\<utente>\AppData\Roaming\npm` e dentro trovi `clasp.cmd`.

#### Login (una tantum, OAuth)

Indipendentemente dall'install scelto:

```bash
clasp login          # oppure: npx clasp login
```

Apre il browser per autorizzare. Le credenziali sono salvate in `~/.clasprc.json`. Da quel momento `clasp` opera come quell'account Google.

Per cambiare account: `clasp logout` e poi `clasp login` con l'altro account.

### 2.2 File di configurazione

- `.clasp.json` — contiene `scriptId` (l'ID del progetto Apps Script) e `rootDir` (cartella locale dei file). Esempio: `{"scriptId":"...","rootDir":"src"}`. **Gitignored**: ogni installazione lo genera localmente da `.clasp.json.example` o tramite `npm run setup`.
- `.claspignore` (opzionale, attualmente assente) — pattern di esclusione per il push.
- `~/.clasprc.json` — credenziali OAuth dell'utente (creato da `clasp login`). Globale per la macchina, non legato al progetto.

### 2.3 Comandi

| Comando | Effetto |
|---|---|
| `clasp pull` | Scarica i file remoti in `src/`. |
| `clasp push` | Invia i file di `src/` ad Apps Script. Flag `-f` forza l'invio senza conferma. |
| `clasp status` | Mostra cosa verrebbe pushato. |
| `clasp list-deployments` | Elenca i deployment (HEAD + numerati). |
| `clasp delete-deployment <id>` | Elimina un deployment numerato (HEAD non eliminabile). |
| `clasp deploy -i <id> -d <descr>` | Aggiorna un deployment esistente alla versione corrente HEAD (utilizzato per pubblicare il Web Calendar). |

### 2.4 Ciclo tipico di sviluppo

1. Modifica un file in `src/`.
2. `clasp push` (o `npm run push`) — il codice arriva su Apps Script HEAD. Le funzioni richiamate da menu sono già attive.
3. Per la web app pubblica: `clasp deploy -i <deploymentId>` (o `npm run deploy`) per aggiornare l'URL `/exec`.

---

## 3. Struttura dello Spreadsheet

### 3.1 Fogli sorgente (`S{n}{cds}`)

Nome che inizia con `S1`, `S2`, … (semestre) seguito dal codice CdS (`LT`, `LM`, `WNN`, …). Esempi: `S1LT` (Laurea Triennale, 1° semestre), `S1LM` (Laurea Magistrale), `S2LT`.

Header in riga 1, dati da riga 2 in giù. Layout colonne:

| Col | Campo | Note |
|---|---|---|
| A | Anno | Numero, può essere multi-cifra: "12" significa "valido per anno 1 e anno 2" |
| B | Sem | Semestre, info |
| C | Codice corso | es. "0044B" |
| D | Codice mutuato | Vuoto, oppure `CODE [@CdS]` per mutuazione |
| E | Nome corso | |
| F | Tipo | LEZ / LAB / ES / LEZ/ES / … |
| G | Vincolo | OBB / FOR / OPZ |
| H | Gruppo | es. A, A1, A2, B, B1, … |
| I | CFU | |
| J | Titolare | Nome docente |
| K | SSD | |
| L–Q | Giorni LUN..SAB | Celle multi-riga `HH:MM-HH:MM\nAula X` |
| R | Periodo | Etichetta libera (es. "Fino 31/10", "Dal 1/11", "P1"). I newline interni vengono compressi in spazi solo lato display. |

### 3.2 Foglio output (`S1AULE` / `S2AULE`)

Generato dallo script "Genera tabella aule". Layout:

- Header riga 1: `Aula | Giorno | 08:30 | 09:00 | … | 19:00 | Tot ore`.
- Una riga per ogni coppia (aula, giorno). 22 slot da 30 min, da 08:30 a 19:30.
- **Col A**: cella mergiata sui 6 day-rows del blocco. Testo multiriga: riga 1 = nome aula (bold), riga 2 = capienza (italic), righe 3+ ignorate dallo script (note libere).
- **Slot di lezione**: cella mergiata sull'estensione della sessione. Testo `CODICE [GRUPPO] Nome` con codice in bold; sfondo dal colore della cella Vincolo (col G) della riga sorgente; font color dal colore del tab del foglio sorgente (per distinguere LT vs LM).
- **Slot multi-entry** (corsi diversi per periodi diversi): `CODICE1 [G1] / CODICE2 [G2] Titolo1 / Titolo2`, parte codici bold, titoli normale.
- **NON DISPONIBILE**: marker manuale (cella mergiata con testo che inizia con "non disp"). Lo script preserva tra rigenerazioni.
- **Bordi**: linee thick `#666666` fra blocchi aula, fra Giorno e slot, fra slot e Tot ore. Sottili `#666666` attorno a slot e indisponibilità.
- **Hover (note)**: per ogni slot mostra Codice — Nome / orario aula / Titolare / Tipo / Gruppo / Periodo / Mutuazione.

### 3.3 Foglio PdS

Matrice dei piani di studio LM. Layout:

| Col | Campo |
|---|---|
| A | Nome del curriculum (es. "ASTRONOMY & ASTROPHYSICS") |
| B | OBB (codici dei corsi obbligatori, separati da spazi/newline) |
| C–F | FOR1..FOR4 (forchette di scelta) |
| G | OPT (opzionali; ignorati nella logica di assegnazione vincoli) |

---

## 4. File del progetto Apps Script

### 4.1 `appsscript.json`

Manifest del progetto. Timezone `Europe/Rome`, runtime V8. Gli scope OAuth sono auto-detectati in base alle API usate (`SpreadsheetApp`, `HtmlService`, `PropertiesService`, `UrlFetchApp`).

### 4.2 `Config.gs`

Costanti e helper condivisi.

**Costanti**

- `CALENDAR_COLS_START = 12` (L), `CALENDAR_COLS_END = 17` (Q): range colonne giorni nei fogli sorgente.
- `COL_CODICE=3, COL_MUTUATO=4, COL_NOMECORSO=5, COL_TIPO=6, COL_VINCOLO=7, COL_GRUPPO=8, COL_TITOLARE=10, COL_SSD=11, COL_PERIODO=18, ROW_DATA_LAST_COL=COL_PERIODO`.
- `HEADER_ROWS = 1`: numero righe header nei fogli sorgente.
- `VINCOLO_FALLBACK_COLORS = { OBB:#ffcfc9, FOR:#ffe5a0, OPZ:#d4edbc }`: colori usati se la cella Vincolo ha sfondo bianco/vuoto.
- `VINCOLO_DEFAULT_COLOR = #ffffff`.
- `TIPO_LABELS = { LEZ:lezione, ES:esercitazione, LEZ/ES:lezione/esercitazione, LAB:laboratorio }`.

**Helpers**

- `tipoLabel(tipo)` — traduce "LEZ" → "lezione" ecc. Fallback al valore originale.
- `isWhiteOrEmpty(c)` — true se colore è bianco/vuoto.
- `parseMutuazione(raw)` — estrae `{ parentCode, parentCds }` dal valore col D, formato `CODICE [@CDS]`.
- `sheetCdsSuffix(name)` — dal nome foglio "S1LT" estrae "LT".
- `detectAuleConfig()` / `detectAuleConfigFor_(ss)` — rileva semestre attivo in base a quale foglio AULE esiste (`S1AULE` o `S2AULE`), ritorna `{ prefix, output }`.

### 4.3 `Menu.gs`

Definisce `onOpen()` che crea il menu **🕒 Orario** nello Spreadsheet con queste voci:

- 🎯 Assegna vincolo da PdS
- 🏛 Genera tabella aule
- 📅 Aggiorna Web Calendar
- ───
- ✨ Normalizza celle calendario
- 🔄 Ricarica formato tabella
- 💾 Salva formato tabella

### 4.4 `FixCalendar.gs`

La voce "Normalizza celle calendario" (`fixCalendarEntries`) opera sul foglio attivo:

1. Itera celle L:Q (giorni LUN..SAB) dalla riga 2 in giù.
2. Per ogni cella non vuota: split su `\n` in righe (max 2). Se >2 righe, salta e logga issue.
3. Se 2 righe: riga 1 = orario, riga 2 = aula. Se 1 riga: tenta di splittare con `splitTimeAndRoom()` (separa "HH:MM-HH:MM AULA" su singola riga).
4. `parseTimeRange(s)` — regex tollerante: 4 numeri separati da intercambiabili `:`, `.`, `,`, `-`, spazio, en/em dash. Output canonico `HH:MM-HH:MM` con zero-pad.
5. `parseRoom(s)` — normalizza prefisso "Aula" o "Lab" + suffisso uppercase (`Aula a1` → `Aula A1`, `lab1` → `Lab 1`).
6. Costruisce RichTextValue: ora bold, aula italic, scritta come 2 righe nella cella.
7. Title-case su Nome corso (col E): `titleCaseItEn(s)` capitalizza la prima lettera di ogni parola, lasciando minuscole le stop words IT/EN (preposizioni, articoli, congiunzioni). Es.: "lab. 1 ed elementi di computazione" → "Lab. 1 ed Elementi di Computazione".
8. Toast finale: slot agg/salt/err + nomi corso aggiornati.

### 4.5 `TabellaAule.gs`

La voce "Genera tabella aule" (`tabellaAule`) costruisce `S1AULE` / `S2AULE`.

**Flusso**

1. Detect semester via `detectAuleConfig()` → `AULE_PREFIX`, `AULE_OUTPUT`.
2. Filtra fogli sorgente: nome che inizia con `AULE_PREFIX`, escluso `AULE_OUTPUT`.
3. Pulisce evidenziazioni rosse residue (`CONFLICT_BG #f4cccc`) nei fogli sorgente.
4. Pre-legge indisponibilità manuali da `AULE_OUTPUT` (NON DISPONIBILE) prima del wipe.
5. Phase 1: `buildMutuantiMap(sources)` — mappa `parentCode → [{childCode, childCds}, …]`. I corsi mutuati non producono occupazioni.
6. Itera sources, riga per riga, sessione per sessione (`extractSessions` parsa la cella). Salta righe con mutuazione.
7. Per ogni sessione: per ogni slot da 30 min coperto, valuta conflitti vs unavail e vs altri corsi. Conflitti corso/corso solo se stesso periodo (o entrambi vuoti).
8. Se conflitti → dipinge celle source rosse, mostra dialog modale con elenco, blocca esecuzione.
9. Altrimenti: legge aule esistenti da `AULE_OUTPUT` col A (per preservare ordine + capienza), chiede conferma per aule nuove rilevate, smerge tutto, clear, ricostruisce.
10. Layout: header riga 1, una riga per (aula, giorno). Col A mergiata su `blockSize=6` righe con RichText nome+capienza.
11. Slot mergiato per run di slot consecutivi con stessa "signature" (set di entries). Cella multi-entry: codici bold + titoli, hover con blocchi separati.
12. Riapplica indisponibilità preservate.
13. Bordi medium `#666666` applicati per **ULTIMI**: top di blocco (split tra col A merged e resto), bottom ultima aula, verticali destra-Giorno e sinistra-Tot.
14. Larghezze colonne: `TAB_W_AULA=100`, `TAB_W_DAY=50`, `TAB_W_SLOT=60`, `TAB_W_TOT=60`.

**Costanti chiave**

- `SLOT_START_MIN=510` (08:30), `SLOT_END_MIN=1170` (19:30), `SLOT_STEP_MIN=30`.
- `CONFLICT_BG=#f4cccc`, `UNAVAIL_BG=#cccccc`, `UNAVAIL_FG=#ffffff`, `UNAVAIL_FONT_SIZE=10`.
- `UNAVAIL_MARKER_REGEX = /^\s*non\s*disp/i`.
- `TAB_BORDER_COLOR=#666666`, `TAB_BORDER_THIN=SOLID`, `TAB_BORDER_THICK=SOLID_THICK`.
- `TAB_HEADER_BG=#e8f0fe`.

### 4.6 `TableFormat.gs`

Snapshot del formato del foglio attivo (header/colonne) per applicarlo poi ad altri fogli.

- `saveTableFormat()` — itera col 1..lastCol del foglio attivo, registra `{ col (lettera), width (px), title (header), orientation (gradi) }`, serializza in `DocumentProperties.tableFormat` (JSON).
- `reloadTableFormat()` — applica al foglio attivo larghezze, titoli, rotazioni dal JSON salvato.

### 4.7 `Mutuazione.gs`

Helper per la gestione delle mutuazioni:

- `buildMutuantiMap(sources)` — itera tutti i sources e ritorna `{ parentCode: [{childCode, childCds}, …] }` con i corsi che mutuano da `parentCode`.
- `formatMutuanti(list)` — formatta la lista per display: `"0044X @LM, 0044Y @WNN"`.

### 4.8 `Vincoli.gs`

La voce "Assegna vincolo da PdS" (`assegnaVincoliDaPds`):

1. Apre il foglio `PdS`. Per ogni riga: estrae codici da col B (OBB) e col C..F (FOR1..FOR4). Splitta su qualsiasi whitespace, uppercased.
2. Applica a tutti i fogli che terminano con `LM` (case-insensitive): `S1LM`, `S2LM`, ecc.
3. Per ogni riga del foglio LM: legge codice da col C, decide vincolo:
   - Se in OBB set → `OBB`
   - Else se in FOR set → `FOR`
   - Else → `OPZ`
4. Scrive in col G (Vincolo). Toast finale con conteggio per OBB/FOR/OPZ + modifiche/invariati.

### 4.9 `WebApp.gs`

Endpoint della web app pubblica + gestione snapshot.

**`doGet(e)`**

- Legge snapshot JSON da `DocumentProperties` (chunked, vedi Snapshot).
- Se `action=data` → ritorna JSON puro via `ContentService`.
- Altrimenti: `HtmlService` template `index.html` con `bootstrap = JSON`.
- `setTitle("Bozza Orario S1"` o `"Bozza Orario S2")` in base al semestre.
- `setFaviconUrl` al PNG del DF UniPi.
- `XFrameOptionsMode.ALLOWALL` per consentire embedding.

**`getOrarioData()`**

1. `detectAuleConfigFor_(ss)` → semestre.
2. Filtra sources, raccoglie codici LT/LM (per filtri PdS), itera righe.
3. Per ogni sessione (`extractSessions`): aggiunge in array `sessions`. Mutuanti attaccati via `buildMutuantiMap`.
4. Legge unavail da `AULE_OUTPUT`.
5. Legge ordine aule da `AULE_OUTPUT` col A (mantiene ordinamento utente).
6. Legge `PdS` sheet (curriculum → codici).
7. Ritorna JSON con: `semester, days, slot config, sheets, rooms ordinate, gruppi, titolari, codesLT, codesLM, pds, sessions, unavail, generatedAt`.

**Snapshot persistente**

Lo snapshot vive in `DocumentProperties` dello Spreadsheet (`PropertiesService.getDocumentProperties()`). Serializzato come stringa JSON e splittato in chunk per via dei limiti API:

- `orarioSnap:meta` — `{n: numero chunk, len: caratteri totali, ts: timestamp}`.
- `orarioSnap:0, orarioSnap:1, …` — chunk sequenziali del JSON.
- `PROP_CHUNK_SIZE = 4000` caratteri (sotto il limite byte 9 KB anche con UTF-8 a 2 byte per carattere accentato).
- Limite totale 500 KB per file.

Funzioni:

- `aggiornaWebApp()` — chiamata da menu: rigenera JSON via `getOrarioData()`, salva in `DocumentProperties` (`saveSnapshot_`), toast con conteggi sessioni / indisponibilità / KB.
- `clearSnapshot()` — utility eseguibile dall'editor per cancellare manualmente lo snapshot.
- `setSpreadsheetIdFromActive()` — utility per memorizzare l'ID dello Spreadsheet (necessario alla web app per aprire il file via `openById`).

---

## 5. Web App lato client (`index.html`)

### 5.1 Anatomia della pagina

- `<head>`: charset, base target, link favicon (PNG DF), title (impostato dinamicamente con semestre).
- CSS embedded: variabili `--bg/--panel/--border/--text/--muted/--accent`.
- Header sticky con due righe di filtri.
- Legenda con i nomi+colori dei fogli sorgente.
- Griglia 7 colonne (label orari + 6 giorni).
- Footer con timestamp generazione + counters.
- Tag `<script>`: `bootstrap = <?!= bootstrap ?>`; logica JS inline.

### 5.2 Layout della griglia

- `display: grid` con `grid-template-columns: 60px repeat(6, 1fr)`.
- Riga 1: header dei giorni (LUN..SAB).
- Riga 2: 7 contenitori, ognuno è un `.day-col` con `position: relative`, `height = totalMinutes * PX_PER_MIN` (`PX_PER_MIN=0.7`).
- Le sessioni sono `<div class="session">` assoluti, posizionati con `top = (start - slotStart) * PX_PER_MIN`, `height = (end - start) * PX_PER_MIN`.
- Etichette ora: una per ogni riga tratteggiata (ogni 60 min), centrata verticalmente sulla riga, testo grigio piccolo.

### 5.3 Filtri

| Filtro | Logica |
|---|---|
| Ricerca testo (`q`) | Tokenize con doppi apici per frasi quotate; binary parser `A` / `A B` / `A or B` / `A and B` (oltre il binario, ignora). Match case-insensitive su code+name+titolare. |
| PdS (`fPds`) | "Tutti i corsi" / "Tutta LT" / "Tutta LM" / una scelta per ogni curriculum del foglio PdS. Filtra per appartenenza dei codici al set scelto. |
| Foglio (`fSheet`) | Mostra solo sessioni del foglio sorgente selezionato. |
| Gruppo (`fGruppo`) | Match gerarchico bidirezionale: filtro "A" mostra A, A1, A2 (figli); filtro "A1" mostra A1 e A (genitore). Sessioni senza gruppo (lezioni per tutti) sempre incluse. |
| Anno (`fAnno`) | La cifra selezionata (1/2/3) deve essere contenuta nella stringa di col A (così "12" matcha sia 1 sia 2). |
| Aule/Labs | Bottoni toggle per ogni stanza, raggruppati in "Aule:" e "Labs:". Tasti Tutte/Nessuna globali. Ordine = quello del foglio AULE. |
| Reset | Ripristina tutti i filtri ai valori di default e ri-attiva tutte le aule. |

### 5.4 Layout overlap-aware

Sessioni sovrapposte nello stesso giorno vengono disposte in colonne (lane) come Google Calendar:

1. `relayoutVisible()` — chiamata a ogni `applyFilters`.
2. Per ogni giorno: prendi solo le sessioni visibili.
3. Sort per `start`, poi `end` discendente.
4. Cluster detection: gruppi di sessioni che si toccano (transitivamente).
5. Per ogni cluster: assegna a ogni sessione la prima lane libera. Aggiunge nuova lane se necessario.
6. `width` per sessione = `100% / lanesCount`; `left = lane * width`; `z-index = 10 + lane`.

Quando i filtri riducono le sovrapposizioni, le lane vengono ricalcolate: le sessioni rimaste si espandono fino a riempire la larghezza disponibile.

### 5.5 Cella sessione

Contenuto:

- **Riga 1**: codice [gruppo] (color del foglio sorgente, bold) + `[Periodo]` in grigio se presente.
- **Riga 2**: nome corso.
- **Riga 3 (meta)**: orario inizio-fine + room.
- **Riga 4 (meta, opz)**: titolare.
- **Riga 5 (meta)**: tipo + Gruppo X (o Gruppo: N/A).
- **Riga 6 (meta, opz)**: ↺ + lista mutuanti.

Hover (title): blocco strutturato con tutte le info (codice — nome / orario aula / Titolare / Tipo / Gruppo / Periodo / Mutuazione).

---

## 6. Mutuazioni

Una riga di un foglio LT/LM/… può "mutuare" da un'altra (cioè condividere lo stesso orario). Si compila col D ("Codice mutuato") con:

- Codice del corso padre, es. `0044B`.
- Opzionale: spazio o newline + `@CdS` per indicare il CdS del padre, es. `0044B @WNN`.

Comportamento:

- La riga mutuata **non produce occupazioni** in `S1AULE` / `S2AULE`.
- La riga mutuata **non genera sessioni** nella web app.
- Il corso padre (se presente nei nostri fogli) ottiene una riga "Mutuazione: …" nell'hover, con i child codes formattati come `CODE @CdS`.
- Mutuazioni a catena (X mutua Y, Y mutua Z): solo un livello, non risolto ricorsivamente.
- Codici padre che non esistono nei nostri fogli sono ignorati senza errore.

---

## 7. Indisponibilità (NON DISPONIBILE)

Un'aula può essere segnata come non disponibile in slot specifici. Procedura manuale in `S1AULE`/`S2AULE`:

1. Selezionare uno o più slot consecutivi nello stesso giorno per un'aula.
2. **Format → Merge cells** (orizzontale).
3. Scrivere `NON DISPONIBILE` (case-insensitive, qualsiasi cosa che inizi con "non disp" matcha).

Al successivo "Genera tabella aule":

- Lo script legge la lista di indisponibilità prima del wipe.
- Verifica conflitti vs corsi: se un corso prova a usare uno slot indisponibile → conflitto rosso, blocco esecuzione.
- Se nessun conflitto, il marker viene riapplicato con stile `#cccccc` / testo bianco / bordo.

---

## 8. Conflict detection

Lo script blocca la rigenerazione di `S1AULE` / `S2AULE` in questi casi:

- Stesso aula+giorno+slot 30min coperto da due corsi diversi con stesso periodo (o entrambi vuoti).
- Stesso aula+giorno+slot 30min coperto da un corso E uno slot NON DISPONIBILE.

Comportamento in caso di conflitto:

1. Le celle K..P (rectius L..Q) sorgenti coinvolte vengono colorate di rosso (`#f4cccc`).
2. Dialog modale con elenco testuale dei conflitti.
3. `S1AULE` / `S2AULE` non viene toccato.

Le evidenziazioni rosse vengono pulite all'inizio di ogni rerun successivo.

**Conflitti per periodo**: due righe stesso aula+slot ma con Periodo diversi non sono conflitti (coesistono in tempi diversi). Vengono rese come slot multi-entry in `S1AULE`.

---

## 9. Vincoli da PdS

Voce di menu **🎯 Assegna vincolo da PdS**. Logica:

- Lettura del foglio `PdS`: aggrega tutti i codici di col B (OBB set) e tutti i codici di col C..F (FOR set), uppercased, splittati su whitespace.
- Per ogni riga di ogni foglio S\*LM: se il codice è in OBB set → `OBB`; else se in FOR set → `FOR`; else → `OPZ`.
- Scrittura in col G (Vincolo).
- Toast finale con conteggio.

Il color background della col G è gestito separatamente (di solito da Conditional Formatting o smart chip / dropdown colorato dell'utente). Lo script popola solo il valore testuale.

---

## 10. Web Calendar (deploy + aggiornamento)

### 10.1 Cos'è

Una pagina HTML pubblica all'URL `/exec` con la griglia settimanale dell'orario, filtri client-side, layout overlap-aware. Mostra solo dati pubblicati (snapshot pre-calcolato), non legge live lo Spreadsheet.

### 10.2 Snapshot pre-calcolato

Il flusso:

1. Utente: 🕒 Orario → 📅 **Aggiorna Web Calendar**.
2. Lo script chiama `getOrarioData()`, serializza in JSON, splitta in chunk, salva in `DocumentProperties`.
3. Toast di conferma con conteggio.
4. Quando un visitatore apre `/exec`, `doGet` legge i chunk, ricompone il JSON, lo inietta nell'HTML come bootstrap iniziale.
5. Se snapshot manca → pagina "Snapshot non ancora pubblicato".

Vantaggi: zero latenza per i visitatori, controllo editoriale (le bozze nello Spreadsheet non appaiono finché non aggiorni).

### 10.3 Deploy

Il deploy della web app pubblica si gestisce in due modi:

**Da editor Apps Script**

1. Deploy → New deployment.
2. Type: Web app. Execute as: Me. Who has access: Anyone.
3. Click Deploy → URL `/exec`.
4. Per aggiornare: Deploy → Manage deployments → matita → Version: New version → Deploy. Stesso URL.

**Da clasp**

`clasp deploy -i <deploymentId> -d "BozzaOrario"` — aggiorna il deployment esistente alla versione HEAD corrente. Stesso URL `/exec`.

`clasp list-deployments` per ottenere il `deploymentId`.

In questo repo: `npm run deploy` chiama `scripts/deploy.js` che fa `clasp push` + `clasp deploy` leggendo gli ID da `config/local.json`.

---

## 11. Workflow operativo tipico

1. Modifica un foglio S\*LT/S\*LM (aggiungi corso, cambia aula, aggiungi mutuazione, ecc.).
2. Opzionale: 🕒 Orario → ✨ **Normalizza celle calendario** — uniforma formati orario+aula e applica title-case ai nomi corso.
3. Opzionale: 🕒 Orario → 🎯 **Assegna vincolo da PdS** — aggiorna col G del foglio LM in base al PdS.
4. 🕒 Orario → 🏛 **Genera tabella aule** — rigenera `S1AULE` / `S2AULE`, segnala conflitti.
5. Risolvi eventuali conflitti, ripeti finché clean.
6. 🕒 Orario → 📅 **Aggiorna Web Calendar** — pubblica snapshot.
7. Se hai modificato il codice (file `.gs` o `index.html`): `npm run deploy` per aggiornare l'URL pubblico.

---

## 12. Persistenza (DocumentProperties)

Tutto lo storage del progetto sta in `DocumentProperties` dello Spreadsheet:

- `spreadsheetId` — ID dello Spreadsheet, usato dalla web app via `openById`.
- `tableFormat` — JSON del formato tabella salvato (Salva formato tabella).
- `orarioSnap:meta` + `orarioSnap:0..N` — chunk dello snapshot web app.

Limiti: 9 KB per singolo valore, 500 KB per file. La chunkatura del JSON tiene sotto controllo il primo limite.

---

## 13. Riepilogo file sorgente

| File | Ruolo |
|---|---|
| `Config.gs` | Costanti colonne, helper (parseMutuazione, isWhiteOrEmpty, tipoLabel, detectAuleConfig). |
| `Menu.gs` | `onOpen()` costruisce il menu **🕒 Orario**. |
| `FixCalendar.gs` | Normalizzazione celle calendario + title-case nome corso. |
| `TabellaAule.gs` | Generazione `S1AULE` / `S2AULE` con merge, conflitti, indisponibilità, mutuanti. |
| `TableFormat.gs` | Snapshot/restore del formato colonne. |
| `Mutuazione.gs` | `buildMutuantiMap`, `formatMutuanti`. |
| `Vincoli.gs` | `assegnaVincoliDaPds` (popola col G dai codici in PdS). |
| `WebApp.gs` | `doGet`, `getOrarioData`, snapshot persistente, `aggiornaWebApp`. |
| `index.html` | Template HtmlService della web app pubblica con CSS+JS embedded. |
| `appsscript.json` | Manifest del progetto (timezone, runtime). |

---

## 14. Glossario degli acronimi

I sigle più frequenti nel codice e in questa documentazione, raggruppate.

### Strumenti / tecnologie

| Sigla | Significato esteso | Note |
|---|---|---|
| **npm** | (originariamente) Node Package Manager | Il gestore dei pacchetti di Node.js. Si installa insieme a Node.js. Legge `package.json` e scarica le librerie in `node_modules/`. |
| **Node.js** | (non è un acronimo) JavaScript runtime su V8 | Permette di eseguire JavaScript fuori dal browser. Necessario per far girare clasp e gli script in `scripts/`. |
| **clasp** | Command Line Apps Script | CLI ufficiale Google per Apps Script. Vedi §2. |
| **CLI** | Command Line Interface | Programma da terminale (in contrapposizione a GUI = Graphical UI). |
| **API** | Application Programming Interface | Insieme di funzioni esposte da un servizio. Es. "Spreadsheet API". |
| **OAuth** | Open Authorization | Standard di autorizzazione delegata. Lo usi quando dai a clasp il permesso di agire sui tuoi dati Google senza condividere la password. |
| **HTTP / HTTPS** | HyperText Transfer Protocol (Secure) | Protocollo del web. La web app è esposta via HTTPS. |
| **URL** | Uniform Resource Locator | L'indirizzo web (es. l'`/exec` della web app). |
| **JSON** | JavaScript Object Notation | Formato di scambio dati testuale. Usato per snapshot e config. |
| **HTML** | HyperText Markup Language | Linguaggio della pagina del Web Calendar. |
| **CSS** | Cascading Style Sheets | Foglio di stile della pagina HTML. |
| **JS** | JavaScript | Linguaggio dei file `.gs` (Apps Script V8) e dello script lato browser. |
| **DOM** | Document Object Model | Albero degli elementi HTML, manipolato da JS lato browser. |
| **SPA** | Single Page Application | Applicazione web in cui la navigazione cambia DOM senza ricaricare la pagina. |
| **RPC** | Remote Procedure Call | Invocare una funzione server da client (es. `google.script.run` da web app). |
| **TTL** | Time To Live | Durata massima di un dato cacheato (CacheService di Apps Script: 6 h). |
| **IDE** | Integrated Development Environment | Editor con debug/intellisense (VS Code). |

### Apps Script / Web App

| Sigla | Significato | Note |
|---|---|---|
| **HEAD** | (terminologia git/clasp) | Lo stato corrente del codice, non ancora versionato. Vedi `docs/deploy-webapp.md`. |
| **doGet / doPost** | (nomi funzione) | Funzioni Apps Script chiamate alle richieste HTTP GET/POST. |
| **`/exec`** | endpoint pubblico versioned | URL servito dal deployment numerato. |
| **`/dev`** | endpoint privato HEAD | URL legato a HEAD, solo proprietario. |

### Universitarie (specifiche del progetto)

| Sigla | Significato esteso |
|---|---|
| **CdS** | Corso di Studio |
| **LT** | Laurea Triennale |
| **LM** | Laurea Magistrale |
| **PdS** | Piano di Studio |
| **CFU** | Crediti Formativi Universitari |
| **SSD** | Settore Scientifico Disciplinare |
| **DF** | Dipartimento di Fisica (UniPi) |

### Tipi corso (col F nei fogli sorgente)

| Sigla | Significato |
|---|---|
| **LEZ** | Lezione |
| **ES** | Esercitazione |
| **LEZ/ES** | Lezione / Esercitazione (entrambe) |
| **LAB** | Laboratorio |

### Vincolo (col G nei fogli sorgente / colore in S1AULE)

| Sigla | Significato |
|---|---|
| **OBB** | Obbligatorio |
| **FOR** | Forchetta (gruppo di scelta tra più corsi) |
| **OPZ** | Opzionale (a libera scelta dello studente) |
| **OPT** | (col G del foglio PdS) Opzionali listati nel piano di studio |

### Giorni (header colonne K..P)

| Sigla | Significato |
|---|---|
| **LUN** | Lunedì |
| **MAR** | Martedì |
| **MER** | Mercoledì |
| **GIO** | Giovedì |
| **VEN** | Venerdì |
| **SAB** | Sabato |

### Altre sigle del codice

| Sigla | Significato |
|---|---|
| **N/A** | Not Applicable / Not Available — usato per "Gruppo: N/A" quando il corso è senza gruppo specifico. |
| **px** | pixel (unità CSS / larghezza colonne). |
| **min** | minuti (slot da 30 min). |
| **bg / fg** | background / foreground (colori). |
| **CDS / CdS** | Corso di Studio (variazione casing nei nomi dei tab e nei riferimenti). |
