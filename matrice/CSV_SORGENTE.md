# CSV sorgente — `FISICA_MONIT_CAR_TAB.csv` (export Esse3)

Specifiche del CSV da cui nasce la matrice co-esami.

> ⚠️ **Dati personali** (cognome, nome, codice fiscale, residenza, voti…): **non
> committare**. Vive in locale (`…\Downloads\FISICA_MONIT_CAR_TAB.csv`), si ri-esporta
> da Esse3 quando serve.

## A colpo d'occhio

- Export Esse3 *monitoraggio carriere/esami* di Fisica. **Una riga = un esame**; lo
  stesso studente compare su più righe (anagrafica ripetuta).
- ~51 200 righe, ~26 MB, **52 colonne**. AA superamento 1984–2025 (volumi seri da ~2009).

## Formato

| | |
|---|---|
| Encoding | **Latin-1 / Windows-1252** (non UTF-8) |
| Separatore | pipe `\|` |
| Quoting | doppi apici |
| Header | sì (riga 1) · Fine riga CRLF |

```python
import csv
with open('FISICA_MONIT_CAR_TAB.csv', encoding='latin-1', newline='') as f:
    for row in csv.DictReader(f, delimiter='|'):   # gestisce gli apici da solo
        row['MATRICOLA']; row['AA_IMM1']; row['TIPO_CORSO_COD']; row['COD']; row['AA_SUP_ID']
```
Accedi **per nome colonna**, non per indice. Con pandas: specifica `sep='|'`, `encoding='latin-1'`.

## Colonne chiave

| Dato | Colonna | Note |
|---|---|---|
| Studente | `MATRICOLA` | ripetuta su tutte le sue righe |
| Coorte | `AA_IMM1` | `2021` = AA 2021/22 |
| Livello | `TIPO_CORSO_COD` | **`L2`** = triennale (LT) · **`LM`** = magistrale (solo questi due valori) |
| Codice esame | `COD` | es. `302BB`, `0001B` |
| Titolo | `DES` | |
| AA superamento | `AA_SUP_ID` | `2024` = AA 2024/25; **`9999999999`** = n/d → escludere |
| Voto / CFU | `VOTO` / `CREDITI` | |

Le altre 52 colonne: anagrafica (`COGNOME`, `NOME`, `COD_FIS`, residenza), carriera
(`FACOLTA_DESC`, `CDS_COD`), titolo di accesso (scuola, voto maturità), stato studente,
laurea (`VOTO_FINALE`, `LODE_FLG`), meta verbalizzazione. Accedi per nome quando servono.

## Convenzioni

- Una matricola può avere righe **sia L2 sia LM** → per il livello deduplica per
  `MATRICOLA` + `TIPO_CORSO_COD`, non per sola matricola.
- `COD`: i corsi moderni terminano in **`B`** (regex tool `^[0-9]+[A-Za-z]*B$`);
  `125ZW` = PROVA FINALE (scartata); suffissi `AA/CC/DD/EE/II` inclusi solo se in `EXTRA_CODES`.
- Il tool `genera_matrice_esami_lm.py` legge **direttamente** questo CSV, tutte le
  carriere (L2+LM), finestra `AA_SUP_ID ∈ {2022,2023,2024}`.
