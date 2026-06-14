# Matrice co-esami (LM)

Questa cartella contiene il necessario per costruire e aggiornare la **matrice
co-esami della Magistrale**, usata dalla Web App dell'orario per stimare il
"costo" delle sovrapposizioni d'orario fra insegnamenti.

## Cosa rappresenta

Per ogni coppia di insegnamenti LM misuriamo **quanti studenti li sostengono
entrambi**: se due corsi molto "condivisi" finiscono in sovrapposizione oraria,
il danno è grande; se non li segue quasi nessuno in comune, è trascurabile.

Due grandezze, entrambe **somme** sugli AA **2022/23, 2023/24, 2024/25** (conteggi
totali sui 3 anni, senza media né arrotondamento):

- **E** — per ogni codice: numero **totale** di studenti distinti che **superano**
  quell'esame nei 3 AA. (Sta sulla **diagonale** della matrice.)
- **N (studenti in comune)** — per ogni coppia di codici: numero **totale** di
  studenti che superano **entrambi** nello **stesso AA**, sommato sui 3 AA. (Sta
  **fuori diagonale**.)

Nella Web App (tab **📊 Co-esami LM** e tab **💥 Collisioni**):

```
costo collisione = ore_sovrapposte_a_settimana × N      [ore·studente/settimana]
```

- coppia **assente** in matrice fra due codici presenti → **0 studenti in comune
  osservati** → **costo 0** (nessuna stima);
- codice **non presente** in matrice → **n/d** (contribuisce 0 al totale).

## Dati di partenza

Export Esse3 **`FISICA_MONIT_CAR_TAB.csv`** (carriere/esami completo,
pipe-delimited, Latin-1, una riga per esame sostenuto). Sta sul PC di chi gestisce
i dati e si ri-esporta quando serve aggiornare la matrice. Colonne usate dal tool:
`MATRICOLA`, `COD`, `AA_SUP_ID` (+ `AA_IMM1` per il filtro coorti).

> 📄 **Specifiche complete del CSV sorgente** — formato, encoding, tutte le 52
> colonne, valori reali (es. `TIPO_CORSO_COD` = `L2` triennale / `LM` magistrale) e
> snippet Python di lettura: **[`CSV_SORGENTE.md`](CSV_SORGENTE.md)**. Contiene dati
> personali → **non committarlo**, tenerlo solo in locale.

Filtri applicati dal tool:
- **solo** AA di superamento **2022, 2023, 2024** (= 2022/23 … 2024/25);
- **coorti** opzionali (`AA_IMM1` = AA di immatricolazione): se imposti la
  costante `COORTI` in cima allo script o passi `--coorti=2021,2022`, vengono
  considerati **solo** gli studenti di quelle coorti; vuoto = tutte le coorti;
- codici che **terminano in B** (es. `0001B`, `042BB`), su **tutte le carriere**
  (triennale `L2` + magistrale `LM`: il dataset è completo, *non* ristretto alla
  LM); scartati gli altri (`.`, `_`, suffissi che non finiscono per B, `PROVA
  FINALE`, voci anomale);
- **eccezioni** in `EXTRA_CODES` (es. `244CC`, codici LT opzionali): ammesse
  **anche** se non terminano in B — scavalcano il vincolo di formato del codice.
  Per aggiungerne altre, modifica l'insieme `EXTRA_CODES` in cima allo script.

I codici nella matrice (riga 1 / colonna A) sono ordinati per **E decrescente**
(più esami in alto a sinistra). Gli studenti "stessi" sono identificati dalla
**matricola**.

## Classi di equivalenza (perché la matrice non sia "sguarnita")

Lo stesso insegnamento, negli anni, **cambia codice** (rinomini, alternative IT/EN,
versioni *long/short* con suffisso `S`, varianti `A`). Esempi reali: *Astrofisica
Generale* è stata `288BB` e `368BB`; *Fisica Medica* `381BB` poi `205BB`;
*Astroparticelle* `063BB`/`192BB`; *Cosmologia* `274BB`/`275BB`. Se **non** li
unifichi, i conteggi E ed N si **spezzano fra le varianti** e il codice attuale del
PdS risulta quasi vuoto (matrice "sguarnita"): es. `205BB` aveva **0** co-esami
perché i dati erano sotto `381BB`.

