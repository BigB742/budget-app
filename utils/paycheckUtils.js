const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

// MongoDB stores dates as UTC midnight (e.g. "2026-04-10T00:00:00Z").
// In non-UTC timezones, new Date() shifts this to the PREVIOUS local day
// (e.g. April 9 5PM PDT). This recovers the intended calendar date as
// local midnight so day-level arithmetic works correctly.
const toLocalDate = (d) => {
  const date = new Date(d);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

// Format a local Date to YYYY-MM-DD string using LOCAL date parts (not UTC).
// Avoids the timezone shift bug where toISOString() converts to UTC first.
const toDateString = (d) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

// Truncate a local Date to midnight. Safe for dates already in local time
const startOfLocalDay = (d) => {
  const date = new Date(d);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const getNextPayDate = (lastPaycheckDate, frequency, n) => {
  const base = new Date(lastPaycheckDate);
  if (Number.isNaN(base.getTime())) return null;
  if (frequency === "weekly") return addDays(base, 7 * n);
  if (frequency === "biweekly") return addDays(base, 14 * n);
  if (frequency === "monthly") return addMonths(base, n);
  return null;
};

const getPaycheckIndexForDate = ({ lastPaycheckDate, frequency, targetDate }) => {
  const target = new Date(targetDate);
  if (!lastPaycheckDate || Number.isNaN(target.getTime())) return 0;

  let index = 0;
  let start = getNextPayDate(lastPaycheckDate, frequency, index);
  let next = getNextPayDate(lastPaycheckDate, frequency, index + 1);

  while (start && next && start <= target) {
    if (target < next) break;
    index += 1;
    if (index > 1000) break;
    start = getNextPayDate(lastPaycheckDate, frequency, index);
    next = getNextPayDate(lastPaycheckDate, frequency, index + 1);
  }

  return index;
};

const getPayPeriodBounds = ({ lastPaycheckDate, frequency, index }) => {
  const start = getNextPayDate(lastPaycheckDate, frequency, index);
  const nextStart = getNextPayDate(lastPaycheckDate, frequency, index + 1);
  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);
  return { start, end };
};

const getCurrentPayPeriod = ({ lastPaycheckDate, frequency, targetDate = new Date() }) => {
  if (!lastPaycheckDate || !frequency) return null;
  const rawBase = new Date(lastPaycheckDate);
  const rawTarget = new Date(targetDate);
  if (Number.isNaN(rawBase.getTime()) || Number.isNaN(rawTarget.getTime())) return null;

  // Normalize: anchor from DB uses UTC calendar date; target uses local date
  const base = toLocalDate(rawBase);
  const target = startOfLocalDay(rawTarget);

  let payDate = new Date(base);
  let nextPayDate = null;

  if (frequency === "weekly" || frequency === "biweekly") {
    const stepDays = frequency === "weekly" ? 7 : 14;

    // Walk backward if anchor is ahead of target
    while (payDate > target) {
      payDate = addDays(payDate, -stepDays);
    }

    // Walk forward to find the period containing target
    while (payDate <= target) {
      const candidateNext = addDays(payDate, stepDays);
      if (candidateNext > target) {
        nextPayDate = candidateNext;
        break;
      }
      payDate = candidateNext;
    }
    if (!nextPayDate) {
      nextPayDate = addDays(payDate, stepDays);
    }
  } else if (frequency === "twicemonthly") {
    // Twice a month: 1st and 15th. Periods: 1st-14th, 15th-end of month.
    const tYear = target.getFullYear();
    const tMonth = target.getMonth();
    const tDay = target.getDate();
    if (tDay < 15) {
      payDate = new Date(tYear, tMonth, 1);
      nextPayDate = new Date(tYear, tMonth, 15);
    } else {
      payDate = new Date(tYear, tMonth, 15);
      // Next pay date is 1st of next month
      nextPayDate = new Date(tYear, tMonth + 1, 1);
    }
  } else if (frequency === "monthly") {
    let monthIndex = 0;

    // Walk backward if anchor is ahead of target
    while (addMonths(base, monthIndex) > target) {
      monthIndex--;
    }

    // Walk forward to find the period containing target
    while (true) {
      const candidate = addMonths(base, monthIndex);
      const nextCandidate = addMonths(base, monthIndex + 1);
      if (candidate <= target && nextCandidate > target) {
        payDate = candidate;
        nextPayDate = nextCandidate;
        break;
      }
      monthIndex += 1;
      if (monthIndex > 240) break;
    }
    if (!nextPayDate) {
      nextPayDate = addMonths(payDate, 1);
    }
  } else {
    return null;
  }

  // Normalize outputs to local midnight (guards against DST hour drift from addDays)
  const periodStart = startOfLocalDay(payDate);
  const periodEnd = startOfLocalDay(addDays(nextPayDate, -1));

  return {
    index: 0,
    start: periodStart,
    end: periodEnd,
    nextPayDate: startOfLocalDay(nextPayDate),
  };
};

// ─── Multi-source helpers ────────────────────────────────────

/**
 * Get all paydays for a given frequency anchor within a date range.
 * Returns an array of Date objects.
 */
const getPaydaysInRange = (anchorDate, frequency, rangeStart, rangeEnd) => {
  if (!anchorDate || !frequency || !rangeStart || !rangeEnd) return [];

  // Normalize: anchor from DB uses UTC calendar date; range bounds use local
  const anchor = toLocalDate(new Date(anchorDate));
  const start = startOfLocalDay(new Date(rangeStart));
  const end = startOfLocalDay(new Date(rangeEnd));

  if (Number.isNaN(anchor.getTime()) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }

  const paydays = [];

  if (frequency === "weekly" || frequency === "biweekly") {
    const stepDays = frequency === "weekly" ? 7 : 14;

    // Walk backward from anchor to find a payday at or before rangeStart
    let cursor = new Date(anchor);
    while (cursor > start) {
      cursor = addDays(cursor, -stepDays);
    }

    // Walk forward, collecting paydays in range
    while (cursor <= end) {
      if (cursor >= start) {
        paydays.push(new Date(cursor));
      }
      cursor = addDays(cursor, stepDays);
    }
  } else if (frequency === "twicemonthly") {
    // Generate 1st and 15th for each month in range
    let y = start.getFullYear();
    let m = start.getMonth();
    const endY = end.getFullYear();
    const endM = end.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const d1 = new Date(y, m, 1);
      const d15 = new Date(y, m, 15);
      if (d1 >= start && d1 <= end) paydays.push(d1);
      if (d15 >= start && d15 <= end) paydays.push(d15);
      m++;
      if (m > 11) { m = 0; y++; }
    }
  } else if (frequency === "monthly") {
    let idx = 0;
    let cursor = addMonths(anchor, idx);
    while (cursor > start) {
      idx--;
      cursor = addMonths(anchor, idx);
    }

    while (cursor <= end) {
      if (cursor >= start) {
        paydays.push(new Date(cursor));
      }
      idx++;
      cursor = addMonths(anchor, idx);
    }
  }

  return paydays;
};

