# Impegni orari FUORI dal dipartimento (da University Planner)

Ricostruisce, per ogni docente dei corsi di Fisica, gli **impegni di docenza in
altri dipartimenti** (corsi di servizio), separati per **semestre**. Servono
all'orario come "**docente occupato**": se un docente insegna fuori sede in una
fascia, quella fascia è un conflitto per la programmazione interna.

## Da dove vengono i dati

Endpoint **pubblico** di University Planner (Cineca), scoperto via HAR nel progetto
gemello `Admin-PreferenzeOrario`:

```
POST https://unipi.prod.up.cineca.it/api/Impegni/impegniCalendarioPubblicoDocente
body {matricolaDocente, provvisorio:false, dataInizio, dataFine,
      clienteId:"628de8b9b63679f193b87046" (UniPi), pianificazioneTemplate:false}
```

- **Nessuna autenticazione.** Filtra per matricola **solo** col `clienteId` UniPi.
- **Semestre = finestra temporale**: S1 = ottobre dell'AA, S2 = aprile dell'AA+1
  (l'orario settimanale ricorrente si ricava da un mese qualunque del semestre).
- **Filtro `is_fisica`**: si SCARTANO gli eventi in aule il cui `codice`/`descrizione`
  inizia per `FIB`/`FIS`, o edificio "Fibonacci" → il docente è già in sede, non è
  un impegno "fuori dipartimento".
- Date UP in UTC (`Z`): convertite in `Europe/Rome`. Solo Lun–Ven.

⚠️ L'API **non** espone un endpoint nome→matricola: le **matricole** vanno fornite.

## I due tool

| File | Cosa |
|---|---|
| `fetch_impegni_up.py` | Core riusabile: data una `matricole.csv` (col. `matricola`[, `cognome`,`nome`]) interroga UP per S1+S2 e scrive gli impegni esterni. |
| `build_from_coperture.py` | Pipeline completa: legge le **matricole dalle coperture** (`../ExportCopertureBasic.xlsx`, foglio `Coperture`, col. MAT/Cognome/Nome/SEM), costruisce gli insiemi S1={S1,A1} e S2={S2,A1}, interroga UP e scrive le liste. |

### Uso

```bash
# pipeline dalle coperture (consigliata) — AA 2025/26 (default)
python impegni/build_from_coperture.py            # usa ../ExportCopertureBasic.xlsx
python impegni/build_from_coperture.py --aa 2026  # quando UP avrà l'AA 2026/27

# oppure solo dal core, con una lista matricole tua
python impegni/fetch_impegni_up.py --aa 2025      # legge impegni/matricole.csv
```

### Output (rigenerabile, NON versionato)

`impegni/impegni_esterni_S1.csv` e `_S2.csv` —
`Cognome, Nome, Matricola, Giorno, Inizio, Fine, Corso, Aula` (header **italiani**, gli
stessi attesi dalla Tabella `SERVIZIO` e dal reader della web app; il reader accetta
comunque anche gli alias inglesi `weekday/start_time/end_time/course`). L'AA d'indagine
è `AA_DEFAULT` (=2025) in `build_from_coperture.py`, override con `--aa`.

> La colonna `Corso` usa il **nome** dell'attività UP (`nome`, es. "TECNOLOGIE DIGITALI"):
> il campo `codiceAttivita` NON è un codice corso ma un indice di partizione (spesso `"1"`),
> quindi non va usato. L'aula viene da `aule[]` (fallback su `risorse[].aula`). L'informazione
> utile (docente · giorno · orario · aula) è sempre corretta.

## File NON versionati (dati, restano locali)

`ExportCopertureBasic.xlsx`, `Orario S*.xlsx`, `all_professor_slots*.csv`,
`impegni/impegni_esterni_*.csv`, `impegni/matricole.csv` — contengono nomi,
matricole e orari dei docenti. Si rigenerano coi tool sopra.
