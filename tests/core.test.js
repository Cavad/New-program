// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const TS = require('./load.js');

const FIX = path.join(__dirname, 'fixtures');
const XLSX = globalThis.XLSX;
const ExcelJS = globalThis.ExcelJS;

function filledGrid() {
  const wb = XLSX.read(fs.readFileSync(path.join(FIX, 'October_timesheet_Filled.xlsx')));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = [];
  for (let i = 0; i < 30; i++) {
    const vals = [null];
    for (let d = 1; d <= 31; d++) {
      const c = ws[XLSX.utils.encode_cell({ r: 4 + i, c: 3 + d })];
      vals.push(c ? c.v : '');
    }
    rows.push(vals);
  }
  return rows;
}

function shiftBlocks() {
  return TS.shiftImport.detectBlocks(TS.shiftImport.readWorkbook(fs.readFileSync(path.join(FIX, 'Shift_work_timesheet.xlsx'))));
}

function importMonth(state, blocks, y, m) {
  const block = TS.shiftImport.pickBlock(blocks, y, m).block;
  const match = TS.shiftImport.matchPeople(block.people, state.employees);
  const res = TS.shiftImport.buildImport(block, match.map((x) => x.empId), state, y, m);
  const rec = TS.compose.getMonth(state, y, m);
  rec.imported = res.imported;
  rec.importNotes = res.notes;
  return { block, match, res };
}

test('month labels are recognised in many spellings', () => {
  const cases = { YANVAR: 1, FEVRAL: 2, MART: 3, 'APREL ': 4, MAY: 5, 'İYUN': 6, IYUL: 7, AVQUST: 8, SENTIYABR: 9, 'OKTYABİR': 10, 'NOYABİR': 11, DEKABR: 12, 'October 2026': 10 };
  for (const [k, v] of Object.entries(cases)) assert.strictEqual(TS.util.detectMonth(k), v, k);
  for (const name of ['SAMIR', 'SENAN', 'MAHİR', 'ROYAL.S', 'MURAD']) assert.strictEqual(TS.util.detectMonth(name), null, name);
});