`matrice/equiv_classes.json` elenca queste classi (`canonical` = codice **attuale**
del PdS, `aliases` = codici-variante). `genera_matrice_esami_lm.py` rimappa ogni
esame al canonico **prima** di contare → il codice attuale porta lo **storico
completo**. (Le **mutuazioni** LT↔LM, es. `0024B`↔`289BB`, restano gestite a valle
dall'Orario e **non** vanno qui.)

Le classi coprono **sia la Magistrale sia la Triennale** (LT): in tutto **56 classi**
(es. `248BB`←`030BB` *Fisica 3*, `258BB`←`036BB,283BB` *Meccanica Quantistica*,
`175BB`←`038BB` *Metodi Matematici 2*). Sono **esclusi** per scelta conservativa i
codici **esteri/Erasmus** (`CATANIA 11`, `BARCEL. 2`, `BELFAST 2`, `LEUVEN 2`), i
**placeholder** di integrazione (`AD_INT`) e codici anomali (`22065`, `ZW899`).

`build_equiv_classes.py` rigenera i **candidati** dal CSV (raggruppa i codici con lo
stesso titolo normalizzato; canonico suggerito = codice con l'AA di superamento più
recente). Va **rivisto a mano**: alcuni casi (due codici entrambi ancora attivi) li
decide la persona.

```bash
python matrice/build_equiv_classes.py            # -> equiv_classes_candidates.json (da rivedere)
# poi cura matrice/equiv_classes.json e rilancia genera_matrice_esami_lm.py
```

## Il tool

`genera_matrice_esami_lm.py` — fa tutto in un passaggio (strip + filtri +
calcolo) e produce `MatriceEsamiLM.csv`.

```bash
python matrice/genera_matrice_esami_lm.py                      # path di default, tutte le coorti
python matrice/genera_matrice_esami_lm.py <csv_completo>       # path esplicito
python matrice/genera_matrice_esami_lm.py --coorti=2021,2022   # solo coorti 2021/22 e 2022/23
```

### Output: `MatriceEsamiLM.csv` (matrice quadrata)

- `A1` = etichetta `COEX` (ignorata);
- **riga 1** e **colonna A** = elenco codici LM, ordinati per **E decrescente**
  (il più "frequente" in alto a sinistra);
- **diagonale** = E (totale studenti sui 3 AA); **fuori diagonale** (triangolo superiore) = N;
- celle vuote fuori diagonale = 0 studenti in comune.

I valori E ed N sono **somme intere** sui 3 AA (niente media né arrotondamento):
così all'import in Google Sheets non ci sono ambiguità di locale (niente decimali
col punto interpretati come testo/date).

### Flag (in cima allo script)

- `flag_dividiAA = True` → divide E ed N per il **numero di AA usati** (`len(YEARS)`),
  cioè la **media annua** invece della somma.
- `flag_round = True` → **arrotonda** E ed N all'intero più vicino.

Default entrambi `False` (somme intere). ⚠️ Con `flag_dividiAA` **senza** `flag_round`
escono valori **decimali** (col punto) → in Google Sheets possono dare problemi di
locale: in genere conviene attivare anche `flag_round`. Le celle che risultano 0
(anche per arrotondamento) restano vuote.

## Flusso di aggiornamento

```
FISICA_MONIT_CAR_TAB.csv (export Esse3)
        │  python matrice/genera_matrice_esami_lm.py
        ▼
matrice/MatriceEsamiLM.csv  (matrice quadrata LM)
        │  incolla / importa
        ▼
gsheet FISSO della matrice  (un solo file, condiviso — cambia di rado)
        │  =IMPORTRANGE(...)  in A1 del foglio "MATRICE"
        ▼
foglio "MATRICE" in ciascun gsheet-orario
        │  getOrarioData → readCoexamMatrix_
        ▼
Web App  (tab 📊 Co-esami LM, costo nel tab 💥 Collisioni)
```

Note pratiche:
- l'`IMPORTRANGE` va **autorizzato una volta** per ogni gsheet-orario;
- dopo aver aggiornato la matrice, fare **Carica / Pubblica** nell'orario per
  rigenerare lo snapshot della Web App;
- il foglio `MATRICE` è **di sola lettura** (alimentato da IMPORTRANGE): non
  scriverci a mano e non usare le vecchie voci di menu Importa/Genera co-esami.

## File in questa cartella

| File | Cosa |
|---|---|
| `genera_matrice_esami_lm.py` | Tool che genera la matrice LM dal CSV completo (applica le classi di equivalenza) |
| `equiv_classes.json` | Classi di equivalenza curate: codice-variante → codice canonico attuale |
| `build_equiv_classes.py` | Rigenera i candidati alle classi di equivalenza dal CSV (da rivedere) |
| `MatriceEsamiLM.csv` | Output (creato quando esegui il tool) |
| `CSV_SORGENTE.md` | Specifiche del CSV Esse3 di partenza (per analisi/estrazioni) |
| `README.md` | Questo file |
