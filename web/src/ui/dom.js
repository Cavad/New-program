/* Tiny DOM toolkit: element builder, icons, modals, menus, toasts. */
(function (root) {
  const TS = (root.TS = root.TS || {});

  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach((x) => append(el, x)); return; }
    if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }

  const PATHS = {
    left: '<path d="M15 18l-6-6 6-6"/>',
    right: '<path d="M9 18l6-6-6-6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    up: '<path d="M18 15l-6-6-6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    swap: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    cursor: '<path d="M4 4l7 17 2.5-7.5L21 11z"/>',
    eraser: '<path d="M20 20H8l-5-5 10-10 9 9-6 6"/><path d="M6.5 11.5l6 6"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>',
    zoomin: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>',
    zoomout: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3M8 11h6"/>',
    wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    plane: '<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  };

  function icon(name, cls) {
    const span = document.createElement('span');
    span.innerHTML = `<svg class="i ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;
    return span.firstChild;
  }

  /* ---------------- toasts */
  function toast(msg, opts) {
    opts = opts || {};
    const rootEl = document.getElementById('toast-root');
    const el = h('div', { class: 'toast ' + (opts.kind || '') },
      opts.kind === 'ok' ? icon('check') : opts.kind === 'err' ? icon('alert') : null,
      h('div', { style: { flex: 1 } }, msg),
      (opts.actions || []).map((a) => h('button', { class: 'btn sm', onclick: () => { a.run(); close(); } }, a.label)));
    function close() { el.remove(); }
    rootEl.appendChild(el);
    setTimeout(close, opts.timeout || (opts.actions ? 9000 : 3800));
    return close;
  }

  /* ---------------- modal */
  function modal(opts) {
    const rootEl = document.getElementById('modal-root');
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'modal ' + (opts.size || ''), role: 'dialog', 'aria-modal': 'true' });
    const close = () => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      if (opts.onClose) opts.onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    if (opts.title) {
      box.appendChild(h('div', { class: 'modal-head' },
        opts.icon ? h('div', { class: 'dz-icon', style: { width: '40px', height: '40px' } }, icon(opts.icon)) : null,
        h('div', { style: { flex: 1 } }, h('div', { class: 'modal-title' }, opts.title), opts.subtitle ? h('div', { class: 'card-sub', style: { marginTop: '3px' } }, opts.subtitle) : null),
        h('button', { class: 'btn ghost icon sm', onclick: close, 'aria-label': 'Close' }, icon('x'))));
    }
    const body = h('div', { class: 'modal-body' });
    if (opts.noPad) body.style.padding = '0';
    box.appendChild(body);
    let foot = null;
    if (opts.buttons) {
      foot = h('div', { class: 'modal-foot' });
      box.appendChild(foot);
    }
    back.appendChild(box);
    back.addEventListener('mousedown', (e) => { if (e.target === back && !opts.sticky) close(); });
    rootEl.appendChild(back);
    document.addEventListener('keydown', onKey, true);
    const api = { el: box, body, foot, close };
    if (opts.content) append(body, typeof opts.content === 'function' ? opts.content(api) : opts.content);
    if (opts.buttons) {
      for (const b of opts.buttons) {
        if (b === 'spacer') { foot.appendChild(h('div', { class: 'spacer' })); continue; }
        foot.appendChild(h('button', {
          class: 'btn ' + (b.kind || ''),
          onclick: async () => { const r = b.run ? await b.run(api) : undefined; if (r !== false) close(); },
        }, b.icon ? icon(b.icon) : null, b.label));
      }
    }
    setTimeout(() => { const f = box.querySelector('[autofocus]'); if (f) f.focus(); }, 30);
    return api;
  }

  function confirmBox(title, text, okLabel, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false;
      modal({
        title,
        content: h('div', { class: 'hint', style: { fontSize: '14px', color: 'var(--text-2)' } }, text),
        buttons: [
          { label: opts.cancel || TS.t('cancel'), run: () => { done = true; resolve(false); } },
          { label: okLabel, kind: opts.danger ? 'danger solid' : 'primary', run: () => { done = true; resolve(true); } },
        ],
        onClose: () => { if (!done) resolve(false); },
      });
    });
  }

  /* ---------------- popover / menu */
  let openPop = null;
  function closePopover() {
    if (openPop) { openPop.remove(); openPop = null; }
  }
  function popover(anchor, content, opts) {
    closePopover();
    opts = opts || {};
    const el = h('div', { class: 'popover ' + (opts.cls || '') });
    append(el, content);
    document.getElementById('menu-root').appendChild(el);
    let x;
    let y;
    if (anchor && anchor.getBoundingClientRect) {
      const r = anchor.getBoundingClientRect();
      x = opts.align === 'right' ? r.right - el.offsetWidth : opts.align === 'center' ? r.left + r.width / 2 - el.offsetWidth / 2 : r.left;
      y = r.bottom + 6;
    } else { x = anchor.x; y = anchor.y; }
    x = Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8));
    if (y + el.offsetHeight > window.innerHeight - 8) y = Math.max(8, (anchor.getBoundingClientRect ? anchor.getBoundingClientRect().top : y) - el.offsetHeight - 6);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    openPop = el;
    setTimeout(() => {
      const off = (e) => {
        if (!openPop) { document.removeEventListener('mousedown', off, true); return; }
        if (!openPop.contains(e.target)) { closePopover(); document.removeEventListener('mousedown', off, true); }
      };
      document.addEventListener('mousedown', off, true);
    }, 0);
    return el;
  }

  /** items: [{label, icon, run, swatch:{fill,color,text}}, 'sep', {header}] */
  function menu(anchor, items, opts) {
    const el = h('div', { class: 'menu' });
    for (const it of items) {
      if (it === 'sep') { el.appendChild(h('div', { class: 'sep' })); continue; }
      if (it.header) { el.appendChild(h('div', { class: 'mh' }, it.header)); continue; }
      el.appendChild(h('button', {
        onclick: () => { closePopover(); it.run(); },
        disabled: it.disabled,
      },
      it.swatch ? h('span', { class: 'sw', style: { background: it.swatch.fill, color: it.swatch.color } }, it.swatch.text) : it.icon ? icon(it.icon, 'sm') : null,
      h('span', { style: { flex: 1 } }, it.label),
      it.hint ? h('span', { class: 'tiny muted' }, it.hint) : null));
    }
    return popover(anchor, el, opts);
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
      inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
      document.body.appendChild(inp);
      inp.click();
    });
  }

  function readFileBytes(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(file);
    });
  }

  function bytesToB64(bytes) {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(s);
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function download(name, bytes, mime) {
    const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  /** Readable text colour for a background. */
  function textOn(hex) {
    const c = String(hex || '#ffffff').replace('#', '');
    if (c.length < 6) return '#000';
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  TS.dom = { h, append, icon, toast, modal, confirmBox, popover, closePopover, menu, pickFile, readFileBytes, bytesToB64, b64ToBytes, download, textOn, escapeHtml };
})(typeof window !== 'undefined' ? window : globalThis);
