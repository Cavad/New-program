/*
 * Persistence. When the page is served by TimesheetStudio.exe the data lives in files next to the exe
 * (with automatic backups). Opened directly as an .html file it uses the browser's localStorage.
 */
(function (root) {
  const TS = (root.TS = root.TS || {});
  const KEY = 'timesheet-studio-state-v1';
  const BKEY = 'timesheet-studio-backups-v1';

  const store = {
    mode: 'browser',
    info: null,
    status: 'saved',
    lastSaved: null,
    onStatus: null,
    _timer: null,
    _pending: null,

    async init() {
      if (location.protocol === 'http:' || location.protocol === 'https:') {
        try {
          const r = await fetch('api/ping', { cache: 'no-store' });
          if (r.ok) {
            const j = await r.json();
            if (j && j.app === 'timesheet-studio') { this.mode = 'server'; this.info = j; }
          }
        } catch (e) { /* plain web hosting */ }
      }
      if (this.mode === 'server') {
        setInterval(() => { fetch('api/heartbeat', { method: 'POST' }).catch(() => {}); }, 5000);
        window.addEventListener('beforeunload', () => {
          this.flush(true);
          try { navigator.sendBeacon('api/closing'); } catch (e) { /* ignore */ }
        });
      } else {
        window.addEventListener('beforeunload', () => this.flush(true));
      }
      return this.mode;
    },

    async load() {
      if (this.mode === 'server') {
        const r = await fetch('api/state', { cache: 'no-store' });
        if (r.status === 204 || r.status === 404) return null;
        if (!r.ok) throw new Error('Could not read data file (' + r.status + ')');
        const txt = await r.text();
        return txt.trim() ? JSON.parse(txt) : null;
      }
      try {
        const txt = localStorage.getItem(KEY);
        return txt ? JSON.parse(txt) : null;
      } catch (e) {
        return null;
      }
    },

    setStatus(s) {
      this.status = s;
      if (s === 'saved') this.lastSaved = new Date();
      if (this.onStatus) this.onStatus(s);
    },

    save(state) {
      this._pending = state;
      this.setStatus('saving');
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.flush(), 400);
    },

    /**
     * Writes pending changes. Saves to the exe run one after another so an older save can never
     * overwrite a newer one; a failed save is retried automatically.
     */
    flush(unloading) {
      clearTimeout(this._timer);
      if (!this._pending) return this._inflight || Promise.resolve();
      if (this.mode === 'server') {
        if (unloading) {
          // the page is closing: only a keepalive request (max 64 KB) survives
          const json = JSON.stringify(this._pending);
          const bytes = new TextEncoder().encode(json);
          if (bytes.length < 63000) {
            this._pending = null;
            fetch('api/state', { method: 'PUT', body: bytes, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
          }
          return Promise.resolve();
        }
        const run = async () => {
          const state = this._pending;
          if (!state) return;
          this._pending = null;
          try {
            const r = await fetch('api/state', { method: 'PUT', body: JSON.stringify(state), headers: { 'Content-Type': 'application/json' } });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            if (!this._pending) this.setStatus('saved');
          } catch (e) {
            this._pending = this._pending || state;
            this.setStatus('error');
            clearTimeout(this._retry);
            this._retry = setTimeout(() => this.flush(), 3000);
          }
        };
        this._inflight = (this._inflight || Promise.resolve()).then(run, run);
        return this._inflight;
      }
      const json = JSON.stringify(this._pending);
      this._pending = null;
      try {
        localStorage.setItem(KEY, json);
        this.browserBackup(json);
        this.setStatus('saved');
      } catch (e) {
        this.setStatus('error');
      }
      return Promise.resolve();
    },

    /** One automatic snapshot per day, last 10 days (browser mode). */
    browserBackup(json) {
      try {
        const list = JSON.parse(localStorage.getItem(BKEY) || '[]');
        const today = new Date().toISOString().slice(0, 10);
        if (list.length && list[0].day === today) list[0] = { day: today, time: new Date().toISOString(), data: json };
        else list.unshift({ day: today, time: new Date().toISOString(), data: json });
        while (list.length > 10) list.pop();
        localStorage.setItem(BKEY, JSON.stringify(list));
      } catch (e) {
        try { localStorage.removeItem(BKEY); } catch (x) { /* ignore */ }
      }
    },

    /** Snapshot of the current data before a destructive action (restore / reset). */
    async backupNow() {
      await this.flush();
      if (this.mode === 'server') {
        try { await fetch('api/backup-now', { method: 'POST' }); } catch (e) { /* ignore */ }
        return;
      }
      try {
        const cur = localStorage.getItem(KEY);
        if (!cur) return;
        const list = JSON.parse(localStorage.getItem(BKEY) || '[]');
        list.unshift({ day: 'before-restore-' + new Date().toISOString().slice(0, 16).replace(':', ''), time: new Date().toISOString(), data: cur });
        while (list.length > 12) list.pop();
        localStorage.setItem(BKEY, JSON.stringify(list));
      } catch (e) { /* storage full */ }
    },

    async listBackups() {
      if (this.mode === 'server') {
        const r = await fetch('api/backups', { cache: 'no-store' });
        if (!r.ok) return [];
        return (await r.json()) || [];
      }
      try {
        return JSON.parse(localStorage.getItem(BKEY) || '[]').map((b) => ({ name: b.day, time: b.time, size: b.data.length }));
      } catch (e) { return []; }
    },

    async readBackup(name) {
      if (this.mode === 'server') {
        const r = await fetch('api/backups/' + encodeURIComponent(name), { cache: 'no-store' });
        if (!r.ok) throw new Error('Backup not found');
        return JSON.parse(await r.text());
      }
      const list = JSON.parse(localStorage.getItem(BKEY) || '[]');
      const b = list.find((x) => x.day === name);
      if (!b) throw new Error('Backup not found');
      return JSON.parse(b.data);
    },

    /** Saves an exported workbook. Returns { path } in exe mode, or downloads it in the browser. */
    async saveExport(fileName, bytes) {
      if (this.mode === 'server') {
        const r = await fetch('api/export?name=' + encodeURIComponent(fileName), { method: 'POST', body: bytes });
        if (!r.ok) throw new Error('Could not save the file (' + r.status + ')');
        return await r.json();
      }
      TS.dom.download(fileName, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return { downloaded: true };
    },

    async open(target, path) {
      if (this.mode !== 'server') return;
      await fetch('api/open?target=' + encodeURIComponent(target) + (path ? '&path=' + encodeURIComponent(path) : ''), { method: 'POST' });
    },
  };

  TS.store = store;
})(typeof window !== 'undefined' ? window : globalThis);