/**
 * Given an array of income sources, compute the budgeting period
 * based on the primary source, and sum total income from all sources
 * that falls within that period.
 *
 * Each source: { _id, name, amount, frequency, nextPayDate, isPrimary, isActive }
 */
const getBudgetPeriod = (sources, targetDate = new Date()) => {
  const active = (sources || []).filter((s) => s.isActive !== false);
  if (!active.length) return null;

  const primary = active.find((s) => s.isPrimary) || active[0];

  const primaryPeriod = getCurrentPayPeriod({
    lastPaycheckDate: primary.nextPayDate,
    frequency: primary.frequency,
    targetDate,
  });

  if (!primaryPeriod) return null;

  let totalIncome = 0;
  const sourceBreakdown = [];

  for (const source of active) {
    const paydays = getPaydaysInRange(
      source.nextPayDate,
      source.frequency,
      primaryPeriod.start,
      primaryPeriod.end
    );
    const sourceIncome = paydays.length * source.amount;
    totalIncome += sourceIncome;
    sourceBreakdown.push({
      sourceId: source._id,
      name: source.name,
      amount: source.amount,
      frequency: source.frequency,
      paydaysInPeriod: paydays.length,
      totalForPeriod: sourceIncome,
      paydays: paydays.map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`),
    });
  }

  return {
    start: primaryPeriod.start,
    end: primaryPeriod.end,
    nextPayDate: primaryPeriod.nextPayDate,
    totalIncome,
    primarySourceId: primary._id,
    sources: sourceBreakdown,
  };
};

/**
 * Get individual pay period info for each active income source.
 */
const getPeriodsForSources = (sources, targetDate = new Date()) => {
  return (sources || [])
    .filter((s) => s.isActive !== false)
    .map((source) => {
      const period = getCurrentPayPeriod({
        lastPaycheckDate: source.nextPayDate,
        frequency: source.frequency,
        targetDate,
      });
      if (!period) return null;
      return {
        sourceId: source._id,
        name: source.name,
        amount: source.amount,
        frequency: source.frequency,
        isPrimary: !!source.isPrimary,
        start: period.start,
        end: period.end,
        nextPayDate: period.nextPayDate,
      };
    })
    .filter(Boolean);
};

module.exports = {
  addDays,
  addMonths,
  toLocalDate,
  toDateString,
  startOfLocalDay,
  getNextPayDate,
  getPaycheckIndexForDate,
  getPayPeriodBounds,
  getCurrentPayPeriod,
  getPaydaysInRange,
  getBudgetPeriod,
  getPeriodsForSources,
};
