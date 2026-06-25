# Matrice co-esami (LM + LT)

Costruisce/aggiorna la **matrice co-esami** usata dalla Web App per stimare il costo
delle sovrapposizioni d'orario.

## Cosa misura

Per ogni coppia di insegnamenti, **quanti studenti li sostengono entrambi**. Due
grandezze, **somme intere** sugli AA **2022/23–2024/25**:

- **E** (diagonale): studenti distinti che **superano** quell'esame nei 3 AA.
- **N** (fuori diagonale): studenti che superano **entrambi** nello **stesso AA**, sommato sui 3 AA.

Nella Web App: `costo = ore_sovrapposte/settimana × N`. Coppia assente → costo 0;
codice non in matrice → `n/d`.

## Sorgente

Export Esse3 **`FISICA_MONIT_CAR_TAB.csv`** (pipe-delimited, Latin-1, una riga per
esame). Sta solo in locale (dati personali, **non** committare). Colonne usate:
`MATRICOLA`, `COD`, `AA_SUP_ID`, `AA_IMM1`. Specifiche complete: [`CSV_SORGENTE.md`](CSV_SORGENTE.md).

Filtri del tool: AA superamento ∈ {2022,2023,2024}; **coorti** opzionali (`AA_IMM1`);
codici che **terminano in B** + eccezioni in `EXTRA_CODES`; **tutte** le carriere (L2+LM).

## Classi di equivalenza

Lo stesso insegnamento cambia codice negli anni (rinomini, IT/EN, long/short `S`,
varianti `A`). Se non si uniscono, E ed N si spezzano fra le varianti e il codice
attuale risulta vuoto. `equiv_classes.json` mappa `aliases` → `canonical` (codice
attuale del PdS); `genera_matrice_esami_lm.py` rimappa al canonico **prima** di contare.

> Le **mutuazioni** LT↔LM (es. `0024B`↔`289BB`) **non** vanno qui: le gestisce l'Orario.

`build_equiv_classes.py` rigenera i **candidati** (`equiv_classes_candidates.json`,
gitignored) raggruppando per titolo → **vanno rivisti a mano**.

## Tool

```bash
python matrice/genera_matrice_esami_lm.py [csv] [--coorti=2021,2022]   # → MatriceEsamiLM.csv
python matrice/build_equiv_classes.py                                   # → candidati (da curare)
```

Output `MatriceEsamiLM.csv`: matrice quadrata, riga1/colA = codici ordinati per E
decrescente, diagonale = E, sopra-diagonale = N, celle vuote = 0. Conteggi **interi**
(no medie/decimali → niente problemi di locale all'import in Sheets). Flag in cima allo
script: `flag_dividiAA` (media annua), `flag_round` (arrotonda); default entrambi off.

## Flusso di aggiornamento

```
FISICA_MONIT_CAR_TAB.csv → genera_matrice_esami_lm.py → MatriceEsamiLM.csv
   → incolla nel gsheet FISSO della matrice → =IMPORTRANGE → foglio "MATRICE" → Web App
```

- l'`IMPORTRANGE` va autorizzato una volta per gsheet;
- dopo l'aggiornamento → **Carica/Pubblica** nell'orario;
- il foglio `MATRICE` è **sola lettura** (IMPORTRANGE): non scriverci a mano.

## File

| File | Cosa |
|---|---|
| `genera_matrice_esami_lm.py` | genera la matrice (applica le classi di equivalenza) |
| `equiv_classes.json` | classi curate alias → canonico |
| `build_equiv_classes.py` | rigenera i candidati (da rivedere) |
| `MatriceEsamiLM.csv` | output (committato: è il dato importato) |
| `CSV_SORGENTE.md` | specifiche del CSV Esse3 |
