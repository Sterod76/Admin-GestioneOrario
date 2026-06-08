# CSV sorgente — `FISICA_MONIT_CAR_TAB.csv` (export Esse3)

Specifiche del **CSV originale** da cui nasce la matrice co-esami. Scopo di questo
file: permettere a chiunque (umano o una nuova istanza di Claude) di **analizzare il
CSV sapendo già cosa aspettarsi**, senza doverlo reverse-engineerare.

> ⚠️ **Dati personali.** Il file contiene `COGNOME`, `NOME`, `COD_FIS` (codice
> fiscale), `GENERE`, residenza, scuola di provenienza, voti, ecc. **Non va
> committato** nel repo né condiviso: vive sul PC di chi gestisce i dati
> (`C:\Users\rodda\Downloads\FISICA_MONIT_CAR_TAB.csv`) e si ri-esporta da Esse3
> quando serve aggiornare la matrice.

## A colpo d'occhio

- **Cos'è**: export Esse3 di *monitoraggio carriere / esami* del corso di Fisica.
- **Grana**: **una riga = un esame sostenuto da uno studente**. Lo stesso studente
  compare su **più righe** (una per esame). Anagrafica e dati di carriera sono
  **ripetuti** identici su tutte le righe dello stesso studente.
- **Dimensioni** (snapshot giugno 2026): ~**51 200 righe**, ~**26 MB**, **52 colonne**.
- Copre AA di superamento dal **1984 al 2025** (la stragrande maggioranza è ≥ 2009).

## Formato del file

| Proprietà | Valore |
|---|---|
| Encoding | **Latin-1 / Windows-1252** (ISO-8859-1) — **non** UTF-8 |
| Separatore di campo | carattere **pipe** `\|` |
| Quoting | ogni campo tra **doppi apici** `"..."` |
| Riga di intestazione | **sì** (1ª riga = nomi colonna) |
| Fine riga | CRLF |

### Lettura in Python (snippet pronto)

```python
import csv
with open('FISICA_MONIT_CAR_TAB.csv', encoding='latin-1', newline='') as f:
    reader = csv.DictReader(f, delimiter='|')   # gestisce da solo gli apici
    for row in reader:
        matricola = row['MATRICOLA']
        aa_imm    = row['AA_IMM1']            # coorte (AA immatricolazione)
        livello   = row['TIPO_CORSO_COD']     # 'L2' = triennale (LT), 'LM' = magistrale
        cod_esame = row['COD']
        aa_sup    = row['AA_SUP_ID']          # AA di superamento ('9999999999' = n/d)
```

`csv.DictReader` rimuove automaticamente gli apici. **Non** usare `pandas.read_csv`
senza specificare `sep='|'`, `encoding='latin-1'`, `quotechar='"'`.

## I 3 campi chiave (estrazione tipica: matricola · coorte · LT/LM)

| Dato | Colonna | Note |
|---|---|---|
| **Matricola** | `MATRICOLA` | identifica lo studente; ripetuta su tutte le sue righe |
| **Anno di immatricolazione** | `AA_IMM1` | coorte; forma `2021` = AA 2021/22; range osservato **1979–2025** |
| **LT vs LM** | `TIPO_CORSO_COD` | **`L2`** = triennale (LT) · **`LM`** = magistrale. Descrizione in `TIPO_CORSO_DES` (`Corso di Laurea` / `Corso di Laurea Magistrale`) |

Valori reali osservati di `TIPO_CORSO_COD` (sono **solo due**):

```
L2 | Corso di Laurea            (triennale / LT)   ~35 500 righe
LM | Corso di Laurea Magistrale (magistrale / LM)  ~15 600 righe
```

**Per ottenere una riga per studente** (anagrafica di carriera) basta deduplicare
per `MATRICOLA`. Attenzione: un *matricola* può avere **sia** righe `L2` **sia**
righe `LM` (chi ha fatto triennale **e** magistrale a Pisa) → se serve il livello,
deduplicare per **`MATRICOLA` + `TIPO_CORSO_COD`** (o `+ CDS_COD`), non per sola
matricola.

## Tutte le 52 colonne

Ordine esatto nel file. (Le voci marcate *(inferito)* sono dedotte dal nome: il
significato preciso va confermato con chi esporta da Esse3.)

### Anagrafica studente
| # | Colonna | Significato |
|---|---|---|
| 1 | `STU_ID` | id interno studente (Esse3) |
| 2 | `MATRICOLA` | **matricola** (chiave studente lato utente) |
| 3 | `COGNOME` | cognome — *dato personale* |
| 4 | `NOME` | nome — *dato personale* |
| 5 | `COD_FIS` | codice fiscale — *dato personale* |
| 6 | `GENERE` | genere — *dato personale* |
| 7 | `PROV_RES_ATTUALE` | provincia di residenza attuale *(inferito)* |
| 8 | `COM_RES_ATTUALE` | comune di residenza attuale *(inferito)* |
| 9 | `RES_PREC_SIGLA` | sigla residenza precedente *(inferito)* |
| 10 | `RES_PREC_DES` | residenza precedente, descrizione *(inferito)* |
| 11 | `RES_PER_PREC` | residenza per periodo precedente *(inferito)* |

### Corso di studi (carriera)
| # | Colonna | Significato |
|---|---|---|
| 12 | `FACOLTA_DESC` | facoltà / dipartimento |
| 13 | `TIPO_CORSO_COD` | **livello**: `L2` (triennale) / `LM` (magistrale) |
| 14 | `TIPO_CORSO_DES` | descrizione del livello |
| 15 | `CDS_ID` | id interno del corso di studi |
| 16 | `CDS_COD` | **codice corso di studi** (es. fisica LT / LM) |
| 17 | `AA_IMM1` | **AA di immatricolazione** (coorte) |

