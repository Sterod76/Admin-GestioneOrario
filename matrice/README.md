# Matrice co-esami

Costruisce la **matrice co-esami** usata dalla Web App per stimare il costo delle
sovrapposizioni d'orario. `costo = ore_sovrapposte/settimana × N`.

## Cosa misura

Per ogni coppia di insegnamenti, **quante carriere** li hanno sostenuti entrambi.
L'unità è la **carriera = (matricola, CdS)**: una coppia si forma **solo** se la stessa
matricola ha superato i due esami **nello stesso corso di studio** (entrambi LT o
entrambi LM). Poi tutto in **un'unica matrice** (LT e LM insieme).

- **E** (diagonale): carriere che hanno superato il codice; **N** (fuori diagonale):
  carriere che hanno superato **entrambi**.
- **Normalizzati per anno**: i conteggi sono divisi per la **durata del periodo in anni**
  e **arrotondati all'intero** → tassi annui interi, confrontabili a prescindere dalla
  lunghezza del periodo (le celle che arrotondano a 0 restano vuote).

## Strumento: `coesami_periodo.ipynb`

Notebook unico. Scarica il dump Esse3 **direttamente da resapp** (HTTP Basic,
credenziali chieste a runtime, **tutto in memoria** — il dump non tocca mai il disco) e
salva **solo** la matrice.

1. Parametri: periodo `START`/`END` in **YYMMDD** (filtra per `DATA_SUP`).
2. **Dedup spacchettamenti**: stessa matricola, **stesso giorno**, un codice prefisso di
   un altro (es. `204BB` e `204BB_`) → tiene **solo il più corto**.
3. Costruisce la matrice (coppie solo entro la stessa carriera) e salva
   `MatriceCoesami_<START>_<END>.csv` (gitignored: è un output rigenerabile).

> Endpoint: `https://resapp.adm.unipi.it/powerbi_ext/fisica/FISICA_MONIT_CAR_TAB.csv`.
> Specifiche del CSV sorgente: [`CSV_SORGENTE.md`](CSV_SORGENTE.md).

## Equivalenze fra codici

Lo stesso insegnamento cambia codice negli anni (rinomini, IT/EN, short/long,
mutuazioni). Le classi di equivalenza sono in **[`equivalenze_codici.csv`](equivalenze_codici.csv)**
(75 classi, `TITOLO` + codici, una classe per riga; importabile in gsheet). I codici di una
classe vanno trattati come **uno solo**.

> ℹ️ **Le equivalenze NON si applicano qui**: la matrice esce coi **codici grezzi**. Il
> collapse dei codici equivalenti avviene **nella web app dell'orario** (come già per le
> mutuazioni, via `canon()`/`data.equiv`), che ingerisce le classi di `equivalenze_codici`.

## Flusso

```
dump Esse3 (resapp, in memoria)
   → coesami_periodo.ipynb → MatriceCoesami_<periodo>.csv
   → incolla nel gsheet FISSO della matrice → =IMPORTRANGE → foglio "MATRICE" → Web App
```

- l'`IMPORTRANGE` va autorizzato una volta per gsheet;
- dopo l'aggiornamento → **Carica/Pubblica** nell'orario;
- il foglio `MATRICE` è **sola lettura** (IMPORTRANGE): non scriverci a mano.

## File

| File | Cosa |
|---|---|
| `coesami_periodo.ipynb` | genera la matrice dal dump (periodo, dedup spacchettamenti) |
| `equivalenze_codici.csv` | classi di codici equivalenti (`TITOLO` + codici; applicate nella web app) |
| `CSV_SORGENTE.md` | specifiche del dump Esse3 |
