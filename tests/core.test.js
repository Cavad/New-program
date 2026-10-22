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
