// === Sorgenti / output ===
// (Prefix e output del foglio aule sono dinamici: detectAuleConfig() in Config.gs.)
const DAYS_LABELS = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];

// === Slot orari ===
const SLOT_START_MIN = 8 * 60 + 30;
const SLOT_END_MIN = 19 * 60 + 30;
const SLOT_STEP_MIN = 30;

// === Layout S1AULE ===
const TAB_DATA_START_ROW = 2;
const TAB_COL_AULA = 1;
const TAB_COL_DAY = 2;
const TAB_COL_SLOT_START = 3;

// === Larghezze colonne (px) ===
const TAB_W_AULA = 100;
const TAB_W_DAY = 50;
const TAB_W_SLOT = 60;
const TAB_W_TOT = 60;

// === Colori e stili ===
const TAB_HEADER_BG = '#e8f0fe';
const TAB_DEFAULT_FG = '#000000';
const TAB_BORDER_COLOR = '#666666';
const TAB_BORDER_THIN = SpreadsheetApp.BorderStyle.SOLID;
const TAB_BORDER_THICK = SpreadsheetApp.BorderStyle.SOLID_THICK;

// === Conflitti / indisponibilità ===
const CONFLICT_BG = '#f4cccc';
const UNAVAIL_BG = '#cccccc';
const UNAVAIL_FG = '#ffffff';
const UNAVAIL_FONT_SIZE = 10;
const UNAVAIL_MARKER_REGEX = /^\s*non\s*disp/i;

