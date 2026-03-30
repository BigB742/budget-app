import { useEffect, useMemo, useState } from "react";

import { authFetch } from "../apiClient";
import { stripTime } from "../utils/dateUtils";
import { useCurrentPaycheckSummary } from "./useCurrentPaycheckSummary";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const parseDateOnly = (dateStr) => {
  if (!dateStr) return null;
  const source = dateStr instanceof Date ? dateStr.toISOString() : String(dateStr);
  const [datePart] = source.split("T");
  const [yearStr, monthStr, dayStr] = datePart.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);
  if (!year || month < 0 || !day) return null;
  return new Date(year, month, day);
};
const toDateKey = (input) => {
  if (!input) return null;
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

export const useCurrentPayPeriodDays = () => {
  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    refresh: refreshSummary,
  } = useCurrentPaycheckSummary();

  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const periodStart = summary?.period?.start
    ? parseDateOnly(summary.period.start)
    : summary?.periodLabel?.start
    ? parseDateOnly(summary.periodLabel.start)
    : null;
  const periodEnd = summary?.period?.end
    ? parseDateOnly(summary.period.end)
    : summary?.periodLabel?.end
    ? parseDateOnly(summary.periodLabel.end)
    : null;

  useEffect(() => {
    if (!periodStart || !periodEnd) {
      setBills([]);
      setExpenses([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const billsData = await authFetch("/api/bills");

        const params = new URLSearchParams({
          from: toDateKey(periodStart),
          to: toDateKey(periodEnd),
        });
        const expensesData = await authFetch(`/api/expenses?${params.toString()}`);

        if (!cancelled) {
          setBills(Array.isArray(billsData) ? billsData : billsData?.bills || []);
          setExpenses(Array.isArray(expensesData) ? expensesData : expensesData?.expenses || []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Failed to load bills/expenses for this period.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [periodStart?.getTime(), periodEnd?.getTime(), reloadToken]);

  const days = useMemo(() => {
    if (!periodStart || !periodEnd) return [];

    const start = stripTime(periodStart);
    const end = stripTime(periodEnd);
    const dayCount = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;

    const result = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(start.getTime() + i * MS_PER_DAY);
      const key = toDateKey(d);
      result.push({
        date: d,
        dateKey: key,
        weekdayLabel: d.toLocaleDateString(undefined, { weekday: "short" }),
        dayOfMonth: d.getDate(),
        isPayday: summary?.periodLabel?.start === key,
        bills: [],
        billsTotal: 0,
        expenses: [],
        expensesTotal: 0,
      });
    }

    const dayMap = new Map(result.map((day) => [day.dateKey, day]));

    for (const bill of bills || []) {
      const dueDay = bill.dueDayOfMonth ?? bill.dueDay;
      if (!dueDay) continue;
      for (const day of result) {
        if (day.dayOfMonth === dueDay) {
          day.bills.push(bill);
          day.billsTotal += Number(bill.amount) || 0;
        }
      }
    }

    const expensesByDateKey = new Map();
    for (const exp of expenses || []) {
      const rawDate = exp.dateString ?? exp.date ?? exp.expenseDate ?? exp.expense_date ?? exp.createdAt;
      const key = toDateKey(rawDate);
      if (!key) continue;
      const bucket = expensesByDateKey.get(key) || { total: 0, items: [] };
      bucket.total += Number(exp.amount) || 0;
      bucket.items.push(exp);
      expensesByDateKey.set(key, bucket);
    }

    result.forEach((day) => {
      const bucket = expensesByDateKey.get(day.dateKey);
      if (bucket) {
        day.expensesTotal = bucket.total;
        day.expenses = bucket.items;
      }
    });

    return result;
  }, [periodStart, periodEnd, bills, expenses, summary?.periodLabel?.start]);

  return {
    summary,
    days,
    loading: summaryLoading || loading,
    error: summaryError || error,
    refresh: () => {
      refreshSummary?.();
      setReloadToken((t) => t + 1);
    },
  };
};
