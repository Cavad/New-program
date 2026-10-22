// Loads the browser core modules into Node for testing.
const path = require('path');
const web = path.join(__dirname, '..', 'web');
globalThis.XLSX = require(path.join(web, 'node_modules', 'xlsx'));
globalThis.ExcelJS = require(path.join(web, 'node_modules', 'exceljs'));
for (const f of ['util', 'defaults', 'rotation', 'compose', 'shiftImport', 'excel']) {
  try { require(path.join(web, 'src', 'core', f + '.js')); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
}
module.exports = globalThis.TS;
