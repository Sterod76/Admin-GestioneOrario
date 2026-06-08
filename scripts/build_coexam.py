#!/usr/bin/env python3
"""Costruisce la matrice co-esami dai dati esami (stripped, con aa_sup).

- Considera SOLO gli AA di superamento 2022, 2023, 2024 e fa la MEDIA.
- Identifica gli studenti con la matricola.
- Ignora i codici non in formato "numero + lettera/e" (es. con . _ o simboli).

Output:
  E_codice  = media su 2022-2024 degli studenti distinti che superano il codice in un AA
  N_coppia  = media annua degli studenti che superano ENTRAMBI i codici nello STESSO AA

Artefatti: coexam_from_exams.json (kind=coexam v2) + coexam_matrix_full.csv (quadrata).
Uso: python scripts/build_coexam.py
"""
import csv
import json
import os
import re
from itertools import combinations

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'FISICA_MONIT_CAR_TAB_stripped.csv')
OUTDIR = os.path.join(ROOT, 'coexam')
DATA_YEAR = '2024'  # ultimo AA della finestra 2022-2024 (usato nel nome file import)

YEARS = {'2022', '2023', '2024'}
CODE_RE = re.compile(r'^[0-9]+[A-Za-z]+$')  # numero poi lettere


def main():
    # per anno: dict code -> set(matricole) che hanno superato quel codice quell'AA
    by_year = {y: {} for y in YEARS}
    kept_codes = set()
    dropped_codes = set()
    with open(SRC, encoding='utf-8', newline='') as f:
        r = csv.DictReader(f)
        for row in r:
            aa = (row.get('aa_sup') or '').strip()
            if aa not in YEARS:
                continue
            code = (row.get('cod_esame') or '').strip().upper()
            mat = (row.get('matricola') or '').strip()
            if not code or not mat:
                continue
            if not CODE_RE.match(code):
                dropped_codes.add(code)
                continue
            kept_codes.add(code)
            by_year[aa].setdefault(code, set()).add(mat)

    nyears = len(YEARS)
    # E_codice = media annua degli studenti distinti
    perCode = {}
    for code in kept_codes:
        tot = sum(len(by_year[y].get(code, ())) for y in YEARS)
        perCode[code] = round(tot / nyears, 1)

    # N_coppia = media annua degli studenti con ENTRAMBI nello stesso AA
    pair_sum = {}
    for y in YEARS:
        # inverti: matricola -> set(codici) di quell'AA
        stu = {}
        for code, mats in by_year[y].items():
            for m in mats:
                stu.setdefault(m, set()).add(code)
        for m, codes in stu.items():
            if len(codes) < 2:
                continue
            for a, b in combinations(sorted(codes), 2):
                key = (a, b)
                pair_sum[key] = pair_sum.get(key, 0) + 1
    pairs = []
    for (a, b), s in pair_sum.items():
        pairs.append({'a': a, 'b': b, 'n': round(s / nyears, 1)})
    pairs.sort(key=lambda p: (-p['n'], p['a'], p['b']))

    os.makedirs(OUTDIR, exist_ok=True)
    # JSON v2 (perCode + pairs) — per import dal menu. La RESTRIZIONE a
    # obbligatori/vincolati e la matrice di riferimento sono gestite dal server
    # in fase di import (applyImportCoexam_). Stessa matrice per S1 e S2.
    for sem in ('S1', 'S2'):
        out = {
            'version': 2, 'kind': 'coexam', 'semester': sem, 'year': DATA_YEAR,
            'source': 'FISICA_MONIT_CAR_TAB media AA 2022-2024',
            'perCode': perCode,
            'pairs': pairs,
        }
        with open(os.path.join(OUTDIR, 'coexam%s-%s.json' % (sem, DATA_YEAR)), 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, indent=1)

    # CSV quadrata COMPLETA (riferimento umano): diagonale = E, fuori-diag = N
    codes = sorted(kept_codes)
    idx = {c: i for i, c in enumerate(codes)}
    grid = [['COEX'] + codes]
    for c in codes:
        grid.append([c] + [''] * len(codes))
    for c in codes:
        grid[idx[c] + 1][idx[c] + 1] = perCode[c]
    for p in pairs:
        i, j = idx[p['a']], idx[p['b']]
        grid[min(i, j) + 1][max(i, j) + 1] = p['n']
    with open(os.path.join(OUTDIR, 'coexam_matrix_full.csv'), 'w', encoding='utf-8', newline='') as f:
        csv.writer(f).writerows(grid)

    # report
    print('codici tenuti:', len(kept_codes))
    print('codici scartati (formato):', len(dropped_codes))
    print('  esempi scartati:', sorted(dropped_codes)[:15])
    print('coppie con N>0:', len(pairs))
    print('coppie con N>=1:', sum(1 for p in pairs if p['n'] >= 1))
    print('coppie con N>=5:', sum(1 for p in pairs if p['n'] >= 5))
    print('TOP 12 coppie:')
    for p in pairs[:12]:
        print('  %-7s x %-7s  N=%s' % (p['a'], p['b'], p['n']))
    print('TOP 12 perCode (E):')
    for c, e in sorted(perCode.items(), key=lambda kv: -kv[1])[:12]:
        print('  %-7s E=%s' % (c, e))
    print('output dir :', OUTDIR)
    print('  coexamS1-%s.json / coexamS2-%s.json + coexam_matrix_full.csv' % (DATA_YEAR, DATA_YEAR))


if __name__ == '__main__':
    main()
