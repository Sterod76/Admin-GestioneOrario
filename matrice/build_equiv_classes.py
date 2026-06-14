#!/usr/bin/env python3
"""Trova CANDIDATE classi di equivalenza fra codici esame dal CSV Esse3 completo.

Due codici sono candidati alla stessa classe se hanno lo stesso TITOLO normalizzato
(lowercase, senza accenti/punteggiatura, senza suffisso finale 'short/long/s', senza
stopword). Servono a non spezzare i conteggi E/N fra varianti storiche dello stesso
insegnamento (rinomini, IT/EN, long/short, varianti 'A'). La mappatura DEFINITIVA va
curata a mano in equiv_classes.json scegliendo il CANONICO = codice attuale del PdS.

Sorgente = stesso CSV di genera_matrice_esami_lm.py (FISICA_MONIT_CAR_TAB.csv,
pipe-delimited, Latin-1; colonne COD e DES). Specifiche: vedi CSV_SORGENTE.md

Uso:
  python matrice/build_equiv_classes.py [percorso_csv]
Output:
  matrice/equiv_classes_candidates.json  (da rivedere → curare equiv_classes.json)
"""
import csv
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = r'C:\Users\rodda\Downloads\FISICA_MONIT_CAR_TAB.csv'
OUT = os.path.join(HERE, 'equiv_classes_candidates.json')

COL_COD, COL_DES, COL_AA = 'COD', 'DES', 'AA_SUP_ID'
CODE_RE = re.compile(r'^[0-9]+[A-Za-z]*B$')   # universo Orario: codici che terminano in B

# Classi note IT/EN da forzare anche se i titoli non coincidono (review manuale).
HARDCODED = [
    ['0046B', '0047B', '256BB', '257BB'],     # Onde gravitazionali (EN/IT, long/short)
]
STOPWORDS = {'di', 'del', 'dei', 'delle', 'della', 'dello', 'dell', 'and', 'of', 'the',
            'in', 'for', 'to', 'a', 'an', 'il', 'la', 'lo', 'le', 'gli', 'i', 'e', 'ed'}


def normalize_title(t):
    t = (t or '').lower().strip()
    t = ''.join(c for c in unicodedata.normalize('NFD', t) if unicodedata.category(c) != 'Mn')
    t = re.sub(r'[^a-z0-9 ]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'\s(short|long|s)\s*$', '', t)        # via suffisso versione
    return ' '.join(w for w in t.split() if w not in STOPWORDS)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    if not os.path.exists(src):
        print('SORGENTE non trovata:', src)
        sys.exit(1)
    # codice -> Counter(titoli)  + ultimo AA di superamento (per scegliere il canonico)
    code_titles = defaultdict(Counter)
    code_latest = defaultdict(int)   # AA_SUP_ID massimo visto per quel codice
    with open(src, encoding='latin-1', newline='') as f:
        for r in csv.DictReader(f, delimiter='|'):
            c = re.sub(r'[._]+$', '', (r.get(COL_COD) or '').strip().upper())
            if not c:
                continue
            code_titles[c][(r.get(COL_DES) or '').strip()] += 1
            aa = (r.get(COL_AA) or '').strip()
            if aa.isdigit() and aa != '9999999999':
                code_latest[c] = max(code_latest[c], int(aa))
    canon_title = {c: ct.most_common(1)[0][0] for c, ct in code_titles.items()}
    # Canonico = codice "attuale" = quello con l'AA di superamento PIU' RECENTE
    # (tie-break: piu' esami). I codici vecchi smettono prima, i nuovi arrivano al 2024/25.
    def pick_canon(codes, ec):
        cand = [c for c in codes if CODE_RE.match(c)] or list(codes)
        return max(cand, key=lambda c: (code_latest.get(c, 0), ec[c]))

    groups = defaultdict(set)
    for c, t in canon_title.items():
        groups[normalize_title(t)].add(c)

    classi = []
    for norm, codes in groups.items():
        if len(codes) < 2:
            continue
        if not any(CODE_RE.match(c) for c in codes):   # almeno un codice dell'universo Orario
            continue
        codes = sorted(codes)
        ec = {c: sum(code_titles[c].values()) for c in codes}
        classi.append({'normalized': norm, 'suggested_canonical': pick_canon(codes, ec),
                       'codes': codes, 'titles': {c: canon_title[c] for c in codes},
                       'exam_count': ec, 'latest_aa': {c: code_latest.get(c, 0) for c in codes}})
    for hc in HARDCODED:
        if not any(set(hc) <= set(cl['codes']) for cl in classi):
            ec = {c: sum(code_titles.get(c, {}).values()) for c in hc}
            classi.append({'normalized': '[HARDCODED]', 'suggested_canonical': pick_canon(hc, ec),
                           'codes': sorted(hc),
                           'titles': {c: canon_title.get(c, '?') for c in hc},
                           'exam_count': ec, 'latest_aa': {c: code_latest.get(c, 0) for c in hc},
                           'hardcoded': True})
    classi.sort(key=lambda x: -sum(x['exam_count'].values()))

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(classi, f, indent=2, ensure_ascii=False)

    print('Classi CANDIDATE trovate:', len(classi))
    print('(rivedi e cura equiv_classes.json: canonical = codice ATTUALE del PdS)\n')
    for cl in classi:
        tot = sum(cl['exam_count'].values())
        print('  %-26s tot=%-5d  cand.canonico=%s%s' % (
            ', '.join(cl['codes']), tot, cl['suggested_canonical'],
            ' [HC]' if cl.get('hardcoded') else ''))
        for c in cl['codes']:
            print('      %-7s %-4d  AA<=%s  "%s"' % (
                c, cl['exam_count'][c], cl.get('latest_aa', {}).get(c, '?'), cl['titles'][c][:42]))
    print('\noutput:', OUT)


if __name__ == '__main__':
    main()
