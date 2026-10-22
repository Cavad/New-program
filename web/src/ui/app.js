/* Main application: shell, tabs, grids, rotation planner, preview, warnings, export. */
(function (root) {
  const TS = root.TS;
  const U = TS.util;
  const C = TS.compose;
  const { h, icon, toast, modal, menu, popover, closePopover } = TS.dom;
  const t = (k, p) => TS.t(k, p);

  const App = {
    state: null,
    view: { year: 2026, month: 1, tab: 'office', brush: null, sel: new Set(), anchor: null, zoom: 0.9, customHours: 6, drawer: false },
    undo: [],
    redo: [],
    composed: null,
  };
  TS.App = App;

  /* ================================================================== state */

  function ensureState(s) {
    const d = TS.defaults.defaultState();
    if (!s || typeof s !== 'object') return d;
    s.version = s.version || 1;
    s.settings = Object.assign({}, d.settings, s.settings || {});
    if (!Array.isArray(s.employees)) s.employees = d.employees;
    s.employees.forEach((e) => {
      if (!e.id) e.id = U.uid('emp');
      if (!Array.isArray(e.aliases)) e.aliases = [];
      if (!['office', 'shift', 'rotation'].includes(e.category)) e.category = 'office';
      if (e.category === 'rotation' && !['A', 'B'].includes(e.group)) e.group = 'A';
    });
    if (!Array.isArray(s.codes) || !s.codes.length) s.codes = d.codes;
    if (!s.importMap || typeof s.importMap !== 'object') s.importMap = d.importMap;
    if (!Array.isArray(s.holidays)) s.holidays = d.holidays;
    if (!s.months || typeof s.months !== 'object') s.months = {};
    if (!s.templates || typeof s.templates !== 'object') s.templates = {};
    if (!s.ui) s.ui = {};
    return s;
  }

  function monthKey() { return U.monthKey(App.view.year, App.view.month); }

  function recompose() {
    App.composed = C.composeMonth(App.state, App.view.year, App.view.month);
    return App.composed;
  }

  function persist() {
    App.state.ui = { year: App.view.year, month: App.view.month, tab: App.view.tab };
    TS.store.save(App.state);
  }

  function commit(opts) {
    persist();
    recompose();
    if (opts && opts.full) render();
    else renderContent();
    renderSubbar();
  }

  /* ================================================================== theme & language */

  function applyTheme() {
    let th = App.state.settings.theme || 'light';
    if (th === 'system') th = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', th);
    document.documentElement.setAttribute('lang', App.state.settings.language === 'az' ? 'az' : 'en');
  }

  function monthName(m) {
    return (App.state.settings.language === 'az' ? U.MONTHS_AZ : U.MONTHS_EN)[m - 1];
  }

  function wdName(w) {
    return (App.state.settings.language === 'az' ? U.WEEKDAYS_AZ : U.WEEKDAYS_EN)[w];
  }

  function codeLabel(code) {
    const c = typeof code === 'object' ? code : C.findCode(App.state, code);
    if (!c) return String(code);
    return App.state.settings.language === 'az' ? (c.az || c.en) : c.en;
  }

  /* ================================================================== shell */

  function render() {
    applyTheme();
    TS.setLang(App.state.settings.language);
    recompose();
    const app = document.getElementById('app');
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'shell' },
      h('header', { class: 'topbar', id: 'topbar' }),
      h('div', { class: 'subbar', id: 'subbar' }),
      h('main', { class: 'content', id: 'content' })));
    renderTopbar();
    renderSubbar();
    renderContent();
  }

  function renderTopbar() {
    const bar = document.getElementById('topbar');
    if (!bar) return;
    bar.innerHTML = '';
    const s = App.state.settings;
    bar.appendChild(h('div', { class: 'brand' },
      h('div', { class: 'brand-logo' }, icon('sheet')),
      h('div', null,
        h('div', { class: 'brand-name' }, 'Timesheet Studio'),
        h('div', { class: 'brand-sub' }, TS.store.mode === 'server' ? t('modeDesktop') : t('modeBrowser')))));
    const label = h('button', { class: 'month-label', onclick: (e) => openMonthPicker(e.currentTarget), title: t('pickMonth') },
      monthName(App.view.month) + ' ' + App.view.year);
    bar.appendChild(h('div', { class: 'month-switch' },
      h('button', { class: 'btn ghost icon sm round', title: t('prevMonth'), onclick: () => goMonth(-1) }, icon('left')),
      label,
      h('button', { class: 'btn ghost icon sm round', title: t('nextMonth'), onclick: () => goMonth(1) }, icon('right'))));
    const save = h('div', { class: 'save-state', id: 'save-state' });
    bar.appendChild(h('div', { class: 'top-actions' },
      save,
      h('div', { class: 'seg', title: t('language') },
        h('button', { class: s.language !== 'az' ? 'on' : '', onclick: () => setLang('en') }, 'EN'),
        h('button', { class: s.language === 'az' ? 'on' : '', onclick: () => setLang('az') }, 'AZ')),
      h('button', { class: 'btn icon', title: t('toggleTheme'), onclick: toggleTheme }, icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon')),
      h('button', { class: 'btn icon', title: t('undo') + ' (Ctrl+Z)', onclick: doUndo, disabled: !App.undo.length }, icon('undo')),
      h('button', { class: 'btn icon', title: t('settings'), onclick: () => TS.settingsDialog.open() }, icon('gear')),
      h('button', { class: 'btn primary', onclick: exportExcel }, icon('download'), t('exportExcel'))));
    renderSaveState();
  }

  function renderSaveState() {
    const el = document.getElementById('save-state');
    if (!el) return;
    const st = TS.store.status;
    el.className = 'save-state ' + st;
    el.innerHTML = '';
    el.appendChild(h('span', { class: 'dot' }));
    el.appendChild(document.createTextNode(st === 'saving' ? t('saving') : st === 'error' ? t('saveError') : t('saved')));
    el.title = TS.store.mode === 'server' && TS.store.info ? TS.store.info.dataDir : t('savedInBrowser');
  }

  function setLang(l) {
    App.state.settings.language = l;
    persist();
    render();
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    App.state.settings.theme = cur === 'dark' ? 'light' : 'dark';
    persist();
    applyTheme();
    renderTopbar();
    renderContent();
  }

  function goMonth(delta) {
    const n = U.addMonths(App.view.year, App.view.month, delta);
    setMonth(n.year, n.month);
  }

  function setMonth(y, m) {
    App.view.year = y;
    App.view.month = m;
    App.view.sel.clear();
    App.view.anchor = null;
    persist();
    render();
  }

  function openMonthPicker(anchor) {
    let year = App.view.year;
    const box = h('div');
    const draw = () => {
      box.innerHTML = '';
      box.appendChild(h('div', { class: 'mp-head' },
        h('button', { class: 'btn ghost icon sm', onclick: () => { year--; draw(); } }, icon('left')),
        h('span', null, String(year)),
        h('button', { class: 'btn ghost icon sm', onclick: () => { year++; draw(); } }, icon('right'))));
      const grid = h('div', { class: 'mp-grid' });
      for (let m = 1; m <= 12; m++) {
        const has = !!App.state.months[U.monthKey(year, m)];
        grid.appendChild(h('button', {
          class: (year === App.view.year && m === App.view.month ? 'on ' : '') + (has ? 'has' : ''),
          onclick: () => { closePopover(); setMonth(year, m); },
        }, monthName(m)));
      }
      box.appendChild(grid);
      const now = new Date();
      box.appendChild(h('div', { style: { marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', { class: 'tiny muted' }, h('span', { class: 'badge ok', style: { padding: '0 4px', marginRight: '6px' } }, '•'), t('hasData')),
        h('button', { class: 'btn sm', onclick: () => { closePopover(); setMonth(now.getFullYear(), now.getMonth() + 1); } }, t('thisMonth'))));
    };
    draw();
    popover(anchor, box, { align: 'center' });
  }

  /* ================================================================== sub bar: tabs, form, warnings */

  function groupRows(cat) {
    const out = [];
    App.composed.rows.forEach((r, i) => { if (r.emp.category === cat) out.push(i); });
    return out;
  }

  function renderSubbar() {
    const bar = document.getElementById('subbar');
    if (!bar) return;
    bar.innerHTML = '';
    const ws = App.composed.warnings;
    const errRows = new Set(ws.filter((w) => w.level === 'error').map((w) => w.row));
    const tabDef = [
      ['office', 'users', t('tabOffice'), 'office'],
      ['shift', 'clock', t('tabShift'), 'shift'],
      ['rotation', 'refresh', t('tabRotation'), 'rotation'],
      ['preview', 'eye', t('tabPreview'), null],
    ];
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    for (const [id, ic, label, cat] of tabDef) {
      const rows = cat ? groupRows(cat) : [];
      const hasErr = cat && rows.some((r) => errRows.has(r));
      tabs.appendChild(h('button', {
        class: 'tab' + (App.view.tab === id ? ' active' : ''), role: 'tab',
        onclick: () => { App.view.tab = id; App.view.sel.clear(); persist(); renderSubbar(); renderContent(); },
      }, icon(ic, 'sm'), label, cat ? h('span', { class: 'count' }, String(rows.length)) : null, hasErr ? h('span', { class: 'flag', title: t('hasErrors') }) : null));
    }
    bar.appendChild(tabs);
    bar.appendChild(h('div', { class: 'spacer' }));

    // form / template chip
    const rec = App.state.months[monthKey()];
    const tpl = rec && rec.templateId ? App.state.templates[rec.templateId] : null;
    bar.appendChild(h('button', { class: 'chip', title: t('formHint'), onclick: (e) => openFormMenu(e.currentTarget) },
      icon('file', 'sm'),
      h('span', null, t('form') + ': '),
      h('b', null, tpl ? tpl.name : t('builtinForm')),
      icon('down', 'sm')));

    const nErr = ws.filter((w) => w.level === 'error').length;
    const nWarn = ws.filter((w) => w.level === 'warn').length;
    const nInfo = ws.filter((w) => w.level === 'info').length;
    bar.appendChild(h('button', { class: 'chip', onclick: openWarnings, title: t('reviewIssues') },
      icon(nErr || nWarn ? 'alert' : 'check', 'sm'),
      nErr || nWarn || nInfo ? [
        nErr ? h('span', { class: 'badge err' }, nErr + ' ' + t('errorsShort')) : null,
        nWarn ? h('span', { class: 'badge warn' }, nWarn + ' ' + t('warningsShort')) : null,
        nInfo ? h('span', { class: 'badge info' }, nInfo + ' ' + t('notesShort')) : null,
      ] : h('span', { class: 'badge ok' }, t('allGood'))));
  }

  function openFormMenu(anchor) {
    const key = monthKey();
    const rec = App.state.months[key];
    const items = [
      { header: t('formFor', { m: monthName(App.view.month) + ' ' + App.view.year }) },
      { label: t('uploadForm'), icon: 'upload', run: uploadForm },
      { label: t('useBuiltin'), icon: 'shield', run: () => { const r = C.getMonth(App.state, App.view.year, App.view.month); r.templateId = null; pruneTemplates(); commit({ full: true }); toast(t('usingBuiltin')); }, disabled: !(rec && rec.templateId) },
    ];
    const others = Object.entries(App.state.templates).filter(([id]) => !(rec && rec.templateId === id));
    if (others.length) {
      items.push('sep', { header: t('reuseForm') });
      others.slice(-5).reverse().forEach(([id, tp]) => items.push({ label: tp.name, hint: tp.month || '', icon: 'file', run: () => { C.getMonth(App.state, App.view.year, App.view.month).templateId = id; commit({ full: true }); } }));
    }
    items.push('sep', { label: t('downloadBuiltin'), icon: 'download', run: () => TS.dom.download('Timesheet_form_builtin.xlsx', TS.dom.b64ToBytes(TS.BUILTIN_FORM_B64), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') });
    menu(anchor, items, { align: 'right' });
  }

  async function uploadForm() {
    const f = await TS.dom.pickFile('.xlsx,.xlsm');
    if (!f) return;
    try {
      const bytes = await TS.dom.readFileBytes(f);
      const info = await TS.excel.inspectTemplate(bytes);
      const id = U.uid('tpl');
      App.state.templates[id] = { name: f.name, b64: TS.dom.bytesToB64(bytes), uploadedAt: new Date().toISOString(), month: monthKey() };
      C.getMonth(App.state, App.view.year, App.view.month).templateId = id;
      pruneTemplates();
      commit({ full: true });
      let msg = t('formUploaded', { days: info.days, rows: info.rows });
      if (info.month && info.month !== App.view.month) msg += ' ' + t('formOtherMonth', { m: monthName(info.month) });
      toast(msg, { kind: 'ok', timeout: 6000 });
    } catch (e) {
      toast(t('formInvalid'), { kind: 'err', timeout: 7000 });
    }
  }

  /** Keep only templates referenced by a month, plus the 6 newest. */
  function pruneTemplates() {
    const used = new Set(Object.values(App.state.months).map((r) => r.templateId).filter(Boolean));
    const ids = Object.keys(App.state.templates).sort((a, b) => String(App.state.templates[a].uploadedAt).localeCompare(String(App.state.templates[b].uploadedAt)));
    const keep = new Set(ids.slice(-6));
    for (const id of ids) if (!used.has(id) && !keep.has(id)) delete App.state.templates[id];
  }

  /* ================================================================== content */

  function renderContent() {
    const el = document.getElementById('content');
    if (!el) return;
    // keep scroll positions across re-renders
    const keep = {};
    el.querySelectorAll('[data-keep]').forEach((n) => { keep[n.dataset.keep] = [n.scrollLeft, n.scrollTop]; });
    const top = el.scrollTop;
    el.innerHTML = '';
    const tab = App.view.tab;
    if (tab === 'office') el.appendChild(viewGroup('office'));
    else if (tab === 'shift') el.appendChild(viewShift());
    else if (tab === 'rotation') el.appendChild(viewRotation());
    else el.appendChild(viewPreview());
    el.scrollTop = top;
    el.querySelectorAll('[data-keep]').forEach((n) => { const k = keep[n.dataset.keep]; if (k) { n.scrollLeft = k[0]; n.scrollTop = k[1]; } });
  }

  /* ---------------- brushes */

  function brushDefs(cat) {
    const s = App.state.settings;
    const main = cat === 'office' ? ['V', 'SL', 'DO', 'HL', 'BT', 'PH']
      : cat === 'shift' ? ['1st', '2nd', 'N', 'OFF', 'V', 'SL']
        : ['V', 'SL', 'DO', 'BT'];
    const list = [];
    if (cat === 'office') list.push({ id: 'h', value: Number(s.officeHours) || 8, label: t('hoursN', { n: s.officeHours }) });
    if (cat === 'rotation') list.push({ id: 'h', value: Number(s.rotationHours) || 12, label: t('hoursN', { n: s.rotationHours }) });
    if (cat === 'shift') list.push({ id: 'n3', value: 3, label: t('dayShift3') });
    for (const code of main) {
      const c = C.findCode(App.state, code, cat);
      if (c) list.push({ id: 'c:' + c.code, value: c.code, label: codeLabel(c).replace(/\s*\(?\d{1,2}:\d{2}.*$/, ''), code: c });
    }
    const more = App.state.codes.filter((c) => !main.includes(c.code) && (cat === 'shift' || c.kind !== 'shift'));
    return { list, more };
  }

  function brushSwatch(value, cat) {
    if (typeof value === 'number') {
      const bg = cat === 'shift' ? (App.state.settings.shiftNumberFill || '#FFFF00') : 'var(--surface-3)';
      return h('span', { class: 'sw', style: { background: bg, color: cat === 'shift' ? '#111' : 'var(--text)' } }, String(value));
    }
    const c = C.findCode(App.state, value, cat);
    const fill = c ? c.fill : '#ddd';
    return h('span', { class: 'sw', style: { background: fill, color: c && c.font && c.font.toUpperCase() !== '#000000' ? c.font : TS.dom.textOn(fill) } }, String(value));
  }

  function isBrush(b) {
    const cur = App.view.brush;
    if (!cur && !b) return true;
    if (!cur || !b) return false;
    return cur.kind === b.kind && String(cur.value) === String(b.value);
  }

  function setBrush(b) {
    App.view.brush = b;
    renderContent();
  }

  function toolbar(cat) {
    const { list, more } = brushDefs(cat);
    const bar = h('div', { class: 'toolbar' });
    bar.appendChild(h('button', { class: 'brush tool' + (isBrush(null) ? ' on' : ''), title: t('selectToolHint'), onclick: () => setBrush(null) }, icon('cursor', 'sm'), h('span', { class: 'lbl' }, t('selectTool'))));
    bar.appendChild(h('div', { class: 'tool-sep' }));
    for (const b of list) {
      const br = { kind: 'value', value: b.value };
      bar.appendChild(h('button', { class: 'brush' + (isBrush(br) ? ' on' : ''), title: t('paintWith', { v: b.label }), onclick: () => setBrush(br) },
        brushSwatch(b.value, cat), h('span', { class: 'lbl' }, b.label)));
    }
    if (cat !== 'shift') {
      const custom = { kind: 'value', value: Number(App.view.customHours) || 0 };
      const inp = h('input', { class: 'hours-input', type: 'number', min: 0, max: 24, step: 0.5, value: App.view.customHours, title: t('customHours'),
        onclick: (e) => e.stopPropagation(),
        onchange: (e) => { App.view.customHours = parseFloat(e.target.value) || 0; setBrush({ kind: 'value', value: App.view.customHours }); } });
      bar.appendChild(h('button', { class: 'brush' + (isBrush(custom) && !list.some((b) => b.value === custom.value) ? ' on' : ''), title: t('customHours'), onclick: () => setBrush({ kind: 'value', value: Number(App.view.customHours) || 0 }) },
        inp, h('span', { class: 'lbl' }, t('hoursShort'))));
    }
    bar.appendChild(h('button', { class: 'brush', onclick: (e) => {
      menu(e.currentTarget, more.map((c) => ({ label: codeLabel(c), swatch: { fill: c.fill, color: TS.dom.textOn(c.fill), text: c.code }, run: () => setBrush({ kind: 'value', value: c.code }) })));
    } }, icon('more', 'sm'), h('span', { class: 'lbl' }, t('moreCodes'))));
    bar.appendChild(h('div', { class: 'tool-sep' }));
    const clearB = { kind: 'clear' };
    const defB = { kind: 'default' };
    bar.appendChild(h('button', { class: 'brush tool' + (isBrush(clearB) ? ' on' : ''), title: t('clearHint'), onclick: () => setBrush(clearB) }, icon('eraser', 'sm'), h('span', { class: 'lbl' }, t('clear'))));
    bar.appendChild(h('button', { class: 'brush tool' + (isBrush(defB) ? ' on' : ''), title: t('defaultHint'), onclick: () => setBrush(defB) }, icon('reset', 'sm'), h('span', { class: 'lbl' }, t('restoreDefault'))));
    return bar;
  }

  function hintLine(cat) {
    return h('div', { class: 'toolbar', style: { paddingTop: '0' } },
      h('div', { class: 'hint', style: { flex: 1, minWidth: '260px' } }, App.view.brush ? t('paintHint') : t('selectHint')),
      h('button', { class: 'btn sm', onclick: () => openRangeDialog(cat) }, icon('calendar', 'sm'), t('addAbsence')),
      h('button', { class: 'btn sm ghost', title: t('resetGroupHint'), onclick: () => resetGroup(cat) }, icon('reset', 'sm'), t('resetGroup')));
  }

  /* ---------------- grid */

  function cellLook(row, d) {
    const comp = App.composed;
    const cell = row.cells[d];
    const v = cell.v;
    const cat = row.emp.category;
    const cls = ['cell'];
    let bg = null;
    let color = null;
    let text = v === '' || v === null || v === undefined ? '' : String(v);
    if (comp.weekend[d]) cls.push('we');
    if (text === '') cls.push('empty');
    else if (typeof v === 'number') {
      if (cat === 'shift') { bg = App.state.settings.shiftNumberFill || '#FFFF00'; color = '#111'; }
    } else {
      const c = C.findCode(App.state, v, cat);
      if (c) {
        bg = c.fill;
        color = c.font && c.font.toUpperCase() !== '#000000' ? c.font : TS.dom.textOn(c.fill);
      } else {
        cls.push('issue-warn');
      }
    }
    if (cell.src === 'override') cls.push('edited');
    let level = null;
    if (cell.notes) for (const n of cell.notes) if (!level || n.level === 'error') level = n.level;
    if (!level && cat === 'shift' && cell.src === 'imported' && cell.rawEmpty) level = 'error';
    if (cat === 'shift' && cell.src === 'missing') level = level || 'warn';
    if (level === 'error') cls.push('issue-error');
    else if (level === 'warn') cls.push('issue-warn');
    else if (level === 'info') cls.push('issue-info');
    // tooltip
    const date = new Date(App.view.year, App.view.month - 1, d);
    const parts = [wdName(date.getDay()) + ' ' + d + ' ' + monthName(App.view.month)];
    if (text) parts.push(typeof v === 'number' ? t('hoursN', { n: v }) : text + ' — ' + codeLabel(v));
    else parts.push(t('emptyCellTip'));
    if (comp.holiday[d]) parts.push('★ ' + (App.state.settings.language === 'az' ? comp.holiday[d].az : comp.holiday[d].en));
    if (cell.src === 'override') parts.push('✎ ' + t('editedTip'));
    if (cell.notes) for (const n of cell.notes) parts.push('⚠ ' + t('w_' + n.key) + (n.raw ? ' — ' + t('sourceWas', { raw: String(n.raw) }) : ''));
    else if (level === 'error') parts.push('⚠ ' + t('w_emptyCell'));
    if (cat === 'shift' && cell.src === 'missing') parts.push('⚠ ' + t('w_noImport'));
    return { cls, bg, color, text, title: parts.join('\n') };
  }

  function paintCell(td, row, d) {
    const look = cellLook(row, d);
    td.className = look.cls.join(' ') + (App.view.sel.has(td.dataset.r + ':' + d) ? ' sel' : '');
    td.style.background = look.bg || '';
    td.style.color = look.color || '';
    td.textContent = look.text;
    td.title = look.title;
  }

  function buildGrid(rowIdx, opts) {
    opts = opts || {};
    const comp = App.composed;
    const today = new Date();
    const isThisMonth = today.getFullYear() === App.view.year && today.getMonth() + 1 === App.view.month;
    const table = h('table', { class: 'tgrid' });
    const thr = h('tr', null,
      h('th', { class: 'no sticky' }, '#'),
      h('th', { class: 'name sticky' }, t('employee')));
    for (let d = 1; d <= comp.days; d++) {
      const w = U.weekday(App.view.year, App.view.month, d);
      const cls = ['day'];
      if (comp.weekend[d]) cls.push('we');
      if (comp.holiday[d]) cls.push('hol');
      if (isThisMonth && today.getDate() === d) cls.push('today');
      thr.appendChild(h('th', { class: cls.join(' '), dataset: { d }, title: comp.holiday[d] ? '★ ' + (App.state.settings.language === 'az' ? comp.holiday[d].az : comp.holiday[d].en) : t('dayHeaderTip') },
        h('div', { class: 'dn' }, String(d)), h('div', { class: 'wd' }, wdName(w))));
    }
    thr.appendChild(h('th', { class: 'tot first' }, t('totalHours')));
    thr.appendChild(h('th', { class: 'tot' }, t('totalDays')));
    table.appendChild(h('thead', null, thr));
    const tb = h('tbody');
    for (const i of rowIdx) {
      const row = comp.rows[i];
      const e = row.emp;
      const tr = h('tr', { dataset: { r: i } });
      tr.appendChild(h('td', { class: 'no sticky' }, String(i + 1)));
      tr.appendChild(h('td', { class: 'name sticky', dataset: { r: i }, title: t('rowTip') },
        h('div', { class: 'nm' },
          h('span', { class: 'cat-dot', style: { background: TS.defaults.CATEGORY_FILL[e.category] } }),
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, e.name),
          e.category === 'rotation' ? h('span', { class: 'gpill ' + (e.group || 'A') }, e.group || 'A') : null),
        h('div', { class: 'ps' }, (e.sap ? e.sap + ' · ' : '') + (e.position || ''))));
      for (let d = 1; d <= comp.days; d++) {
        const td = h('td', { dataset: { r: i, d } });
        paintCell(td, row, d);
        tr.appendChild(td);
      }
      tr.appendChild(h('td', { class: 'tot first', dataset: { tot: 'h' } }, fmtNum(row.hours)));
      tr.appendChild(h('td', { class: 'tot', dataset: { tot: 'd' } }, String(row.dayCount)));
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    const wrap = h('div', { class: 'grid-wrap', dataset: { keep: 'grid-' + (opts.key || 'g') } }, table);
    attachGridEvents(table, rowIdx);
    return wrap;
  }

  function fmtNum(n) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  }

  /** Re-paint cells and totals in place (no rebuild; keeps scroll and drag state). */
  function refreshGrid() {
    const comp = App.composed;
    document.querySelectorAll('table.tgrid tbody tr').forEach((tr) => {
      const i = Number(tr.dataset.r);
      const row = comp.rows[i];
      if (!row) return;
      tr.querySelectorAll('td[data-d]').forEach((td) => paintCell(td, row, Number(td.dataset.d)));
      const th = tr.querySelector('td[data-tot="h"]');
      const tdd = tr.querySelector('td[data-tot="d"]');
      if (th) th.textContent = fmtNum(row.hours);
      if (tdd) tdd.textContent = String(row.dayCount);
    });
  }

  /* ---------------- grid interaction: paint, select, edit, keyboard */

  let drag = null;

  function cellFromEvent(e) {
    const td = e.target.closest && e.target.closest('td[data-d]');
    if (!td) return null;
    return { td, r: Number(td.dataset.r), d: Number(td.dataset.d) };
  }

  function attachGridEvents(table, rowIdx) {
    table.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const c = cellFromEvent(e);
      const nameTd = e.target.closest('td.name');
      const head = e.target.closest('th.day');
      closeEditor(true);
      if (nameTd) { selectRect(rowIdx, Number(nameTd.dataset.r), 1, Number(nameTd.dataset.r), App.composed.days, e.ctrlKey || e.metaKey); return; }
      if (head) { openDayHeaderMenu(head, rowIdx, Number(head.dataset.d)); return; }
      if (!c) return;
      e.preventDefault();
      if (App.view.brush) {
        drag = { mode: 'paint', changes: new Map(), rowIdx };
        paintAt(c);
      } else {
        if (e.shiftKey && App.view.anchor) {
          selectRect(rowIdx, App.view.anchor.r, App.view.anchor.d, c.r, c.d, e.ctrlKey || e.metaKey);
        } else if (e.ctrlKey || e.metaKey) {
          const k = c.r + ':' + c.d;
          if (App.view.sel.has(k)) App.view.sel.delete(k); else App.view.sel.add(k);
          App.view.anchor = { r: c.r, d: c.d };
          refreshSelection();
        } else {
          App.view.anchor = { r: c.r, d: c.d };
          selectRect(rowIdx, c.r, c.d, c.r, c.d, false);
        }
        drag = { mode: 'select', rowIdx, start: { r: c.r, d: c.d }, base: new Set(App.view.sel) };
      }
    });
    table.addEventListener('mouseover', (e) => {
      if (!drag) return;
      const c = cellFromEvent(e);
      if (!c) return;
      if (drag.mode === 'paint') paintAt(c);
      else selectRect(drag.rowIdx, drag.start.r, drag.start.d, c.r, c.d, false);
    });
    table.addEventListener('dblclick', (e) => {
      const c = cellFromEvent(e);
      if (c && !App.view.brush) openEditor(c.td, '');
    });
    table.addEventListener('contextmenu', (e) => {
      const c = cellFromEvent(e);
      if (!c) return;
      e.preventDefault();
      if (!App.view.sel.has(c.r + ':' + c.d)) { App.view.anchor = { r: c.r, d: c.d }; selectRect(rowIdx, c.r, c.d, c.r, c.d, false); }
      openCellMenu({ x: e.clientX, y: e.clientY }, App.composed.rows[c.r].emp.category);
    });
  }

  document.addEventListener('mouseup', () => {
    if (!drag) return;
    if (drag.mode === 'paint' && drag.changes.size) {
      pushUndo([...drag.changes.values()]);
      persist();
      recompose();
      renderSubbar();
      refreshGrid();
      renderTopbar();
    }
    drag = null;
  });

  function brushValue(emp) {
    const b = App.view.brush;
    if (!b) return undefined;
    if (b.kind === 'default') return { def: true };
    if (b.kind === 'clear') return { v: '' };
    return { v: C.canonicalValue(App.state, b.value, emp.category) };
  }

  function paintAt(c) {
    const key = c.r + ':' + c.d;
    if (drag.changes.has(key)) return;
    const emp = App.composed.rows[c.r].emp;
    const bv = brushValue(emp);
    const ch = setCell(emp, c.d, bv.def ? undefined : bv.v);
    drag.changes.set(key, ch);
    recompose();
    paintCell(c.td, App.composed.rows[c.r], c.d);
    const tr = c.td.parentElement;
    tr.querySelector('td[data-tot="h"]').textContent = fmtNum(App.composed.rows[c.r].hours);
    tr.querySelector('td[data-tot="d"]').textContent = String(App.composed.rows[c.r].dayCount);
  }

  /** Sets one cell. value undefined = back to default. Returns undo record. */
  function setCell(emp, day, value) {
    const y = App.view.year;
    const m = App.view.month;
    const before = C.getOverride(App.state, y, m, emp.id, day);
    let after = value;
    if (after !== undefined) {
      const def = C.defaultFor(App.state, y, m, emp, day);
      if (String(def) === String(after) && typeof def === typeof after) after = undefined;
    }
    C.setOverride(App.state, y, m, emp.id, day, after);
    return { key: monthKey(), empId: emp.id, day, before, after };
  }

  function applyToSelection(valueOrDefault) {
    const changes = [];
    for (const k of App.view.sel) {
      const [r, d] = k.split(':').map(Number);
      const row = App.composed.rows[r];
      if (!row) continue;
      const v = valueOrDefault === undefined ? undefined : C.canonicalValue(App.state, valueOrDefault, row.emp.category);
      changes.push(setCell(row.emp, d, v));
    }
    if (!changes.length) return;
    pushUndo(changes);
    persist();
    recompose();
    renderSubbar();
    refreshGrid();
    renderTopbar();
  }

  function pushUndo(changes) {
    App.undo.push(changes);
    if (App.undo.length > 300) App.undo.shift();
    App.redo = [];
  }

  function applyChanges(changes, dir) {
    for (const ch of changes) {
      const { year, month } = U.parseMonthKey(ch.key);
      C.setOverride(App.state, year, month, ch.empId, ch.day, dir === 'undo' ? ch.before : ch.after);
    }
    const k = changes[0] && changes[0].key;
    if (k && k !== monthKey()) {
      const { year, month } = U.parseMonthKey(k);
      App.view.year = year;
      App.view.month = month;
      persist();
      render();
      return;
    }
    persist();
    recompose();
    renderSubbar();
    renderContent();
    renderTopbar();
  }

  function doUndo() {
    const c = App.undo.pop();
    if (!c) return;
    App.redo.push(c);
    applyChanges(c, 'undo');
  }

  function doRedo() {
    const c = App.redo.pop();
    if (!c) return;
    App.undo.push(c);
    applyChanges(c, 'redo');
  }

  function selectRect(rowIdx, r1, d1, r2, d2, additive) {
    const i1 = rowIdx.indexOf(r1);
    const i2 = rowIdx.indexOf(r2);
    if (i1 < 0 || i2 < 0) return;
    const [a, b] = i1 < i2 ? [i1, i2] : [i2, i1];
    const [x, y] = d1 < d2 ? [d1, d2] : [d2, d1];
    const base = additive && drag && drag.base ? drag.base : additive ? App.view.sel : null;
    const sel = new Set(base || []);
    for (let i = a; i <= b; i++) for (let d = x; d <= y; d++) sel.add(rowIdx[i] + ':' + d);
    App.view.sel = sel;
    if (!App.view.anchor) App.view.anchor = { r: r1, d: d1 };
    refreshSelection();
  }

  function refreshSelection() {
    document.querySelectorAll('table.tgrid td[data-d]').forEach((td) => {
      td.classList.toggle('sel', App.view.sel.has(td.dataset.r + ':' + td.dataset.d));
    });
  }

  function currentRowIdx() {
    const tab = App.view.tab;
    return ['office', 'shift', 'rotation'].includes(tab) ? groupRows(tab) : [];
  }

  /* inline editor */
  let editor = null;
  function openEditor(td, initial) {
    closeEditor(false);
    const rect = td.getBoundingClientRect();
    const r = Number(td.dataset.r);
    const d = Number(td.dataset.d);
    const row = App.composed.rows[r];
    const cur = row.cells[d].v;
    const inp = h('input', { class: 'cell-editor', value: initial !== '' ? initial : (cur === '' ? '' : String(cur)) });
    Object.assign(inp.style, { left: rect.left + window.scrollX - 6 + 'px', top: rect.top + window.scrollY - 2 + 'px', width: rect.width + 12 + 'px', height: rect.height + 4 + 'px', position: 'absolute' });
    document.body.appendChild(inp);
    inp.focus();
    if (initial === '') inp.select();
    else inp.setSelectionRange(inp.value.length, inp.value.length);
    editor = { inp, r, d };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        closeEditor(true);
        moveSel(e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0, e.key === 'Enter' ? (e.shiftKey ? -1 : 1) : 0);
      } else if (e.key === 'Escape') { e.preventDefault(); closeEditor(false); }
      e.stopPropagation();
    });
    inp.addEventListener('blur', () => closeEditor(true));
  }

  function closeEditor(commitIt) {
    if (!editor) return;
    const ed = editor;
    editor = null;
    const val = ed.inp.value;
    ed.inp.remove();
    if (!commitIt) return;
    const row = App.composed.rows[ed.r];
    const cur = row.cells[ed.d].v;
    if (String(val).trim() === String(cur)) return;
    const v = C.canonicalValue(App.state, val, row.emp.category);
    const ch = setCell(row.emp, ed.d, v);
    pushUndo([ch]);
    persist();
    recompose();
    renderSubbar();
    refreshGrid();
    renderTopbar();
    const known = v === '' || typeof v === 'number' || C.findCode(App.state, v, row.emp.category);
    if (!known) toast(t('unknownCodeToast', { v }), { timeout: 5000 });
  }

  function moveSel(dx, dy) {
    const rowIdx = currentRowIdx();
    if (!rowIdx.length) return;
    const a = App.view.anchor || { r: rowIdx[0], d: 1 };
    let i = rowIdx.indexOf(a.r);
    if (i < 0) i = 0;
    i = Math.max(0, Math.min(rowIdx.length - 1, i + dy));
    const d = Math.max(1, Math.min(App.composed.days, a.d + dx));
    App.view.anchor = { r: rowIdx[i], d };
    App.view.sel = new Set([rowIdx[i] + ':' + d]);
    refreshSelection();
    const td = document.querySelector(`table.tgrid td[data-r="${rowIdx[i]}"][data-d="${d}"]`);
    if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('.modal-back') || editor) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); TS.store.flush(); toast(t('saved')); return; }
      if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); exportExcel(); return; }
      if (!['office', 'shift', 'rotation'].includes(App.view.tab)) return;
      if (e.key === 'Escape') { App.view.brush = null; App.view.sel.clear(); closePopover(); renderContent(); return; }
      if (mod && e.key.toLowerCase() === 'c') { copySel(); e.preventDefault(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); const ri = currentRowIdx(); selectRect(ri, ri[0], 1, ri[ri.length - 1], App.composed.days, false); return; }
      if (!App.view.sel.size) return;
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key]) { e.preventDefault(); moveSel(...arrows[e.key]); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); applyToSelection(''); return; }
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        const a = App.view.anchor;
        const td = a && document.querySelector(`table.tgrid td[data-r="${a.r}"][data-d="${a.d}"]`);
        if (td) openEditor(td, '');
        return;
      }
      if (!mod && e.key.length === 1 && /[\w.,]/.test(e.key)) {
        const a = App.view.anchor;
        if (App.view.sel.size > 1) {
          // type a value for many cells
          e.preventDefault();
          quickValuePrompt(e.key);
          return;
        }
        const td = a && document.querySelector(`table.tgrid td[data-r="${a.r}"][data-d="${a.d}"]`);
        if (td) { e.preventDefault(); openEditor(td, e.key); }
      }
    });
    document.addEventListener('paste', (e) => {
      if (document.querySelector('.modal-back') || editor) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (!App.view.anchor || !['office', 'shift', 'rotation'].includes(App.view.tab)) return;
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!text) return;
      e.preventDefault();
      pasteText(text);
    });
  }

  function quickValuePrompt(first) {
    const inp = h('input', { class: 'input', value: first, autofocus: true, style: { width: '100%', fontSize: '18px', height: '44px', textAlign: 'center', fontWeight: '700' } });
    const m = modal({
      title: t('setCells', { n: App.view.sel.size }),
      content: h('div', { class: 'stack' }, inp, h('div', { class: 'hint' }, t('setCellsHint'))),
      buttons: [{ label: t('cancel') }, { label: t('apply'), kind: 'primary', run: () => applyToSelection(inp.value) }],
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { applyToSelection(inp.value); m.close(); } });
    setTimeout(() => { inp.focus(); inp.setSelectionRange(1, 1); }, 40);
  }

  function selBounds() {
    const rowIdx = currentRowIdx();
    let r1 = Infinity; let r2 = -1; let d1 = Infinity; let d2 = -1;
    for (const k of App.view.sel) {
      const [r, d] = k.split(':').map(Number);
      const i = rowIdx.indexOf(r);
      if (i < 0) continue;
      r1 = Math.min(r1, i); r2 = Math.max(r2, i); d1 = Math.min(d1, d); d2 = Math.max(d2, d);
    }
    return r2 < 0 ? null : { rowIdx, r1, r2, d1, d2 };
  }

  function copySel() {
    const b = selBounds();
    if (!b) return;
    const lines = [];
    for (let i = b.r1; i <= b.r2; i++) {
      const row = App.composed.rows[b.rowIdx[i]];
      const vals = [];
      for (let d = b.d1; d <= b.d2; d++) vals.push(App.view.sel.has(b.rowIdx[i] + ':' + d) ? String(row.cells[d].v) : '');
      lines.push(vals.join('\t'));
    }
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
    toast(t('copied', { n: App.view.sel.size }));
  }

  function pasteText(text) {
    const rowIdx = currentRowIdx();
    const b = selBounds();
    const start = b ? { i: b.r1, d: b.d1 } : { i: rowIdx.indexOf(App.view.anchor.r), d: App.view.anchor.d };
    const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    const changes = [];
    lines.forEach((vals, li) => {
      const i = start.i + li;
      if (i >= rowIdx.length) return;
      const row = App.composed.rows[rowIdx[i]];
      vals.forEach((v, vi) => {
        const d = start.d + vi;
        if (d > App.composed.days) return;
        changes.push(setCell(row.emp, d, C.canonicalValue(App.state, v, row.emp.category)));
      });
    });
    if (!changes.length) return;
    pushUndo(changes);
    persist();
    recompose();
    renderSubbar();
    refreshGrid();
    toast(t('pasted', { n: changes.length }));
  }

  function openCellMenu(pos, cat) {
    const { list, more } = brushDefs(cat);
    const items = [{ header: t('setCells', { n: App.view.sel.size }) }];
    for (const b of list) items.push({ label: b.label, swatch: { fill: typeof b.value === 'number' ? (cat === 'shift' ? '#FFFF00' : '#eef1f7') : b.code.fill, color: typeof b.value === 'number' ? '#111' : TS.dom.textOn(b.code.fill), text: String(b.value) }, run: () => applyToSelection(b.value) });
    items.push({ label: t('otherValue'), icon: 'tag', run: () => quickValuePrompt('') });
    if (more.length) {
      items.push('sep');
      for (const c of more.slice(0, 8)) items.push({ label: codeLabel(c), swatch: { fill: c.fill, color: TS.dom.textOn(c.fill), text: c.code }, run: () => applyToSelection(c.code) });
    }
    items.push('sep');
    items.push({ label: t('clear'), icon: 'eraser', run: () => applyToSelection('') });
    items.push({ label: t('restoreDefault'), icon: 'reset', run: () => applyToSelection(undefined) });
    menu(pos, items);
  }

  function openDayHeaderMenu(th, rowIdx, d) {
    const comp = App.composed;
    const iso = U.isoDate(App.view.year, App.view.month, d);
    const hol = comp.holiday[d];
    const items = [
      { header: wdName(U.weekday(App.view.year, App.view.month, d)) + ' ' + d + ' ' + monthName(App.view.month) },
      { label: t('selectColumn'), icon: 'cursor', run: () => { App.view.anchor = { r: rowIdx[0], d }; selectRect(rowIdx, rowIdx[0], d, rowIdx[rowIdx.length - 1], d, false); } },
    ];
    if (hol) {
      const isSpecific = hol.date === iso;
      items.push({ label: t('removeHoliday'), icon: 'flag', run: () => {
        if (isSpecific) App.state.holidays = App.state.holidays.filter((x) => x !== hol);
        else App.state.holidays.push({ date: iso, en: 'Working day', az: 'İş günü', code: '', off: true });
        commit();
      } });
    } else {
      items.push({ label: t('markHoliday'), icon: 'flag', run: () => {
        App.state.holidays = App.state.holidays.filter((x) => !(x.date === iso && x.off));
        App.state.holidays.push({ date: iso, en: 'Public holiday', az: 'Bayram günü', code: 'PH' });
        commit();
      } });
    }
    menu(th, items);
  }

  /* ---------------- group views */

  function legend(cat) {
    const codes = App.state.codes.filter((c) => cat === 'shift' || c.kind !== 'shift');
    return h('div', { class: 'legend-row' },
      h('span', null, h('span', { class: 'cat-dot', style: { background: 'var(--weekend)' } }), t('weekend')),
      h('span', null, h('span', { style: { width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)' } }), t('editedLegend')),
      h('span', null, h('span', { class: 'cat-dot', style: { background: 'repeating-linear-gradient(135deg, transparent 0 2px, rgba(220,38,38,.5) 2px 4px)', borderColor: 'var(--err)' } }), t('issueLegend')),
      codes.map((c) => h('span', null, h('span', { class: 'sw badge', style: { background: c.fill, color: TS.dom.textOn(c.fill), border: '1px solid rgba(0,0,0,.1)' } }, c.code), codeLabel(c))));
  }

  function groupSummary(cat) {
    const comp = App.composed;
    const rows = groupRows(cat).map((i) => comp.rows[i]);
    let working = 0;
    for (let d = 1; d <= comp.days; d++) if (!comp.weekend[d] && !comp.holiday[d]) working++;
    const edited = rows.reduce((n, r) => n + r.cells.filter((c) => c && c.src === 'override').length, 0);
    const hours = rows.reduce((n, r) => n + r.hours, 0);
    const absences = rows.reduce((n, r) => n + r.cells.filter((c) => c && typeof c.v === 'string' && c.v && !['OFF', '1st', '2nd', 'N'].includes(c.v)).length, 0);
    const k = [];
    if (cat === 'office') k.push([working, t('kWorkingDays')], [working * (Number(App.state.settings.officeHours) || 8), t('kNormHours')]);
    k.push([fmtNum(hours), t('kTotalHours')], [absences, t('kAbsences')], [edited, t('kEdited')]);
    return h('div', { class: 'kpis' }, k.map(([v, l]) => h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(v)), h('div', { class: 'l' }, l))));
  }

  function viewGroup(cat) {
    const rows = groupRows(cat);
    if (!rows.length) return emptyGroup();
    return h('div', { class: 'stack' },
      groupSummary(cat),
      h('div', { class: 'card' }, toolbar(cat), hintLine(cat)),
      buildGrid(rows, { key: cat }),
      h('div', { class: 'card' }, legend(cat)));
  }

  function emptyGroup() {
    return h('div', { class: 'card empty-state' }, icon('users', 'lg'), h('p', null, t('noPeople')),
      h('button', { class: 'btn primary', onclick: () => TS.settingsDialog.open('employees') }, icon('plus'), t('manageEmployees')));
  }

  /* ---------------- shift workers */

  function viewShift() {
    const rows = groupRows('shift');
    if (!rows.length) return emptyGroup();
    const rec = App.state.months[monthKey()];
    const info = rec && rec.importInfo;
    const dz = h('div', { class: 'dropzone', onclick: () => TS.importDialog.pick() },
      h('div', { class: 'dz-icon' }, icon('upload', 'lg')),
      h('div', { style: { flex: 1 } },
        h('div', { class: 'strong' }, info ? t('reimportTitle') : t('importTitle')),
        h('div', { class: 'hint' }, t('importHint'))),
      h('button', { class: 'btn primary', onclick: (e) => { e.stopPropagation(); TS.importDialog.pick(); } }, icon('file'), t('chooseFile')));
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) TS.importDialog.openFile(f);
    });
    const parts = [dz];
    if (info) {
      const errs = App.composed.warnings.filter((w) => w.level === 'error' && rows.includes(w.row)).length;
      parts.push(h('div', { class: 'import-meta', style: { marginTop: '12px' } },
        h('span', null, icon('file', 'sm'), ' ', h('b', null, info.file)),
        h('span', null, t('sheet') + ': ', h('b', null, info.sheet)),
        h('span', null, t('block') + ': ', h('b', null, info.label || '—')),
        h('span', null, t('importedAt') + ': ', h('b', null, new Date(info.at).toLocaleString())),
        h('span', null, t('people') + ': ', h('b', null, String(info.matched)))));
      if (errs) {
        parts.push(h('div', { class: 'callout warn', style: { marginTop: '12px', cursor: 'pointer' }, onclick: openWarnings }, icon('alert'),
          h('div', null, h('b', null, t('undeterminedTitle', { n: errs })), h('div', null, t('undeterminedText')))));
      } else {
        parts.push(h('div', { class: 'callout ok', style: { marginTop: '12px' } }, icon('check'), h('div', null, t('importClean'))));
      }
    }
    return h('div', { class: 'stack' },
      h('div', { class: 'card card-pad' }, parts),
      h('div', { class: 'card' }, toolbar('shift'), hintLine('shift')),
      buildGrid(rows, { key: 'shift' }),
      h('div', { class: 'card' }, legend('shift')));
  }

  /* ---------------- rotation */

  function viewRotation() {
    const rows = groupRows('rotation');
    if (!rows.length) return emptyGroup();
    const comp = App.composed;
    const rec = C.getMonth(App.state, App.view.year, App.view.month);
    const cfg = rec.rotation;
    const block = C.blockLen(App.state);
    const setCfg = (patch) => { rec.rotation = Object.assign({}, cfg, patch); commit(); };

    // setup card
    const seg = h('div', { class: 'seg' },
      ['A', 'B'].map((g) => h('button', { class: cfg.group === g ? 'on' : '', onclick: () => setCfg({ group: g }) }, h('span', { class: 'gpill ' + g }, g), ' ' + t('groupX', { g }))));
    const cal = h('div', { class: 'mini-cal' });
    const firstW = U.weekday(App.view.year, App.view.month, 1);
    const offset = (firstW + 6) % 7; // Monday first
    for (let i = 0; i < 7; i++) cal.appendChild(h('div', { class: 'wd' }, wdName((i + 1) % 7)));
    for (let i = 0; i < offset; i++) cal.appendChild(h('div'));
    for (let d = 1; d <= comp.days; d++) {
      const g = comp.rotPattern[d];
      cal.appendChild(h('button', {
        class: g + (d === Number(cfg.startDay) ? ' start' : '') + (comp.weekend[d] ? ' we' : ''),
        title: t('groupWorks', { g, d }),
        onclick: () => setCfg({ startDay: d }),
      }, String(d)));
    }
    const prev = U.addMonths(App.view.year, App.view.month, -1);
    const prevRec = App.state.months[U.monthKey(prev.year, prev.month)];
    const suggestion = prevRec && prevRec.rotation ? TS.rotation.continueFrom(prevRec.rotation, block, prev.year, prev.month) : null;
    const sameAsSuggestion = suggestion && suggestion.group === cfg.group && Number(suggestion.startDay) === Number(cfg.startDay) && !!suggestion.oneDay === !!cfg.oneDay;
    const oneDay = h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: !!cfg.oneDay, onchange: (e) => setCfg({ oneDay: e.target.checked }) }),
      h('span', { class: 'track' }),
      h('span', null, h('div', { class: 'strong' }, t('oneDayStart')), h('div', { class: 'hint' }, t('oneDayHint', { g: cfg.group }))));
    const setup = h('div', { class: 'card' },
      h('div', { class: 'card-head' }, icon('refresh'), h('div', null, h('div', { class: 'card-title' }, t('rotationSetup')), h('div', { class: 'card-sub' }, t('rotationSub', { h: App.state.settings.rotationHours, b: block })))),
      h('div', { class: 'card-pad stack' },
        h('div', { class: 'field' }, h('label', null, t('whichGroupStarts')), seg),
        h('div', { class: 'field' }, h('label', null, t('firstWorkDay', { g: cfg.group })), cal),
        oneDay,
        suggestion ? h('div', { class: 'callout ' + (sameAsSuggestion ? 'ok' : '') }, icon(sameAsSuggestion ? 'check' : 'info'),
          h('div', { style: { flex: 1 } },
            sameAsSuggestion ? t('continuesFromPrev', { m: monthName(prev.month) }) : t('suggestFromPrev', { m: monthName(prev.month), g: suggestion.group, d: suggestion.startDay, one: suggestion.oneDay ? t('oneDayShort') : '' }),
            !sameAsSuggestion ? h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn sm primary', onclick: () => { rec.rotation = Object.assign({}, suggestion); commit(); } }, icon('wand', 'sm'), t('applySuggestion'))) : null))
          : h('div', { class: 'hint' }, t('noPrevMonth'))));

    // pattern strip + members
    const strip = h('div', { class: 'strip' });
    for (let d = 1; d <= comp.days; d++) {
      const g = comp.rotPattern[d];
      strip.appendChild(h('div', { class: 'd ' + g, title: wdName(U.weekday(App.view.year, App.view.month, d)) + ' ' + d }, h('span', { class: 'n' }, String(d)), g));
    }
    const memberCol = (g) => {
      const list = App.state.employees.filter((e) => e.category === 'rotation' && (e.group || 'A') === g);
      const workDays = comp.rotPattern.filter((x) => x === g).length;
      return h('div', { class: 'member-col ' + g },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h('span', { class: 'gpill ' + g }, g), h('b', null, t('groupX', { g })),
          h('span', { class: 'spacer' }), h('span', { class: 'badge' }, t('daysCount', { n: workDays }))),
        list.map((e) => h('div', { class: 'member' },
          h('span', { class: 'nm', title: e.position }, e.name),
          h('button', { class: 'btn ghost icon sm', title: t('moveToGroup', { g: g === 'A' ? 'B' : 'A' }), onclick: () => { e.group = g === 'A' ? 'B' : 'A'; commit(); } }, icon('swap', 'sm')))),
        !list.length ? h('div', { class: 'hint', style: { marginTop: '8px' } }, t('emptyGroup')) : null);
    };
    const right = h('div', { class: 'stack' },
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, icon('calendar'), h('div', null, h('div', { class: 'card-title' }, t('patternPreview')), h('div', { class: 'card-sub' }, t('patternSub')))),
        h('div', { class: 'card-pad' }, strip)),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, icon('users'), h('div', null, h('div', { class: 'card-title' }, t('groupsTitle')), h('div', { class: 'card-sub' }, t('groupsSub')))),
        h('div', { class: 'card-pad members' }, memberCol('A'), memberCol('B'))));
    return h('div', { class: 'stack' },
      h('div', { class: 'rot-grid' }, setup, right),
      h('div', { class: 'card' }, toolbar('rotation'), hintLine('rotation')),
      buildGrid(rows, { key: 'rotation' }),
      h('div', { class: 'card' }, legend('rotation')));
  }

  /* ---------------- preview */

  function viewPreview() {
    const comp = App.composed;
    const s = App.state.settings;
    const sheet = h('div', { class: 'sheet' });
    const tbl = h('table');
    const cols = 4 + comp.days + 2;
    tbl.appendChild(h('tr', null, h('td', { class: 'title', colspan: cols },
      TS.LOGO_B64 ? h('img', { src: 'data:image/png;base64,' + TS.LOGO_B64, alt: '' }) : null,
      'Timesheet ' + U.MONTHS_EN[App.view.month - 1] + ' ' + App.view.year)));
    tbl.appendChild(h('tr', null, h('td', { colspan: 2, style: { border: '1px solid #000' } }), h('td', { style: { color: '#f00', fontWeight: 700, fontFamily: 'Times New Roman' } }, s.department || 'Departament/ Team'), h('td', { colspan: cols - 3 })));
    const hr = h('tr', null, h('th', null, '№'), h('th', null, 'SAP Code'), h('th', null, 'Name Surname'), h('th', null, 'Position'));
    for (let d = 1; d <= comp.days; d++) hr.appendChild(h('th', { class: 'd' }, String(d)));
    hr.appendChild(h('th', null, 'Total hours'));
    hr.appendChild(h('th', null, 'Total days'));
    tbl.appendChild(hr);
    comp.rows.forEach((row, i) => {
      const e = row.emp;
      const cf = TS.defaults.CATEGORY_FILL[e.category];
      const tr = h('tr', null,
        h('td', { style: { fontWeight: 700 } }, String(i + 1)),
        h('td', { style: { background: cf, fontWeight: 700 } }, e.sap),
        h('td', { class: 'nm', style: { background: cf } }, e.name),
        h('td', { class: 'nm', style: { background: cf } }, e.position));
      for (let d = 1; d <= comp.days; d++) {
        const v = row.cells[d].v;
        let bg = comp.weekend[d] ? '#BDD7EE' : '#fff';
        let color = '#000';
        if (v !== '' && v !== null && v !== undefined) {
          if (typeof v === 'number') { if (e.category === 'shift') bg = s.shiftNumberFill || '#FFFF00'; } else {
            const c = C.findCode(App.state, v, e.category);
            if (c) { bg = c.fill; color = c.font || '#000'; }
          }
        }
        const issue = row.cells[d].notes && row.cells[d].notes.some((n) => n.level === 'error');
        tr.appendChild(h('td', { class: 'v', style: { background: bg, color, outline: issue ? '2px solid #dc2626' : '' } }, v === '' ? '' : String(v)));
      }
      tr.appendChild(h('td', { style: { fontWeight: 700 } }, fmtNum(row.hours)));
      tr.appendChild(h('td', { style: { fontWeight: 700 } }, String(row.dayCount)));
      tbl.appendChild(tr);
    });
    sheet.appendChild(tbl);
    const lg = h('table', { class: 'legend', style: { marginTop: '16px' } });
    App.state.codes.filter((c) => c.kind === 'leave').forEach((c) => lg.appendChild(h('tr', null, h('td', { style: { background: c.fill, color: c.font, minWidth: '40px' } }, c.code), h('td', { style: { background: c.fill, color: c.font, minWidth: '160px' } }, c.en))));
    sheet.appendChild(lg);
    const now = new Date();
    sheet.appendChild(h('table', { style: { marginTop: '16px' } },
      h('tr', null, h('td', { style: { fontWeight: 700, fontFamily: 'Times New Roman', height: '30px', minWidth: '110px' } }, 'Line manager'), h('td', { style: { minWidth: '230px' } })),
      h('tr', null, h('td', { style: { fontWeight: 700, fontFamily: 'Times New Roman', height: '30px' } }, 'Signature'), h('td')),
      h('tr', null, h('td', { style: { fontWeight: 700, fontFamily: 'Times New Roman', height: '30px' } }, 'Date'), h('td', { style: { fontWeight: 700 } }, String(now.getDate()).padStart(2, '0') + '.' + String(now.getMonth() + 1).padStart(2, '0') + '.' + now.getFullYear()))));
    sheet.style.transform = 'scale(' + App.view.zoom + ')';
    const holder = h('div', { style: { width: 'fit-content' } }, sheet);
    const wrap = h('div', { class: 'preview-wrap', dataset: { keep: 'preview' } }, holder);
    requestAnimationFrame(() => {
      holder.style.width = sheet.offsetWidth * App.view.zoom + 'px';
      holder.style.height = sheet.offsetHeight * App.view.zoom + 'px';
    });
    const setZoom = (z) => { App.view.zoom = Math.max(0.4, Math.min(1.6, Math.round(z * 10) / 10)); renderContent(); };
    return h('div', { class: 'stack' },
      h('div', { class: 'card toolbar' },
        icon('eye'), h('div', null, h('div', { class: 'card-title' }, t('previewTitle')), h('div', { class: 'card-sub' }, t('previewSub'))),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn icon sm', title: t('zoomOut'), onclick: () => setZoom(App.view.zoom - 0.1) }, icon('zoomout', 'sm')),
        h('span', { class: 'badge' }, Math.round(App.view.zoom * 100) + '%'),
        h('button', { class: 'btn icon sm', title: t('zoomIn'), onclick: () => setZoom(App.view.zoom + 0.1) }, icon('zoomin', 'sm')),
        h('button', { class: 'btn primary sm', onclick: exportExcel }, icon('download', 'sm'), t('exportExcel'))),
      wrap);
  }

  /* ================================================================== warnings drawer */

  function warningText(w) {
    const emp = w.empId ? App.state.employees.find((e) => e.id === w.empId) : null;
    const who = emp ? emp.name : '';
    const day = w.day ? wdName(U.weekday(App.view.year, App.view.month, w.day)) + ' ' + w.day + ' ' + monthName(App.view.month) : '';
    let msg = t('w_' + w.key, { a: w.a, b: w.b });
    if (w.raw !== undefined && w.raw !== null && w.raw !== '') msg += ' — ' + t('sourceWas', { raw: String(w.raw) });
    return { who, day, msg };
  }

  function openWarnings() {
    const ws = App.composed.warnings;
    const back = h('div', { class: 'drawer-back', onclick: () => close() });
    const body = h('div', { class: 'drawer-body' });
    const drawer = h('aside', { class: 'drawer' },
      h('div', { class: 'drawer-head' }, icon('alert'), h('div', { style: { flex: 1 } }, h('div', { class: 'card-title' }, t('reviewIssues')), h('div', { class: 'card-sub' }, monthName(App.view.month) + ' ' + App.view.year)),
        h('button', { class: 'btn ghost icon sm', onclick: () => close() }, icon('x'))),
      body);
    function close() { back.remove(); drawer.remove(); document.removeEventListener('keydown', onKey); }
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    if (!ws.length) body.appendChild(h('div', { class: 'empty-state' }, icon('check', 'lg'), h('p', null, t('noIssues'))));
    for (const level of ['error', 'warn', 'info']) {
      const list = ws.filter((w) => w.level === level);
      if (!list.length) continue;
      const g = h('div', { class: 'wgroup' }, h('div', { class: 'wgroup-title' }, t('level_' + level) + ' · ' + list.length));
      for (const w of list) {
        const tx = warningText(w);
        g.appendChild(h('div', { class: 'witem', onclick: () => { close(); jumpTo(w); } },
          h('div', { class: 'ic ' + level }, icon(level === 'info' ? 'info' : 'alert', 'sm')),
          h('div', null,
            h('div', { class: 't1' }, [tx.who, tx.day].filter(Boolean).join(' · ') || t('general')),
            h('div', { class: 't2' }, tx.msg))));
      }
      body.appendChild(g);
    }
    document.body.appendChild(back);
    document.body.appendChild(drawer);
  }

  function jumpTo(w) {
    if (w.row === undefined) {
      if (w.key === 'groupSize') { App.view.tab = 'rotation'; renderSubbar(); renderContent(); }
      return;
    }
    const emp = App.composed.rows[w.row].emp;
    App.view.tab = emp.category;
    App.view.brush = null;
    App.view.sel = new Set(w.day ? [w.row + ':' + w.day] : []);
    App.view.anchor = w.day ? { r: w.row, d: w.day } : null;
    renderSubbar();
    renderContent();
    if (w.day) {
      const td = document.querySelector(`table.tgrid td[data-r="${w.row}"][data-d="${w.day}"]`);
      if (td) { td.scrollIntoView({ block: 'center', inline: 'center' }); td.classList.add('flash'); }
    }
  }

  /* ================================================================== dialogs: range, reset */

  function openRangeDialog(cat) {
    const emps = App.state.employees.filter((e) => e.category === cat);
    const days = App.composed.days;
    const empSel = h('select', { class: 'input' }, emps.map((e) => h('option', { value: e.id }, e.name)));
    const from = h('input', { class: 'input', type: 'number', min: 1, max: days, value: 1 });
    const to = h('input', { class: 'input', type: 'number', min: 1, max: days, value: Math.min(days, 5) });
    const { list, more } = brushDefs(cat);
    const codeSel = h('select', { class: 'input' },
      list.concat(more.map((c) => ({ value: c.code, label: codeLabel(c) }))).map((b) => h('option', { value: String(b.value) }, String(b.value) + ' — ' + b.label)));
    codeSel.value = 'V';
    const onlyWork = h('input', { type: 'checkbox' });
    modal({
      title: t('addAbsence'), icon: 'calendar', subtitle: t('addAbsenceSub'),
      content: h('div', { class: 'form-grid', style: { gridTemplateColumns: '1fr 1fr' } },
        h('div', { class: 'field', style: { gridColumn: '1 / -1' } }, h('label', null, t('employee')), empSel),
        h('div', { class: 'field' }, h('label', null, t('fromDay')), from),
        h('div', { class: 'field' }, h('label', null, t('toDay')), to),
        h('div', { class: 'field', style: { gridColumn: '1 / -1' } }, h('label', null, t('value')), codeSel),
        h('label', { class: 'switch', style: { gridColumn: '1 / -1' } }, onlyWork, h('span', { class: 'track' }), h('span', null, t('onlyWorkingDays')))),
      buttons: [{ label: t('cancel') }, {
        label: t('apply'), kind: 'primary', run: () => {
          const emp = emps.find((e) => e.id === empSel.value);
          const a = Math.max(1, Math.min(days, parseInt(from.value, 10) || 1));
          const b = Math.max(1, Math.min(days, parseInt(to.value, 10) || a));
          const changes = [];
          const rowI = App.composed.rows.findIndex((r) => r.emp.id === emp.id);
          for (let d = Math.min(a, b); d <= Math.max(a, b); d++) {
            if (onlyWork.checked) {
              const cur = App.composed.rows[rowI].cells[d].v;
              if (cur === '' || cur === 'OFF') continue;
            }
            changes.push(setCell(emp, d, C.canonicalValue(App.state, codeSel.value, cat)));
          }
          if (changes.length) { pushUndo(changes); commit(); renderTopbar(); toast(t('rangeApplied', { n: changes.length, name: emp.name }), { kind: 'ok' }); }
        },
      }],
    });
  }

  async function resetGroup(cat) {
    const ok = await TS.dom.confirmBox(t('resetGroup'), t('resetGroupConfirm', { m: monthName(App.view.month) }), t('reset'), { danger: true });
    if (!ok) return;
    const rec = C.getMonth(App.state, App.view.year, App.view.month);
    const changes = [];
    for (const e of App.state.employees.filter((x) => x.category === cat)) {
      const ov = rec.overrides[e.id] || {};
      for (const d of Object.keys(ov)) changes.push({ key: monthKey(), empId: e.id, day: Number(d), before: ov[d], after: undefined });
      delete rec.overrides[e.id];
    }
    if (changes.length) pushUndo(changes);
    commit();
    renderTopbar();
  }

  /* ================================================================== export */

  function fileNameFor() {
    const s = App.state.settings;
    const pat = s.fileName || '{Month}_timesheet_Filled';
    const name = pat.replace(/\{Month\}/g, U.MONTHS_EN[App.view.month - 1]).replace(/\{Year\}/g, App.view.year).replace(/\{MM\}/g, String(App.view.month).padStart(2, '0'))
      .replace(/[\\/:*?"<>|]+/g, '_');
    return name + '.xlsx';
  }

  async function exportExcel() {
    const comp = recompose();
    const errs = comp.warnings.filter((w) => w.level === 'error');
    if (errs.length) {
      const goOn = await new Promise((resolve) => {
        let done = false;
        modal({
          title: t('exportWithErrors', { n: errs.length }), icon: 'alert',
          content: h('div', { class: 'stack' }, h('div', { class: 'hint', style: { fontSize: '14px' } }, t('exportWithErrorsText')),
            h('div', { class: 'card', style: { maxHeight: '220px', overflow: 'auto', padding: '6px' } }, errs.slice(0, 30).map((w) => {
              const tx = warningText(w);
              return h('div', { class: 'small', style: { padding: '4px 6px' } }, h('b', null, [tx.who, tx.day].filter(Boolean).join(' · ')), ' — ', tx.msg);
            }))),
          buttons: [{ label: t('review'), run: () => { done = true; resolve(false); setTimeout(openWarnings, 50); } }, 'spacer', { label: t('exportAnyway'), kind: 'primary', run: () => { done = true; resolve(true); } }],
          onClose: () => { if (!done) resolve(false); },
        });
      });
      if (!goOn) return;
    }
    const rec = App.state.months[monthKey()];
    const tpl = rec && rec.templateId ? App.state.templates[rec.templateId] : null;
    const close = toast(t('exporting'), { timeout: 20000 });
    try {
      const out = await TS.excel.exportMonth(App.state, App.view.year, App.view.month, tpl ? TS.dom.b64ToBytes(tpl.b64) : null);
      close();
      const name = fileNameFor();
      const res = await TS.store.saveExport(name, out.bytes);
      if (out.fallbackReason) toast(t('formFallback'), { kind: 'err', timeout: 8000 });
      if (res && res.path) {
        toast(t('exportedTo', { path: res.path }), { kind: 'ok', actions: [
          { label: t('openFile'), run: () => TS.store.open('file', res.path) },
          { label: t('openFolder'), run: () => TS.store.open('exports') },
        ] });
      } else {
        toast(t('exportedDownload', { name }), { kind: 'ok' });
      }
      C.getMonth(App.state, App.view.year, App.view.month).exportedAt = new Date().toISOString();
      persist();
    } catch (e) {
      close();
      console.error(e);
      toast(t('exportFailed') + ' ' + (e && e.message ? e.message : ''), { kind: 'err', timeout: 9000 });
    }
  }

  /* ================================================================== start */

  async function start() {
    try {
      await TS.store.init();
    } catch (e) { /* stays in browser mode */ }
    let loaded = null;
    try { loaded = await TS.store.load(); } catch (e) { console.error(e); }
    App.state = ensureState(loaded);
    const ui = App.state.ui || {};
    const now = new Date();
    App.view.year = ui.year || now.getFullYear();
    App.view.month = ui.month || now.getMonth() + 1;
    App.view.tab = ui.tab || 'office';
    TS.store.onStatus = renderSaveState;
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (App.state.settings.theme === 'system') applyTheme(); });
    bindKeys();
    render();
    if (!loaded) persist();
  }

  Object.assign(App, { start, render, renderContent, renderSubbar, renderTopbar, commit, persist, recompose, ensureState, monthName, codeLabel, setMonth, exportExcel, openWarnings, jumpTo, monthKey, pushUndo, applyTheme, wdName });
  document.addEventListener('DOMContentLoaded', start);
})(typeof window !== 'undefined' ? window : globalThis);
