// Bundles the app into one self-contained HTML file (works offline, no install).
// Usage: node web/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const require = createRequire(import.meta.url);
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));

const read = (p) => fs.readFileSync(path.join(here, p), 'utf8');
const scriptSafe = (js) => js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

async function logoBase64(formBytes) {
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(formBytes);
    const media = (wb.model.media || []).find((m) => m.type === 'image');
    return media ? Buffer.from(media.buffer).toString('base64') : '';
  } catch (e) {
    return '';
  }
}

const form = fs.readFileSync(path.join(here, 'assets', 'form_template.xlsx'));
const logo = await logoBase64(form);

const scripts = [
  ['vendor/xlsx.full.min.js', true],
  ['vendor/exceljs.min.js', true],
  [null, `window.TS = window.TS || {}; TS.VERSION = ${JSON.stringify(pkg.version)}; TS.BUILTIN_FORM_B64 = ${JSON.stringify(form.toString('base64'))}; TS.LOGO_B64 = ${JSON.stringify(logo)};`],
  ['src/core/util.js'],
  ['src/core/defaults.js'],
  ['src/core/rotation.js'],
  ['src/core/compose.js'],
  ['src/core/shiftImport.js'],
  ['src/core/excel.js'],
  ['src/i18n.js'],
  ['src/ui/dom.js'],
  ['src/ui/storage.js'],
  ['src/ui/importDialog.js'],
  ['src/ui/settingsDialog.js'],
  ['src/ui/app.js'],
];

const blocks = scripts.map(([file, inline]) => {
  const code = file ? read(file) : inline;
  return `<script>\n${scriptSafe(code)}\n</script>`;
});

let html = read('src/index.html');
html = html.replace('/*__STYLE__*/', () => read('src/styles.css'));
html = html.replace('<!--__SCRIPTS__-->', () => blocks.join('\n'));

const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'TimesheetStudio.html'), html);
const appDir = path.join(root, 'launcher', 'app');
fs.mkdirSync(appDir, { recursive: true });
fs.writeFileSync(path.join(appDir, 'index.html'), html);
console.log(`Built dist/TimesheetStudio.html (${(html.length / 1024 / 1024).toFixed(2)} MB), version ${pkg.version}`);
