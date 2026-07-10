# Manuale — Orario CdS (Fisica, UniPi)

Web app per costruire e revisionare l'**orario didattico**: calendario settimanale,
vista per aula, editing degli slot, **collisioni** (con costo basato sui co-esami),
**conflitti docente**, **capienza aule**, **matrice co-esami**.

> Gli screenshot sono generati con dati di esempio (`scripts/build_manual_screens.js`);
> l'interfaccia reale è identica.

## Indice
1. [Com'è fatto](#1-comè-fatto) · 2. [Gsheet sorgente](#2-gsheet-sorgente) ·
3. [Aprire / Carica / Salva / accessi](#3-aprire--carica--salva--accessi) ·
4. [I tab](#4-i-tab) · 5. [Capienza](#5-capienza) · 6. [Costo e matrice](#6-costo-e-matrice) ·
7. [Pipeline matrice](#7-pipeline-matrice) · 8. [Pubblicazione](#8-pubblicazione)

---

## 1. Com'è fatto

Apps Script **bound** al gsheet, esposto come **web app**. La pagina legge uno
**snapshot** (Script Properties, bucket LT/LM/PDS) → carica veloce. Le modifiche
grafiche (drag, resize, nuovo slot, "non disponibile") sono **locali** finché non premi
**Salva**, che scrive su `SxLT`/`SxLM` e rigenera `SxAULE`. Replicato su più installazioni
(`npm run deploy`, §8). Dettagli tecnici: [`docs/guida-tecnica-completa.md`](docs/guida-tecnica-completa.md).

## 2. Gsheet sorgente

Fogli `S1LT`, `S1LM`, `S2LT`, `S2LM` (semestre × LT/LM). Colonne principali:

| Col | Campo |
|---|---|
| C | Codice · D | Codice mutuato (valorizzato → mutuazione) · E | Insegnamento · F | Tipo · G | Vincolo OBB/FOR/OPZ |
| H | Gruppo (A, A1…; per la LT **`A+B`** o `AB` = comune a entrambi i canali. In LT il vuoto/N.A. **non esiste**: viene mostrato ovunque come `A+B`) · **J** | **Docenti** (1° = titolare; separatori a capo `/ ; ,` " e ") · K | SSD |
| L–Q | LUN…SAB (`Aula · HH:MM-HH:MM`) · R | Periodo · **S** | **Note e Richieste** (mostrata in Consultazione) |

Menu **🛠️ Gestione tabelle → 👤 Normalizza docenti** ripulisce la col J (*Cognome N.*,
iniziali puntate, maiuscola dopo l'apostrofo).

- **`SxAULE`**: rigenerato al salvataggio; nella cella aula la **2ª riga = capienza**.
- **`MATRICE`**: **sola lettura** (IMPORTRANGE dal gsheet fisso, §6–7). Non scriverci.

## 3. Aprire / Carica / Salva / accessi

URL `/exec` (§8). In alto: titolo *Bozza - <nome gsheet>*, **Cerca**, filtri livello/anno/gruppo, selettori **Aule/Labs**.

- **📥 Carica dal gsheet** — rilegge il foglio (usalo dopo modifiche manuali).
- **📤 Salva sul gsheet** — scrive le modifiche pendenti + rigenera `SxAULE`.
- **🅿️ Parking** / **Log modifiche** (a destra) — appoggio slot / elenco modifiche pendenti.

**EDIT / VIEW e lock.** Il **Ruolo** (Consultazione / Revisore / Editore) è in alto a
destra. Gli editor partono in **VIEW**; **EDIT** acquisisce un **lock** (un solo editor
per volta, scadenza 24 h auto-rinnovata). Uscendo da EDIT con modifiche non salvate →
conferma. Se il lock ti viene tolto, il Salva è rifiutato (ricarica e riapplica). Sblocco
forzato: menu **🕒 Orario → 🔓 Sconnetti editor**.

**👁 Vedi come** (solo editor, selettore in alto a destra): anteprima della UI come la
vedono **Revisore** o **Consultazione** (tab, barra Aule/Labs e tabelle cambiano di
conseguenza; l'editing è disattivato). **Vista normale** ripristina la vista editor.

**Livelli (foglio CONFIG)**: `WebEditors` (tutto) · `WebAuditors`/`WebRevisori`/`WebReviewers`
(tutti i tab, sola lettura) · chiunque altro = **Consultazione**: vede **Calendario** + due
**tabelle semplificate** (`LT` e `LM`) — una riga per codice/gruppo, colonne Lun–Ven con
orario e aula, poi **Docenti** e **Note e Richieste** (dalla col S). Niente tab Slot né barra Aule/Labs.

**Visibilità** (menu **👁️**): *Pubblicato* (default) / *In redazione* (gli utenti generici
vedono "Calendario in fase di redazione"; editor/revisori lavorano comunque).

**Feedback** (menu **💬**): se *Attivo*, compare il tasto **💬 Feedback** (per tutti) che
scrive sul foglio `FEEDBACK` (A Timestamp · B email · C Feedback · D Risposta · E Stato ·
F Commenti, riservata admin). Chiuso automaticamente se la visibilità è *In redazione*.

![Revisore](docs/img/11-auditor.png) ![Consultazione](docs/img/12-public.png)

## 4. I tab

### Calendario
Griglia LUN–SAB coi blocchi-sessione (codice, titolo, aula, gruppo). Docenti/tipo nel
**tooltip**. Clic su un'aula in alto → solo quell'aula.
![Calendario](docs/img/01-calendario.png)

### Aule
Stessa settimana **per aula** (una colonna per aula), incluse le zone **NON DISPONIBILE**.
In EDIT: drag/resize. Nei blocchi piccoli, titolo con "/" → si mostra la parte prima della "/".
![Aule](docs/img/02-aule.png)

### Slot
Vista **per giorno**, una colonna per aula con la **capienza** nel sottotitolo. Editing
fine: **+ Nuovo slot**, **Cestino**, Aule/Labs, espandi. Slot oltre **80% capienza** → **⚠**
(§5).

**📄 Save view as PDF** (in alto, per tutti): salva la vista corrente in **A4**
(Calendario/Aule/Slot e le tabelle **S\*LT/S\*LM** orizzontali — queste ultime con tutte le
colonne in larghezza e tutte le righe su più pagine; gli altri tab verticali), intestazione *Bozza - <gsheet> ·
vista · filtri* a sx e *PDF generated on GG/MM/AAAA* a dx. Stampa solo il contenuto (niente
toolbar/Log/Parking né evidenziazioni), zoom automatico. Calendario: tutti i giorni + ore a
sx; Slot: **tutti i giorni LUN–SAB, uno per pagina**, ognuno con banda Aule + banda Labs.
**Calendario con ricerca vuota** → un calendario per
pagina (LT anni 1/2/3 + ogni PdS); con ricerca attiva → solo quella vista.

**Selezione / drag.** Selezionando uno slot (anche in VIEW) il pannello in basso mostra
codice, ore/settimana, CFU, collisioni e capienza; nella colonna «Ora» compaiono le
**lineette di collisione** del docente (**rossa** = a Fisica, **viola** = servizio), i
**pallini co-esame** sugli slot in collisione e i cerchi sugli slot sorgente. Hover su una
lineetta → chi/quale evento. Sotto, «Impegni dei docenti coinvolti» elenca tutti gli
impegni settimanali (interni + servizio). Durante il **drag** gli stessi overlay sono live,
più un **riquadro grigio** (dove atterra) e un **rettangolo costo** (costo + differenziale
±). I pallini: **rosso** OBB-OBB, **mezzo rosso/giallo** OBB-FOR, **giallo** FOR-FOR, verdi
per gli opzionali; numero = `N` co-esami (grigio se 0). **LT**: tra **obblighi** pallino
rosso **senza numero** (stesso anno, gruppi compatibili); le coppie con una **forchetta/
opzionale** sono invece **valorizzate** (pallino col tipo + `N`), con l'**anno ignorato**
(tutti al terzo).

**Impegni di servizio** (lineette viola): dalla Tabella nativa **`SERVIZIO`**. Menu
**🛠️ Gestione tabelle → 🌐 Prepara tabella SERVIZIO** la crea; **🛰️ Recupera SERVIZIO da
UP** la popola da University Planner (basta la colonna **Matricola**; chiede l'AA: S1=ottobre,
S2=aprile AA+1). Match docente per **cognome + iniziale**. Poi **Carica/Pubblica**.
> ⚠️ **Matricole con zeri iniziali**: incolla i dati **dopo** aver creato la tabella (colonna
> già formattata come testo).
> ⚠️ **Autorizzazione**: SERVIZIO usa lo scope `spreadsheets` pieno + richieste esterne →
> dopo `npm run deploy` ogni installazione va **ri-autorizzata** una volta (apri il gsheet o
> la web app da loggato e passa la schermata di consenso), altrimenti `/exec` dà errore.

![Slot drag](docs/img/14-slot-drag.png) ![Slot](docs/img/03-slot.png)

### Collisioni
Report (sola lettura) delle sovrapposizioni con la **funzione di costo** in cima (Σ
`ore × N`/settimana). Gli **obblighi–obblighi** sono sempre a lista; toggle in alto:
**📋 solo liste** o **▦ matrice forchette** (default: obblighi a lista + matrici
OBB–FOR e FOR–FOR + matrice OPZIONALI–TUTTI).

- **Lista**: per Piano di Studi; ogni riga giorno/orario, cella costo (`ore × N`, rosso se
  N≥5), i due insegnamenti (chip rosso=OBB, giallo=FOR). Hover sulla cella costo → spostamenti utili.
- **Matrice**: codice × codice, valori = costo totale `N × ore`, heatmap (rosso se N≥5),
  solo costi > 0. Clic su una cella → varianti a destra. Le sezioni sono **additive** (ogni
  collisione una sola sezione, precedenza OBB-OBB › OBB-FOR › FF) e tornano col totale del banner.
- **OPZIONALI–TUTTI**: non valorizzata (solo presenza `●`); badge/colonna verde = quante
  collisioni ha ogni opzionale.

> **`n/d`** = uno dei due codici non è nel foglio `MATRICE` (escluso dai filtri o senza
> storico). Rimedio: aggiungerlo a `EXTRA_CODES` e rigenerare.

![Collisioni lista](docs/img/04-collisioni.png) ![Collisioni matrice](docs/img/09-collisioni-matrice.png) ![Collisioni opzionali](docs/img/13-collisioni-opzionali.png)

### Docenti
**Collisioni docente**: stesso docente (titolare o co-docente) in slot sovrapposti
(escluse le collisioni fra slot dello stesso codice). Seconda sezione **«Servizio — corsi
fuori dipartimento»**: corso interno ✕ impegno di servizio sovrapposto (tag ⚠ servizio).
![Docenti](docs/img/05-obiquita.png)

### Co-esami LM / LT
Matrice codici: **diagonale = E** (esami sostenuti, 3 AA), **fuori diagonale = N**
(studenti con entrambi). Heatmap da soglia *"colore da N ≥"* (default 2). Hover su un
codice → dettagli corso. Clic su cella/codice → pannello a destra. Solo in **LM**: pannello
**«Piani di studio attivi»** (checkbox per PdS; deselezionando, gli esami non più citati si
spengono in grigio). **LT** = solo opzionali (OPZ), header verdi.
> Il foglio `MATRICE` è letto **per intero** (tutti i codici/coppie); i tab mostrano solo
> il sottoinsieme LM OBB/FOR o LT OPZ, ma E/N completi alimentano i costi.

![Co-esami LM](docs/img/06-coesami.png) ![Co-esami LT](docs/img/10-coesami-lt.png)

### S1LT / S1LM (specchio)
Una **card per codice** (codice/titolo/docenti/CFU/SSD, righe TIPO/Vincolo/Gruppo coi badge
orari, totale ore, ore/CFU colorato). Ordina per Codice o Ore/CFU; la ricerca filtra.
![Specchio LM](docs/img/08-mirror-lm.png)

## 5. Capienza

```
studenti stimati (min.) = E ÷ n.gruppi   (1 senza gruppo · 2 con "A" · 4 con "A1")
sovraffollamento = studenti > 80% capienza
```
`E` = **esami/anno** (diagonale matrice). Gli "studenti stimati" sono una **stima
minima**: gli esami superati/anno **sottostimano** i frequentanti reali (chi non supera, o
supera in anni successivi), **soprattutto in LT**. Capienza = 2° campo della cella aula in
`SxAULE`. Slot sovraffollati: bordo rosso + ⚠ nel tab Slot; selezionandolo vedi *studenti
stimati ~N (E esami/anno ÷ gruppi) su posti = %*.

## 6. Costo e matrice

```
costo = ore_sovrapposte/settimana × N        N = studenti con entrambi gli esami
```
Coppia assente → 0; codice non in matrice → `n/d`. La web app conserva l'**intero** dataset
`MATRICE` (tutti i codici, LT inclusi).

**Classi di equivalenza.** Più codici che sono lo stesso esame (short/long, LT↔LM, rinomini)
vengono **fusi**: `E` ed `N` **sommate su tutta la classe**, niente collisione fra membri, e i
codici restano mostrati **come sono** (codice del PdS). Due sorgenti, unite:
- le **mutuazioni** (col D "Codice mutuato");
- il foglio **`CORRISPONDENZE`** (import del CSV `equivalenze_codici`: una riga per classe,
  `TITOLO` + codici). Foglio assente → solo mutuazioni.

## 7. Pipeline matrice

La matrice si **genera** dal dump Esse3 (non si compila a mano), col notebook
`matrice/coesami_periodo.ipynb` (scarica da resapp, in memoria):

```
dump Esse3 (resapp) → matrice/coesami_periodo.ipynb → MatriceCoesami_<periodo>.csv
   → incolla nel gsheet FISSO → =IMPORTRANGE → foglio "MATRICE" → Web App
```
Dettagli (periodo, dedup spacchettamenti, equivalenze): [`matrice/README.md`](matrice/README.md).
Dopo l'aggiornamento: autorizza l'IMPORTRANGE (una volta per gsheet) e fai **Carica/Pubblica**.

## 8. Pubblicazione

- **`npm run push`** → solo `@HEAD` (`/dev`), non tocca il pubblico.
- **`npm run deploy`** → push + nuova versione → la URL `/exec` (utenti) ha il codice nuovo. **Usa questo.**

Da VS Code: task pronti (verifica, deploy, commit, target). Guida operativa completa:
[`docs/USO-RAPIDO.md`](docs/USO-RAPIDO.md). Backup dei fogli: menu **🔁 Import / Export**.

Menu **📅 Vai al Web Calendar** = rigenera lo snapshot (dopo modifiche manuali al foglio).

---

> **Manutenzione**: quando una modifica cambia uso o aspetto, aggiornare questo file (e gli
> screenshot in `docs/img/` con `node scripts/build_manual_screens.js` se l'interfaccia cambia).
