/* Builds the final month grid from rules + imported data + manual edits, and validates it. */
(function (root) {
  const TS = (root.TS = root.TS || {});
  const U = TS.util;

  function emptyMonth() {
    return { overrides: {}, imported: {}, importNotes: {}, importInfo: null, rotation: null, templateId: null };
  }

  /** Returns the month record, creating it (and continuing the rotation from last month) if needed. */
  function getMonth(state, year, month, create) {
    const key = U.monthKey(year, month);
    let rec = state.months[key];
    if (!rec) {
      rec = emptyMonth();
      if (create === false) return rec;
      state.months[key] = rec;
    }
    if (!rec.rotation) rec.rotation = suggestRotation(state, year, month);
    for (const k of ['overrides', 'imported', 'importNotes']) if (!rec[k]) rec[k] = {};
    return rec;
  }

  function suggestRotation(state, year, month) {
    const prev = U.addMonths(year, month, -1);
    const prevRec = state.months[U.monthKey(prev.year, prev.month)];
    const block = blockLen(state);
    if (prevRec && prevRec.rotation) return TS.rotation.continueFrom(prevRec.rotation, block, prev.year, prev.month);
    return U.clone(state.settings.rotationDefault || { group: 'A', startDay: 1, oneDay: false });
  }

  function blockLen(state) {
    return Math.max(1, parseInt(state.settings.rotationBlock, 10) || 2);
  }

  function holidayFor(state, year, month, day) {
    if (!state.settings.applyHolidays) return null;
    const iso = U.isoDate(year, month, day);
    const md = iso.slice(5);
    const list = state.holidays || [];
    // a dated entry (YYYY-MM-DD) beats the yearly one (MM-DD); `off` marks "normal working day this year"
    const specific = list.find((h) => h.date === iso);
    if (specific) return specific.off ? null : specific;
    return list.find((h) => h.date === md) || null;
  }

  function findCode(state, value, category) {
    if (value === null || value === undefined || value === '') return null;
    const s = String(value).trim();
    const exact = state.codes.find((c) => c.code === s);
    if (exact) return exact;
    const lower = s.toLowerCase();
    const matches = state.codes.filter((c) => c.code.toLowerCase() === lower);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      // "off" (unpaid leave) vs "OFF" (shift rest day)
      const pref = category === 'shift' ? 'shift' : 'leave';
      return matches.find((c) => c.kind === pref) || matches[0];
    }
    return null;
  }

  /** Normalise what a user typed into a cell. Returns number, canonical code string or ''. */
  function canonicalValue(state, input, category) {
    if (input === null || input === undefined) return '';
    if (typeof input === 'number') return input;
    const s = String(input).trim();
    if (!s) return '';
    if (U.isNumeric(s)) return U.toNumber(s);
    const c = findCode(state, s, category);
    if (c) return c.code;
    const f = U.compact(s);
    if (state.importMap && Object.prototype.hasOwnProperty.call(state.importMap, f)) return state.importMap[f];
    return s;
  }

  function defaultValue(state, emp, rec, year, month, day, rotPattern) {
    const s = state.settings;
    if (emp.category === 'office') {
      if (U.isWeekend(year, month, day)) return { v: '', src: 'default' };
      const h = holidayFor(state, year, month, day);
      if (h) return { v: h.code || 'PH', src: 'holiday', note: h };
      return { v: Number(s.officeHours) || 8, src: 'default' };
    }
    if (emp.category === 'rotation') {
      const works = rotPattern[day] === (emp.group || 'A');
      return { v: works ? (Number(s.rotationHours) || 12) : '', src: 'default' };
    }
    // shift workers: whatever was imported from their sheet
    const imp = rec.imported[emp.id];
    if (imp && Object.prototype.hasOwnProperty.call(imp, day)) {
      let v = imp[day];
      const rawEmpty = v === '' || v === null || v === undefined;
      if (emp.offAsBlank && v === 'OFF') v = '';
      return { v: rawEmpty ? '' : v, src: 'imported', rawEmpty };
    }
    return { v: '', src: imp ? 'imported' : 'missing', rawEmpty: !!imp };
  }

  function composeMonth(state, year, month) {
    const rec = getMonth(state, year, month, false);
    const rotationCfg = rec.rotation || suggestRotation(state, year, month);
    const days = U.daysInMonth(year, month);
    const rotPattern = TS.rotation.pattern(rotationCfg, blockLen(state), days);
    const weekend = [false];
    const holiday = [null];
    for (let d = 1; d <= days; d++) {
      weekend.push(U.isWeekend(year, month, d));
      holiday.push(holidayFor(state, year, month, d));
    }
    const rows = [];
    const warnings = [];
    for (const emp of state.employees) {
      const cells = [null];
      const ov = rec.overrides[emp.id] || {};
      const notes = (rec.importNotes && rec.importNotes[emp.id]) || [];
      const noteByDay = {};
      for (const n of notes) (noteByDay[n.day] = noteByDay[n.day] || []).push(n);
      let hours = 0;
      let count = 0;
      for (let d = 1; d <= days; d++) {
        let cell;
        if (Object.prototype.hasOwnProperty.call(ov, d)) cell = { v: ov[d], src: 'override' };
        else cell = defaultValue(state, emp, rec, year, month, d, rotPattern);
        if (noteByDay[d] && cell.src !== 'override') cell.notes = noteByDay[d];
        if (typeof cell.v === 'number') { hours += cell.v; count++; }
        cells.push(cell);
      }
      rows.push({ emp, cells, hours: Math.round(hours * 100) / 100, dayCount: count });
    }
    validate(state, rec, year, month, days, rows, warnings);
    return { year, month, days, weekend, holiday, rotation: rotationCfg, rotPattern, rows, warnings, rec };
  }

  function validate(state, rec, year, month, days, rows, warnings) {
    let groupA = 0;
    let groupB = 0;
    rows.forEach((row, idx) => {
      const emp = row.emp;
      if (emp.category === 'rotation') (emp.group === 'B' ? groupB++ : groupA++);
      if (emp.category === 'shift' && !rec.imported[emp.id]) {
        const anyOverride = Object.keys(rec.overrides[emp.id] || {}).length > 0;
        if (!anyOverride) warnings.push({ level: 'warn', key: 'noImport', empId: emp.id, row: idx });
      }
      for (let d = 1; d <= days; d++) {
        const c = row.cells[d];
        if (c.notes) {
          for (const n of c.notes) warnings.push({ level: n.level, key: n.key, empId: emp.id, row: idx, day: d, raw: n.raw });
        } else if (emp.category === 'shift' && c.src === 'imported' && c.rawEmpty) {
          warnings.push({ level: 'error', key: 'emptyCell', empId: emp.id, row: idx, day: d });
        }
        if (c.v === '' || c.v === null || c.v === undefined) continue;
        if (typeof c.v === 'number') {
          if (c.v < 0 || c.v > 24) warnings.push({ level: 'error', key: 'badHours', empId: emp.id, row: idx, day: d, raw: c.v });
        } else if (!findCode(state, c.v, emp.category)) {
          warnings.push({ level: 'warn', key: 'unknownCode', empId: emp.id, row: idx, day: d, raw: c.v });
        }
      }
    });
    if (groupA && groupB && groupA !== groupB) warnings.push({ level: 'info', key: 'groupSize', a: groupA, b: groupB });
    const seen = {};
    rows.forEach((row, idx) => {
      const sap = String(row.emp.sap || '').trim();
      if (!sap) return;
      if (seen[sap] !== undefined) warnings.push({ level: 'error', key: 'dupSap', empId: row.emp.id, row: idx, raw: sap });
      seen[sap] = idx;
    });
  }

  function setOverride(state, year, month, empId, day, value) {
    const rec = getMonth(state, year, month);
    if (!rec.overrides[empId]) rec.overrides[empId] = {};
    if (value === undefined) delete rec.overrides[empId][day];
    else rec.overrides[empId][day] = value;
    if (!Object.keys(rec.overrides[empId]).length) delete rec.overrides[empId];
  }

  function getOverride(state, year, month, empId, day) {
    const rec = state.months[U.monthKey(year, month)];
    if (!rec || !rec.overrides[empId] || !Object.prototype.hasOwnProperty.call(rec.overrides[empId], day)) return undefined;
    return rec.overrides[empId][day];
  }

  /** Default (non-edited) value of one cell. */
  function defaultFor(state, year, month, emp, day) {
    const rec = getMonth(state, year, month, false);
    const cfg = rec.rotation || suggestRotation(state, year, month);
    const pat = TS.rotation.pattern(cfg, blockLen(state), U.daysInMonth(year, month));
    return defaultValue(state, emp, rec, year, month, day, pat).v;
  }

  TS.compose = {
    defaultFor, emptyMonth, getMonth, suggestRotation, holidayFor, findCode, canonicalValue, composeMonth, setOverride, getOverride, blockLen };
})(typeof window !== 'undefined' ? window : globalThis);