> Accedere sempre **per nome** (`row['NOME_COLONNA']` con `DictReader`), non per
> indice numerico: gli indici qui sono solo indicativi dell'ordine nel file.

### Titolo di accesso (scuola superiore)
`TIPO_TITOLO_SUP_DESC`, `TIPO_TITOLO_STRA_DESC`, `SCUOLA_DESC`,
`COMUNE_SCUOLA_DESC`, `PROVINCIA_SCUOLA_SIGLA`, `VOTO_MATURITA`, `VOTO_MIN`,
`VOTO_MAX` — diploma e voto di maturità *(inferito)*.

### Stato studente
`STA_STU_COD`, `STATO_STU_DESC` (stato carriera: attivo / laureato / rinuncia…),
`MOT_STASTU_COD`, `MOTIVO_STATO_STU_DESC`, `AA_ARRIVO_CDS`, `AA_PARTENZA_CDS`
(AA di ingresso/uscita dal CdS, per trasferimenti) *(inferito)*.

### Laurea / titolo conseguito
`STU_ID_L`, `CDS_COD_L`, `CDS_DESC_L` (carriera di laurea collegata),
`VOTO_FINALE`, `LODE_FLG` (lode alla laurea), `ANNO_CT`, `DATA_CT` (anno/data
conseguimento titolo) *(inferito)*.

### Contesto AA / trasferimenti
`AA_ID`, `CDS_PROV_AN`, `CDS_ARR_AN` *(inferito)*.

### Esame sostenuto — il cuore della riga
| # | Colonna | Significato |
|---|---|---|
| 42 | `COD` | **codice insegnamento** (es. `302BB`, `0001B`) |
| 43 | `DES` | titolo dell'insegnamento (es. `FISICA DELLE PARTICELLE`) |
| 44 | `VOTO` | voto d'esame |
| 45 | `CREDITI` | CFU dell'esame |
| 46 | `DATA_SUP` | data di superamento |
| 47 | `AA_SUP_ID` | **AA di superamento** (id): forma `2024` = AA 2024/25 |

### Meta verbalizzazione
`RIC_ID`, `STA_SCE_COD`, `PRESIDENTE_COMMISSIONE`, `DATA_ESTR` (data estrazione
dell'export), `LODE_FLG_ESA` (lode all'esame) *(inferito)*.

## Valori e convenzioni utili

- **`AA_SUP_ID`** = AA di superamento. Forma `2024` = AA 2024/25. Esiste una
  **sentinella `9999999999`** (~944 righe) = esame **senza** AA di superamento
  valido (es. non ancora verbalizzato / placeholder) → **da escludere** nelle
  analisi. Range reale dei valori veri: 1984–2025 (volumi seri da ~2009 in poi).
- **`AA_IMM1`** = AA di immatricolazione, stessa codifica (`2021` = 2021/22).
- **`COD`** (codice insegnamento) — convenzione locale Fisica:
  - gli insegnamenti "moderni" terminano in **`B`** (es. `302BB`, `0001B`); è il
    formato che il tool matrice tiene di default (regex `^[0-9]+[A-Za-z]*B$`);
  - `125ZW` = **PROVA FINALE** (tesi) → scartata (non finisce in `B`);
  - suffissi `AA`/`CC`/`DD`/`EE`/`II` = altri insegnamenti (alcuni **opzionali LT**),
    inclusi solo se elencati a mano in `EXTRA_CODES` nel tool.
- **`CREDITI`** = CFU (numero). **`VOTO`** = voto d'esame (numerico; idoneità/lode
  codificate a parte).

## Come lo usano gli strumenti di questa cartella

- **`genera_matrice_esami_lm.py`** (tool attuale): legge **direttamente** il CSV
  completo. Usa `MATRICOLA`, `COD`, `AA_SUP_ID` e (per il filtro coorti opzionale)
  `AA_IMM1`. **Include TUTTE le carriere** (`L2` + `LM`): *non* filtra per
  `TIPO_CORSO_COD`. Finestra AA di superamento `AA_SUP_ID ∈ {2022, 2023, 2024}`.
- **`scripts/strip_exams.py`** (utility): estrae un sottoinsieme di 10 colonne
  (`MATRICOLA`, `AA_IMM1`, `CDS_COD`, `TIPO_CORSO_COD`, `AA_SUP_ID`, `DATA_SUP`,
  `COD`, `DES`, `VOTO`, `CREDITI`) in un CSV "stripped" UTF-8/comma per analisi più
  comode.

## Ricette rapide

```python
import csv

def rows(path='FISICA_MONIT_CAR_TAB.csv'):
    with open(path, encoding='latin-1', newline='') as f:
        yield from csv.DictReader(f, delimiter='|')

# 1) Una riga per studente con coorte e livello (matricola, AA_IMM1, LT/LM)
visti = {}
for r in rows():
    key = (r['MATRICOLA'], r['TIPO_CORSO_COD'])     # carriera = studente + livello
    if key not in visti:
        visti[key] = {
            'matricola': r['MATRICOLA'],
            'anno_imm':  r['AA_IMM1'],
            'livello':   'LT' if r['TIPO_CORSO_COD'] == 'L2' else 'LM',
        }

# 2) Esami validi (con AA di superamento reale)
for r in rows():
    if r['AA_SUP_ID'] == '9999999999':
        continue
    ...
```
