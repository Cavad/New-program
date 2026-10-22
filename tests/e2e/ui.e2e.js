// Browser end-to-end test of dist/TimesheetStudio.html (needs Playwright + Chromium).
// Run: node tests/e2e/ui.e2e.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* fall back to a global install */ }
  const root = require('child_process').execSync('npm root -g').toString().trim();
  return require(path.join(root, 'playwright'));
}

const FIX = path.join(__dirname, '..', 'fixtures');
const HTML = 'file://' + path.join(__dirname, '..', '..', 'dist', 'TimesheetStudio.html');

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(HTML);
  await page.waitForFunction(() => window.TS && TS.App && TS.App.composed);
  await page.evaluate(() => TS.App.setMonth(2026, 10));
  const val = (r, d) => page.evaluate(([r, d]) => TS.App.composed.rows[r].cells[d].v, [r, d]);

  // paint + undo/redo
  await page.click('.toolbar .brush:has-text("Vacation")');
  await page.click('table.tgrid td[data-r="1"][data-d="5"]');
  assert.strictEqual(await val(1, 5), 'V');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  assert.strictEqual(await val(1, 5), 8, 'undo');
  await page.keyboard.press('Control+y');
  assert.strictEqual(await val(1, 5), 'V', 'redo');

  // select a range, type a value for all of it
  await page.click('table.tgrid td[data-r="2"][data-d="5"]');
  await page.click('table.tgrid td[data-r="3"][data-d="7"]', { modifiers: ['Shift'] });
  await page.keyboard.type('6');
  await page.keyboard.press('Enter');
  for (const [r, d] of [[2, 5], [2, 7], [3, 6]]) assert.strictEqual(await val(r, d), 6);

  // copy/paste through the paste event
  await page.click('table.tgrid td[data-r="4"][data-d="12"]');
  await page.evaluate(() => {
    const ev = new Event('paste', { bubbles: true });
    ev.clipboardData = { getData: () => 'SL\tSL\tHL' };
    document.dispatchEvent(ev);
  });
  assert.deepStrictEqual([await val(4, 12), await val(4, 13), await val(4, 14)], ['SL', 'SL', 'HL']);

  // mark a holiday from the day header (Mon 26 Oct)
  await page.click('table.tgrid th.day[data-d="26"]');
  await page.click('.menu button:has-text("Mark as public holiday")');
  assert.strictEqual(await val(0, 26), 'PH');

  // upload an empty form through the form menu
  await page.click('.subbar .chip:has-text("Form")');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.menu button:has-text("Upload empty form")')]);
  await chooser.setFiles(path.join(FIX, 'October_timesheet_empty.xlsx'));
  await page.waitForSelector('.subbar .chip:has-text("October_timesheet_empty.xlsx")');

  // add an employee in settings
  await page.click('button[title="Settings"]');
  await page.click('.settings-nav button:has-text("Employees")');
  await page.click('.settings-main button:has-text("Add · Office")');
  const nameInput = page.locator('.settings-main tbody tr').nth(11).locator('input').nth(1);
  await nameInput.fill('Test Person');
  await nameInput.press('Tab');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const names = await page.evaluate(() => TS.App.composed.rows.map((r) => r.emp.name));
  assert.strictEqual(names.length, 31);
  assert.strictEqual(names[11], 'Test Person');

  // import the shift sheet and export
  const b64 = fs.readFileSync(path.join(FIX, 'Shift_work_timesheet.xlsx')).toString('base64');
  await page.evaluate((b64) => {
    const bytes = TS.dom.b64ToBytes(b64);
    TS.importDialog.openFile(new File([bytes], 'Shift_work_timesheet.xlsx'));
  }, b64);
  await page.click('.modal-foot .btn.primary:has-text("Import")');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => TS.App.exportExcel())]);
  const out = path.join(require('os').tmpdir(), 'ts-e2e-' + Date.now() + '.xlsx');
  await dl.saveAs(out);
  const ExcelJS = require(path.join(__dirname, '..', '..', 'web', 'node_modules', 'exceljs'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(out);
  const ws = wb.worksheets[0];
  assert.strictEqual(ws.getCell('C16').value, 'Test Person');
  assert.strictEqual(ws.getCell('C35').value, 'Nəbiyev Samir');
  assert.strictEqual(ws.getCell('B38').value, 'MC');
  fs.unlinkSync(out);

  // data survives a reload
  await page.reload();
  await page.waitForFunction(() => window.TS && TS.App && TS.App.composed);
  assert.strictEqual(await val(1, 5), 'V');
  assert.strictEqual(await page.evaluate(() => TS.App.composed.rows.length), 31);

  // narrow window: no horizontal page scroll (the grid scrolls inside its box)
  await page.setViewportSize({ width: 420, height: 800 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, 'page wider than the window by ' + overflow + 'px');

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('UI end-to-end test passed');
})().catch((e) => { console.error(e); process.exit(1); });