function tabellaAule() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { prefix: AULE_PREFIX, output: AULE_OUTPUT } = detectAuleConfig();
  const sources = ss.getSheets().filter(s => {
    const n = s.getName();
    return n.toUpperCase().startsWith(AULE_PREFIX) && n !== AULE_OUTPUT;
  });
  if (!sources.length) {
    SpreadsheetApp.getUi().alert(`Nessun foglio "${AULE_PREFIX}*" trovato (escluso ${AULE_OUTPUT}).`);
    return;
  }

  const slots = [];
  for (let m = SLOT_START_MIN; m + SLOT_STEP_MIN <= SLOT_END_MIN; m += SLOT_STEP_MIN) slots.push(m);
  const nSlots = slots.length;
  const nDays = DAYS_LABELS.length;

  // Pulisci eventuali evidenziazioni rosse residue (solo CONFLICT_BG) in J:O
  sources.forEach(sheet => clearConflictHighlights(sheet));

  // Pre-leggi indisponibilità manuali da S1AULE (prima di qualsiasi wipe)
  const preReadOut = ss.getSheetByName(AULE_OUTPUT);
  const unavailItems = preReadOut
    ? readUnavailability(preReadOut, nDays, nSlots)
    : [];
  const unavailMap = {};
  unavailItems.forEach(it => {
    if (!unavailMap[it.room]) {
      unavailMap[it.room] = Array.from({ length: nDays }, () => new Array(nSlots).fill(null));
    }
    for (let c = 0; c < it.span; c++) {
      const si = it.slotIdx + c;
      if (si < nSlots) unavailMap[it.room][it.dayIdx][si] = it;
    }
  });

  // Phase 1: mappa mutuanti per codice padre (calcolata su tutti i fogli)
  const mutuantiByParent = buildMutuantiMap(sources);

  // occ[room][day][slot] = { tag, names: [], origin: "S1LT!J5" }
  const occ = {};
  const conflicts = [];
  const conflictCells = {}; // sheetName -> Set di A1
  const parseIssues = [];

  function markConflict(sheetName, a1) {
    if (!conflictCells[sheetName]) conflictCells[sheetName] = {};
    conflictCells[sheetName][a1] = true;
  }

  sources.forEach(sheet => {
    const lastRow = sheet.getLastRow();
    if (lastRow < HEADER_ROWS + 1) return;
    const fullRange = sheet.getRange(HEADER_ROWS + 1, 1, lastRow - HEADER_ROWS, ROW_DATA_LAST_COL);
    const data = fullRange.getValues();
    const bgs = fullRange.getBackgrounds();
    const tabColor = readTabColor(sheet);
    data.forEach((row, rIdx) => {
      const code = row[COL_CODICE - 1];
      // Riga mutuata: salta completamente, non aggiunge occupazioni
      if (parseMutuazione(row[COL_MUTUATO - 1])) return;
      const name = row[COL_NOMECORSO - 1];
      const tipo = row[COL_TIPO - 1];
      const group = row[COL_GRUPPO - 1];
      const titolare = row[COL_TITOLARE - 1];
      const periodoRaw = row[COL_PERIODO - 1];
      const periodoStr = periodoRaw
        ? String(periodoRaw).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
        : '';
      const vincoloRaw = row[COL_VINCOLO - 1];
      const vincoloKey = vincoloRaw ? String(vincoloRaw).trim().toUpperCase() : '';
      const staticBg = bgs[rIdx][COL_VINCOLO - 1];
      const vincoloBg = !isWhiteOrEmpty(staticBg)
        ? staticBg
        : (VINCOLO_FALLBACK_COLORS[vincoloKey] || VINCOLO_DEFAULT_COLOR);
      if (!code) return;
      const tag = group ? `${code} [${group}]` : String(code);
      const courseName = name ? String(name) : '';
      const groupStr = group ? String(group) : '';
      const tipoStr = tipo ? String(tipo).trim() : '';
      const titolareStr = titolare ? String(titolare).trim() : '';
      for (let d = 0; d < nDays; d++) {
        const cellText = row[CALENDAR_COLS_START - 1 + d];
        if (!cellText) continue;
        const a1 = sheet.getRange(HEADER_ROWS + 1 + rIdx, CALENDAR_COLS_START + d).getA1Notation();
        const origin = `${sheet.getName()}!${a1}`;
        const parsed = extractSessions(String(cellText));
        parsed.errors.forEach(e => parseIssues.push(`${origin}: ${e}`));
        parsed.list.forEach(s => {
          if (!occ[s.room]) {
            occ[s.room] = Array.from({ length: nDays }, () =>
              Array.from({ length: nSlots }, () => null));
          }
          const newEntry = {
            tag: tag,
            code: String(code),
            name: courseName,
            group: groupStr,
            tipo: tipoStr,
            titolare: titolareStr,
            periodo: periodoStr,
            bg: vincoloBg || VINCOLO_DEFAULT_COLOR,
            fg: tabColor,
            origin: origin,
            sessStart: s.start,
            sessEnd: s.end
          };
          const periodKey = periodoStr.toLowerCase();
          for (let i = 0; i < nSlots; i++) {
            const slotStart = slots[i];
            const slotEnd = slotStart + SLOT_STEP_MIN;
            if (slotStart >= s.start && slotEnd <= s.end) {
              const unav = unavailMap[s.room] && unavailMap[s.room][d] && unavailMap[s.room][d][i];
              if (unav) {
                conflicts.push(
                  `${s.room} • ${DAYS_LABELS[d]} ${fmtMin(slotStart)}-${fmtMin(slotEnd)}: ` +
                  `${unav.text} (S1AULE) vs "${tag}" (${origin})`
                );
                markConflict(origin.split('!')[0], origin.split('!')[1]);
                continue;
              }
              if (!occ[s.room][d][i]) occ[s.room][d][i] = { entries: [] };
              const entries = occ[s.room][d][i].entries;
              // Conflict check: stessa slot+stesso period+tag diverso → conflitto
              let conflict = null;
              let alreadySameTag = false;
              for (const ex of entries) {
                if (ex.tag === tag) { alreadySameTag = true; break; }
                if (ex.periodo.toLowerCase() === periodKey) { conflict = ex; break; }
              }
              if (alreadySameTag) continue;
              if (conflict) {
                conflicts.push(
                  `${s.room} • ${DAYS_LABELS[d]} ${fmtMin(slotStart)}-${fmtMin(slotEnd)}: ` +
                  `"${conflict.tag}"${conflict.periodo ? ' [' + conflict.periodo + ']' : ''} (${conflict.origin}) vs ` +
                  `"${tag}"${periodoStr ? ' [' + periodoStr + ']' : ''} (${origin})`
                );
                const [shA, a1A] = conflict.origin.split('!');
                const [shB, a1B] = origin.split('!');
                markConflict(shA, a1A);
                markConflict(shB, a1B);
                continue;
              }
              entries.push(newEntry);
            }
          }
        });
      }
    });
  });

  if (conflicts.length) {
    Object.keys(conflictCells).forEach(sheetName => {
      const sh = ss.getSheetByName(sheetName);
      if (!sh) return;
      Object.keys(conflictCells[sheetName]).forEach(a1 => {
        sh.getRange(a1).setBackground(CONFLICT_BG);
      });
    });
    Logger.log(conflicts.join('\n'));
    showConflictsDialog(conflicts, parseIssues);
    return;
  }

  // Read existing rooms from S1AULE.
  // Layout: blocchi di nDays righe, col A merged sul blocco con testo multiriga:
  //   riga 1 del testo = nome aula
  //   riga 2 del testo = capienza
  //   riga 3+ del testo = ignorate (note libere)
  let out = ss.getSheetByName(AULE_OUTPUT);
  const existingRooms = [];
  const capMap = {};
  if (out) {
    const lr = out.getLastRow();
    if (lr >= 2) {
      const colA = out.getRange(2, 1, lr - 1, 1).getValues().map(r => r[0]);
      const colB = out.getRange(2, 2, lr - 1, 1).getValues().map(r => r[0]);
      const seen = {};
      const blockSize = nDays;
      for (let i = 0; i < colA.length; i += blockSize) {
        const raw = colA[i];
        if (raw === '' || raw === null) continue;
        const lines = String(raw).split(/\r?\n/).map(s => s.trim()).filter(s => s.length);
        if (!lines.length) continue;
        const name = lines[0];
        if (DAYS_LABELS.indexOf(name) !== -1) continue;
        if (seen[name]) continue;
        seen[name] = true;
        let cap = lines[1] || '';
        if (cap === '' && i + 1 < colA.length) {
          const r2 = colA[i + 1];
          if (r2 !== '' && r2 !== null) cap = r2;
        }
        if (cap === '' && colB[i] !== '' && colB[i] !== null) cap = colB[i];
        existingRooms.push(name);
        capMap[name] = cap;
      }
    }
  } else {
    out = ss.insertSheet(AULE_OUTPUT);
  }

  // Aule trovate nei dati ma non presenti in col A
  const existingSet = {};
  existingRooms.forEach(r => existingSet[r] = true);
  const newRooms = Object.keys(occ).filter(r => !existingSet[r]).sort(roomCompare);

  let acceptedNew = [];
  if (newRooms.length) {
    const ui = SpreadsheetApp.getUi();
    const resp = ui.alert(
      'Aule non in S1AULE',
      `Le seguenti aule sono usate nei fogli sorgente ma non sono in S1AULE:\n\n` +
      `${newRooms.join(', ')}\n\nAggiungerle in coda?`,
      ui.ButtonSet.YES_NO_CANCEL
    );
    if (resp === ui.Button.CANCEL || resp === ui.Button.CLOSE) {
      ss.toast('Operazione annullata.', 'Tabella aule', 3);
      return;
    }
    if (resp === ui.Button.YES) acceptedNew = newRooms;
    // se NO: sessioni di quelle aule verranno scartate
  }

  // SMERGE TUTTO + reset bordi prima di ricostruire
  const fullSheet = out.getRange(1, 1, out.getMaxRows(), out.getMaxColumns());
  fullSheet.breakApart();
  out.clear();
  out.clearNotes();
  fullSheet.setBorder(false, false, false, false, false, false);

  const rooms = existingRooms.concat(acceptedNew);
  const roomsSet = {};
  rooms.forEach(r => roomsSet[r] = true);
  const ignoredRooms = newRooms.filter(r => !roomsSet[r]);

  // Layout: una riga per (aula, giorno). Col A: riga 1 blocco = nome, riga 2 blocco = capienza.
  const COL_AULA = TAB_COL_AULA, COL_DAY = TAB_COL_DAY, COL_SLOT_START = TAB_COL_SLOT_START;
  const totalCols = 2 + nSlots + 1;

  const header = new Array(totalCols).fill('');
  header[0] = 'Aula';
  header[1] = 'Giorno';
  for (let i = 0; i < nSlots; i++) header[COL_SLOT_START - 1 + i] = fmtMin(slots[i]);
  header[totalCols - 1] = 'Tot ore';
  out.getRange(1, 1, 1, totalCols).setValues([header])
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground(TAB_HEADER_BG);
  out.setFrozenRows(1);
  out.setFrozenColumns(0);

  if (rooms.length) {
    const dataStartRow = TAB_DATA_START_ROW;
    const blockSize = nDays;
    const totalDataRows = rooms.length * blockSize;

    // Bulk-write skeleton: per ogni aula, blockSize righe con day labels in col B.
    // Col A: solo riga 0 del blocco contiene nome+capienza multiriga (poi mergiata).
    const skeleton = [];
    rooms.forEach(room => {
      DAYS_LABELS.forEach((dayLabel, d) => {
        const r = new Array(totalCols).fill('');
        r[1] = dayLabel;
        skeleton.push(r);
      });
    });
    out.getRange(dataStartRow, 1, totalDataRows, totalCols).setValues(skeleton);

    // Col A: merge sul blocco e scrittura RichText (nome bold + capienza italic sotto)
    rooms.forEach((room, rIdx) => {
      const baseRow = dataStartRow + rIdx * blockSize;
      const cap = capMap[room];
      const capStr = (cap !== undefined && cap !== null && String(cap).trim() !== '')
        ? String(cap).trim() : '';
      const text = capStr ? `${room}\n${capStr}` : room;
      const bold = SpreadsheetApp.newTextStyle().setBold(true).build();
      const italic = SpreadsheetApp.newTextStyle().setItalic(true).build();
      const rtb = SpreadsheetApp.newRichTextValue()
        .setText(text)
        .setTextStyle(0, room.length, bold);
      if (capStr) rtb.setTextStyle(room.length + 1, text.length, italic);
      const cell = out.getRange(baseRow, COL_AULA, blockSize, 1);
      cell.merge();
      cell.setRichTextValue(rtb.build())
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle')
        .setWrap(true);
    });

    // Per ogni (aula, giorno): merge dei run di slot con stessa "signature" di entries
    function entriesSignature(entries) {
      return entries
        .map(e => e.tag + '\x1f' + (e.periodo || '').toLowerCase())
        .sort()
        .join('|');
    }

    rooms.forEach((room, rIdx) => {
      const baseRow = dataStartRow + rIdx * blockSize;
      const occRoom = occ[room];
      for (let d = 0; d < nDays; d++) {
        const sheetRow = baseRow + d;
        let totSlots = 0;
        if (occRoom) {
          let i = 0;
          while (i < nSlots) {
            const slotCell = occRoom[d][i];
            if (!slotCell || !slotCell.entries.length) { i++; continue; }
            const sig = entriesSignature(slotCell.entries);
            let j = i + 1;
            while (j < nSlots) {
              const next = occRoom[d][j];
              if (!next || !next.entries.length) break;
              if (entriesSignature(next.entries) !== sig) break;
              j++;
            }
            const span = j - i;
            const range = out.getRange(sheetRow, COL_SLOT_START + i, 1, span);
            if (span > 1) range.merge();
            const slotFrom = fmtMin(slots[i]);
            const slotTo = fmtMin(slots[j - 1] + SLOT_STEP_MIN);

            // Build display single-line:
            //   "CODICE1 [G1] / CODICE2 [G2] Titolo1 / Titolo2"
            // (codici+gruppi in bold, titoli in normal)
            const sortedEntries = slotCell.entries.slice()
              .sort((a, b) => (a.periodo || '').localeCompare(b.periodo || ''));
            const codesBlock = sortedEntries.map(e => e.tag).join(' / ');
            const seenNames = {};
            const namesArr = [];
            sortedEntries.forEach(e => {
              if (!e.name) return;
              if (seenNames[e.name]) return;
              seenNames[e.name] = true;
              namesArr.push(e.name);
            });
            const namesBlock = namesArr.join(' / ');
            const displayText = namesBlock ? `${codesBlock} ${namesBlock}` : codesBlock;
            const boldStyle = SpreadsheetApp.newTextStyle().setBold(true).build();
            const normalStyle = SpreadsheetApp.newTextStyle().setBold(false).build();
            const rtb = SpreadsheetApp.newRichTextValue()
              .setText(displayText)
              .setTextStyle(0, codesBlock.length, boldStyle);
            if (displayText.length > codesBlock.length) {
              rtb.setTextStyle(codesBlock.length, displayText.length, normalStyle);
            }

            // Note (hover): blocchi separati per ogni entry
            const noteBlocks = sortedEntries.map(e => {
              const lines = [
                `${e.code}${e.name ? ' - ' + e.name : ''}`,
                `${slotFrom}-${slotTo} ${room}`
              ];
              if (e.titolare) lines.push(`Titolare: ${e.titolare}`);
              if (e.tipo) lines.push(`Tipo: ${tipoLabel(e.tipo)}`);
              lines.push(`Gruppo: ${e.group || 'N/A'}`);
              if (e.periodo) lines.push(`Periodo: ${e.periodo}`);
              const mutLista = mutuantiByParent[e.code];
              if (mutLista && mutLista.length) lines.push(`Mutuazione: ${formatMutuanti(mutLista)}`);
              return lines.join('\n');
            });
            const noteText = noteBlocks.join('\n— — —\n');

            const firstEntry = sortedEntries[0];
            range.setRichTextValue(rtb.build());
            range.setBackground(firstEntry.bg || VINCOLO_DEFAULT_COLOR);
            range.setFontColor(firstEntry.fg || TAB_DEFAULT_FG);
            range.setHorizontalAlignment('left');
            range.setVerticalAlignment('middle');
            range.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
            range.setNote(noteText);
            range.setBorder(true, true, true, true, null, null,
              TAB_BORDER_COLOR, TAB_BORDER_THIN);
            totSlots += span;
            i = j;
          }
        }
        out.getRange(sheetRow, totalCols)
          .setValue(totSlots * (SLOT_STEP_MIN / 60))
          .setHorizontalAlignment('center').setFontWeight('bold');
      }
    });

    // Bordi: solo (1) orizzontale grosso fra aule, (2) bordo cella per ogni slot
    // di lezione [già applicato sopra al momento del merge], (3) verticale grosso prima della col Tot.

    // Bordo intorno a ogni slot di lezione: applicato sopra al momento del merge.

    // Riapplica indisponibilità manuali (NON DISPONIBILE) preservate prima del wipe
    unavailItems.forEach(it => {
      const rIdx = rooms.indexOf(it.room);
      if (rIdx < 0) return;
      const sheetRow = dataStartRow + rIdx * blockSize + it.dayIdx;
      const colStart = COL_SLOT_START + it.slotIdx;
      const span = Math.min(it.span, nSlots - it.slotIdx);
      if (span <= 0) return;
      const range = out.getRange(sheetRow, colStart, 1, span);
      if (span > 1) range.merge();
      range.setValue(it.text)
        .setBackground(UNAVAIL_BG)
        .setFontColor(UNAVAIL_FG)
        .setFontWeight('bold')
        .setFontStyle('normal')
        .setFontSize(UNAVAIL_FONT_SIZE)
        .setHorizontalAlignment('left')
        .setVerticalAlignment('middle')
        .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
        .setBorder(true, true, true, true, null, null,
          TAB_BORDER_COLOR, TAB_BORDER_THIN);
    });

    // Bordi medium APPLICATI PER ULTIMI (per non essere sovrascritti da slot/unavail)
    // Orizzontale: top di ogni blocco dal 2° in poi.
    // Split in 2 chiamate separate per col A (mergiata) e per il resto della riga,
    // così Sheets applica correttamente il bordo anche al merged.
    rooms.forEach((_, rIdx) => {
      if (rIdx === 0) return;
      const topRow = dataStartRow + rIdx * blockSize;
      out.getRange(topRow, COL_AULA, blockSize, 1)
        .setBorder(true, null, null, null, null, null,
          TAB_BORDER_COLOR, TAB_BORDER_THICK);
      out.getRange(topRow, COL_DAY, 1, totalCols - 1)
        .setBorder(true, null, null, null, null, null,
          TAB_BORDER_COLOR, TAB_BORDER_THICK);
    });
    // Orizzontale: sotto l'ultima riga (SAB ultima aula)
    const lastBlockTop = dataStartRow + (rooms.length - 1) * blockSize;
    out.getRange(lastBlockTop, COL_AULA, blockSize, 1)
      .setBorder(null, null, true, null, null, null,
        TAB_BORDER_COLOR, TAB_BORDER_THICK);
    out.getRange(dataStartRow + totalDataRows - 1, COL_DAY, 1, totalCols - 1)
      .setBorder(null, null, true, null, null, null,
        TAB_BORDER_COLOR, TAB_BORDER_THICK);
    // Verticale: destra di Giorno
    out.getRange(1, COL_DAY, 1 + totalDataRows, 1)
      .setBorder(null, null, null, true, null, null,
        TAB_BORDER_COLOR, TAB_BORDER_THICK);
    // Verticale: sinistra di Tot ore
    out.getRange(1, totalCols, 1 + totalDataRows, 1)
      .setBorder(null, true, null, null, null, null,
        TAB_BORDER_COLOR, TAB_BORDER_THICK);

    // Centra orizzontalmente la colonna Giorno (B)
    out.getRange(1, COL_DAY, 1 + totalDataRows, 1).setHorizontalAlignment('center');
  }

  out.setColumnWidth(COL_AULA, TAB_W_AULA);
  out.setColumnWidth(COL_DAY, TAB_W_DAY);
  for (let i = 0; i < nSlots; i++) out.setColumnWidth(COL_SLOT_START + i, TAB_W_SLOT);
  out.setColumnWidth(totalCols, TAB_W_TOT);

  if (parseIssues.length) Logger.log(parseIssues.join('\n'));
  if (ignoredRooms.length) Logger.log('Aule ignorate: ' + ignoredRooms.join(', '));
  const unusedCount = rooms.filter(r => !occ[r]).length;
  ss.toast(
    `Aule: ${rooms.length} (di cui ${unusedCount} non usate)` +
    (ignoredRooms.length ? ` • ignorate: ${ignoredRooms.length}` : '') +
    (parseIssues.length ? ` • parsing: ${parseIssues.length}` : ''),
    'Tabella aule',
    5
  );
}

