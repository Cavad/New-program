/* 12-hour rotation: two groups alternate in blocks of N days (default 2 on / 2 off). */
(function (root) {
  const TS = (root.TS = root.TS || {});
  const U = TS.util;

  function mod(a, n) {
    return ((a % n) + n) % n;
  }

  /**
   * cfg = { group: 'A'|'B', startDay: 1..31, oneDay: bool }
   * `startDay` is the first day of the month the chosen group works. With `oneDay` (only meaningful
   * when the group starts on the 1st) that day is the last day of a block begun in the previous month.
   * Returns the day (relative to this month, may be <= 0) on which a block of `group` starts.
   */
  function anchorOf(cfg, block) {
    const start = Math.max(1, parseInt(cfg.startDay, 10) || 1);
    return cfg.oneDay && start === 1 ? start - (block - 1) : start;
  }

  /** Which group works on `day`: 'A' or 'B'. */
  function groupOnDay(cfg, block, day) {
    const pos = mod(day - anchorOf(cfg, block), 2 * block);
    const chosenWorks = pos < block;
    const other = cfg.group === 'A' ? 'B' : 'A';
    return chosenWorks ? cfg.group : other;
  }

  /** Array (index 1..days) with 'A'/'B'. */
  function pattern(cfg, block, days) {
    const out = [null];
    for (let d = 1; d <= days; d++) out.push(groupOnDay(cfg, block, d));
    return out;
  }

  /** Derive the configuration for the next month so the cycle continues without a break. */
  function continueFrom(prevCfg, block, prevYear, prevMonth) {
    const prevDays = U.daysInMonth(prevYear, prevMonth);
    // Day 1 of next month is day prevDays+1 in the previous month's numbering.
    const g = groupOnDay(prevCfg, block, prevDays + 1);
    // how many days of g's current block are left starting at day 1
    let left = 0;
    for (let d = prevDays + 1; d <= prevDays + block; d++) {
      if (groupOnDay(prevCfg, block, d) === g) left++; else break;
    }
    if (left === block) return { group: g, startDay: 1, oneDay: false };
    if (left === 1) return { group: g, startDay: 1, oneDay: true };
    // Longer blocks part-way through: describe it from the other group's first full block.
    const other = g === 'A' ? 'B' : 'A';
    return { group: other, startDay: left + 1, oneDay: false };
  }

  TS.rotation = { anchorOf, groupOnDay, pattern, continueFrom };
})(typeof window !== 'undefined' ? window : globalThis);
