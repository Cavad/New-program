/* Settings: general, employees, codes & colours, import rules, holidays, data & backups. */
(function (root) {
  const TS = root.TS;
  const U = TS.util;
  const { h, icon, toast, modal } = TS.dom;
  const t = (k, p) => TS.t(k, p);

  let current = 'general';

  function open(section) {
    if (section) current = section;
    const App = TS.App;
    const nav = h('nav', { class: 'settings-nav' });
    const main = h('div', { class: 'settings-main' });
    const sections = () => [
      ['general', 'sliders', t('sGeneral')],
      ['employees', 'users', t('sEmployees')],
      ['codes', 'tag', t('sCodes')],
      ['import', 'wand', t('sImport')],
      ['holidays', 'flag', t('sHolidays')],
      ['data', 'database', t('sData')],
      ['help', 'info', t('sHelp')],
    ];
    const draw = () => {
      nav.innerHTML = '';
      for (const [id, ic, label] of sections()) {
        nav.appendChild(h('button', { class: current === id ? 'on' : '', onclick: () => { current = id; draw(); } }, icon(ic, 'sm'), label));
      }
      main.innerHTML = '';
      const fn = { general, employees, codes, importRules, holidays, data, help }[current === 'import' ? 'importRules' : current];
      main.appendChild(fn(draw));
    };
    draw();
    modal({
      title: t('settings'), icon: 'gear', size: 'full', noPad: true,
      content: h('div', { class: 'settings' }, nav, main),
      onClose: () => App.render(),
    });
  }

  function save() {
    TS.App.persist();
    TS.App.recompose();
  }

  /* ---------------------------------------------------------------- general */
  function general(redraw) {
    const App = TS.App;
    const s = App.state.settings;
    const num = (key, min, max, step) => h('input', { class: 'input', type: 'number', min, max, step: step || 1, value: s[key], onchange: (e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { s[key] = v; save(); } } });
    const seg = (key, opts, after) => h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { class: s[key] === v ? 'on' : '', onclick: () => { s[key] = v; save(); if (after) after(); redraw(); } }, l)));
    return h('div', null,
      h('h3', null, t('sGeneral')),
      h('div', { class: 'hint' }, t('sGeneralSub')),
      h('div', { class: 'form-grid' },
        h('div', { class: 'field' }, h('label', null, t('language')), seg('language', [['en', 'English'], ['az', 'Azərbaycanca']], () => { TS.setLang(s.language); })),
        h('div', { class: 'field' }, h('label', null, t('theme')), seg('theme', [['light', t('light')], ['dark', t('dark')], ['system', t('system')]], () => App.applyTheme())),
        h('div', { class: 'field' }, h('label', null, t('officeHours')), num('officeHours', 0, 24, 0.5)),
        h('div', { class: 'field' }, h('label', null, t('rotationHours')), num('rotationHours', 0, 24, 0.5)),
        h('div', { class: 'field' }, h('label', null, t('rotationBlock')), num('rotationBlock', 1, 14)),
        h('div', { class: 'field' }, h('label', null, t('department')), h('input', { class: 'input', value: s.department || '', placeholder: 'Departament/ Team', onchange: (e) => { s.department = e.target.value.trim(); save(); } })),
        h('div', { class: 'field' }, h('label', null, t('fileNamePattern')), h('input', { class: 'input', value: s.fileName, onchange: (e) => { s.fileName = e.target.value.trim() || '{Month}_timesheet_Filled'; save(); } }), h('div', { class: 'tiny muted' }, t('fileNameHint'))),
        h('div', { class: 'field' }, h('label', null, t('shiftNumberColour')), h('input', { class: 'color-in', type: 'color', value: s.shiftNumberFill || '#FFFF00', onchange: (e) => { s.shiftNumberFill = e.target.value.toUpperCase(); save(); } }))),
      h('div', { class: 'section-gap' }),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!s.applyHolidays, onchange: (e) => { s.applyHolidays = e.target.checked; save(); } }), h('span', { class: 'track' }),
        h('span', null, h('div', { class: 'strong' }, t('applyHolidays')), h('div', { class: 'hint' }, t('applyHolidaysHint')))));
  }

  /* ---------------------------------------------------------------- employees */
  function employees(redraw) {
    const App = TS.App;
    const list = App.state.employees;
    const catSel = (e) => h('select', { class: 'input sm', onchange: (ev) => { e.category = ev.target.value; if (e.category === 'rotation' && !e.group) e.group = 'A'; save(); redraw(); } },
      [['office', t('catOffice')], ['shift', t('catShift')], ['rotation', t('catRotation')]].map(([v, l]) => h('option', { value: v, selected: e.category === v }, l)));
    const tb = h('tbody');
    list.forEach((e, i) => {
      const inp = (key, ph, w) => h('input', { class: 'input sm', value: e[key] || '', placeholder: ph || '', style: w ? { minWidth: w } : null, onchange: (ev) => { e[key] = ev.target.value.replace(/\s+/g, ' ').trim(); save(); } });
      const extra = [];
      if (e.category === 'rotation') {
        extra.push(h('div', { class: 'seg' }, ['A', 'B'].map((g) => h('button', { class: (e.group || 'A') === g ? 'on' : '', onclick: () => { e.group = g; save(); redraw(); } }, g))));
      } else if (e.category === 'shift') {
        extra.push(h('input', { class: 'input sm', value: (e.aliases || []).join(', '), placeholder: t('aliasesPh'), title: t('aliasesHint'), style: { minWidth: '150px' },
          onchange: (ev) => { e.aliases = ev.target.value.split(',').map((x) => x.trim()).filter(Boolean); save(); } }));
        extra.push(h('label', { class: 'switch tiny', title: t('offBlankHint'), style: { marginLeft: '8px' } },
          h('input', { type: 'checkbox', checked: !!e.offAsBlank, onchange: (ev) => { e.offAsBlank = ev.target.checked; save(); } }), h('span', { class: 'track' }), h('span', null, t('offBlank'))));
      }
      tb.appendChild(h('tr', null,
        h('td', { class: 'muted' }, String(i + 1)),
        h('td', null, inp('sap', 'SAP', '80px')),
        h('td', null, inp('name', t('employee'), '170px')),
        h('td', null, inp('position', t('position'), '150px')),
        h('td', null, catSel(e)),
        h('td', null, h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, extra)),
        h('td', { class: 'act' },
          h('button', { class: 'btn ghost icon sm', title: t('moveUp'), disabled: i === 0, onclick: () => { list.splice(i - 1, 0, list.splice(i, 1)[0]); save(); redraw(); } }, icon('up', 'sm')),
          h('button', { class: 'btn ghost icon sm', title: t('moveDown'), disabled: i === list.length - 1, onclick: () => { list.splice(i + 1, 0, list.splice(i, 1)[0]); save(); redraw(); } }, icon('down', 'sm')),
          h('button', { class: 'btn ghost icon sm danger', title: t('remove'), onclick: async () => {
            if (await TS.dom.confirmBox(t('removeEmployee'), t('removeEmployeeText', { name: e.name }), t('remove'), { danger: true })) { list.splice(i, 1); save(); redraw(); }
          } }, icon('trash', 'sm')))));
    });
    const addBtn = (cat) => h('button', { class: 'btn sm', onclick: () => {
      const e = { id: U.uid('emp'), sap: '', name: '', position: '', category: cat, group: cat === 'rotation' ? 'A' : '', aliases: [], offAsBlank: false };
      // insert after the last employee of the same category so the sheet keeps its grouping
      let at = -1;
      list.forEach((x, idx) => { if (x.category === cat) at = idx; });
      list.splice(at + 1 || list.length, 0, e);
      save(); redraw();
      setTimeout(() => { const ins = document.querySelectorAll('.settings-main tbody tr')[at + 1 >= 0 ? at + 1 : list.length - 1]; if (ins) { const f = ins.querySelectorAll('input')[1]; if (f) f.focus(); } }, 30);
    } }, icon('plus', 'sm'), t('addTo', { g: t(cat === 'office' ? 'catOffice' : cat === 'shift' ? 'catShift' : 'catRotation') }));
    return h('div', null,
      h('h3', null, t('sEmployees')),
      h('div', { class: 'hint' }, t('sEmployeesSub')),
      h('div', { class: 'row wrap', style: { margin: '14px 0', gap: '8px' } },
        addBtn('office'), addBtn('shift'), addBtn('rotation'),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn sm', onclick: () => importEmployees(redraw) }, icon('upload', 'sm'), t('importFromFilled')),
        h('button', { class: 'btn sm ghost', onclick: async () => {
          if (await TS.dom.confirmBox(t('restoreDefaults'), t('restoreEmployeesText'), t('restoreDefaults'), { danger: true })) { App.state.employees = TS.defaults.defaultEmployees(); save(); redraw(); }
        } }, icon('reset', 'sm'), t('restoreDefaults'))),
      h('div', { class: 'card', style: { overflow: 'auto' } },
        h('table', { class: 'etable' },
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'SAP'), h('th', null, t('employee')), h('th', null, t('position')), h('th', null, t('category')), h('th', null, t('groupOrAliases')), h('th', null, ''))),
          tb)));
  }

  async function importEmployees(redraw) {
    const App = TS.App;
    const f = await TS.dom.pickFile('.xlsx,.xlsm');
    if (!f) return;
    try {
      const list = await TS.excel.readEmployees(await TS.dom.readFileBytes(f));
      if (!list.length) throw new Error('empty');
      const ok = await TS.dom.confirmBox(t('importFromFilled'), t('importEmployeesConfirm', { n: list.length, o: list.filter((e) => e.category === 'office').length, s: list.filter((e) => e.category === 'shift').length, r: list.filter((e) => e.category === 'rotation').length }), t('replaceList'));
      if (!ok) return;
      const old = App.state.employees;
      App.state.employees = list.map((e) => {
        const prev = old.find((o) => (e.sap && String(o.sap) === String(e.sap)) || U.compact(o.name) === U.compact(e.name));
        return Object.assign({ id: prev ? prev.id : U.uid('emp'), aliases: prev ? prev.aliases : [], offAsBlank: prev ? !!prev.offAsBlank : false }, e, { group: e.category === 'rotation' ? (e.group || 'A') : '' });
      });
      save();
      redraw();
      toast(t('employeesImported', { n: list.length }), { kind: 'ok' });
    } catch (e) {
      toast(t('formInvalid'), { kind: 'err' });
    }
  }

  /* ---------------------------------------------------------------- codes */
  function codes(redraw) {
    const App = TS.App;
    const list = App.state.codes;
    const tb = h('tbody');
    list.forEach((c, i) => {
      tb.appendChild(h('tr', null,
        h('td', null, h('span', { class: 'badge', style: { background: c.fill, color: TS.dom.textOn(c.fill), border: '1px solid rgba(0,0,0,.12)', minWidth: '34px', justifyContent: 'center' } }, c.code)),
        h('td', null, h('input', { class: 'input sm', value: c.code, style: { width: '80px' }, onchange: (e) => { const v = e.target.value.trim(); if (v) { c.code = v; save(); redraw(); } } })),
        h('td', null, h('input', { class: 'input sm', value: c.en || '', onchange: (e) => { c.en = e.target.value; save(); } })),
        h('td', null, h('input', { class: 'input sm', value: c.az || '', onchange: (e) => { c.az = e.target.value; save(); } })),
        h('td', null, h('input', { class: 'color-in', type: 'color', value: (c.fill || '#ffffff').slice(0, 7), title: t('fillColour'), onchange: (e) => { c.fill = e.target.value.toUpperCase(); delete c.excelFill; save(); redraw(); } })),
        h('td', null, h('input', { class: 'color-in', type: 'color', value: (c.font || '#000000').slice(0, 7), title: t('textColour'), onchange: (e) => { c.font = e.target.value.toUpperCase(); save(); redraw(); } })),
        h('td', null, h('select', { class: 'input sm', onchange: (e) => { c.kind = e.target.value; save(); } },
          h('option', { value: 'leave', selected: c.kind !== 'shift' }, t('kindLeave')), h('option', { value: 'shift', selected: c.kind === 'shift' }, t('kindShift')))),
        h('td', { class: 'act' }, h('button', { class: 'btn ghost icon sm danger', title: t('remove'), onclick: () => { list.splice(i, 1); save(); redraw(); } }, icon('trash', 'sm')))));
    });
    return h('div', null,
      h('h3', null, t('sCodes')),
      h('div', { class: 'hint' }, t('sCodesSub')),
      h('div', { class: 'row', style: { margin: '14px 0', gap: '8px' } },
        h('button', { class: 'btn sm', onclick: () => { list.push({ code: 'X', en: 'New code', az: 'Yeni kod', fill: '#E2E8F0', font: '#000000', kind: 'leave' }); save(); redraw(); } }, icon('plus', 'sm'), t('addCode')),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn sm ghost', onclick: async () => { if (await TS.dom.confirmBox(t('restoreDefaults'), t('restoreCodesText'), t('restoreDefaults'), { danger: true })) { App.state.codes = TS.defaults.defaultCodes(); save(); redraw(); } } }, icon('reset', 'sm'), t('restoreDefaults'))),
      h('div', { class: 'card', style: { overflow: 'auto' } }, h('table', { class: 'etable' },
        h('thead', null, h('tr', null, h('th', null, ''), h('th', null, t('code')), h('th', null, 'English'), h('th', null, 'Azərbaycanca'), h('th', null, t('fillColour')), h('th', null, t('textColour')), h('th', null, t('kind')), h('th', null, ''))),
        tb)));
  }

  /* ---------------------------------------------------------------- import rules */
  function importRules(redraw) {
    const App = TS.App;
    const map = App.state.importMap;
    const tb = h('tbody');
    Object.keys(map).forEach((k) => {
      tb.appendChild(h('tr', null,
        h('td', null, h('span', { class: 'raw' }, k)),
        h('td', null, h('input', { class: 'input sm', value: String(map[k]), style: { width: '120px' }, onchange: (e) => { const v = e.target.value.trim(); map[k] = U.isNumeric(v) ? U.toNumber(v) : v; save(); } })),
        h('td', { class: 'act' }, h('button', { class: 'btn ghost icon sm danger', onclick: () => { delete map[k]; save(); redraw(); } }, icon('trash', 'sm')))));
    });
    const kIn = h('input', { class: 'input sm', placeholder: t('textInSheet') });
    const vIn = h('input', { class: 'input sm', placeholder: t('writeAs'), style: { width: '120px' } });
    tb.appendChild(h('tr', null, h('td', null, kIn), h('td', null, vIn), h('td', { class: 'act' }, h('button', { class: 'btn sm primary', onclick: () => {
      const k = U.compact(kIn.value);
      const v = vIn.value.trim();
      if (!k) return;
      map[k] = U.isNumeric(v) ? U.toNumber(v) : v;
      save(); redraw();
    } }, icon('plus', 'sm'), t('add')))));
    return h('div', null,
      h('h3', null, t('sImport')),
      h('div', { class: 'hint' }, t('sImportSub')),
      h('div', { class: 'callout', style: { margin: '14px 0' } }, icon('info'), h('div', null, h('b', null, t('autoRulesTitle')), h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px', lineHeight: 1.6 } },
        ['rule1', 'rule2', 'rule3', 'rule4', 'rule5', 'rule6', 'rule7'].map((r) => h('li', null, t(r)))))),
      h('div', { class: 'card', style: { overflow: 'auto' } }, h('table', { class: 'etable' },
        h('thead', null, h('tr', null, h('th', null, t('textInSheet')), h('th', null, t('writeAs')), h('th', null, ''))), tb)));
  }

  /* ---------------------------------------------------------------- holidays */
  function holidays(redraw) {
    const App = TS.App;
    const list = App.state.holidays;
    const tb = h('tbody');
    list.slice().map((x, i) => [x, i]).sort((a, b) => a[0].date.slice(-5).localeCompare(b[0].date.slice(-5))).forEach(([x]) => {
      const annual = x.date.length === 5;
      tb.appendChild(h('tr', null,
        h('td', null, h('input', { class: 'input sm', value: x.date, style: { width: '120px' }, title: t('dateHint'), onchange: (e) => { const v = e.target.value.trim(); if (/^(\d{4}-)?\d{2}-\d{2}$/.test(v)) { x.date = v; save(); redraw(); } else toast(t('dateHint'), { kind: 'err' }); } })),
        h('td', null, h('span', { class: 'badge ' + (annual ? 'info' : x.off ? 'warn' : '') }, annual ? t('everyYear') : x.off ? t('workingDayOverride') : t('onceOnly'))),
        h('td', null, h('input', { class: 'input sm', value: (App.state.settings.language === 'az' ? x.az : x.en) || '', onchange: (e) => { if (App.state.settings.language === 'az') x.az = e.target.value; else x.en = e.target.value; save(); } })),
        h('td', null, x.off ? '' : h('select', { class: 'input sm', onchange: (e) => { x.code = e.target.value; save(); } }, App.state.codes.filter((c) => c.kind !== 'shift').map((c) => h('option', { value: c.code, selected: x.code === c.code }, c.code)))),
        h('td', { class: 'act' }, h('button', { class: 'btn ghost icon sm danger', onclick: () => { list.splice(list.indexOf(x), 1); save(); redraw(); } }, icon('trash', 'sm')))));
    });
    const dIn = h('input', { class: 'input sm', type: 'date' });
    const nIn = h('input', { class: 'input sm', placeholder: t('holidayName') });
    const yearly = h('input', { type: 'checkbox' });
    return h('div', null,
      h('h3', null, t('sHolidays')),
      h('div', { class: 'hint' }, t('sHolidaysSub')),
      h('div', { class: 'card card-pad', style: { margin: '14px 0', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
        dIn, nIn, h('label', { class: 'switch tiny' }, yearly, h('span', { class: 'track' }), h('span', null, t('everyYear'))),
        h('button', { class: 'btn sm primary', onclick: () => {
          if (!dIn.value) return;
          const date = yearly.checked ? dIn.value.slice(5) : dIn.value;
          list.push({ date, en: nIn.value || 'Public holiday', az: nIn.value || 'Bayram günü', code: 'PH' });
          save(); redraw();
        } }, icon('plus', 'sm'), t('add')),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn sm ghost', onclick: async () => { if (await TS.dom.confirmBox(t('restoreDefaults'), t('restoreHolidaysText'), t('restoreDefaults'), { danger: true })) { App.state.holidays = TS.defaults.defaultHolidays(); save(); redraw(); } } }, icon('reset', 'sm'), t('restoreDefaults'))),
      h('div', { class: 'card', style: { overflow: 'auto' } }, h('table', { class: 'etable' },
        h('thead', null, h('tr', null, h('th', null, t('date')), h('th', null, t('type')), h('th', null, t('name')), h('th', null, t('code')), h('th', null, ''))), tb)));
  }

  /* ---------------------------------------------------------------- data & backups */
  function data(redraw) {
    const App = TS.App;
    const box = h('div');
    const server = TS.store.mode === 'server';
    const backupsEl = h('div', { class: 'card', style: { overflow: 'auto', maxHeight: '300px' } }, h('div', { class: 'card-pad hint' }, t('loading')));
    TS.store.listBackups().then((list) => {
      backupsEl.innerHTML = '';
      if (!list.length) { backupsEl.appendChild(h('div', { class: 'card-pad hint' }, t('noBackups'))); return; }
      const tb = h('tbody');
      list.forEach((b) => tb.appendChild(h('tr', null,
        h('td', null, h('b', null, b.name)),
        h('td', { class: 'muted' }, b.time ? new Date(b.time).toLocaleString() : ''),
        h('td', { class: 'muted' }, Math.round((b.size || 0) / 1024) + ' KB'),
        h('td', { class: 'act' }, h('button', { class: 'btn sm', onclick: async () => {
          if (!(await TS.dom.confirmBox(t('restoreBackup'), t('restoreBackupText', { name: b.name }), t('restore'), { danger: true }))) return;
          try { const st = await TS.store.readBackup(b.name); restoreState(st); } catch (e) { toast(String(e.message || e), { kind: 'err' }); }
        } }, icon('reset', 'sm'), t('restore'))))));
      backupsEl.appendChild(h('table', { class: 'etable' }, h('thead', null, h('tr', null, h('th', null, t('backup')), h('th', null, t('date')), h('th', null, t('size')), h('th', null, ''))), tb));
    });
    box.appendChild(h('h3', null, t('sData')));
    box.appendChild(h('div', { class: 'callout ' + (server ? 'ok' : 'warn'), style: { margin: '12px 0' } }, icon(server ? 'shield' : 'alert'),
      h('div', null, server ? [h('b', null, t('storedInFolder')), h('div', { class: 'raw', style: { display: 'inline-block', marginTop: '4px' } }, (TS.store.info && TS.store.info.dataDir) || '')]
        : [h('b', null, t('storedInBrowser')), h('div', null, t('storedInBrowserHint'))])));
    box.appendChild(h('div', { class: 'row wrap', style: { gap: '8px' } },
      h('button', { class: 'btn', onclick: () => {
        const name = 'TimesheetStudio-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        TS.dom.download(name, new TextEncoder().encode(JSON.stringify(App.state, null, 1)), 'application/json');
      } }, icon('download'), t('downloadBackup')),
      h('button', { class: 'btn', onclick: async () => {
        const f = await TS.dom.pickFile('.json');
        if (!f) return;
        try {
          const st = JSON.parse(new TextDecoder().decode(await TS.dom.readFileBytes(f)));
          if (!st || !st.employees || !st.settings) throw new Error('bad');
          if (await TS.dom.confirmBox(t('restoreBackup'), t('restoreBackupText', { name: f.name }), t('restore'), { danger: true })) restoreState(st);
        } catch (e) { toast(t('badBackup'), { kind: 'err' }); }
      } }, icon('upload'), t('restoreFromFile')),
      server ? h('button', { class: 'btn', onclick: () => TS.store.open('data') }, icon('folder'), t('openDataFolder')) : null,
      server ? h('button', { class: 'btn', onclick: () => TS.store.open('exports') }, icon('folder'), t('openExportFolder')) : null));
    box.appendChild(h('div', { class: 'section-gap' }));
    box.appendChild(h('div', { class: 'strong' }, t('autoBackups')));
    box.appendChild(h('div', { class: 'hint', style: { marginBottom: '8px' } }, server ? t('autoBackupsServer') : t('autoBackupsBrowser')));
    box.appendChild(backupsEl);
    box.appendChild(h('div', { class: 'section-gap' }));
    box.appendChild(h('div', { class: 'card card-pad', style: { borderColor: 'var(--err)' } },
      h('div', { class: 'strong', style: { color: 'var(--err)' } }, t('dangerZone')),
      h('div', { class: 'hint', style: { margin: '4px 0 10px' } }, t('resetAllHint')),
      h('div', { class: 'row', style: { gap: '8px' } },
        h('button', { class: 'btn danger', onclick: async () => {
          if (!(await TS.dom.confirmBox(t('clearMonth'), t('clearMonthText', { m: App.monthName(App.view.month) + ' ' + App.view.year }), t('clearMonth'), { danger: true }))) return;
          delete App.state.months[App.monthKey()];
          save(); toast(t('done'), { kind: 'ok' });
        } }, icon('trash'), t('clearMonth')),
        h('button', { class: 'btn danger solid', onclick: async () => {
          if (!(await TS.dom.confirmBox(t('resetAll'), t('resetAllText'), t('resetAll'), { danger: true }))) return;
          restoreState(TS.defaults.defaultState());
        } }, icon('trash'), t('resetAll')))));
    return box;
  }

  async function restoreState(st) {
    const App = TS.App;
    await TS.store.backupNow();
    App.state = App.ensureState(st);
    App.undo = [];
    App.redo = [];
    App.persist();
    document.getElementById('modal-root').innerHTML = '';
    App.render();
    toast(t('restored'), { kind: 'ok' });
  }

  /* ---------------------------------------------------------------- help */
  function help() {
    const keys = [['Ctrl+Z / Ctrl+Y', t('kUndoRedo')], ['Ctrl+C / Ctrl+V', t('kCopyPaste')], ['Delete', t('kDelete')], [t('kTypeKey'), t('kType')], ['Enter / F2', t('kEdit')], [t('kArrows'), t('kMove')], ['Shift+' + t('kClick'), t('kRange')], ['Ctrl+' + t('kClick'), t('kAdd')], ['Ctrl+A', t('kAll')], ['Esc', t('kEsc')], ['Ctrl+E', t('kExport')], [t('kRightClick'), t('kMenu')]];
    return h('div', null,
      h('h3', null, t('sHelp')),
      h('div', { class: 'stack', style: { marginTop: '12px' } },
        ['help1', 'help2', 'help3', 'help4', 'help5'].map((k) => h('div', { class: 'callout' }, icon('info'), h('div', null, t(k)))),
        h('div', { class: 'card' }, h('table', { class: 'etable' }, h('tbody', null, keys.map(([k, v]) => h('tr', null, h('td', { style: { width: '200px' } }, h('kbd', null, k)), h('td', null, v)))))),
        h('div', { class: 'hint' }, 'Timesheet Studio ' + (TS.VERSION || '') + ' · ' + (TS.store.mode === 'server' ? t('modeDesktop') : t('modeBrowser')))));
  }

  TS.settingsDialog = { open };
})(typeof window !== 'undefined' ? window : globalThis);
