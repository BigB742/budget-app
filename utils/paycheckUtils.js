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
  const base = new Date(lastPaycheckDate);
  const target = new Date(targetDate);
  if (Number.isNaN(base.getTime()) || Number.isNaN(target.getTime())) return null;

  let payDate = new Date(base);
  let nextPayDate = null;

  if (frequency === "weekly" || frequency === "biweekly") {
    const stepDays = frequency === "weekly" ? 7 : 14;
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
  } else if (frequency === "monthly") {
    let monthIndex = 0;
    while (true) {
      const candidate = addMonths(base, monthIndex);
      const nextCandidate = addMonths(base, monthIndex + 1);
      if (candidate <= target && nextCandidate > target) {
        payDate = candidate;
        nextPayDate = nextCandidate;
        break;
      }
      if (candidate > target) {
        payDate = base;
        nextPayDate = addMonths(base, 1);
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

  const periodStart = payDate;
  const periodEnd = new Date(nextPayDate);
  periodEnd.setDate(periodEnd.getDate() - 1);

  return {
    index: 0,
    start: periodStart,
    end: periodEnd,
    nextPayDate,
  };
};

// ─── Multi-source helpers ────────────────────────────────────

/**
 * Get all paydays for a given frequency anchor within a date range.
 * Returns an array of Date objects.
 */
const getPaydaysInRange = (anchorDate, frequency, rangeStart, rangeEnd) => {
  if (!anchorDate || !frequency || !rangeStart || !rangeEnd) return [];

  const anchor = new Date(anchorDate);
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);

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
      paydays: paydays.map((d) => d.toISOString().slice(0, 10)),
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
  getNextPayDate,
  getPaycheckIndexForDate,
  getPayPeriodBounds,
  getCurrentPayPeriod,
  getPaydaysInRange,
  getBudgetPeriod,
  getPeriodsForSources,
};
