#!/usr/bin/env python3
"""Genera MatriceEsamiLM.csv (matrice esami/co-esami) dal CSV ESAMI COMPLETO.

DATASET COMPLETO: include TUTTE le carriere (LT + LM), così la matrice ha E
(numero esami → capienza aule) e N (studenti in comune) per OGNI codice. Il tab
"Co-esami" della Web App mostra poi solo il sottoinsieme LM obbligatori/forchette,
ma il dato grezzo c'è per tutti (serve es. alle capienze dei corsi LT).

Il "csv completo" è l'export Esse3 FISICA_MONIT_CAR_TAB.csv (pipe-delimited,
quotato, Latin-1). Si lavora direttamente su quello: il tool fa strip + filtri +
matrice in un unico passaggio. Si esegue a mano (la sorgente sta sul tuo PC):

    python matrice/genera_matrice_esami_lm.py [percorso_csv_completo] [--coorti=2021,2022]

Filtri:
  - SOLO AA di superamento 2022/23, 2023/24, 2024/25 (AA_SUP_ID ∈ {2022,2023,2024});
  - COORTI opzionali (AA_IMM1): se impostate (costante COORTI o --coorti=...),
    si considerano solo gli studenti immatricolati in quegli AA; vuoto = tutte;
  - codici che TERMINANO in B (es. 0001B, 042BB), su TUTTE le carriere (LT + LM);
  - ECCEZIONI in EXTRA_CODES (es. 244CC, codici LT opzionali): ammesse ANCHE se
    non terminano in B (override sul formato del codice).

Output: matrice/MatriceEsamiLM.csv — MATRICE QUADRATA
  A1 = 'COEX' ; riga 1 e colonna A = codici (ordinati per E totale decrescente)
  DIAGONALE  = E = SOMMA sui 3 AA degli studenti distinti che superano il codice
  FUORI DIAG = N = SOMMA sui 3 AA degli studenti che superano ENTRAMBI nello stesso AA
  (triangolo superiore; celle vuote = 0 studenti in comune; conteggi interi → nessun
   problema di locale all'import in Google Sheets)

Questo CSV va incollato nel gsheet FISSO della matrice; da lì un IMPORTRANGE lo
porta nel foglio "MATRICE" dell'orario, che la Web App legge.
"""
import csv
import os
import re
import sys
from itertools import combinations

HERE = os.path.dirname(os.path.abspath(__file__))
# Sorgente di default = CSV COMPLETO (export Esse3, chiedere a Roddaro/Mannella). Override con argv[1].
DEFAULT_SRC = r'C:\Users\rodda\Downloads\FISICA_MONIT_CAR_TAB.csv'
OUT = os.path.join(HERE, 'MatriceEsamiLM.csv')

YEARS = {'2022', '2023', '2024'}            # AA di superamento 2022/23, 2023/24, 2024/25
CODE_RE = re.compile(r'^[0-9]+[A-Za-z]*B$')  # numero + lettere che TERMINANO in B (es. 0001B, 042BB)

# Coorti = AA di IMMATRICOLAZIONE (AA_IMM1) degli studenti da includere.
# Vuoto = TUTTE le coorti. Es. {'2021', '2022'} = solo immatricolati 2021/22 e
# 2022/23. Override da riga di comando: --coorti=2021,2022
COORTI = set()

# Post-elaborazione dei conteggi E ed N (default: somme intere, come prima).
#   flag_dividiAA = True  → divide per il numero di AA usati (= len(YEARS)) → media annua
#   flag_round    = True  → arrotonda all'intero più vicino
# NB: con dividiAA e SENZA round escono valori decimali (col punto): in Google
#     Sheets potrebbero dare problemi di locale → in genere conviene anche flag_round.
flag_dividiAA = True
flag_round = True

# Eccezioni: codici ammessi ANCHE se non in formato "solo B" e ANCHE se non LM
# (override sia sul formato lettera sia sulla restrizione LM). Aggiungere qui.
# Qui sotto aggiunti anche tutti i codici LT opzionali: non ha senso includere i labs del terzo anno, esclusi quindi
EXTRA_CODES = {
    '0001B',    # Relatività (LT)
    '0002B',    # Introduction to medical imaging (LT)
    '0042B',    # Grafica e animazione con python (LT)
    '0045B',    # Teoria dei gruppi per la scienza dei materiali (LT)
    '108BB',    # Elementi di storia della fisica (LT)
    '187DD',    # Elementi di Geofisica (LT)
    '224CC',    # Chimica Fisica e Laboratorio (LT)
    '250BB',    # Introduzione alla fisica nucleare (LT)
    '286BB',    # Teoria dei gruppi (LT)
    '288BB',    # Astrofisica generale (LT)
    '289BB',    # Fluidodinamica (LT)
    '319BB',    # Laboratorio di fisica per l'insegnamento (LT)
    '349BB',    # Meccanica quantistica avanzata (LT)
    '415BB',    # Fisica del suono (LT)
    '424BB',    # Fondamenti di ottica (LT)
    '428BB',    # Armi nucleari, disarmo e proliferazione nucleare (LT)
    '672AA',    # Equazioni alle derivate parziali (LT)
    '719AA',    # Geometria differenziale (LT)
    '814II',    # Principi meccanici per l'ingegneria nucleare (LT)
    '815II',    # Principi terminici per l'ingegneria nucleare (LT)
    '288BB',    # Astrofisica generale (LT)
    '244CC',    # Chemical physics of molecules
    '478EE',    # Elementi di fisiopatologia
    # 'XXXYY',   # <- altri codici eccezione qui
}

