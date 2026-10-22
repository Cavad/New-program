/*
 * Excel output. Works on any copy of the timesheet form (uploaded per month or the built-in one):
 * finds the header row with day numbers, rebuilds the employee rows for the current list, moves the
 * legend/signature block below them, adapts the day columns to the month length and recolours.
 */
(function (root) {
  const TS = (root.TS = root.TS || {});
  const U = TS.util;

  function lib() {
    const E = root.ExcelJS;
    if (!E) throw new Error('ExcelJS library is not loaded');
    return E;
  }

  /* ------------------------------------------------------------------ helpers */

  function plain(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map((t) => t.text).join('');
      if (Object.prototype.hasOwnProperty.call(v, 'result')) return v.result === undefined ? null : v.result;
      if (v.text !== undefined) return v.text;
      if (v.formula || v.sharedFormula) return null;
    }
    return v;
  }

  function dayNo(v) {
    v = plain(v);
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31) return v;
    if (typeof v === 'string' && /^\s*\d{1,2}\s*$/.test(v)) return parseInt(v, 10);
    if (v instanceof Date) return v.getDate();
    return null;
  }

  function argb(hex) {
    const h = String(hex || '#FFFFFF').replace('#', '').toUpperCase();
    return 'FF' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padStart(6, '0').slice(0, 6));
  }

  function solid(color) {
    return { type: 'pattern', pattern: 'solid', fgColor: color, bgColor: { indexed: 64 } };
  }

  function fillFor(hex, excelFill) {
    if (excelFill) return solid({ theme: excelFill.theme, tint: excelFill.tint });
    return solid({ argb: argb(hex) });
  }

  function parseRange(ref) {
    const m = String(ref).replace(/\$/g, '').split('!').pop().match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
    if (!m) return null;
    const left = U.colNumber(m[1]);
    const top = parseInt(m[2], 10);
    const right = m[3] ? U.colNumber(m[3]) : left;
    const bottom = m[4] ? parseInt(m[4], 10) : top;
    return { top, left, bottom, right };
  }

  function rangeRef(r) {
    return U.colLetter(r.left) + r.top + ':' + U.colLetter(r.right) + r.bottom;
  }

  function cloneStyle(s) {
    return s ? JSON.parse(JSON.stringify(s)) : {};
  }

  /* ------------------------------------------------------------------ template detection */

  /** Locates the parts of the form. Throws a readable error if the sheet is not a timesheet. */
  function detect(ws) {
    let header = null;
    const maxScanRow = Math.min(40, Math.max(ws.rowCount, 10));
    for (let r = 1; r <= maxScanRow && !header; r++) {
      const row = ws.getRow(r);
      const last = Math.max(row.cellCount, 40);
      for (let c = 1; c <= last; c++) {
        if (dayNo(row.getCell(c).value) !== 1) continue;
        let n = 1;
        while (dayNo(row.getCell(c + n).value) === n + 1) n++;
        if (n >= 28) { header = { row: r, dayCol: c, days: n }; break; }
      }
    }
    if (!header) throw new Error('NO_HEADER');
    const hr = ws.getRow(header.row);
    const lastDayCol = header.dayCol + header.days - 1;
    const find = (from, to, re) => {
      for (let c = from; c <= to; c++) {
        const v = plain(hr.getCell(c).value);
        if (v !== null && re.test(U.fold(v))) return c;
      }
      return null;
    };
    const left = Math.max(1, header.dayCol - 8);
    const cols = {
      no: find(left, header.dayCol - 1, /№|^NO\b|^N\b|^#|S\/S|SIRA/),
      sap: find(left, header.dayCol - 1, /SAP|TABEL|CODE|KOD/),
      name: find(left, header.dayCol - 1, /NAME|AD|SOYAD|FIO/),
      pos: find(left, header.dayCol - 1, /POSITION|VEZIFE|TITLE/),
      hours: find(lastDayCol + 1, lastDayCol + 8, /HOUR|SAAT/),
      daysTotal: find(lastDayCol + 1, lastDayCol + 8, /DAY|GUN/),
    };
    if (!cols.pos) cols.pos = header.dayCol - 1;
    if (!cols.name) cols.name = cols.pos - 1;
    if (!cols.sap) cols.sap = cols.name - 1;
    if (!cols.no) cols.no = cols.sap - 1 >= 1 ? cols.sap - 1 : null;
    if (!cols.hours) cols.hours = lastDayCol + 1;
    if (!cols.daysTotal) cols.daysTotal = cols.hours + 1;

    // employee rows: numbered or bordered rows right under the header
    let empEnd = header.row;
    for (let r = header.row + 1; r <= header.row + 300; r++) {
      const row = ws.getRow(r);
      const no = cols.no ? plain(row.getCell(cols.no).value) : null;
      const nameCell = row.getCell(cols.name);
      const dayCell = row.getCell(header.dayCol);
      const bordered = !!(dayCell.border && dayCell.border.left && dayCell.border.left.style) ||
        !!(nameCell.border && nameCell.border.left && nameCell.border.left.style);
      const hasNum = typeof no === 'number';
      const legendish = (() => {
        for (let c = 1; c < header.dayCol; c++) {
          const v = plain(row.getCell(c).value);
          if (typeof v === 'string' && /^(MC|DO|V|SL|BT|ML|OFF|PH|PL|EL|MD|HL|TR|AM)$/i.test(v.trim())) return true;
        }
        return false;
      })();
      if (legendish && !hasNum) break;
      if (hasNum || (bordered && r === empEnd + 1)) empEnd = r;
      else break;
    }

    // bottom of the used area (values, merges or print area)
    let lastRow = ws.rowCount;
    let lastCol = Math.max(ws.columnCount, cols.daysTotal);
    for (const m of ws.model.merges || []) {
      const rg = parseRange(m);
      if (rg) { lastRow = Math.max(lastRow, rg.bottom); lastCol = Math.max(lastCol, rg.right); }
    }
    const pa = ws.pageSetup && ws.pageSetup.printArea ? parseRange(String(ws.pageSetup.printArea).split(',')[0]) : null;

    // title / department / date cells
    let title = null;
    let dept = null;
    for (let r = 1; r < header.row; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= lastCol; c++) {
        const v = plain(row.getCell(c).value);
        if (typeof v !== 'string') continue;
        const f = U.fold(v);
        if (!title && (/TIMESHEET|TABEL/.test(f) || U.detectMonth(v))) title = { row: r, col: c, text: v };
        if (!dept && /DEPART|TEAM|SOBE|BOLME/.test(f)) dept = { row: r, col: c, text: v };
      }
    }
    let dateCell = null;
    for (let r = empEnd + 1; r <= lastRow && !dateCell; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= lastCol; c++) {
        const v = plain(row.getCell(c).value);
        if (typeof v === 'string' && /^(DATE|TARIX)\b/.test(U.fold(v).trim())) { dateCell = { row: r, col: c + 1 }; break; }
      }
    }
    return {
      ws, headerRow: header.row, dayCol: header.dayCol, days: header.days, lastDayCol, cols,
      empStart: header.row + 1, empEnd, lastRow, lastCol, printArea: pa, title, dept, dateCell,
    };
  }

  function findSheet(wb) {
    const errors = [];
    for (const ws of wb.worksheets) {
      if (ws.state && ws.state !== 'visible') continue;
      try { return detect(ws); } catch (e) { errors.push(ws.name + ': ' + e.message); }
    }
    throw new Error('NO_TIMESHEET');
  }

  /* ------------------------------------------------------------------ built-in form generator (last resort) */

  /** Creates the form from scratch, mirroring the original layout, when no template file can be used. */
  function generateForm() {
    const E = lib();
    const wb = new E.Workbook();
    const ws = wb.addWorksheet('Timesheet', { pageSetup: { orientation: 'landscape', paperSize: 8, margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } } });
    const thin = { style: 'thin' };
    const box = { top: thin, left: thin, bottom: thin, right: thin };
    const accent = solid({ theme: 4, tint: 0.5999938962981048 });
    const white = solid({ theme: 0, tint: 0 });
    const widths = { 1: 6.3, 2: 13, 3: 29.3, 4: 41.5, 36: 6.4, 37: 7.8 };
    for (let c = 1; c <= 40; c++) ws.getColumn(c).width = widths[c] || (c >= 5 && c <= 35 ? 4 : 8.7);
    ws.mergeCells('A1:AN2');
    const t = ws.getCell('A1');
    t.value = 'Timesheet';
    t.font = { name: 'Times New Roman', size: 14, bold: true };
    t.alignment = { horizontal: 'center' };
    t.fill = white;
    for (let c = 1; c <= 40; c++) { const cell = ws.getRow(3).getCell(c); cell.fill = white; cell.border = box; }
    ws.getCell('C3').value = 'Departament/ Team';
    ws.getCell('C3').font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FFFF0000' } };
    ws.getCell('C3').alignment = { horizontal: 'center' };
    const hdr = ['№', 'SAP Code', 'Name Surname', 'Position '];
    ws.getRow(4).height = 24.9;
    hdr.forEach((h, i) => {
      const cell = ws.getRow(4).getCell(i + 1);
      cell.value = h;
    });
    for (let d = 1; d <= 31; d++) ws.getRow(4).getCell(4 + d).value = d;
    ws.getRow(4).getCell(36).value = 'Total hours';
    ws.getRow(4).getCell(37).value = 'Total days';
    for (let c = 1; c <= 37; c++) {
      const cell = ws.getRow(4).getCell(c);
      cell.fill = accent;
      cell.border = box;
      const isDay = c >= 5 && c <= 35;
      cell.font = isDay ? { name: 'Calibri', size: 11 } : { name: 'Times New Roman', size: 10, bold: true };
      cell.alignment = isDay ? { horizontal: 'center', vertical: 'top' } : { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
    // one placeholder employee row (styles are copied from it)
    const r = ws.getRow(5);
    r.height = 15;
    for (let c = 1; c <= 37; c++) {
      const cell = r.getCell(c);
      cell.border = box;
      cell.font = { name: c === 3 || c === 4 ? 'Times New Roman' : 'Calibri', size: c === 2 ? 9 : c === 3 ? 9 : c === 4 ? 10 : 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: c <= 4 ? 'middle' : undefined, wrapText: c === 3 || c === 4 };
      if (c > 1) cell.fill = white;
    }
    r.getCell(1).value = 1;
    // legend
    const codes = TS.defaults.defaultCodes().filter((c) => c.kind === 'leave');
    codes.forEach((code, i) => {
      const row = ws.getRow(8 + i);
      const a = row.getCell(2);
      const b = row.getCell(3);
      a.value = code.code;
      b.value = code.en;
      for (const cell of [a, b]) {
        cell.fill = fillFor(code.fill, code.excelFill);
        cell.border = box;
        cell.font = { name: 'Calibri', size: 11, bold: true };
        cell.alignment = { horizontal: 'center' };
      }
    });
    const sig = 8 + codes.length + 3;
    [['Line manager', null], ['Signature', null], ['Date', '']].forEach(([label], i) => {
      const top = sig + i * 2;
      ws.mergeCells(top, 2, top + 1, 2);
      ws.mergeCells(top, 3, top + 1, 3);
      const a = ws.getCell(top, 2);
      a.value = label;
      for (const cell of [a, ws.getCell(top, 3)]) {
        cell.border = box;
        cell.font = { name: 'Times New Roman', size: 10, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
    ws.pageSetup.printArea = 'A1:AO' + (sig + 7);
    return wb;
  }

  /* ------------------------------------------------------------------ fill */

  function excelTitle(text, year, month) {
    const name = U.MONTHS_EN[month - 1];
    const base = String(text || 'Timesheet').trim();
    // replace an existing month + year, or append them
    const re = /(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})?/i;
    if (re.test(base)) return base.replace(re, name + ' ' + year).replace(/\s+$/, '');
    const cleaned = base.replace(/\b20\d\d\b/, '').trim();
    return (cleaned || 'Timesheet') + ' ' + name + ' ' + year;
  }

  function codeStyle(state, value, category) {
    if (value === '' || value === null || value === undefined) return null;
    if (typeof value === 'number') {
      if (category === 'shift') return { fill: state.settings.shiftNumberFill || '#FFFF00' };
      return null;
    }
    const c = TS.compose.findCode(state, value, category);
    return c ? { fill: c.fill, excelFill: c.excelFill, font: c.font } : null;
  }

  /**
   * Fills `wb` (a loaded template) with the composed month. Returns the workbook.
   * `composed` = TS.compose.composeMonth(...)
   */
  function fill(wb, composed, state, opts) {
    opts = opts || {};
    const info = findSheet(wb);
    const ws = info.ws;
    const year = composed.year;
    const month = composed.month;
    const days = composed.days;
    const delta = days - info.days;
    const shiftCol = (c) => (c > info.lastDayCol ? c + delta : c);
    const maxCol = Math.max(info.lastCol, info.cols.daysTotal, info.printArea ? info.printArea.right : 0);

    // 1. merges: remember and dissolve
    const merges = (ws.model.merges || []).map(parseRange).filter(Boolean);
    for (const m of merges) { try { ws.unMergeCells(rangeRef(m)); } catch (e) { /* ignore */ } }

    // 2. snapshots
    const snapRow = (r) => {
      const row = ws.getRow(r);
      const cells = [];
      for (let c = 1; c <= maxCol; c++) {
        const cell = row.getCell(c);
        cells[c] = { value: cell.value, style: cloneStyle(cell.style) };
      }
      return { height: row.height, cells };
    };
    const footerStart = info.empEnd + 1;
    const footer = [];
    for (let r = footerStart; r <= info.lastRow; r++) footer.push(snapRow(r));
    const empTpl = info.empEnd >= info.empStart ? snapRow(info.empStart) : snapRow(info.headerRow);
    if (info.empEnd < info.empStart) {
      // no employee row in the template: derive from header styles without the header fill
      for (let c = 1; c <= maxCol; c++) {
        if (!empTpl.cells[c]) continue;
        empTpl.cells[c].style.fill = solid({ theme: 0, tint: 0 });
        empTpl.cells[c].style.font = Object.assign({}, empTpl.cells[c].style.font, { bold: true, size: 11 });
      }
      empTpl.height = 15;
    }
    const topRows = [];
    for (let r = 1; r <= info.headerRow; r++) topRows.push(snapRow(r));
    const widths = [];
    for (let c = 1; c <= maxCol; c++) widths[c] = ws.getColumn(c).width;

    // 3. clear everything from row 1 to the old bottom (rebuilt below)
    const clearTo = Math.max(info.lastRow, info.printArea ? info.printArea.bottom : 0);
    const clearCols = maxCol + Math.max(delta, 0) + 2;
    for (let r = 1; r <= clearTo; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= clearCols; c++) {
        const cell = row.getCell(c);
        cell.value = null;
        cell.style = {};
      }
      if (r > info.headerRow) row.height = undefined;
    }

    // remap a snapshot row into the new column layout
    const writeRow = (r, snap, extraDayStyleFrom) => {
      const row = ws.getRow(r);
      if (snap.height) row.height = snap.height;
      for (let c = 1; c <= maxCol; c++) {
        const s = snap.cells[c];
        if (!s) continue;
        if (c >= info.dayCol && c <= info.lastDayCol && c - info.dayCol + 1 > days) continue; // dropped day columns
        const nc = shiftCol(c);
        const cell = row.getCell(nc);
        cell.style = cloneStyle(s.style);
        cell.value = s.value;
      }
      if (delta > 0 && extraDayStyleFrom) {
        for (let d = info.days + 1; d <= days; d++) {
          const cell = row.getCell(info.dayCol + d - 1);
          cell.style = cloneStyle(snap.cells[info.lastDayCol].style);
          cell.value = null;
        }
      }
    };

    // 4. top rows (title, department, header)
    topRows.forEach((snap, i) => writeRow(i + 1, snap, true));
    for (let c = 1; c <= maxCol; c++) {
      const nc = shiftCol(c);
      if (c >= info.dayCol && c <= info.lastDayCol && c - info.dayCol + 1 > days) continue;
      if (widths[c] !== undefined) ws.getColumn(nc).width = widths[c];
    }
    for (let d = info.days + 1; d <= days; d++) ws.getColumn(info.dayCol + d - 1).width = widths[info.lastDayCol] || 4;
    if (delta < 0) {
      // columns freed at the right edge
      for (let c = maxCol + delta + 1; c <= maxCol; c++) ws.getColumn(c).width = widths[maxCol] || 8.7;
    }
    const hRow = ws.getRow(info.headerRow);
    for (let d = 1; d <= days; d++) hRow.getCell(info.dayCol + d - 1).value = d;

    // 5. employee rows
    const firstDayL = U.colLetter(info.dayCol);
    const lastDayL = U.colLetter(info.dayCol + days - 1);
    const weekendFill = solid({ theme: 4, tint: 0.5999938962981048 });
    const n = composed.rows.length;
    composed.rows.forEach((rowData, i) => {
      const r = info.headerRow + 1 + i;
      writeRow(r, empTpl, true);
      const row = ws.getRow(r);
      row.height = empTpl.height || 15;
      const emp = rowData.emp;
      const cat = emp.category;
      const catFill = solid({ argb: argb(TS.defaults.CATEGORY_FILL[cat] || '#FFFFFF') });
      if (info.cols.no) row.getCell(info.cols.no).value = i + 1;
      const sapCell = row.getCell(info.cols.sap);
      sapCell.value = /^\d+$/.test(String(emp.sap || '').trim()) ? Number(emp.sap) : (emp.sap || null);
      sapCell.fill = catFill;
      sapCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
      sapCell.alignment = { horizontal: 'center', vertical: 'middle' };
      const nameCell = row.getCell(info.cols.name);
      nameCell.value = emp.name;
      const posCell = row.getCell(info.cols.pos);
      posCell.value = emp.position || null;
      for (const cell of [nameCell, posCell]) {
        cell.fill = catFill;
        cell.font = { name: 'Times New Roman', size: 11, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
      for (let d = 1; d <= days; d++) {
        const cell = row.getCell(info.dayCol + d - 1);
        const v = rowData.cells[d].v;
        cell.value = v === '' || v === undefined ? null : v;
        const cs = codeStyle(state, v, cat);
        const baseFont = Object.assign({}, cell.font || {}, { bold: true });
        if (cat === 'shift') Object.assign(baseFont, { name: 'Calibri', size: 12 });
        if (cs) {
          cell.fill = fillFor(cs.fill, cs.excelFill);
          cell.font = Object.assign(baseFont, cs.font && cs.font.toUpperCase() !== '#000000' ? { color: { argb: argb(cs.font) } } : { color: { argb: 'FF000000' } });
        } else {
          cell.fill = composed.weekend[d] ? weekendFill : solid({ theme: 0, tint: 0 });
          cell.font = baseFont;
        }
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
      const hCol = shiftCol(info.cols.hours);
      const dCol = shiftCol(info.cols.daysTotal);
      row.getCell(hCol).value = { formula: `SUM(${firstDayL}${r}:${lastDayL}${r})`, result: rowData.hours };
      row.getCell(dCol).value = { formula: `COUNT(${firstDayL}${r}:${lastDayL}${r})`, result: rowData.dayCount };
    });

    // 6. footer (legend, signatures) below the employees
    const newFooterStart = info.headerRow + 1 + n;
    const offset = newFooterStart - footerStart;
    footer.forEach((snap, i) => writeRow(newFooterStart + i, snap, false));

    // 7. merges back, shifted
    for (const m of merges) {
      const nm = Object.assign({}, m);
      if (m.top > info.empEnd) { nm.top += offset; nm.bottom += offset; }
      else if (m.top >= info.empStart && m.top <= info.empEnd) continue; // merges inside old employee rows are dropped
      if (m.left > info.lastDayCol) nm.left += delta;
      if (m.right > info.lastDayCol) nm.right += delta;
      if (nm.right < nm.left) continue;
      if (nm.right === nm.left && nm.bottom === nm.top) continue;
      try { ws.mergeCells(rangeRef(nm)); } catch (e) { /* overlapping merge - skip */ }
    }

    // 8. texts
    const tCell = info.title ? ws.getCell(info.title.row, shiftCol(info.title.col)) : ws.getCell('A1');
    tCell.value = excelTitle(info.title ? info.title.text : 'Timesheet', year, month);
    if (info.dept && state.settings.department) ws.getCell(info.dept.row, shiftCol(info.dept.col)).value = state.settings.department;
    if (info.dateCell) {
      const dc = ws.getCell(info.dateCell.row + offset, shiftCol(info.dateCell.col));
      const now = opts.date || new Date();
      dc.value = String(now.getDate()).padStart(2, '0') + '.' + String(now.getMonth() + 1).padStart(2, '0') + '.' + now.getFullYear();
    }
    try { ws.name = (U.MONTHS_EN[month - 1] + ' ' + year).slice(0, 31); } catch (e) { /* duplicate name */ }

    // 9. print area, conditional formatting, view
    const pa = info.printArea || { top: 1, left: 1, right: maxCol, bottom: info.lastRow };
    const newBottom = Math.max(pa.bottom + offset, newFooterStart + footer.length - 1);
    ws.pageSetup.printArea = 'A1:' + U.colLetter(pa.right > info.lastDayCol ? pa.right + delta : pa.right) + newBottom;
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 0;
    const sapL = U.colLetter(info.cols.sap);
    const first = info.headerRow + 1;
    const last = info.headerRow + n;
    ws.conditionalFormattings = [];
    if (n > 1) {
      ws.addConditionalFormatting({
        ref: `${sapL}${first}:${sapL}${last}`,
        rules: [{
          type: 'expression', priority: 1,
          formulae: [`COUNTIF($${sapL}$${first}:$${sapL}$${last},${sapL}${first})>1`],
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } },
        }],
      });
    }
    const zoom = (ws.views && ws.views[0] && ws.views[0].zoomScale) || 80;
    ws.views = [{ state: 'frozen', xSplit: info.dayCol - 1, ySplit: info.headerRow, zoomScale: zoom, zoomScaleNormal: zoom, activeCell: U.colLetter(info.dayCol) + first }];
    wb.calcProperties = Object.assign({}, wb.calcProperties, { fullCalcOnLoad: true });
    return wb;
  }

  function base64ToBytes(b64) {
    if (typeof Buffer !== 'undefined' && !root.document) return Buffer.from(b64, 'base64');
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** Loads the template bytes (uploaded or built-in) and checks it. Falls back to the generated form. */
  async function loadTemplate(bytes) {
    const E = lib();
    if (bytes) {
      const wb = new E.Workbook();
      await wb.xlsx.load(bytes);
      findSheet(wb); // throws if not a timesheet
      return { wb, source: 'file' };
    }
    if (TS.BUILTIN_FORM_B64) {
      try {
        const wb = new E.Workbook();
        await wb.xlsx.load(base64ToBytes(TS.BUILTIN_FORM_B64));
        findSheet(wb);
        return { wb, source: 'builtin' };
      } catch (e) { /* fall through to generator */ }
    }
    return { wb: generateForm(), source: 'generated' };
  }

  /** Full export: returns { bytes: Uint8Array, source } */
  async function exportMonth(state, year, month, templateBytes, opts) {
    const composed = TS.compose.composeMonth(state, year, month);
    let tpl;
    try {
      tpl = await loadTemplate(templateBytes);
    } catch (e) {
      tpl = await loadTemplate(null);
      tpl.fallbackReason = e.message;
    }
    fill(tpl.wb, composed, state, opts);
    const buf = await tpl.wb.xlsx.writeBuffer();
    return { bytes: new Uint8Array(buf), source: tpl.source, fallbackReason: tpl.fallbackReason, composed };
  }

  /** Validates an uploaded template; returns a short description or throws. */
  async function inspectTemplate(bytes) {
    const E = lib();
    const wb = new E.Workbook();
    await wb.xlsx.load(bytes);
    const info = findSheet(wb);
    const tMonth = info.title ? U.detectMonth(info.title.text) : null;
    const tYear = info.title ? U.detectYear(info.title.text) : null;
    return { sheet: info.ws.name, days: info.days, rows: info.empEnd - info.empStart + 1, month: tMonth, year: tYear };
  }

  /**
   * Reads a filled timesheet (e.g. last month's) to rebuild the employee list.
   * Category is guessed from the row colour (yellow/green/blue) or position.
   */
  async function readEmployees(bytes) {
    const E = lib();
    const wb = new E.Workbook();
    await wb.xlsx.load(bytes);
    const info = findSheet(wb);
    const ws = info.ws;
    const out = [];
    for (let r = info.empStart; r <= info.empEnd; r++) {
      const row = ws.getRow(r);
      const name = plain(row.getCell(info.cols.name).value);
      if (!name || !String(name).trim()) continue;
      const sap = plain(row.getCell(info.cols.sap).value);
      const pos = plain(row.getCell(info.cols.pos).value);
      const fillc = row.getCell(info.cols.name).fill;
      const rgb = fillc && fillc.fgColor && fillc.fgColor.argb ? fillc.fgColor.argb.slice(2).toUpperCase() : '';
      let category = 'office';
      if (rgb === '00B050') category = 'shift';
      else if (rgb === '00B0F0') category = 'rotation';
      else if (/SHIFT|WEIGHBRIDGE|BANKSMAN|NOVBE/.test(U.fold(pos || ''))) category = 'shift';
      else if (/ROUSTABOUT|TECHNICIAN/.test(U.fold(pos || ''))) category = 'rotation';
      // rotation group from who works on day 1/2
      let group = '';
      if (category === 'rotation') {
        const d1 = plain(row.getCell(info.dayCol).value);
        const d2 = plain(row.getCell(info.dayCol + 1).value);
        group = (typeof d1 === 'number' || typeof d2 === 'number') ? 'A' : 'B';
      }
      out.push({ sap: sap === null ? '' : String(sap).trim(), name: String(name).replace(/\s+/g, ' ').trim(), position: pos ? String(pos).trim() : '', category, group });
    }
    return out;
  }

  TS.excel = { detect, findSheet, fill, generateForm, loadTemplate, exportMonth, inspectTemplate, readEmployees, excelTitle, plain };
})(typeof window !== 'undefined' ? window : globalThis);
