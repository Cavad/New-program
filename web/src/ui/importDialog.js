/* Import dialog for the shift workers' sheet: choose month block, check name matching, preview, import. */
(function (root) {
  const TS = root.TS;
  const U = TS.util;
  const C = TS.compose;
  const SI = TS.shiftImport;
  const { h, icon, toast, modal } = TS.dom;
  const t = (k, p) => TS.t(k, p);

  async function pick() {
    const f = await TS.dom.pickFile('.xlsx,.xlsm,.xls,.ods,.csv');
    if (f) openFile(f);
  }

  async function openFile(file) {
    const App = TS.App;
    let sheets;
    try {
      const bytes = await TS.dom.readFileBytes(file);
      sheets = SI.readWorkbook(bytes);
    } catch (e) {
      console.error(e);
      toast(t('readFailed', { name: file.name }), { kind: 'err', timeout: 8000 });
      return;
    }
    const blocks = SI.detectBlocks(sheets).filter((b) => b.people.length);
    if (!blocks.length) {
      modal({ title: t('noBlocksTitle'), icon: 'alert', content: h('div', { class: 'hint', style: { fontSize: '14px' } }, t('noBlocksText')), buttons: [{ label: t('ok'), kind: 'primary' }] });
      return;
    }
    const y = App.view.year;
    const m = App.view.month;
    const picked = SI.pickBlock(blocks, y, m);
    let block = picked ? picked.block : blocks[blocks.length - 1];
    let assignment = [];
    let manual = {};

    const blockLabel = (b) => {
      const mname = b.month ? App.monthName(b.month) : '?';
      return `${b.sheet} › ${b.label || mname}${b.year ? ' ' + b.year : ''} · ${t('nDays', { n: b.days })} · ${t('nPeople', { n: b.people.length })}`;
    };
    const blockSel = h('select', { class: 'input', style: { minWidth: '420px' } });
    // newest first
    blocks.slice().reverse().forEach((b) => blockSel.appendChild(h('option', { value: b.id, selected: b === block }, blockLabel(b))));
    const remember = h('input', { type: 'checkbox', checked: true });
    const body = h('div', { class: 'stack' });

    const rematch = () => {
      const res = SI.matchPeople(block.people, App.state.employees);
      assignment = res.map((r) => r.empId);
      manual = {};
      return res;
    };
    let matchRes = rematch();

    const draw = () => {
      body.innerHTML = '';
      const monthOk = block.month === m && (!block.year || block.year === y);
      body.appendChild(h('div', { class: 'row wrap', style: { alignItems: 'flex-end' } },
        h('div', { class: 'field' }, h('label', null, t('chooseBlock')), blockSel),
        h('div', { class: 'hint', style: { paddingBottom: '8px' } }, t('blocksFound', { n: blocks.length }))));
      if (!monthOk) {
        body.appendChild(h('div', { class: 'callout warn' }, icon('alert'), h('div', null,
          picked ? t('blockOtherMonth', { m: App.monthName(m) + ' ' + y }) : t('blockNotFound', { m: App.monthName(m) + ' ' + y }))));
      } else {
        body.appendChild(h('div', { class: 'callout ok' }, icon('check'), h('div', null, t('blockMatched', { m: App.monthName(m) + ' ' + y, sheet: block.sheet, row: block.headerRow }))));
      }
      if (block.days < U.daysInMonth(y, m)) {
        body.appendChild(h('div', { class: 'callout warn' }, icon('alert'), h('div', null, t('blockShort', { n: block.days, m: U.daysInMonth(y, m) }))));
      }

      // name mapping
      const shiftEmps = App.state.employees.filter((e) => e.category === 'shift');
      const otherEmps = App.state.employees.filter((e) => e.category !== 'shift');
      const used = new Set(assignment.filter(Boolean));
      const table = h('table', { class: 'etable map-table' },
        h('thead', null, h('tr', null, h('th', null, t('nameInSheet')), h('th', null, t('employee')), h('th', null, t('status')))));
      const tb = h('tbody');
      block.people.forEach((p, i) => {
        const sel = h('select', { class: 'input sm' },
          h('option', { value: '' }, '— ' + t('skip') + ' —'),
          h('optgroup', { label: t('tabShift') }, shiftEmps.map((e) => h('option', { value: e.id, selected: assignment[i] === e.id }, e.name + (used.has(e.id) && assignment[i] !== e.id ? ' ✓' : '')))),
          otherEmps.length ? h('optgroup', { label: t('otherEmployees') }, otherEmps.map((e) => h('option', { value: e.id, selected: assignment[i] === e.id }, e.name))) : null);
        sel.addEventListener('change', () => {
          const v = sel.value || null;
          // keep one row per employee
          assignment.forEach((a, j) => { if (j !== i && v && a === v) assignment[j] = null; });
          assignment[i] = v;
          manual[i] = true;
          draw();
        });
        const r = matchRes[i];
        let status;
        if (!assignment[i]) status = h('span', { class: r && r.ambiguous ? 'status-amb' : 'status-bad' }, r && r.ambiguous ? t('ambiguous') : t('notMatched'));
        else if (manual[i]) status = h('span', { class: 'status-ok' }, '✓ ' + t('chosenByYou'));
        else status = h('span', { class: 'status-ok' }, '✓ ' + t('autoMatched'));
        tb.appendChild(h('tr', null, h('td', null, h('b', null, p.name), h('span', { class: 'tiny muted' }, '  ' + t('rowN', { n: p.sheetRow }))), h('td', null, sel), h('td', null, status)));
      });
      table.appendChild(tb);
      const missing = shiftEmps.filter((e) => !assignment.includes(e.id));

      // preview
      const res = SI.buildImport(block, assignment, App.state, y, m);
      const days = U.daysInMonth(y, m);
      let errCount = 0;
      let cellCount = 0;
      const grid = h('table', { class: 'mini-grid' });
      const hr = h('tr', null, h('th', null, ''));
      for (let d = 1; d <= days; d++) hr.appendChild(h('th', { style: U.isWeekend(y, m, d) ? { background: 'var(--weekend-head)' } : null }, String(d)));
      grid.appendChild(hr);
      block.people.forEach((p, i) => {
        const empId = assignment[i];
        if (!empId) return;
        const emp = App.state.employees.find((e) => e.id === empId);
        const vals = res.imported[empId];
        const notes = res.notes[empId] || [];
        const tr = h('tr', null, h('td', { class: 'nm', title: p.name }, emp.name));
        for (let d = 1; d <= days; d++) {
          let v = vals[d];
          const ns = notes.filter((n) => n.day === d);
          const bad = ns.some((n) => n.level === 'error');
          if (bad) errCount++;
          cellCount++;
          if (emp.offAsBlank && v === 'OFF') v = '';
          let bg = '';
          let color = '';
          if (v !== '' && v !== undefined) {
            if (typeof v === 'number') { bg = App.state.settings.shiftNumberFill || '#FFFF00'; color = '#111'; } else {
              const c = C.findCode(App.state, v, 'shift');
              if (c) { bg = c.fill; color = c.font && c.font.toUpperCase() !== '#000000' ? c.font : TS.dom.textOn(c.fill); }
            }
          }
          const raw = p.merged[d] ? p.merged[d].headValue : p.raw[d];
          const tip = [t('dayN', { d }) + ': ' + (v === '' || v === undefined ? t('emptyCellTip') : String(v))];
          if (raw !== null && raw !== undefined && raw !== '') tip.push(t('sourceWas', { raw: String(raw) }));
          for (const n of ns) tip.push('⚠ ' + t('w_' + n.key));
          tr.appendChild(h('td', { class: bad ? 'bad' : ns.length ? 'inf' : '', style: bad ? null : { background: bg, color }, title: tip.join('\n') }, bad ? '?' : (v === undefined ? '' : String(v))));
        }
        grid.appendChild(tr);
      });

      body.appendChild(h('div', { class: 'row wrap' },
        h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(assignment.filter(Boolean).length)), h('div', { class: 'l' }, t('peopleMatched'))),
        h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(cellCount - errCount)), h('div', { class: 'l' }, t('daysRead'))),
        h('div', { class: 'kpi', style: errCount ? { borderColor: 'var(--err)' } : null }, h('div', { class: 'v', style: errCount ? { color: 'var(--err)' } : null }, String(errCount)), h('div', { class: 'l' }, t('daysUndetermined')))));
      if (missing.length) {
        body.appendChild(h('div', { class: 'callout warn' }, icon('alert'), h('div', null, h('b', null, t('notInSheet')), ' ', missing.map((e) => e.name).join(', '))));
      }
      body.appendChild(h('div', { class: 'card', style: { overflow: 'auto', maxHeight: '260px' } }, table));
      body.appendChild(h('div', { class: 'field' }, h('label', null, t('previewTitle')), h('div', { class: 'grid-wrap', style: { maxHeight: '340px' } }, grid)));
      body.appendChild(h('div', { class: 'hint' }, t('importPreviewHint')));
      body.appendChild(h('label', { class: 'switch' }, remember, h('span', { class: 'track' }), h('span', null, t('rememberNames'))));
    };

    blockSel.addEventListener('change', () => {
      block = blocks.find((b) => b.id === blockSel.value);
      matchRes = rematch();
      draw();
    });
    draw();

    modal({
      title: t('importDialogTitle'), subtitle: file.name, icon: 'upload', size: 'wide', sticky: true,
      content: body,
      buttons: [{ label: t('cancel') }, 'spacer', {
        label: t('importNow'), kind: 'primary', icon: 'check', run: () => {
          if (!assignment.some(Boolean)) { toast(t('nothingToImport'), { kind: 'err' }); return false; }
          const res = SI.buildImport(block, assignment, App.state, y, m);
          const rec = C.getMonth(App.state, y, m);
          rec.imported = res.imported;
          rec.importNotes = res.notes;
          rec.importInfo = { file: file.name, sheet: block.sheet, label: block.label || (block.month ? App.monthName(block.month) : ''), at: new Date().toISOString(), matched: Object.keys(res.imported).length, blockId: block.id };
          if (remember.checked) {
            Object.keys(manual).forEach((i) => {
              const empId = assignment[i];
              if (!empId) return;
              const emp = App.state.employees.find((e) => e.id === empId);
              const alias = block.people[i].name;
              if (emp && !emp.aliases.some((a) => U.compact(a) === U.compact(alias))) emp.aliases.push(alias);
            });
          }
          const kept = App.state.employees.filter((e) => e.category === 'shift' && rec.overrides[e.id]).reduce((n, e) => n + Object.keys(rec.overrides[e.id]).length, 0);
          App.view.tab = 'shift';
          App.commit({ full: true });
          const errs = App.composed.warnings.filter((w) => w.level === 'error').length;
          toast(t('imported', { n: Object.keys(res.imported).length }) + (errs ? ' ' + t('importedWithIssues', { n: errs }) : '') + (kept ? ' ' + t('keptEdits', { n: kept }) : ''),
            { kind: errs ? '' : 'ok', timeout: 7000, actions: errs ? [{ label: t('review'), run: () => App.openWarnings() }] : null });
          return true;
        },
      }],
    });
  }

  TS.importDialog = { pick, openFile };
})(typeof window !== 'undefined' ? window : globalThis);