function showConflictsDialog(conflicts, parseIssues) {
  const items = conflicts.map(s => '<li><code>' + escapeHtml(s) + '</code></li>').join('');
  const parseBlock = parseIssues.length
    ? `<p style="color:#888">Anche ${parseIssues.length} problemi di parsing — vedi log.</p>`
    : '';
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:13px">' +
    `<p><b>Esecuzione bloccata:</b> trovati ${conflicts.length} conflitti aula/orario.</p>` +
    `<ul style="padding-left:18px">${items}</ul>` +
    parseBlock +
    '<p>Risolvi i conflitti nei fogli sorgente, poi ri-esegui "Tabella aule".</p>' +
    '</div>';
  const out = HtmlService.createHtmlOutput(html).setWidth(720).setHeight(480);
  SpreadsheetApp.getUi().showModalDialog(out, 'Conflitti aule');
}

function readTabColor(sheet) {
  try {
    const co = sheet.getTabColorObject && sheet.getTabColorObject();
    if (co) {
      const t = co.getColorType && co.getColorType();
      if (t === SpreadsheetApp.ColorType.RGB) return co.asRgbColor().asHexString();
      if (t === SpreadsheetApp.ColorType.THEME) {
        // tema: prendi il colore risolto se possibile
        const rgb = co.asRgbColor && co.asRgbColor();
        if (rgb) return rgb.asHexString();
      }
    }
  } catch (e) {}
  try {
    const c = sheet.getTabColor();
    if (c) return c;
  } catch (e) {}
  return null;
}