# Nomi colonna nel CSV completo Esse3
COL_MATRICOLA = 'MATRICOLA'
COL_COD = 'COD'
COL_AASUP = 'AA_SUP_ID'
COL_TIPO = 'TIPO_CORSO_COD'
COL_IMM = 'AA_IMM1'           # AA di immatricolazione (coorte)


def main():
    # Argomenti: [percorso_csv]  e/o  --coorti=2021,2022
    src = DEFAULT_SRC
    coorti = set(COORTI)
    for a in sys.argv[1:]:
        if a.startswith('--coorti='):
            coorti = {x.strip() for x in a.split('=', 1)[1].split(',') if x.strip()}
        elif a.startswith('--'):
            print('opzione sconosciuta:', a)
            sys.exit(1)
        else:
            src = a
    if not os.path.exists(src):
        print('SORGENTE non trovata:', src)
        print('Uso: python matrice/genera_matrice_esami_lm.py [csv_completo] [--coorti=2021,2022]')
        sys.exit(1)

    # per anno: code -> set(matricole) che hanno superato quel codice quell'AA
    by_year = {y: {} for y in YEARS}
    kept, dropped, n_rows = set(), set(), 0
    # Esse3: pipe-delimited, quotato, Latin-1
    with open(src, encoding='latin-1', newline='') as f:
        reader = csv.DictReader(f, delimiter='|')
        needed = [COL_MATRICOLA, COL_COD, COL_AASUP]
        if coorti:
            needed.append(COL_IMM)
        for need in needed:
            if need not in reader.fieldnames:
                print('Colonna mancante nel CSV completo:', need)
                sys.exit(2)
        for row in reader:
            aa = (row.get(COL_AASUP) or '').strip()
            if aa not in YEARS:
                continue                       # finestra AA di superamento sempre applicata
            if coorti and (row.get(COL_IMM) or '').strip() not in coorti:
                continue                       # filtro coorte (AA_IMM1)
            code = (row.get(COL_COD) or '').strip().upper()
            mat = (row.get(COL_MATRICOLA) or '').strip()
            if not code or not mat:
                continue
            is_exc = code in EXTRA_CODES
            # Formato: il codice deve TERMINARE in B (es. 0001B, 042BB), salvo eccezioni
            if not (CODE_RE.match(code) or is_exc):
                dropped.add(code)
                continue
            # DATASET COMPLETO: si includono TUTTE le carriere (LT + LM), così la
            # matrice ha E (capienza) e N per ogni codice. Il tab Co-esami mostra
            # poi il sottoinsieme LM obbligatori/forchette, ma il dato c'è tutto.
            n_rows += 1
            kept.add(code)
            by_year[aa].setdefault(code, set()).add(mat)

    # E = SOMMA (sui 3 AA) degli studenti distinti che superano il codice.
    # Nessuna media, nessun arrotondamento: è già un conteggio intero.
    perCode = {c: sum(len(by_year[y].get(c, ())) for y in YEARS) for c in kept}

    pair_sum = {}
    for y in YEARS:
        stu = {}
        for code, mats in by_year[y].items():
            for m in mats:
                stu.setdefault(m, set()).add(code)
        for m, codes in stu.items():
            if len(codes) < 2:
                continue
            for a, b in combinations(sorted(codes), 2):
                pair_sum[(a, b)] = pair_sum.get((a, b), 0) + 1
    # N = SOMMA (sui 3 AA) degli studenti con ENTRAMBI nello stesso AA.
    # Già conteggio intero >= 1 per costruzione (solo coppie co-occorse).
    pairN = dict(pair_sum)

    # Post-elaborazione opzionale (flag in cima): /numero AA e/o arrotondamento.
    nAA = len(YEARS)
    if flag_dividiAA or flag_round:
        def _ap(x):
            v = x / nAA if flag_dividiAA else x
            return int(round(v)) if flag_round else v
        perCode = {c: _ap(e) for c, e in perCode.items()}
        pairN = {k: _ap(n) for k, n in pairN.items()}

    # codici ordinati per E decrescente (più esami in alto a sinistra)
    codes = sorted(kept, key=lambda c: (-perCode.get(c, 0), c))
    idx = {c: i for i, c in enumerate(codes)}

    grid = [['COEX'] + codes]
    for c in codes:
        grid.append([c] + [''] * len(codes))
    for c in codes:
        if perCode[c]:                                     # diagonale = E (0 → vuoto, come gli zeri veri)
            grid[idx[c] + 1][idx[c] + 1] = perCode[c]
    for (a, b), n in pairN.items():
        if not n:                                          # 0 (anche da arrotondamento) → vuoto
            continue
        i, j = idx[a], idx[b]
        grid[min(i, j) + 1][max(i, j) + 1] = n             # triangolo superiore = N

    with open(OUT, 'w', encoding='utf-8', newline='') as f:
        csv.writer(f).writerows(grid)

    # report
    print('coorti (AA_IMM1):', ', '.join(sorted(coorti)) if coorti else 'TUTTE')
    print('flag: dividiAA=%s (/%d AA), round=%s' % (flag_dividiAA, nAA, flag_round))
    print('righe esami tenute (AA superam. 2022-2024):', n_rows)
    print('codici tenuti:', len(kept))
    print('codici scartati (formato):', len(dropped), sorted(dropped)[:10])
    print('coppie con N>0:', len(pairN))
    print('TOP 10 perCode (E):')
    for c, e in sorted(perCode.items(), key=lambda kv: -kv[1])[:10]:
        print('  %-7s E=%s' % (c, e))
    print('TOP 10 coppie (N):')
    for (a, b), n in sorted(pairN.items(), key=lambda kv: -kv[1])[:10]:
        print('  %-7s x %-7s  N=%s' % (a, b, n))
    print('output:', OUT)


if __name__ == '__main__':
    main()
