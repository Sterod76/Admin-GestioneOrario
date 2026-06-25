# Orario CdS — Guida tecnica

Riferimento del progetto Apps Script "Orario". Tutto il sorgente è in `src/`.
Per operare (commit/deploy/target) vedi [`USO-RAPIDO.md`](USO-RAPIDO.md); per il
deploy in dettaglio [`deploy-webapp.md`](deploy-webapp.md).

## Architettura

Apps Script **container-bound** a uno Spreadsheet. Tre tipi di foglio:

- **Sorgente** (`S1LT`, `S1LM`, `S2LT`, …): lista corsi del semestre + orario settimanale.
- **Output** (`S1AULE`/`S2AULE`): tabella aule, **rigenerata** dallo script aggregando le sorgenti.
- **PdS**: piani di studio LM (curriculum × codici), per assegnare il vincolo OBB/FOR/OPZ.

Una **web app** (HtmlService) serve una vista filtrabile a partire da uno **snapshot JSON**
salvato in `DocumentProperties` (niente lettura live del foglio). Codice gestito con **clasp**.

## Spreadsheet

### Fogli sorgente `S{n}{cds}`

Header in riga 1, dati da riga 2.

| Col | Campo | Note |
|---|---|---|
| A | Anno | multi-cifra: "12" = anni 1 e 2 |
| C | Codice | es. `0044B` |
| D | Codice mutuato | vuoto, o `CODICE [@CdS]` → mutuazione |
| E | Nome | |
| F | Tipo | LEZ / LAB / ES / LEZ/ES |
| G | Vincolo | OBB / FOR / OPZ |
| H | Gruppo | A, A1, A2, … |
| I | CFU | |
| J | Docenti | 1° = titolare; co-docenti dopo. Separatori: a capo `/ ; ,` " e ". Case-insensitive. |
| K | SSD | |
| L–Q | LUN…SAB | celle `HH:MM-HH:MM` + `Aula X` (2 righe) |
| R | Periodo | etichetta libera (es. "Fino 31/10"); coesistenza nello stesso slot se periodi diversi |

### Foglio output `S{n}AULE`

Generato da "Genera tabella aule". Header `Aula | Giorno | 08:30 … 19:00 | Tot ore`,
una riga per (aula, giorno), slot da 30 min (08:30–19:30). **Col A** mergiata sui 6
day-row: riga 1 nome aula (bold), riga 2 **capienza** (numero), righe 3+ note libere.
Slot di lezione: cella mergiata, `CODICE [GRUPPO] Nome`, sfondo dal colore Vincolo,
font color dal tab del foglio sorgente (LT vs LM). `NON DISPONIBILE`: marker manuale
(cella mergiata, testo che inizia con "non disp"), preservato fra rigenerazioni.

### Foglio PdS

A = curriculum, B = OBB, C–F = FOR1..FOR4, G = OPT (ignorati nell'assegnazione).

## File `.gs`

| File | Ruolo |
|---|---|
| `Config.gs` | costanti colonne, `parseMutuazione`, `parseDocenti_`, `detectAuleConfig` (rileva semestre da quale `S*AULE` esiste) |
| `Menu.gs` | `onOpen()` → menu **🕒 Orario** |
| `FixCalendar.gs` | "Normalizza celle calendario": parse orario/aula + title-case nome corso |
| `TabellaAule.gs` | "Genera tabella aule": merge, conflitti, indisponibilità, mutuanti |
| `TableFormat.gs` | salva/ripristina formato colonne |
| `Mutuazione.gs` | `buildMutuantiMap`, `formatMutuanti` |
| `Vincoli.gs` | "Assegna vincolo da PdS" → col G dei fogli LM |
| `Coexam.gs` | lettura foglio `MATRICE` |
| `ImpegniEsterni.gs` | tabella `SERVIZIO` + fetch da University Planner |
| `Storage.gs` | Import/Export JSON dei fogli sorgente |
| `WebApp.gs` | `doGet`, `getOrarioData`, snapshot |
| `index.html` | client web app (UI/render/editing), CSS+JS inline |
| `appsscript.json` | manifest (vedi [`appsscript-manifest.md`](appsscript-manifest.md)) |

## Concetti chiave

- **Mutuazioni** (col D): una riga "mutuata" non produce occupazioni né sessioni; il
  corso padre eredita i figli (hover "Mutuazione: …"). Un solo livello, non ricorsivo.
  Le mutuazioni fungono anche da **classi di equivalenza** per i co-esami (E/N sommati).
- **Conflict detection** (Genera tabella aule): stesso aula+giorno+slot con due corsi
  (stesso periodo) o corso+NON DISPONIBILE → celle sorgente rosse + dialog + blocco.
- **Snapshot**: `getOrarioData()` serializza tutto in JSON, splittato in chunk
  (`orarioSnap:meta` + `orarioSnap:N`, ~4000 char/chunk) in `DocumentProperties`
  (limiti: 9 KB/valore, 500 KB/file). `doGet` lo ricompone e lo inietta in `index.html`
  via `<?!= bootstrap ?>`. "Vai al Web Calendar" rigenera lo snapshot.
- **Web app client**: griglia CSS `grid-template-columns: 60px repeat(6,1fr)`, sessioni
  in posizionamento assoluto (`PX_PER_MIN`), layout overlap-aware a lane (come Google
  Calendar), filtri client-side (ricerca, PdS, foglio, gruppo gerarchico, anno, aule).

## Glossario

CdS = Corso di Studio · LT = Triennale · LM = Magistrale · PdS = Piano di Studio ·
CFU = crediti · SSD = settore · OBB/FOR/OPZ = obbligo/forchetta/opzionale ·
HEAD = codice live (URL `/dev`) vs deployment versionato (URL `/exec`).
