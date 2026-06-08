# Analisi carriere — dataset esami anonimizzato

Strumenti per ricavare dataset di **analisi** dalle carriere/esami Esse3, in forma
**anonimizzata** (senza dati personali identificativi).

## `genera_dataset_anon.py`

Genera un CSV con una riga per **esame**, con questi campi:

| Campo | Sorgente | Note |
|---|---|---|
| `id_studente` | `MATRICOLA` | **anonimizzata** (vedi sotto): stessa persona → stesso id |
| `anno_imm` | `AA_IMM1` | AA di immatricolazione (coorte) |
| `tipo` | `TIPO_CORSO_COD` | `LT` (era `L2`) / `LM` |
| `cod_esame` | `COD` | codice insegnamento |
| `titolo_esame` | `DES` | titolo insegnamento |
| `voto` | `VOTO` | voto d'esame |
| `data_sup` | `DATA_SUP` | data di superamento |
| `aa_sup` | `AA_SUP_ID` | AA di superamento (`9999999999` → vuoto) |

Sorgente = export Esse3 `FISICA_MONIT_CAR_TAB.csv`. **Specifiche complete del CSV
di partenza** (formato, encoding, tutte le colonne, valori): vedi
[`../matrice/CSV_SORGENTE.md`](../matrice/CSV_SORGENTE.md).

### Uso

```bash
python analisi/genera_dataset_anon.py                       # sorgente di default, tutte le righe
python analisi/genera_dataset_anon.py <csv_completo>        # sorgente esplicita
python analisi/genera_dataset_anon.py --solo-superati       # solo esami con AA di superamento valido
python analisi/genera_dataset_anon.py -o mio_dataset.csv    # output personalizzato
```

Output di default: `analisi/dataset_esami_anon.csv` (UTF-8, separatore virgola).

### Anonimizzazione

La **matricola non compare** nell'output. È sostituita da un id pseudonimo:

```
id_studente = 'S' + HMAC-SHA256(salt, matricola)[:12]
```

- **Stabile**: la stessa matricola dà sempre lo stesso `id_studente`, quindi le
  analisi **per studente** (es. esami sostenuti dalla stessa persona, co-esami)
  restano possibili.
- **Non reversibile senza il salt**: l'id è una funzione pseudocasuale con chiave
  segreta. Il salt (256 bit casuali) viene generato una volta e salvato in
  `analisi/.anon_salt` e riusato nei run successivi (id stabili nel tempo).
  Override: variabile d'ambiente `ANON_SALT` o `--salt=HEX`.

> ⚠️ **Privacy.** Il salt (`.anon_salt`) e il dataset prodotto **non vanno
> committati** né condivisi pubblicamente:
> - il **salt** è la chiave che permetterebbe di ricollegare gli id alle matricole;
> - il **dataset**, pur senza matricola, resta **pseudonimo** (un id stabile con
>   esami/voti/date può, combinato con altre fonti, riportare a una persona).
>
> Entrambi sono già in `.gitignore`. Per condividere con analisti esterni, valuta
> filtri aggiuntivi (es. rimuovere voto/data, aggregare le coorti piccole).