test('every month block of the shift workbook is found', () => {
  const blocks = shiftBlocks();
  const y2026 = blocks.filter((b) => b.sheet === '2026');
  assert.deepStrictEqual(y2026.map((b) => b.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const b of y2026) assert.strictEqual(b.people.length, 11);
  assert.strictEqual(TS.shiftImport.pickBlock(blocks, 2026, 10).block.id, '2026!155');
});

test('October import reproduces the filled timesheet rows 12-22 exactly', () => {
  const state = TS.defaults.defaultState();
  const { match } = importMonth(state, shiftBlocks(), 2026, 10);
  assert.ok(match.every((m) => m.empId), 'all names matched');
  const comp = TS.compose.composeMonth(state, 2026, 10);
  const filled = filledGrid();
  for (let i = 11; i <= 21; i++) {
    for (let d = 1; d <= 31; d++) {
      assert.strictEqual(String(comp.rows[i].cells[d].v), String(filled[i][d]), `${comp.rows[i].emp.name} day ${d}`);
    }
  }
  assert.strictEqual(comp.warnings.filter((w) => w.level === 'error').length, 0);
});

test('office defaults and 12h rotation match the filled example on untouched days', () => {
  const state = TS.defaults.defaultState();
  const comp = TS.compose.composeMonth(state, 2026, 10);
  const filled = filledGrid();
  // Cəfərov Emil (row 9) and Allahverdiyev Şahin (row 25) have no absences in October
  for (const i of [8, 24, 25, 28, 29]) {
    for (let d = 1; d <= 31; d++) assert.strictEqual(String(comp.rows[i].cells[d].v), String(filled[i][d]), `${comp.rows[i].emp.name} day ${d}`);
  }
});

test('rotation: first day, one-day start and continuation into next month', () => {
  const R = TS.rotation;
  const p = R.pattern({ group: 'A', startDay: 1, oneDay: false }, 2, 31);
  assert.deepStrictEqual(p.slice(1, 9), ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B']);
  const q = R.pattern({ group: 'A', startDay: 1, oneDay: true }, 2, 30);
  assert.deepStrictEqual(q.slice(1, 7), ['A', 'B', 'B', 'A', 'A', 'B']);
  const r = R.pattern({ group: 'B', startDay: 2, oneDay: false }, 2, 30);
  assert.deepStrictEqual(r.slice(1, 6), ['A', 'B', 'B', 'A', 'A']);
  // Oct 2026 (A from 1st) -> Oct 31 is B's first day -> Nov 1 is B's second day
  const next = R.continueFrom({ group: 'A', startDay: 1, oneDay: false }, 2, 2026, 10);
  assert.deepStrictEqual(next, { group: 'B', startDay: 1, oneDay: true });
});

function interpret(cells, merged) {
  const raw = [null].concat(cells);
  const m = [null].concat(cells.map(() => null));
  if (merged) for (const [d, head] of merged) m[d] = { headDay: head, headValue: raw[head] };
  const state = TS.defaults.defaultState();
  return TS.shiftImport.interpretRow({ name: 'X', raw, merged: m }, cells.length, cells.length, { importMap: state.importMap, codes: state.codes });
}

test('messy absences: split words, overflow, merged cells, ambiguity', () => {
  // SICK LEAVE overflowing, then VACATION spelled letter by letter, then two undeterminable N cells
  const row = ['1st', 'SİCK LEAVE', null, null, 'V', 'A', 'C', 'A', 'T', 'İ', 'O', 'N', 'N', 'N', '1st', 'OFF', 'OFF', '2nd', '2nd', 'OFF', 'OFF', 'OFF', 'OFF', '1st', '1st', '2nd', '2nd', 'OFF', 'OFF', 'OFF'];
  const res = interpret(row);
  assert.deepStrictEqual([2, 3, 4].map((d) => res.values[d]), ['SL', 'SL', 'SL']);
  assert.deepStrictEqual([5, 11, 12].map((d) => res.values[d]), ['V', 'V', 'V']);
  assert.strictEqual(res.values[13], '');
  assert.strictEqual(res.values[14], '');
  assert.ok(res.notes.some((n) => n.day === 13 && n.level === 'error'));
  assert.strictEqual(res.values[15], '1st');

  // paternity leave written as ATA LIQ M Ə Z, typo 6ST, asterisks
  const r2 = interpret(['ATA', 'LIQ', 'M', 'Ə', 'Z', '6ST', '*', 'OP', 'BY', '3RD', '1Sst', 'NN'].concat(Array(18).fill('OFF')));
  assert.deepStrictEqual([1, 2, 3, 4, 5].map((d) => r2.values[d]), ['AM', 'AM', 'AM', 'AM', 'AM']);
  assert.strictEqual(r2.values[6], '');
  assert.strictEqual(r2.values[7], '');
  assert.deepStrictEqual([8, 9, 10, 11, 12].map((d) => r2.values[d]), ['N', 'N', 3, '1st', 'N']);

  // merged "VACATİON" cell spanning days 2..10
  const cells = ['OFF', 'VACATİON'].concat(Array(8).fill(null)).concat(Array(20).fill('OFF'));
  const r3 = interpret(cells, [3, 4, 5, 6, 7, 8, 9, 10].map((d) => [d, 2]));
  for (let d = 2; d <= 10; d++) assert.strictEqual(r3.values[d], 'V', 'day ' + d);
  assert.strictEqual(r3.values[11], 'OFF');

  // short fragment followed by an empty cell is not guessed
  const r4 = interpret(['VA', null, '1st'].concat(Array(27).fill('OFF')));
  assert.strictEqual(r4.values[1], 'V');
  assert.strictEqual(r4.values[2], '');
});

test('name matching prefers shift workers and handles initials', () => {
  const emps = TS.defaults.defaultEmployees();
  const people = ['SAHIN', 'RUSLAN', 'ROYAL.S', 'VƏLİ', 'MAHİR', 'ELGUN', 'UNKNOWN'].map((name) => ({ name }));
  const res = TS.shiftImport.matchPeople(people, emps);
  const name = (id) => (emps.find((e) => e.id === id) || {}).name || null;
  assert.deepStrictEqual(res.map((r) => name(r.empId)), ['Rəhimov Şahin', 'Xubalıyev Ruslan', 'Süleymanov Röyal', 'Süleymanov Vəli', 'Hüseynov Mahir', 'Həbibov Elgün', null]);
});

async function readBack(bytes) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  return wb.worksheets[0];
}

test('export with the empty October form equals the filled example', async () => {
  const state = TS.defaults.defaultState();
  importMonth(state, shiftBlocks(), 2026, 10);
  const filled = filledGrid();
  const comp = TS.compose.composeMonth(state, 2026, 10);
  comp.rows.forEach((row, i) => {
    for (let d = 1; d <= 31; d++) if (String(row.cells[d].v) !== String(filled[i][d])) TS.compose.setOverride(state, 2026, 10, row.emp.id, d, filled[i][d]);
  });
  const tpl = fs.readFileSync(path.join(FIX, 'October_timesheet_empty.xlsx'));
  const out = await TS.excel.exportMonth(state, 2026, 10, tpl, { date: new Date(2026, 9, 21) });
  assert.strictEqual(out.source, 'file');
  const ws = await readBack(out.bytes);
  assert.strictEqual(ws.name, 'October 2026');
  for (let i = 0; i < 30; i++) {
    const r = ws.getRow(5 + i);
    assert.strictEqual(r.getCell(1).value, i + 1);
    for (let d = 1; d <= 31; d++) {
      const v = r.getCell(4 + d).value;
      assert.strictEqual(String(v === null ? '' : v), String(filled[i][d]), `row ${i + 1} day ${d}`);
    }
    assert.strictEqual(r.getCell(36).value.formula, `SUM(E${5 + i}:AI${5 + i})`);
  }
  // legend + signature block moved below 30 rows, date filled
  assert.strictEqual(ws.getCell('B37').value, 'MC');
  assert.strictEqual(ws.getCell('B58').value, 'Date');
  assert.strictEqual(ws.getCell('C58').value, '21.10.2026');
});

test('export adapts the form to 28/30 day months and to the generated fallback form', async () => {
  const state = TS.defaults.defaultState();
  const tpl = fs.readFileSync(path.join(FIX, 'October_timesheet_empty.xlsx'));
  for (const [y, m, days] of [[2026, 2, 28], [2026, 11, 30], [2027, 1, 31]]) {
    for (const t of [tpl, null]) {
      const out = await TS.excel.exportMonth(state, y, m, t);
      const ws = await readBack(out.bytes);
      const hdr = ws.getRow(4);
      assert.strictEqual(hdr.getCell(4 + days).value, days);
      assert.strictEqual(hdr.getCell(5 + days).value, 'Total hours');
      assert.strictEqual(hdr.getCell(6 + days).value, 'Total days');
      assert.match(String(ws.getCell('A1').value), new RegExp(TS.util.MONTHS_EN[m - 1] + ' ' + y));
    }
  }
});

test('employees can be read back from a filled timesheet', async () => {
  const list = await TS.excel.readEmployees(fs.readFileSync(path.join(FIX, 'October_timesheet_Filled.xlsx')));
  assert.strictEqual(list.length, 30);
  assert.deepStrictEqual(list.map((e) => e.category).join(','), Array(11).fill('office').concat(Array(11).fill('shift'), Array(8).fill('rotation')).join(','));
  assert.deepStrictEqual(list.slice(22).map((e) => e.group).join(''), 'AAAABBBB');
});

test('a word spelled letter by letter is not split (S I C K L E A V E)', () => {
  const r = interpret(['S', 'I', 'C', 'K', null, 'L', 'E', 'A', 'V', 'E', 'V', 'A', 'C', 'A', 'T', 'I', 'O', 'N', '1st'].concat(Array(11).fill('OFF')));
  for (let d = 1; d <= 10; d++) assert.strictEqual(r.values[d], 'SL', 'day ' + d);
  for (let d = 11; d <= 18; d++) assert.strictEqual(r.values[d], 'V', 'day ' + d);
  assert.strictEqual(r.values[19], '1st');
});

test('other layouts: SAP/position columns, dated headers, CSV and old .xls files', () => {
  const state = TS.defaults.defaultState();
  // a tidy sheet someone might send next year: №, SAP, Name, Position, then 01.11 ... 30.11
  const header = ['№', 'SAP', 'Name', 'Position'];
  for (let d = 1; d <= 30; d++) header.push(String(d).padStart(2, '0') + '.11');
  const rowA = [1, 10807, 'Süleymanov Röyal', 'Weighbridge Operator'].concat(Array(30).fill('1st'));
  const rowB = [2, 11073, 'Rəhimov Şahin', 'Weighbridge Operator'].concat(['vacation'], Array(29).fill(null));
  const rowC = [3, 10765, 'Samir', 'Night Shift Operator'].concat(Array(30).fill('n'));
  const ws = XLSX.utils.aoa_to_sheet([['Noyabr 2026 növbə qrafiki'], [], header, rowA, rowB, rowC]);
  ws['!merges'] = [{ s: { r: 4, c: 4 }, e: { r: 4, c: 33 } }]; // vacation merged over the whole month
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const blocks = TS.shiftImport.detectBlocks(TS.shiftImport.readWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].month, 11);
  assert.strictEqual(blocks[0].year, 2026);
  const match = TS.shiftImport.matchPeople(blocks[0].people, state.employees);
  const names = match.map((m) => (state.employees.find((e) => e.id === m.empId) || {}).name);
  assert.deepStrictEqual(names, ['Süleymanov Röyal', 'Rəhimov Şahin', 'Şəmmədov Samir']);
  const res = TS.shiftImport.buildImport(blocks[0], match.map((m) => m.empId), state, 2026, 11);
  assert.strictEqual(res.imported['emp-11073'][30], 'V');
  assert.strictEqual(res.imported['emp-10765'][5], 'N');
  assert.strictEqual(res.notes['emp-11073'].filter((n) => n.level === 'error').length, 0);

  // the real file saved as CSV (one sheet) and as old Excel 97 .xls
  const real = XLSX.read(fs.readFileSync(path.join(FIX, 'Shift_work_timesheet.xlsx')));
  const csv = XLSX.utils.sheet_to_csv(real.Sheets['2026']);
  const csvBlocks = TS.shiftImport.detectBlocks(TS.shiftImport.readWorkbook(new TextEncoder().encode(csv)));
  assert.strictEqual(TS.shiftImport.pickBlock(csvBlocks, 2026, 10).block.people.length, 11);
  const xls = XLSX.write(real, { type: 'array', bookType: 'biff8' });
  const xlsBlocks = TS.shiftImport.detectBlocks(TS.shiftImport.readWorkbook(xls));
  const oct = TS.shiftImport.pickBlock(xlsBlocks, 2026, 10).block;
  const st2 = TS.defaults.defaultState();
  const m2 = TS.shiftImport.matchPeople(oct.people, st2.employees);
  const r2 = TS.shiftImport.buildImport(oct, m2.map((m) => m.empId), st2, 2026, 10);
  const filled = filledGrid();
  st2.employees.forEach((e, i) => {
    if (e.category !== 'shift') return;
    for (let d = 1; d <= 31; d++) {
      let v = r2.imported[e.id][d];
      if (e.offAsBlank && v === 'OFF') v = '';
      assert.strictEqual(String(v), String(filled[i][d]), `xls ${e.name} ${d}`);
    }
  });
});

