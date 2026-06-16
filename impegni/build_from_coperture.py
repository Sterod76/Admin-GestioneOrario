#!/usr/bin/env python3
"""Costruisce le liste degli impegni FUORI dal dipartimento per i docenti dei
corsi di Fisica, separati per semestre, leggendo le matricole da
ExportCopertureBasic.xlsx (colonne MAT, Cognome, Nome, SEM).

- SEM: S1 / S2 / A1 (annuale). S1set = {S1,A1}; S2set = {S2,A1}.
- Interroga University Planner (vedi fetch_impegni_up.py) e filtra isFisica.
- AA proxy: 2025/26 (il 2026/27 non è ancora pubblicato su UP). Override: --aa.
Output: impegni/impegni_esterni_S1.csv e _S2.csv
"""
import csv, os, sys, time, json, urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TZ = ZoneInfo('Europe/Rome')
WD = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
BASE = 'https://unipi.prod.up.cineca.it/api'
CID = '628de8b9b63679f193b87046'


def post_impegni(mat, frm, to):
    b = json.dumps({"matricolaDocente": str(mat), "provvisorio": False, "dataInizio": frm,
                    "dataFine": to, "clienteId": CID, "pianificazioneTemplate": False}).encode()
    rq = urllib.request.Request(BASE + '/Impegni/impegniCalendarioPubblicoDocente', data=b,
                                headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
    with urllib.request.urlopen(rq, timeout=40) as r:
        d = json.load(r)
    return d if isinstance(d, list) else []


def is_fisica(e):
    for a in (e.get('aule') or []):
        c = str(a.get('codice') or '').upper(); d = str(a.get('descrizione') or '').upper()
        if c.startswith('FIB') or c.startswith('FIS') or d.startswith('FIB') or d.startswith('FIS'):
            return True
        if 'FIBONACCI' in str((a.get('edificio') or {}).get('descrizione') or '').upper():
            return True
    return False


def month_window(y, m):
    frm = datetime(y, m, 1, tzinfo=timezone.utc)
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    iso = lambda d: d.isoformat().replace('+00:00', 'Z')
    return iso(frm), iso(datetime(ny, nm, 1, tzinfo=timezone.utc))


def esterni(mat, y, m):
    frm, to = month_window(y, m)
    out = set()
    for e in post_impegni(mat, frm, to):
        if e.get('indisponibilita') is True or not e.get('dataInizio') or not e.get('dataFine'):
            continue
        if is_fisica(e):
            continue
        di = datetime.fromisoformat(e['dataInizio'].replace('Z', '+00:00')).astimezone(TZ)
        df = datetime.fromisoformat(e['dataFine'].replace('Z', '+00:00')).astimezone(TZ)
        if di.weekday() > 4:
            continue
        aula = (e.get('aule') or [{}])[0]
        out.add((WD[di.weekday()], di.strftime('%H:%M'), df.strftime('%H:%M'),
                 str(e.get('codiceAttivita') or e.get('nome') or '').strip(),
                 str(aula.get('codice') or aula.get('descrizione') or '').strip()))
    return sorted(out, key=lambda x: (WD.index(x[0]), x[1]))


def main():
    import openpyxl
    aa = 2025
    for i, a in enumerate(sys.argv):
        if a == '--aa' and i + 1 < len(sys.argv):
            aa = int(sys.argv[i + 1])
    wb = openpyxl.load_workbook(os.path.join(ROOT, 'ExportCopertureBasic.xlsx'), read_only=True, data_only=True)
    ws = wb['Coperture']
    info = {}                       # mat -> (cognome, nome)
    sets = {'S1': set(), 'S2': set()}
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r or not r[0]:
            continue
        mat = str(r[0]).strip()
        info[mat] = (str(r[1] or '').strip(), str(r[2] or '').strip())
        sem = str(r[5] or '').strip().upper()
        if sem in ('S1', 'A1'):
            sets['S1'].add(mat)
        if sem in ('S2', 'A1'):
            sets['S2'].add(mat)
    windows = {'S1': (aa, 10), 'S2': (aa + 1, 4)}
    print(f'AA proxy {aa}/{aa+1} · S1={len(sets["S1"])} docenti · S2={len(sets["S2"])} docenti')
    for sem in ('S1', 'S2'):
        y, m = windows[sem]
        rows = []
        mats = sorted(sets[sem])
        for n, mat in enumerate(mats, 1):
            cog, nom = info.get(mat, ('', ''))
            try:
                ev = esterni(mat, y, m)
            except Exception as ex:
                print(f'  ERR {mat} {cog}: {ex}'); ev = []
            for wd, s, e, cod, aula in ev:
                rows.append([cog, nom, mat, wd, s, e, cod, aula])
            if n % 20 == 0 or n == len(mats):
                print(f'  {sem}: {n}/{len(mats)} docenti, {len(rows)} impegni esterni')
            time.sleep(0.15)
        out = os.path.join(HERE, f'impegni_esterni_{sem}.csv')
        with open(out, 'w', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            w.writerow(['cognome', 'nome', 'matricola', 'weekday', 'start_time', 'end_time', 'course', 'aula'])
            w.writerows(rows)
        ndoc = len({r[2] for r in rows})
        print(f'OUTPUT {out}: {len(rows)} impegni, {ndoc} docenti con impegni esterni')


if __name__ == '__main__':
    main()
