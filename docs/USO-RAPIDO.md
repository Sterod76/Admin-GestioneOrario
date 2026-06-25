# Uso rapido — operare senza Claude

Scheda per fare le operazioni comuni **da soli**, in VS Code. Tutti i comandi sono
già pronti come **Task**: `Ctrl+Shift+P` → **Tasks: Run Task** → scegli dalla lista
(le etichette hanno un'emoji per ritrovarle a colpo d'occhio). In alternativa,
Terminal integrato + il comando `npm`.

> Prerequisiti una tantum: Node ≥ 18, `clasp` globale (`npm i -g @google/clasp`),
> `clasp login` con l'account giusto. Verifica account: task **👤 clasp: whoami**.

---

## Voglio… → cosa faccio

| Voglio… | Task VS Code | Comando equivalente |
|---|---|---|
| Controllare che il codice non sia rotto | 🔍 **Verifica (sintassi + sim)** | `npm run verify` |
| **Pubblicare** le modifiche al pubblico (tutte le installazioni) | 📤 **Deploy web app** | `npm run deploy` |
| Verificare **e** pubblicare | 🧪 **Verifica + Deploy** | `npm run verify && npm run deploy` |
| **Tutto in uno**: verifica → pubblica → salva su git → push | 🚀 **Rilascio completo** | (vedi sotto) |
| Salvare su Codeberg (senza pubblicare) | 💾 **Git: commit + push** | `git add -A && git commit -m "…" && git push origin main` |
| Solo commit locale | 📝 **Git: commit (solo locale)** | `git add -A && git commit -m "…"` |
| Solo inviare commit già fatti | 🆙 **Git: push (Codeberg)** | `git push origin main` |
| Aggiungere/cambiare un'installazione | 🎯 **Apri config target** | edita `config/local.json` |
| Provare il codice senza toccare il pubblico | ⬆️ **clasp push (@HEAD /dev)** | `npm run push` |
| Vedere i deployment | 📋 **List deployments** | `npm run deployments` |
| Aprire l'editor Apps Script | 🌐 **Apri editor Apps Script** | `npm run open` |
| Cambiare account clasp | 🔑 **clasp: login** | `npm run logout && npm run login` |

> **Push vs Deploy.** `clasp push` aggiorna solo l'URL **/dev** (anteprima). Solo
> **`deploy`** aggiorna la web app pubblica **/exec**. Per pubblicare → Deploy.

---

## I 3 flussi tipici

### 1. Ho cambiato il codice e voglio pubblicarlo
1. 🔍 **Verifica** — deve essere tutta verde.
2. 📤 **Deploy web app** — pubblica su tutte le installazioni (riepiloga `@versione` + URL).
3. Ricarica la web app (`/exec`) per controllare.

Oppure, in un colpo solo (verifica + deploy + salvataggio su git): 🚀 **Rilascio completo**.

### 2. Voglio salvare il lavoro su Codeberg
- 💾 **Git: commit + push** → ti chiede il messaggio, fa `add -A`, commit e push su `main`.
- In alternativa usa il pannello **Source Control** di VS Code (`Ctrl+Shift+G`):
  scrivi il messaggio, **✓ Commit**, poi **Sync/Push**.

### 3. Aggiungere o modificare un'installazione (target)
Le installazioni vivono nell'array **`targets[]`** di `config/local.json` (gitignorato).

1. 🎯 **Apri config target**.
2. Aggiungi/modifica un blocco nell'array `targets` (schema e template in
   [`config/local.multitarget.example.json`](../config/local.multitarget.example.json)):
   ```json
   {
     "label": "Nome leggibile",
     "scriptId": "ID dello script Apps Script",
     "deploymentId": "ID del deployment web app (/exec)",
     "webappUrl": "https://script.google.com/.../exec"
   }
   ```
   - `scriptId`: editor Apps Script → **Impostazioni progetto → ID**.
   - `deploymentId` + `webappUrl`: editor → **Deploy → Gestisci deployment** (o
     **Nuovo deployment → Web app** la prima volta).
   - Un target **senza** `deploymentId` viene solo *pushato*, non pubblicato.
3. Salva. Il prossimo 📤 **Deploy** include il nuovo target.

> ⚠ **Non** usare **🔧 Setup IDs** per i target esistenti: quel comando scrive il
> formato a *target singolo* e cancellerebbe l'array. (Ora si rifiuta di farlo da
> solo.) Serve solo per creare da zero una nuova installazione separata.

---

## Note utili
- **Account sbagliato in deploy?** Il deploy si blocca se l'account clasp ≠
  `expectedAccount` (in `config/local.json`). Fix: 🔑 **clasp: login** con l'account giusto.
- **"Modifiche non visibili su /exec"** → hai fatto solo *push*; serve **Deploy**.
- **Primo deployment di una nuova installazione** va creato a mano dall'editor
  (Deploy → Nuovo deployment → Web app): vedi [`duplicare-gsheet.md`](duplicare-gsheet.md).
- Dettagli completi sui comandi: [`../README.md`](../README.md) §Comandi.
