import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { authFetch } from "../apiClient";

// Distinct per-category color palette — deterministic by name
const CATEGORY_COLORS = {
  "Food": "#F59E0B", "Dining Out": "#F59E0B", "Gas": "#EF4444", "Travel": "#F97316",
  "Entertainment": "#EC4899", "Shopping": "#14B8A6", "Health": "#10B981", "Gym": "#8B5CF6",
  "Home": "#84CC16", "Subscriptions": "#6366F1", "Other": "#8492A6",
  "Extra income": "#8B5CF6", "Unspent": "#00C896",
};
// Named bills get colors by hash
const BILL_PALETTE = ["#3B82F6", "#8B5CF6", "#6366F1", "#06B6D4", "#0EA5E9", "#14B8A6", "#F59E0B", "#F97316", "#EC4899", "#10B981", "#84CC16", "#EF4444"];
const hashColor = (name) => { let h = 0; for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0; return BILL_PALETTE[Math.abs(h) % BILL_PALETTE.length]; };
const getColor = (name) => CATEGORY_COLORS[name] || hashColor(name);

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const DonutChart = ({ data, centerLabel, centerValue, height = 190 }) => {
  if (!data.length) return null;
  return (
    <div className="donut-wrapper">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={52} outerRadius={72} paddingAngle={1} stroke="none">
            {data.map((entry, i) => <Cell key={i} fill={entry.color || getColor(entry.name)} />)}
          </Pie>
          <Tooltip formatter={(v) => currency.format(v)} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <span className="donut-center-label">{centerLabel}</span>
        <span className="donut-center-value">{centerValue}</span>
      </div>
    </div>
  );
};

const Legend = ({ data }) => (
  <div className="spending-legend">
    {data.map((item, i) => (
      <div key={item.name} className="legend-row">
        <span className="legend-dot-color" style={{ background: item.color || getColor(item.name) }} />
        <span className="legend-name">{item.name}</span>
        <span className="legend-amount">{currency.format(item.value)}</span>
      </div>
    ))}
  </div>
);

const SpendingBreakdown = ({ expensesByCategory = [], summary }) => {
  const [ytd, setYtd] = useState(null);

  useEffect(() => {
    authFetch("/api/summary/year-to-date").then(setYtd).catch(() => {});
  }, []);

  // Chart 1 — Year to date
  const ytdData = useMemo(() => {
    if (!ytd) return [];
    const slices = [];
    (ytd.billBreakdown || []).forEach((b, i) => {
      if (b.annualTotal > 0) slices.push({ name: b.name, value: b.annualTotal, color: hashColor(b.name) });
    });
    (ytd.expenseBreakdown || []).forEach((e, i) => {
      if (e.total > 0) slices.push({ name: e.category, value: e.total, color: getColor(e.category) });
    });
    if (ytd.oneTimeIncome > 0) slices.push({ name: "Extra income", value: ytd.oneTimeIncome, color: "#8B5CF6" });
    if (ytd.remaining > 0) slices.push({ name: "Unspent", value: ytd.remaining, color: "#00C896" });
    return slices;
  }, [ytd]);

  // Chart 2 — This paycheck
  const paycheckData = useMemo(() => {
    if (!summary) return [];
    const slices = [];
    // We don't have per-bill breakdown in summary, so show total bills as one slice
    if (summary.totalBills > 0) slices.push({ name: "Bills", value: summary.totalBills, color: "#E53E3E" });
    (expensesByCategory || []).forEach((c, i) => {
      if (c.total > 0) slices.push({ name: c.category, value: c.total, color: getColor(c.category) });
    });
    const balance = summary.balance || 0;
    if (balance > 0) slices.push({ name: "Available", value: balance, color: "#00C896" });
    return slices;
  }, [summary, expensesByCategory]);

  const hasData = ytdData.length > 0 || paycheckData.length > 0;

  if (!hasData) {
    return (
      <div className="spending-section">
        <h2 className="section-title">Spending Breakdown</h2>
        <p className="empty-hint">No expenses logged yet. Add your first one above.</p>
      </div>
    );
  }

  return (
    <div className="spending-section">
      <h2 className="section-title">Spending Breakdown</h2>
      <div className="dual-charts">
        {/* Year to date */}
        {ytd && ytdData.length > 0 && (
          <div className="chart-col">
            <h3 className="chart-label">Year to date</h3>
            <DonutChart data={ytdData} centerLabel="Remaining" centerValue={currency.format(ytd.remaining || 0)} />
            <Legend data={ytdData} />
          </div>
        )}

        {/* This paycheck */}
        {summary && paycheckData.length > 0 && (
          <div className="chart-col">
            <h3 className="chart-label">This paycheck</h3>
            <DonutChart data={paycheckData} centerLabel="Balance" centerValue={currency.format(summary.balance || 0)} />
            <Legend data={paycheckData} />
          </div>
        )}
      </div>
    </div>
  );
};

export default SpendingBreakdown;