function readUnavailability(sheet, nDays, nSlots) {
  const items = [];
  const lr = sheet.getLastRow();
  if (lr < 2) return items;

  // Determina lista aule (riga 0 di ogni blocco col A, multiriga split)
  const blockSize = nDays;
  const colA = sheet.getRange(2, 1, lr - 1, 1).getValues().map(r => r[0]);
  const roomByBlockIdx = [];
  for (let bi = 0; bi * blockSize < colA.length; bi++) {
    const raw = colA[bi * blockSize];
    if (raw === '' || raw === null) { roomByBlockIdx.push(null); continue; }
    const lines = String(raw).split(/\r?\n/).map(s => s.trim()).filter(s => s.length);
    const name = lines.length ? lines[0] : null;
    if (!name || DAYS_LABELS.indexOf(name) !== -1) { roomByBlockIdx.push(null); continue; }
    roomByBlockIdx.push(name);
  }
  if (!roomByBlockIdx.some(x => x)) return items;

  // Layout corrente: COL_SLOT_START = 3 (dopo Aula e Giorno)
  const slotStartCol = 3;
  const dataStartRow = 2;
  const totalRows = roomByBlockIdx.length * blockSize;
  if (sheet.getLastColumn() < slotStartCol) return items;
  const dataArea = sheet.getRange(dataStartRow, slotStartCol, totalRows, nSlots);
  const values = dataArea.getValues();
  const merges = dataArea.getMergedRanges();
  const processed = {};

  merges.forEach(mr => {
    const v = String(mr.getValue() || '').trim();
    if (!UNAVAIL_MARKER_REGEX.test(v)) return;
    const top = mr.getRow();
    const left = mr.getColumn();
    const span = mr.getNumColumns();
    const offsetRow = top - dataStartRow;
    const blockIdx = Math.floor(offsetRow / blockSize);
    const dayIdx = offsetRow % blockSize;
    const slotIdx = left - slotStartCol;
    const room = roomByBlockIdx[blockIdx];
    if (!room || mr.getNumRows() !== 1) return;
    items.push({ room: room, dayIdx: dayIdx, slotIdx: slotIdx, span: span, text: v });
    for (let c = 0; c < span; c++) processed[`${top}:${left + c}`] = true;
  });

  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      const cellRow = dataStartRow + r;
      const cellCol = slotStartCol + c;
      if (processed[`${cellRow}:${cellCol}`]) continue;
      const v = String(values[r][c] || '').trim();
      if (!UNAVAIL_MARKER_REGEX.test(v)) continue;
      const blockIdx = Math.floor(r / blockSize);
      const dayIdx = r % blockSize;
      const room = roomByBlockIdx[blockIdx];
      if (!room) continue;
      items.push({ room: room, dayIdx: dayIdx, slotIdx: c, span: 1, text: v });
    }
  }
  return items;
}

