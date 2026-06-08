#!/usr/bin/env python3
"""Estrae da FISICA_MONIT_CAR_TAB.csv (export Esse3, pipe-delimited, quotato)
una versione 'stripped' con le sole colonne utili, INCLUSO l'AA di superamento
(AA_SUP_ID, valore amministrativo esatto — gestisce gli appelli straordinari).

Uso:  python scripts/strip_exams.py [percorso_csv_completo]
Output:  FISICA_MONIT_CAR_TAB_stripped.csv nella root del progetto.
"""
import csv
import os
import sys

DEFAULT_SRC = r'C:\Users\rodda\Downloads\FISICA_MONIT_CAR_TAB.csv'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'FISICA_MONIT_CAR_TAB_stripped.csv')

# colonna_output -> colonna_sorgente
MAP = [
    ('matricola',    'MATRICOLA'),
    ('aa_imm',       'AA_IMM1'),
    ('cds_cod',      'CDS_COD'),
    ('tipo_corso',   'TIPO_CORSO_COD'),
    ('aa_sup',       'AA_SUP_ID'),
    ('data_sup',     'DATA_SUP'),
    ('cod_esame',    'COD'),
    ('titolo_esame', 'DES'),
    ('voto',         'VOTO'),
    ('crediti',      'CREDITI'),
]


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    if not os.path.exists(src):
        print('SORGENTE non trovata:', src)
        sys.exit(1)
    # L'export Esse3 è in Windows-1252/Latin-1 (non UTF-8): latin-1 decodifica
    # tutti i byte senza errori e mappa correttamente gli accenti italiani.
    with open(src, encoding='latin-1', newline='') as f:
        reader = csv.DictReader(f, delimiter='|')
        missing = [s for _, s in MAP if s not in reader.fieldnames]
        if missing:
            print('Colonne mancanti nel sorgente:', missing)
            sys.exit(2)
        rows = [[(row.get(s) or '').strip() for _, s in MAP] for row in reader]
    with open(OUT, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow([d for d, _ in MAP])
        w.writerows(rows)
    aa = {}
    for r in rows:
        aa[r[4]] = aa.get(r[4], 0) + 1  # conteggio per aa_sup
    print('righe esami:', len(rows))
    print('output:', OUT)
    print('per aa_sup (ultimi):', dict(sorted((k, v) for k, v in aa.items() if k.isdigit() and int(k) >= 2019)))


if __name__ == '__main__':
    main()