test('export works with unusual forms: own output, a filled sheet, no employee rows, cover sheet, few people', async () => {
  const state = TS.defaults.defaultState();
  const empty = fs.readFileSync(path.join(FIX, 'October_timesheet_empty.xlsx'));
  const nov = (await TS.excel.exportMonth(state, 2026, 11, empty)).bytes; // 30-day form with 30 rows

  const checkMonth = async (tpl, y, m, st) => {
    st = st || state;
    const out = await TS.excel.exportMonth(st, y, m, tpl);
    assert.strictEqual(out.source, 'file', 'template accepted');
    const ws = await readBack(out.bytes);
    const days = TS.util.daysInMonth(y, m);
    const n = st.employees.length;
    assert.strictEqual(ws.getRow(4).getCell(4 + days).value, days);
    assert.strictEqual(ws.getRow(4).getCell(5 + days).value, 'Total hours');
    for (let i = 0; i < n; i++) assert.strictEqual(ws.getRow(5 + i).getCell(3).value, st.employees[i].name);
    // nothing left over between the last employee and the legend
    for (let r = 5 + n; r < 5 + n + 2; r++) for (let c = 1; c <= 4 + days; c++) assert.ok(ws.getRow(r).getCell(c).value === null, `leftover at ${r}:${c}`);
    const legendRow = (() => { for (let r = 5 + n; r < 5 + n + 10; r++) if (ws.getRow(r).getCell(2).value === 'MC') return r; return -1; })();
    assert.ok(legendRow > 0, 'legend follows the employees');
    return ws;
  };
  await checkMonth(nov, 2026, 12);
  await checkMonth(nov, 2026, 2);
  await checkMonth(fs.readFileSync(path.join(FIX, 'October_timesheet_Filled.xlsx')), 2026, 11);

  // only 5 employees: the 22-row form shrinks
  const few = TS.defaults.defaultState();
  few.employees = few.employees.filter((e, i) => i % 6 === 0);
  await checkMonth(empty, 2026, 10, few);

  // a form without employee rows and with a cover sheet in front
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(empty);
  const ws = wb.worksheets[0];
  ws.spliceRows(5, 22);
  const cover = wb.addWorksheet('Cover');
  cover.getCell('A1').value = 'Read me';
  wb.worksheets.unshift(wb.worksheets.pop());
  const odd = await wb.xlsx.writeBuffer();
  const out = await TS.excel.exportMonth(state, 2026, 10, odd);
  assert.notStrictEqual(out.source, 'builtin');
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(out.bytes);
  const sheet = back.worksheets.find((w) => w.name === 'October 2026');
  assert.ok(sheet, 'timesheet sheet renamed');
  assert.strictEqual(sheet.getRow(5).getCell(3).value, state.employees[0].name);
});

test('rotation: "only 1 day" is ignored unless the group starts on the 1st', () => {
  const p = TS.rotation.pattern({ group: 'A', startDay: 3, oneDay: true }, 2, 10);
  assert.deepStrictEqual(p.slice(1, 7), ['B', 'B', 'A', 'A', 'B', 'B']);
});