function clearConflictHighlights(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < HEADER_ROWS + 1) return;
  const numCols = CALENDAR_COLS_END - CALENDAR_COLS_START + 1;
  const range = sheet.getRange(HEADER_ROWS + 1, CALENDAR_COLS_START, lastRow - HEADER_ROWS, numCols);
  const bgs = range.getBackgrounds();
  let dirty = false;
  for (let r = 0; r < bgs.length; r++) {
    for (let c = 0; c < bgs[r].length; c++) {
      if (String(bgs[r][c]).toLowerCase() === CONFLICT_BG) {
        bgs[r][c] = null;
        dirty = true;
      }
    }
  }
  if (dirty) range.setBackgrounds(bgs);
}

function fmtMin(min) {
  const h = Math.floor(min / 60), m = min % 60;
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return `${pad(h)}:${pad(m)}`;
}

function roomCompare(a, b) {
  const cat = s => /^aula\b/i.test(s) ? 0 : (/^lab/i.test(s) ? 1 : 2);
  const ca = cat(a), cb = cat(b);
  if (ca !== cb) return ca - cb;
  return a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' });
}

function extractSessions(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
  const list = [];
  const errors = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const split = splitTimeAndRoom(line);
    if (split && split.room) {
      const t = parseTimeRangeRaw(split.time);
      const r = parseRoom(split.room);
      if (t && r) list.push({ start: t.start, end: t.end, room: r });
      else errors.push(`riga "${line}" non parsata`);
      i++;
      continue;
    }
    const tOnly = parseTimeRangeRaw(line);
    if (tOnly) {
      const next = lines[i + 1];
      if (next) {
        const r = parseRoom(next);
        if (r) {
          list.push({ start: tOnly.start, end: tOnly.end, room: r });
          i += 2;
          continue;
        }
      }
      errors.push(`ora "${line}" senza aula riconosciuta`);
      i++;
      continue;
    }
    errors.push(`riga non riconosciuta: "${line}"`);
    i++;
  }
  return { list: list, errors: errors };
}

function parseTimeRangeRaw(s) {
  const m = String(s).match(/^\s*(\d{1,2})\s*[\s:.,\-–—]\s*(\d{2})\s*[\s\-–—]\s*(\d{1,2})\s*[\s:.,\-–—]\s*(\d{2})\s*$/);
  if (!m) return null;
  const h1 = +m[1], m1 = +m[2], h2 = +m[3], m2 = +m[4];
  if (h1 < 0 || h1 > 23 || h2 < 0 || h2 > 23 || m1 < 0 || m1 > 59 || m2 < 0 || m2 > 59) return null;
  const start = h1 * 60 + m1, end = h2 * 60 + m2;
  if (end <= start) return null;
  return { start: start, end: end };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
