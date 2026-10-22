/* Shared helpers: text normalisation (Azerbaijani aware), dates, month names. */
(function (root) {
  const TS = (root.TS = root.TS || {});

  const AZ_MAP = {
    'Ə': 'E', 'ə': 'E', 'İ': 'I', 'ı': 'I', 'i': 'I', 'Ü': 'U', 'ü': 'U', 'Ö': 'O', 'ö': 'O',
    'Ş': 'S', 'ş': 'S', 'Ç': 'C', 'ç': 'C', 'Ğ': 'G', 'ğ': 'G', 'Ä': 'A', 'ä': 'A',
  };

  /** Upper-case ASCII form of a string: "Vəli" -> "VELI", "VACATİON" -> "VACATION". */
  function fold(s) {
    if (s === null || s === undefined) return '';
    s = String(s).normalize('NFC');
    let out = '';
    for (const ch of s) out += AZ_MAP[ch] !== undefined ? AZ_MAP[ch] : ch;
    // strip any remaining combining marks (e.g. "I" + dot above)
    return out.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  }

  /** Only letters/digits of the folded string. */
  function compact(s) {
    return fold(s).replace(/[^A-Z0-9]/g, '');
  }

  function nameTokens(s) {
    return fold(s).replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  }

  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_AZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
  const WEEKDAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const WEEKDAYS_AZ = ['B', 'B.e', 'Ç.a', 'Ç', 'C.a', 'C', 'Ş'];

  // Full month spellings (folded) seen in messy sheets: EN, AZ, RU transliteration.
  const MONTH_WORDS = [
    [1, ['JANUARY', 'YANVAR']],
    [2, ['FEBRUARY', 'FEVRAL']],
    [3, ['MARCH', 'MART']],
    [4, ['APRIL', 'APREL']],
    [5, ['MAY', 'MAI']],
    [6, ['JUNE', 'IYUN', 'IYUNU', 'IUN']],
    [7, ['JULY', 'IYUL', 'IYULU', 'IUL']],
    [8, ['AUGUST', 'AVQUST', 'AVGUST']],
    [9, ['SEPTEMBER', 'SENTYABR', 'SENTABR']],
    [10, ['OCTOBER', 'OKTYABR', 'OKTABR']],
    [11, ['NOVEMBER', 'NOYABR']],
    [12, ['DECEMBER', 'DEKABR']],
  ];

  function similarity(a, b) {
    // Levenshtein ratio
    a = String(a); b = String(b);
    if (!a.length && !b.length) return 1;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
  }

  /** Detect a month (1..12) in a label such as "OKTYABİR", "IYUN", "October 2026", "Sep". */
  function detectMonth(label) {
    const words = fold(label).replace(/[^A-Z]+/g, ' ').trim().split(' ').filter(Boolean);
    let best = null;
    let bestScore = 0;
    for (const w of words) {
      if (w.length < 3 || w.length > 11) continue;
      for (const [m, names] of MONTH_WORDS) {
        for (const n of names) {
          let score = 0;
          if (w === n) score = 1;
          else if (n.startsWith(w)) score = 0.9; // abbreviation: OKT, SEN, DEK
          else score = similarity(w, n);
          if (score > bestScore) { bestScore = score; best = m; }
        }
      }
    }
    return bestScore >= 0.72 ? best : null;
  }

  function detectYear(label) {
    const m = String(label || '').match(/(?:^|\D)(20\d\d)(?:\D|$)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function weekday(year, month, day) {
    return new Date(year, month - 1, day).getDay(); // 0 = Sunday
  }

  function isWeekend(year, month, day) {
    const w = weekday(year, month, day);
    return w === 0 || w === 6;
  }

  function monthKey(year, month) {
    return year + '-' + String(month).padStart(2, '0');
  }

  function parseMonthKey(key) {
    const [y, m] = key.split('-').map(Number);
    return { year: y, month: m };
  }

  function addMonths(year, month, delta) {
    const idx = year * 12 + (month - 1) + delta;
    return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
  }

  function isoDate(year, month, day) {
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  /** Days between two (y,m,d) dates, b - a. */
  function dayDiff(a, b) {
    const ta = Date.UTC(a.year, a.month - 1, a.day);
    const tb = Date.UTC(b.year, b.month - 1, b.day);
    return Math.round((tb - ta) / 86400000);
  }

  function colLetter(n) {
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function colNumber(letters) {
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function clone(o) {
    return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  }

  /** Normalise a cell value typed by a user: numbers become numbers, codes keep canonical case. */
  function isNumeric(v) {
    if (typeof v === 'number') return isFinite(v);
    if (typeof v !== 'string') return false;
    return /^\s*\d+([.,]\d+)?\s*$/.test(v);
  }

  function toNumber(v) {
    if (typeof v === 'number') return v;
    return parseFloat(String(v).replace(',', '.'));
  }

  TS.util = {
    fold, compact, nameTokens, detectMonth, detectYear, daysInMonth, weekday, isWeekend,
    monthKey, parseMonthKey, addMonths, isoDate, dayDiff, colLetter, colNumber, uid, clone,
    isNumeric, toNumber, similarity,
    MONTHS_EN, MONTHS_AZ, WEEKDAYS_EN, WEEKDAYS_AZ,
  };
})(typeof window !== 'undefined' ? window : globalThis);
