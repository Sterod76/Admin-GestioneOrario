#!/usr/bin/env python3
"""Genera un dataset ESAMI ANONIMIZZATO dal CSV completo Esse3.

Sorgente: FISICA_MONIT_CAR_TAB.csv (export Esse3; pipe-delimited, quotato,
Latin-1; una riga per esame). Specifiche complete del CSV sorgente:
    ../matrice/CSV_SORGENTE.md

Output (UTF-8, separatore virgola, con intestazione):
    id_studente   matricola ANONIMIZZATA (HMAC-SHA256 con salt locale segreto)
    anno_imm      AA di immatricolazione (coorte)        [AA_IMM1]
    tipo          'LT' (triennale) | 'LM' (magistrale)   [TIPO_CORSO_COD: L2/LM]
    cod_esame     codice insegnamento                    [COD]
    titolo_esame  titolo insegnamento                    [DES]
    voto          voto d'esame                           [VOTO]
    data_sup      data di superamento                    [DATA_SUP]
    aa_sup        AA di superamento ('' se n/d)          [AA_SUP_ID; 9999999999 -> '']

ANONIMIZZAZIONE
    La matricola NON compare nell'output: è sostituita da un id pseudonimo
    stabile = 'S' + HMAC-SHA256(salt, matricola)[:12]. Lo stesso studente ha
    sempre lo stesso id_studente (le analisi per-studente, es. co-esami, restano
    possibili), ma SENZA il salt l'id non è riconducibile alla matricola.
      - Il salt è un segreto casuale (256 bit) generato UNA VOLTA e salvato in
        analisi/.anon_salt (gitignored); riusato nelle esecuzioni successive ->
        id stabili fra run. Override: variabile d'ambiente ANON_SALT o --salt=HEX.
      - Tieni SIA il salt SIA l'output fuori da git/condivisioni pubbliche: sono
        dati pseudonimi, comunque sensibili (un id stabile + esami/voti/date).

USO
    python analisi/genera_dataset_anon.py [percorso_csv] [opzioni]
      percorso_csv        sorgente (default: vedi DEFAULT_SRC)
      --solo-superati     tiene solo le righe con AA di superamento valido
      --salt=HEX          usa questo salt invece di analisi/.anon_salt
      -o, --out FILE      file di output (default: analisi/dataset_esami_anon.csv)
"""
import csv
import hashlib
import hmac
import os
import secrets
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Sorgente di default = CSV COMPLETO Esse3 (sta sul PC di chi gestisce i dati).
DEFAULT_SRC = r'C:\Users\rodda\Downloads\FISICA_MONIT_CAR_TAB.csv'
DEFAULT_OUT = os.path.join(HERE, 'dataset_esami_anon.csv')
SALT_FILE = os.path.join(HERE, '.anon_salt')

# Colonne nel CSV sorgente (accesso per NOME, non per indice).
C_MAT, C_IMM, C_TIPO = 'MATRICOLA', 'AA_IMM1', 'TIPO_CORSO_COD'
C_COD, C_DES, C_VOTO, C_DATA, C_AASUP = 'COD', 'DES', 'VOTO', 'DATA_SUP', 'AA_SUP_ID'
NEEDED = [C_MAT, C_IMM, C_TIPO, C_COD, C_DES, C_VOTO, C_DATA, C_AASUP]

TIPO_MAP = {'L2': 'LT', 'LM': 'LM'}   # TIPO_CORSO_COD -> etichetta richiesta
AA_SENTINEL = '9999999999'            # AA_SUP_ID placeholder = esame non superato/n.d.


def get_salt(cli_salt):
    """Restituisce il salt (bytes). Priorita': --salt > env ANON_SALT > file > nuovo."""
    if cli_salt:
        return cli_salt.encode('utf-8')
    env = os.environ.get('ANON_SALT')
    if env:
        return env.encode('utf-8')
    if os.path.exists(SALT_FILE):
        with open(SALT_FILE, encoding='utf-8') as f:
            return f.read().strip().encode('utf-8')
    salt = secrets.token_hex(32)
    with open(SALT_FILE, 'w', encoding='utf-8') as f:
        f.write(salt)
    print('Salt nuovo generato e salvato in', SALT_FILE, '(NON committare; necessario per id stabili).')
    return salt.encode('utf-8')


def parse_args(argv):
    src, out, only_passed, cli_salt = DEFAULT_SRC, DEFAULT_OUT, False, None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--solo-superati':
            only_passed = True
        elif a.startswith('--salt='):
            cli_salt = a.split('=', 1)[1]
        elif a in ('-o', '--out'):
            i += 1
            out = argv[i]
        elif a.startswith('-'):
            print('opzione sconosciuta:', a)
            sys.exit(1)
        else:
            src = a
        i += 1
    return src, out, only_passed, cli_salt


def main():
    src, out, only_passed, cli_salt = parse_args(sys.argv[1:])
    if not os.path.exists(src):
        print('SORGENTE non trovata:', src)
        print('Uso: python analisi/genera_dataset_anon.py [csv] [--solo-superati] [--salt=HEX] [-o out.csv]')
        sys.exit(1)

    salt = get_salt(cli_salt)
    ids = {}

    def anon(mat):
        if mat not in ids:
            ids[mat] = 'S' + hmac.new(salt, mat.encode('utf-8'), hashlib.sha256).hexdigest()[:12]
        return ids[mat]

    n_in = n_out = 0
    unknown_tipo = {}
    with open(src, encoding='latin-1', newline='') as f:
        reader = csv.DictReader(f, delimiter='|')
        missing = [c for c in NEEDED if c not in (reader.fieldnames or [])]
        if missing:
            print('Colonne mancanti nel CSV sorgente:', missing)
            sys.exit(2)
        with open(out, 'w', encoding='utf-8', newline='') as g:
            w = csv.writer(g)
            w.writerow(['id_studente', 'anno_imm', 'tipo', 'cod_esame',
                        'titolo_esame', 'voto', 'data_sup', 'aa_sup'])
            for row in reader:
                n_in += 1
                mat = (row.get(C_MAT) or '').strip()
                if not mat:
                    continue
                aa_sup = (row.get(C_AASUP) or '').strip()
                if aa_sup == AA_SENTINEL:
                    aa_sup = ''
                if only_passed and not aa_sup:
                    continue
                tipo_raw = (row.get(C_TIPO) or '').strip().upper()
                tipo = TIPO_MAP.get(tipo_raw, tipo_raw)
                if tipo_raw and tipo_raw not in TIPO_MAP:
                    unknown_tipo[tipo_raw] = unknown_tipo.get(tipo_raw, 0) + 1
                w.writerow([
                    anon(mat),
                    (row.get(C_IMM) or '').strip(),
                    tipo,
                    (row.get(C_COD) or '').strip().upper(),
                    (row.get(C_DES) or '').strip(),
                    (row.get(C_VOTO) or '').strip(),
                    (row.get(C_DATA) or '').strip(),
                    aa_sup,
                ])
                n_out += 1

    print('righe lette          :', n_in)
    print('righe scritte        :', n_out, '(solo superati)' if only_passed else '(tutte)')
    print('studenti distinti    :', len(ids))
    if unknown_tipo:
        print('TIPO_CORSO_COD non mappato (lasciato grezzo):', dict(unknown_tipo))
    print('output               :', out)
    print('ATTENZIONE: output e .anon_salt sono dati pseudonimi -> NON committare.')


if __name__ == '__main__':
    main()
