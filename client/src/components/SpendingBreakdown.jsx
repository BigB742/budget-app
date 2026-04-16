import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { authFetch } from "../apiClient";

import { getCategoryColor } from "../utils/categoryColors";

const getColor = getCategoryColor;

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const Donut = ({ data, height = 140 }) => {
  if (!data.length) return null;
  return (
    <div className="sb-donut" style={{ width: height, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={Math.round(height * 0.32)}
            outerRadius={Math.round(height * 0.48)}
            paddingAngle={1}
            stroke="none"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color || getColor(entry.name)} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => currency.format(v)} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

const SpendingBreakdown = ({ expensesByCategory = [], summary }) => {
  const [ytd, setYtd] = useState(null);
  const [mode, setMode] = useState("ytd"); // "ytd" | "paycheck"

  useEffect(() => {
    authFetch("/api/summary/year-to-date").then(setYtd).catch(() => {});
  }, []);

  // Year to date — SPENDING only (bills + expenses). One-time income
  // from `ytd.oneTimeIncome` is intentionally excluded because this is a
  // Spending Breakdown; income belongs in an income view, not a donut
  // that represents money going out. Total shown at the center is just
  // bills + expenses for the same reason.
  const ytdSlices = useMemo(() => {
    if (!ytd) return [];
    const slices = [];
    (ytd.billBreakdown || []).forEach((b) => {
      if (b.annualTotal > 0) slices.push({ name: b.name, value: b.annualTotal, color: getColor(b.name) });
    });
    (ytd.expenseBreakdown || []).forEach((e) => {
      if (e.total > 0) slices.push({ name: e.category, value: e.total, color: getColor(e.category) });
    });
    return slices.sort((a, b) => b.value - a.value);
  }, [ytd]);

  // This paycheck — bills + per-category expenses
  const paycheckSlices = useMemo(() => {
    if (!summary) return [];
    const slices = [];
    if (summary.totalBills > 0) slices.push({ name: "Bills", value: summary.totalBills, color: "#EF4444" });
    (expensesByCategory || []).forEach((c) => {
      if (c.total > 0) slices.push({ name: c.category, value: c.total, color: getColor(c.category) });
    });
    return slices.sort((a, b) => b.value - a.value);
  }, [summary, expensesByCategory]);

  const activeSlices = mode === "ytd" ? ytdSlices : paycheckSlices;
  const totalValue = activeSlices.reduce((sum, s) => sum + s.value, 0);
  const topFive = activeSlices.slice(0, 5);

  const hasYtd = ytdSlices.length > 0;
  const hasPaycheck = paycheckSlices.length > 0;
  const hasAny = hasYtd || hasPaycheck;

  return (
    <section className="sb-card">
      <div className="sb-header">
        <h2 className="sb-title">Spending Breakdown</h2>
        <div className="sb-toggle" role="tablist" aria-label="Period">
          <button
            type="button"
            className={mode === "ytd" ? "active" : ""}
            onClick={() => setMode("ytd")}
            role="tab"
            aria-selected={mode === "ytd"}
          >
            Year to Date
          </button>
          <button
            type="button"
            className={mode === "paycheck" ? "active" : ""}
            onClick={() => setMode("paycheck")}
            role="tab"
            aria-selected={mode === "paycheck"}
          >
            This Paycheck
          </button>
        </div>
      </div>

      {!hasAny ? (
        <p className="sb-empty">No expenses logged yet. Add your first one above.</p>
      ) : activeSlices.length === 0 ? (
        <p className="sb-empty">Nothing to show for this view yet.</p>
      ) : (
        <>
          <div className="sb-donut-row">
            <Donut data={activeSlices} height={140} />
            <div className="sb-total-block">
              <span className="sb-total-label">{mode === "ytd" ? "Year total" : "Spent this period"}</span>
              <span className="sb-total-value">{currency.format(totalValue)}</span>
            </div>
          </div>

          <ul className="sb-top-list">
            {topFive.map((s) => (
              <li key={s.name} className="sb-top-row">
                <span className="sb-top-name">
                  <span className="sb-top-dot" style={{ background: s.color || getColor(s.name) }} />
                  {s.name}
                </span>
                <span className="sb-top-amount">{currency.format(s.value)}</span>
              </li>
            ))}
          </ul>

          <Link to="/app/expenses" className="sb-view-all">View all expenses →</Link>
        </>
      )}
    </section>
  );
};

export default SpendingBreakdown;
