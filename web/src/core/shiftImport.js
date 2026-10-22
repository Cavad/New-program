/*
 * Reads the free-form shift worker workbook.
 *
 * The sheet is filled by hand, month after month, in blocks:
 *   - a month label somewhere above ("OKTYABR", "IYUN", "AVQUST" ...)
 *   - a header row with day numbers 1..N (the first day column moves between blocks)
 *   - one row per person with only a first name ("SAMIR", "ROYAL.S", "VƏLİ")
 *   - day cells: 1st / 2nd / N / OFF / 3 / OP / BY ..., and absences written as words that are
 *     spread over several cells: "VA" "CA" "Tİ" "ON", "V" "A" "C" ..., "SİCK LEAVE" followed by empty
 *     cells (Excel text overflow), merged "VACATİON" cells, "ATA" "LIQ" "M" "Ə" "Z" (paternity leave) ...
 * Everything that cannot be determined with confidence is left empty and reported.
 */
(function (root) {
  const TS = (root.TS = root.TS || {});
  const U = TS.util;

  /* ------------------------------------------------------------------ workbook adapter */

  /** Convert a SheetJS workbook into simple grids: rows[r][c] (0-based) + merges. */
  function sheetsFromSheetJS(wb) {
    const XLSX = root.XLSX;
    return wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const rows = [];
      if (ws && ws['!ref']) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let r = range.s.r; r <= range.e.r; r++) {
          const row = [];
          for (let c = 0; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            row.push(cell ? (cell.v === undefined ? (cell.w || null) : cell.v) : null);
          }
          rows[r] = row;
        }
        for (let r = 0; r < range.s.r; r++) rows[r] = [];
      }
      const merges = (ws && ws['!merges']) || [];
      const hidden = !!(wb.Workbook && wb.Workbook.Sheets && (wb.Workbook.Sheets.find((s) => s.name === name) || {}).Hidden);
      return { name, rows, merges: merges.map((m) => ({ s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c } })), hidden };
    });
  }

  function readWorkbook(arrayBuffer) {
    const XLSX = root.XLSX;
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: false });
    return sheetsFromSheetJS(wb);
  }

  /* ------------------------------------------------------------------ block detection */

  function cellAt(sheet, r, c) {
    const row = sheet.rows[r];
    if (!row) return null;
    const v = row[c];
    return v === undefined ? null : v;
  }

  function isBlank(v) {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }

  function dayNumber(v) {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31) return v;
    if (typeof v === 'string' && /^\s*\d{1,2}\s*$/.test(v)) {
      const n = parseInt(v, 10);
      return n >= 1 && n <= 31 ? n : null;
    }
    if (v instanceof Date && !isNaN(v)) return v.getDate();
    return null;
  }

  /** Finds a run of day numbers 1,2,3,... (>= 28 long) in a row. */
  function findDayHeader(sheet, r) {
    const row = sheet.rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (dayNumber(row[c]) !== 1) continue;
      let n = 1;
      while (dayNumber(row[c + n]) === n + 1) n++;
      if (n >= 28) {
        const cols = [null];
        for (let d = 1; d <= n; d++) cols.push(c + d - 1);
        let monthFromDates = null;
        let yearFromDates = null;
        if (row[c] instanceof Date) {
          monthFromDates = row[c].getMonth() + 1;
          yearFromDates = row[c].getFullYear();
        }
        return { row: r, firstCol: c, days: n, cols, monthFromDates, yearFromDates };
      }
    }
    return null;
  }

  function buildMergeIndex(sheet) {
    const idx = new Map();
    for (const m of sheet.merges) {
      for (let r = m.s.r; r <= m.e.r; r++) {
        for (let c = m.s.c; c <= m.e.c; c++) {
          if (r === m.s.r && c === m.s.c) continue;
          idx.set(r + ':' + c, m);
        }
      }
    }
    return idx;
  }

  function countDayValues(sheet, r, header) {
    let n = 0;
    for (let d = 1; d <= header.days; d++) if (!isBlank(cellAt(sheet, r, header.cols[d]))) n++;
    return n;
  }

  function looksLikeName(v) {
    if (typeof v !== 'string') return false;
    const s = v.trim();
    if (s.length < 2 || s.length > 40) return false;
    if (/\d/.test(s) || /:/.test(s)) return false;
    if (!/[A-Za-zƏəİıÜüÖöŞşÇçĞğ]/.test(s)) return false;
    return U.nameTokens(s).length <= 4;
  }

  /** Name for a person row: the nearest text cell left of the first day column. */
  function rowName(sheet, r, header) {
    for (let c = header.firstCol - 1; c >= 0; c--) {
      const v = cellAt(sheet, r, c);
      if (isBlank(v)) continue;
      if (typeof v === 'number') continue; // a running number / SAP code column
      return String(v).trim();
    }
    return null;
  }

  function detectBlocks(sheets) {
    const blocks = [];
    sheets.forEach((sheet, sheetIndex) => {
      const headers = [];
      for (let r = 0; r < sheet.rows.length; r++) {
        const h = findDayHeader(sheet, r);
        if (h) headers.push(h);
      }
      const sheetYear = U.detectYear(sheet.name);
      headers.forEach((h, i) => {
        const prevHeaderRow = i > 0 ? headers[i - 1].row : -1;
        const nextHeaderRow = i + 1 < headers.length ? headers[i + 1].row : sheet.rows.length;
        // month label: nearest text above the header that is not a person row
        let label = null;
        let month = h.monthFromDates;
        let year = h.yearFromDates;
        const tryCells = (r, maxCol) => {
          const row = sheet.rows[r] || [];
          for (let c = 0; c < Math.min(row.length, maxCol); c++) {
            const v = row[c];
            if (typeof v !== 'string' || !v.trim()) continue;
            const m = U.detectMonth(v);
            if (m) return { m, text: v.trim(), y: U.detectYear(v) };
          }
          return null;
        };
        if (!month) {
          let found = tryCells(h.row, h.firstCol);
          for (let r = h.row - 1; !found && r > prevHeaderRow && r >= h.row - 8; r--) {
            if (countDayValues(sheet, r, h) >= 3) continue; // a person row of the previous block
            found = tryCells(r, 200);
          }
          if (found) { month = found.m; label = found.text; if (found.y) year = found.y; }
        }
        if (!year && sheetYear) year = sheetYear;

        const mergeIdx = buildMergeIndex(sheet);
        const people = [];
        let blankRun = 0;
        for (let r = h.row + 1; r < nextHeaderRow; r++) {
          const name = rowName(sheet, r, h);
          const values = countDayValues(sheet, r, h);
          let mergedDays = 0;
          for (let d = 1; d <= h.days; d++) if (mergeIdx.has(r + ':' + h.cols[d])) mergedDays++;
          if (!name && values === 0 && mergedDays === 0) {
            blankRun++;
            if (blankRun >= 3 && people.length) break;
            continue;
          }
          blankRun = 0;
          if (name && values === 0 && mergedDays === 0 && U.detectMonth(name) && people.length) break; // next month label
          if (!name || !looksLikeName(name)) continue; // notes such as "18 IYUN BABEK - 07:30-09:30"
          if (values === 0 && mergedDays === 0) continue;
          const raw = [null];
          const merged = [null];
          for (let d = 1; d <= h.days; d++) {
            const c = h.cols[d];
            const m = mergeIdx.get(r + ':' + c);
            if (m) {
              const headDay = h.cols.indexOf(m.s.c);
              merged.push({ headDay: m.s.r === r && headDay > 0 ? headDay : null, headValue: cellAt(sheet, m.s.r, m.s.c) });
              raw.push(null);
            } else {
              merged.push(null);
              raw.push(cellAt(sheet, r, c));
            }
          }
          people.push({ name, sheetRow: r + 1, raw, merged });
        }
        blocks.push({
          id: sheet.name + '!' + (h.row + 1),
          sheet: sheet.name,
          sheetIndex,
          headerRow: h.row + 1,
          firstCol: h.firstCol,
          days: h.days,
          month,
          year,
          label,
          people,
        });
      });
    });
    return blocks;
  }

  /** Choose the block for the requested month; returns { block, reason } or null. */
  function pickBlock(blocks, year, month) {
    const days = U.daysInMonth(year, month);
    const usable = blocks.filter((b) => b.people.length);
    let cands = usable.filter((b) => b.month === month);
    if (cands.length) {
      const exactYear = cands.filter((b) => b.year === year);
      if (exactYear.length) cands = exactYear;
      else {
        const noYear = cands.filter((b) => !b.year);
        if (noYear.length) cands = noYear;
      }
      const dayMatch = cands.filter((b) => b.days === days);
      if (dayMatch.length) cands = dayMatch;
      return { block: cands[cands.length - 1], reason: 'month' };
    }
    if (usable.length === 1 && !usable[0].month) return { block: usable[0], reason: 'only' };
    return null;
  }

  /* ------------------------------------------------------------------ token classification */

  const LEGEND = ['MC', 'DO', 'SL', 'BT', 'ML', 'PH', 'PL', 'EL', 'MD', 'HL', 'TR', 'AM'];

  // Words that start an absence; used to split "SICK LEAVE ... VACATION" written back to back.
  const LEAVE_STARTS = [
    ['V', ['VACATION', 'VACATIN', 'MEZUNIYYET', 'MEZUNIYET']],
    ['SL', ['SICKLEAVE', 'SICK', 'XESTELIK', 'XESTE', 'BULLETEN', 'BULLETIN']],
    ['AM', ['ATALIQ']],
    ['ML', ['ANALIQ', 'MATERNITY']],
    ['BT', ['EZAMIYYET', 'EZAMIYET', 'BUSINESSTRIP']],
    ['TR', ['TELIM', 'TRAINING']],
    ['MC', ['MEDICAL', 'TIBBI']],
  ];

  /** Leave code a (possibly partial) word belongs to, or null. */
  function leaveTypeOf(letters) {
    const w = letters;
    if (!w) return null;
    if (/SICK|XESTE|BULLET/.test(w)) return 'SL';
    if (/ATALIQ/.test(w) || /^ATA/.test(w)) return 'AM';
    if (/ANALIQ|MATERN/.test(w)) return 'ML';
    if (/EZAM|TRIP/.test(w)) return 'BT';
    if (/TELIM|TRAIN/.test(w)) return 'TR';
    if (/MEDIC|TIBBI/.test(w)) return 'MC';
    if (/MEZUN|VACA|CATI|ATION/.test(w)) return 'V';
    if (/^[VACTION]+$/.test(w) && /[VCT]/.test(w)) return 'V';
    if (/^[VACTION]+$/.test(w)) return 'V'; // "A", "ON", "O" pieces inside a vacation run
    return null;
  }

  /** Leave type if `letters` clearly begins a new absence word ("V", "VA", "VACA", "SICK", "ATA"...). */
  function startType(letters) {
    if (letters === 'V' || letters === 'VA') return 'V';
    if (letters.length < 3) return null;
    for (const [type, words] of LEAVE_STARTS) {
      for (const w of words) if (w.startsWith(letters) || letters.startsWith(w)) return type;
    }
    if (/^ATA/.test(letters)) return 'AM';
    return null;
  }

  function classify(raw, ctx) {
    if (raw === null || raw === undefined) return { t: 'empty' };
    if (raw instanceof Date) return { t: 'unknown', text: raw.toISOString().slice(0, 10) };
    if (typeof raw === 'number') {
      const key = String(raw);
      if (ctx.importMap && Object.prototype.hasOwnProperty.call(ctx.importMap, key)) return { t: 'code', value: ctx.importMap[key] };
      return { t: 'code', value: raw };
    }
    const text = String(raw);
    if (!text.trim()) return { t: 'empty' };
    const f = U.compact(text);
    if (!f) return { t: 'unknown', text: text.trim() };
    if (ctx.importMap && Object.prototype.hasOwnProperty.call(ctx.importMap, f)) {
      const v = ctx.importMap[f];
      // "NN" -> N stays ambiguous next to a vacation word; "OP"/"BY" -> N are explicit codes.
      if (v === 'N' && /^N+$/.test(f)) return { t: 'dual', value: 'N', letters: f, text };
      return { t: 'code', value: v, text };
    }
    if (/^\d+([.,]\d+)?$/.test(text.trim())) return { t: 'code', value: U.toNumber(text.trim()), text };
    if (/^1S+T*$/.test(f)) return { t: 'code', value: '1st', text };
    if (/^2N+D*$/.test(f)) return { t: 'code', value: '2nd', text };
    if (/^3R+D*$/.test(f)) return { t: 'code', value: 3, text };
    if (/^OF+$/.test(f)) return { t: 'code', value: 'OFF', text };
    if (/^N+$/.test(f)) return { t: 'dual', value: 'N', letters: f, text };
    if (f === 'V') return { t: 'frag', letters: 'V', text, dualV: true };
    if (LEGEND.includes(f)) return { t: 'code', value: f, text };
    const custom = (ctx.codes || []).find((c) => U.compact(c.code) === f && c.code.toUpperCase() !== 'OFF');
    if (custom) return { t: 'code', value: custom.code, text };
    if (/^[A-Z]+$/.test(f)) return { t: 'frag', letters: f, text };
    return { t: 'unknown', text: text.trim() };
  }

  /* ------------------------------------------------------------------ row interpretation */

  /**
   * Interprets one person row.
   * @returns {{ values: Object<number, string|number>, notes: Array<{day, level, key, raw}> }}
   *   values[day] === '' means "could not be determined".
   */
  function interpretRow(person, blockDays, monthDays, ctx) {
    const n = Math.min(blockDays, monthDays);
    const toks = [null];
    for (let d = 1; d <= n; d++) {
      const m = person.merged[d];
      if (m) toks.push({ t: 'merged', headDay: m.headDay, headValue: m.headValue });
      else toks.push(classify(person.raw[d], ctx));
    }
    const values = {};
    const notes = [];
    const err = (d, key, raw) => { values[d] = ''; notes.push({ day: d, level: 'error', key, raw: raw === undefined ? null : raw }); };
    const info = (d, key, raw) => notes.push({ day: d, level: 'info', key, raw: raw === undefined ? null : raw });
    const rawText = (d) => {
      const t = toks[d];
      if (!t) return null;
      if (t.t === 'merged') return t.headValue === null || t.headValue === undefined ? null : String(t.headValue);
      return t.text !== undefined ? String(t.text).trim() : (t.value !== undefined ? String(t.value) : null);
    };

    const inRegion = (t) => t && (t.t === 'frag' || t.t === 'dual' || t.t === 'empty' || t.t === 'merged');

    let i = 1;
    while (i <= n) {
      const tok = toks[i];
      if (tok.t === 'frag') {
        // region of letters / blanks / N's: one or more absence words
        let j = i;
        while (j <= n && inRegion(toks[j])) j++;
        const segs = [];
        let cur = null;
        for (let k = i; k < j; k++) {
          const t = toks[k];
          if (t.t === 'frag') {
            const st = startType(t.letters);
            if (cur && st && cur.type && st !== cur.type) cur = null;
            if (!cur) { cur = { start: k, lastFrag: k, letters: '', texts: [], type: null }; segs.push(cur); }
            // tokens between previous fragment and this one belong to the word
            for (let q = cur.lastFrag + 1; q < k; q++) if (toks[q].t === 'dual') cur.letters += toks[q].letters;
            cur.letters += t.letters;
            cur.texts.push(t.text);
            cur.lastFrag = k;
            cur.lastLetters = t.letters;
            cur.type = leaveTypeOf(cur.letters) || st || cur.type;
          } else if (t.t === 'merged' && cur && t.headDay !== null && t.headDay >= cur.start) {
            cur.lastFrag = k; // merged continuation is part of the word for sure
            cur.mergedTail = true;
          }
        }
        segs.forEach((seg, si) => {
          const end = si + 1 < segs.length ? segs[si + 1].start - 1 : j - 1;
          const type = leaveTypeOf(seg.letters) || seg.type;
          if (!type) {
            for (let d = seg.start; d <= seg.lastFrag; d++) err(d, 'unknownText', seg.texts.join(' '));
            for (let d = seg.lastFrag + 1; d <= end; d++) {
              if (toks[d].t === 'dual') values[d] = 'N';
              else err(d, 'emptyCell', rawText(d));
            }
            return;
          }
          for (let d = seg.start; d <= seg.lastFrag; d++) values[d] = type;
          const longWord = (seg.lastLetters || '').length >= 5 || !!seg.mergedTail;
          let ambiguous = false;
          let lastLetters = seg.lastLetters || '';
          for (let d = seg.lastFrag + 1; d <= end; d++) {
            const t = toks[d];
            if (t.t === 'merged' && t.headDay !== null && t.headDay >= seg.start) { values[d] = type; continue; }
            if (ambiguous) { err(d, 'ambiguousAfterLeave', rawText(d)); continue; }
            if (t.t === 'dual') {
              if (d === seg.lastFrag + 1 && type === 'V' && /(O|IO|TIO)$/.test(lastLetters)) {
                values[d] = type; lastLetters = 'N';
                continue;
              }
              ambiguous = true;
              err(d, 'ambiguousAfterLeave', rawText(d));
              continue;
            }
            if (t.t === 'empty' || t.t === 'merged') {
              if (longWord) {
                values[d] = type;
                if (d === monthDays && end === monthDays) info(d, 'overflowToMonthEnd', seg.texts.join(' '));
              } else {
                ambiguous = true;
                err(d, 'ambiguousAfterLeave', rawText(d));
              }
            }
          }
        });
        // anything in the region before the first segment (cannot happen: region starts with frag)
        i = j;
        continue;
      }
      if (tok.t === 'code') values[i] = tok.value;
      else if (tok.t === 'dual') values[i] = tok.value;
      else if (tok.t === 'empty') err(i, 'emptyCell', null);
      else if (tok.t === 'merged') {
        const head = tok.headDay ? values[tok.headDay] : undefined;
        if (head !== undefined && head !== '') values[i] = head;
        else err(i, 'emptyCell', rawText(i));
      } else err(i, 'unknownText', tok.text);
      i++;
    }
    for (let d = n + 1; d <= monthDays; d++) err(d, 'missingDay', null);
    return { values, notes };
  }

  /* ------------------------------------------------------------------ name matching */

  function scoreName(raw, emp) {
    const rawC = U.compact(raw);
    const eTok = U.nameTokens(emp.name);
    if (!rawC) return 0;
    for (const a of emp.aliases || []) if (a && U.compact(a) === rawC) return 100;
    if (rawC === U.compact(emp.name) || rawC === U.compact(eTok.slice().reverse().join(''))) return 100;
    const rTok = U.nameTokens(raw);
    let score = 0;
    const used = new Set();
    for (const rt of rTok) {
      if (rt.length < 2) continue;
      let best = 0;
      let bestIdx = -1;
      eTok.forEach((et, idx) => {
        let s = 0;
        if (et === rt) s = 60;
        else {
          // "ROYALS" = ROYAL + surname initial S
          const last = rt.slice(-1);
          if (rt.slice(0, -1) === et && eTok.some((o, oi) => oi !== idx && o.startsWith(last))) s = 70;
          else {
            const sim = U.similarity(rt, et);
            if (sim >= 0.8) s = 45 * sim;
          }
        }
        if (s > best) { best = s; bestIdx = idx; }
      });
      if (bestIdx >= 0) used.add(bestIdx);
      score += best;
    }
    for (const rt of rTok) {
      if (rt.length !== 1) continue;
      const ok = eTok.some((et, idx) => !used.has(idx) && et.startsWith(rt));
      score += ok ? 15 : -15;
    }
    return score;
  }

  /**
   * Match sheet names to employees. Shift workers are preferred so that "SAHIN" or "RUSLAN"
   * never land on a rotation worker with the same first name.
   */
  function matchPeople(people, employees) {
    const pool = employees.filter((e) => e.category === 'shift');
    const others = employees.filter((e) => e.category !== 'shift');
    const results = people.map((p) => {
      const scored = pool.map((e) => ({ emp: e, score: scoreName(p.name, e) }))
        .concat(others.map((e) => ({ emp: e, score: scoreName(p.name, e) - 20 })))
        .filter((x) => x.score >= 40)
        .sort((a, b) => b.score - a.score);
      let empId = null;
      let ambiguous = false;
      if (scored.length && scored[0].score >= 55) {
        if (scored.length > 1 && scored[1].score === scored[0].score) ambiguous = true;
        else empId = scored[0].emp.id;
      }
      return { name: p.name, empId, score: scored.length ? scored[0].score : 0, ambiguous, candidates: scored.slice(0, 4).map((x) => x.emp.id) };
    });
    // one sheet row per employee: keep the best scoring one
    const byEmp = {};
    results.forEach((r, i) => {
      if (!r.empId) return;
      const prev = byEmp[r.empId];
      if (prev === undefined) byEmp[r.empId] = i;
      else if (results[prev].score >= r.score) { r.empId = null; r.ambiguous = true; }
      else { results[prev].empId = null; results[prev].ambiguous = true; byEmp[r.empId] = i; }
    });
    return results;
  }

  /**
   * Full pipeline for one block. `assignment` maps person index -> employee id (from matchPeople or the user).
   * Returns { imported: {empId: {day: value}}, notes: {empId: [...]}, unassigned: [names] }
   */
  function buildImport(block, assignment, state, year, month) {
    const monthDays = U.daysInMonth(year, month);
    const ctx = { importMap: state.importMap || {}, codes: state.codes || [] };
    const imported = {};
    const notes = {};
    const unassigned = [];
    block.people.forEach((p, idx) => {
      const empId = assignment[idx];
      if (!empId) { unassigned.push(p.name); return; }
      const res = interpretRow(p, block.days, monthDays, ctx);
      imported[empId] = res.values;
      notes[empId] = res.notes;
    });
    return { imported, notes, unassigned };
  }

  TS.shiftImport = {
    readWorkbook, sheetsFromSheetJS, detectBlocks, pickBlock, classify, interpretRow, leaveTypeOf, startType,
    scoreName, matchPeople, buildImport,
  };
})(typeof window !== 'undefined' ? window : globalThis);
