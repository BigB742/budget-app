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

module.exports = {
  addDays,
  addMonths,
  getNextPayDate,
  getPaycheckIndexForDate,
  getPayPeriodBounds,
  getCurrentPayPeriod,
};
