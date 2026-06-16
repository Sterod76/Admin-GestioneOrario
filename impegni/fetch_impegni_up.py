#!/usr/bin/env python3
"""Estrae gli impegni orari FUORI dal dipartimento di Fisica dei docenti, da
University Planner (Cineca), separati per semestre.

Replica la logica del progetto Admin-PreferenzeOrario (webapp/Code.js):
- endpoint PUBBLICO (no auth): POST .../api/Impegni/impegniCalendarioPubblicoDocente
  body {matricolaDocente, provvisorio:false, dataInizio, dataFine,
        clienteId:"628de8b9b63679f193b87046" (UniPi), pianificazioneTemplate:false}
- semestre via FINESTRA TEMPORALE: S1 = ottobre dell'AA, S2 = aprile dell'AA+1
  (l'orario settimanale ricorrente si ottiene da un mese qualunque del semestre).
- filtro isFisica(): si SCARTANO gli eventi in aule con codice/descrizione che
  inizia per FIB/FIS o edificio "Fibonacci" (il docente è già in sede → non è un
  impegno "fuori dipartimento").
- conversione orari in Europe/Rome (le date UP sono UTC 'Z').

INPUT  : impegni/matricole.csv  con almeno la colonna `matricola`
         (opzionali: `cognome`, `nome` per arricchire l'output).
         L'API UP NON espone un endpoint nome→matricola: le matricole vanno
         fornite (es. esportate dalla tab Collisioni di Admin-PreferenzeOrario).
OUTPUT : impegni/impegni_esterni_S1.csv e impegni/impegni_esterni_S2.csv
USO    : python impegni/fetch_impegni_up.py [--aa 2025]   # default: AA corrente
"""
import csv, json, os, sys, time, urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
TZ = ZoneInfo('Europe/Rome')
WD = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
BASE = 'https://unipi.prod.up.cineca.it/api'
CLIENTE_ID = '628de8b9b63679f193b87046'   # UniPi
THROTTLE = 0.2                            # s fra le chiamate (gentile con UP)


def _post_impegni(mat, frm, to):
    body = json.dumps({"matricolaDocente": str(mat), "provvisorio": False,
                       "dataInizio": frm, "dataFine": to, "clienteId": CLIENTE_ID,
                       "pianificazioneTemplate": False}).encode()
    req = urllib.request.Request(BASE + '/Impegni/impegniCalendarioPubblicoDocente',
                                 data=body, headers={'Content-Type': 'application/json',
                                                     'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = json.load(r)
    return data if isinstance(data, list) else []


def _get_nome(mat):
    try:
        with urllib.request.urlopen(BASE + '/Utenti/getUtenteByMatricola?matricola=' + str(mat), timeout=20) as r:
            return json.load(r)
    except Exception:
        return {}


def _is_fisica(e):
    for a in (e.get('aule') or []):
        c = str(a.get('codice') or '').upper()
        d = str(a.get('descrizione') or '').upper()
        if c.startswith('FIB') or c.startswith('FIS') or d.startswith('FIB') or d.startswith('FIS'):
            return True
        if 'FIBONACCI' in str((a.get('edificio') or {}).get('descrizione') or '').upper():
            return True
    return False


def _month_window(year, month):   # month 1-based; finestra = mese intero (UTC)
    frm = datetime(year, month, 1, tzinfo=timezone.utc)
    ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
    to = datetime(ny, nm, 1, tzinfo=timezone.utc)
    iso = lambda d: d.isoformat().replace('+00:00', 'Z')
    return iso(frm), iso(to)


def impegni_esterni(mat, year, month):
    """Lista (weekday, start, end, course, aula) fuori-dipartimento, dedotta da un
    mese del semestre; deduplicata (orario settimanale ricorrente)."""
    frm, to = _month_window(year, month)
    out = set()
    for e in _post_impegni(mat, frm, to):
        if e.get('indisponibilita') is True or not e.get('dataInizio') or not e.get('dataFine'):
            continue
        if _is_fisica(e):
            continue
        di = datetime.fromisoformat(e['dataInizio'].replace('Z', '+00:00')).astimezone(TZ)
        df = datetime.fromisoformat(e['dataFine'].replace('Z', '+00:00')).astimezone(TZ)
        if di.weekday() > 4:    # solo Lun-Ven
            continue
        aula = (e.get('aule') or [{}])[0]
        out.add((WD[di.weekday()], di.strftime('%H:%M'), df.strftime('%H:%M'),
                 str(e.get('codiceAttivita') or e.get('nome') or '').strip(),
                 str(aula.get('codice') or aula.get('descrizione') or '').strip()))
    return sorted(out, key=lambda x: (WD.index(x[0]), x[1]))


def main():
    aa = None
    for i, a in enumerate(sys.argv):
        if a == '--aa' and i + 1 < len(sys.argv):
            aa = int(sys.argv[i + 1])
    if aa is None:   # come la GAS: se mese>=9 anno corrente, altrimenti precedente
        now = datetime.now()
        aa = now.year if now.month >= 9 else now.year - 1
    src = os.path.join(HERE, 'matricole.csv')
    if not os.path.exists(src):
        print('Manca', src, '(serve almeno la colonna `matricola`).'); sys.exit(1)
    rows = list(csv.DictReader(open(src, encoding='utf-8-sig')))
    print(f'AA {aa}/{aa+1}: S1=ottobre {aa}, S2=aprile {aa+1} · {len(rows)} docenti')
    res = {'S1': [], 'S2': []}
    for n, r in enumerate(rows, 1):
        mat = str(r.get('matricola') or '').strip()
        if not mat:
            continue
        u = _get_nome(mat)
        cog = (r.get('cognome') or u.get('cognome') or '').strip()
        nom = (r.get('nome') or u.get('nome') or '').strip()
        for sem, (y, m) in [('S1', (aa, 10)), ('S2', (aa + 1, 4))]:
            for wd, s, e, cod, aula in impegni_esterni(mat, y, m):
                res[sem].append([cog, nom, mat, wd, s, e, cod, aula])
            time.sleep(THROTTLE)
        print(f'  [{n}/{len(rows)}] {cog} {nom} ({mat}): S1={sum(1 for x in res["S1"] if x[2]==mat)} S2={sum(1 for x in res["S2"] if x[2]==mat)}')
    for sem in ('S1', 'S2'):
        out = os.path.join(HERE, f'impegni_esterni_{sem}.csv')
        with open(out, 'w', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            w.writerow(['cognome', 'nome', 'matricola', 'weekday', 'start_time', 'end_time', 'course', 'aula'])
            w.writerows(res[sem])
        print(f'OUTPUT {out}: {len(res[sem])} impegni')


if __name__ == '__main__':
    main()
