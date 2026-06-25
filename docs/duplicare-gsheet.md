# Duplicare il gsheet (nuova istanza)

Crei un'istanza nuova (altro CdS/semestre). Lo Spreadsheet si duplica facilmente ma
porta un Apps Script bound vuoto: codice e config vanno re-installati. Due strade.

## Procedura A — solo browser

Niente clasp/terminale; perdi però versioning git.

1. **Duplica**: Drive → gsheet originale → *File → Make a copy*. Verifica i fogli
   `S*LT/S*LM/S*AULE/PdS` e i dati.
2. **Deployment**: sulla copia → *Estensioni → Apps Script* → *Deploy → New deployment*
   → **Web app** → Execute as: **Me**, Who has access: **Anyone within unipi.it** →
   **Deploy** → autorizza → copia **Web app URL**.
3. **Incolla l'URL in `CONFIG!C2`** (il "Web app URL" del deployment, formato
   `…/a/macros/unipi.it/s/…/exec`). Il menu *Vai al Web Calendar* legge l'URL da lì.
   > `ScriptApp.getService().getUrl()` non è affidabile → incolla a mano dal dialog.
4. **Pubblica i dati**: ricarica il gsheet → menu **🕒 Orario → 📅 Vai al Web Calendar**
   (lo snapshot non si copia col gsheet, va rigenerato). Apri l'URL `/exec`.
5. **Aggiornamenti codice**: editor → modifica → salva (menu attivi subito). Web app:
   Deploy → Manage deployments → matita → New version → Deploy.

## Procedura B — VS Code + clasp

Codice versionato nel repo; ogni istanza ha la sua cartella + `config/local.json`.

1. **Clona su disco locale** (⚠ **non** su Drive: `npm` su Drive condiviso è inaffidabile):
   ```bash
   git clone https://codeberg.org/Sterod76/Admin-GestioneOrario.git orario-XYZ
   cd orario-XYZ
   clasp login          # account Google del nuovo gsheet
   ```
2. **Duplica il gsheet** (come A.1) e **crea il deployment dall'editor** (come A.2):
   serve la UI per scegliere la policy d'accesso.
3. **Raccogli gli ID**: `scriptId` (editor → Project Settings → IDs), `deploymentId` +
   `webappUrl` (dal dialog di deploy o Manage deployments), `spreadsheetId` (URL del foglio).
4. **Registra**: `npm run setup` → incolla i valori (scrive `.clasp.json` +
   `config/local.json`, gitignored). *Per più installazioni gestite insieme usa invece
   l'array `targets[]`: vedi [`USO-RAPIDO.md`](USO-RAPIDO.md) §3.*
5. **Allinea il codice**: `npm run push` (sovrascrive il codice della copia con `src/`).
6. **Pubblica i dati**: sul gsheet → *Vai al Web Calendar* → apri `/exec`.
7. **Aggiornamenti**: `npm run deploy` (vedi [`USO-RAPIDO.md`](USO-RAPIDO.md)).

## Troubleshooting

- **Menu non funzionano sulla copia** → apri una voce di menu: autorizza gli scope (è per-progetto).
- **`clasp push`: "Conflicting files found"** → `clasp pull` ha lasciato `.js` accanto ai
  `.gs`: cancella i `.js` doppi e ripeti.
- **`/exec` dà 403** → policy restrittiva: Manage deployments → matita → "Anyone with Google account".
- **`npm run deploy`: "Requested entity was not found"** → `deploymentId` errato/cancellato:
  ricrea il deployment dall'editor → `npm run setup`.
- **Propagare un fix a una copia** (solo B): nella sua cartella `git pull` + `npm run deploy`.
