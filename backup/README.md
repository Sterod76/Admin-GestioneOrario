# Backup degli orari, formato re-importabile

Questi `.json` **non sono file sciolti**: sono gli export prodotti da
`exportToJson()` in `src/Storage.gs`, e si rimettono dentro un foglio con
`importFromJson()` dal menu amministrativo. Sono quindi l'unica copia offline
degli orari in una forma che l'applicazione sa ricaricare.

| File | Semestre | Versione formato | Esportato |
|---|---|---|---|
| `orarioS1-2019.json` | S1 | v1 | 2019-10-01 |
| `orarioS1-2020.json` | S1 | v1 | 2020-10-01 |
| `orarioS1-2026.json` | S1 2026 | v2 | 2026-05-21 |

La **v2** include il campo `fmt`, cioè fa il roundtrip anche della formattazione;
la v1 no. Il foglio PdS non è mai incluso nell'export e viene ignorato in import.

Stavano alla radice della cartella amministrativa, orfani e senza che nulla li
nominasse — sembravano scarti. Sono stati portati qui il 2026-09-21, quando si è
visto che `Storage.gs` li sa leggere.

**Un export nuovo va aggiunto qui**, con il nome `orario<semestre>-<anno>.json`.
