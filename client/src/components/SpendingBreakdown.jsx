import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#00C896", "#FF6B35", "#0D1B2A", "#F6C90E", "#E53E3E", "#8B5CF6", "#3B82F6", "#F97316", "#8492A6", "#06B6D4", "#EC4899"];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const CATEGORY_ICONS = {
  Food: "\ud83c\udf54", "Dining Out": "\ud83c\udf7d\ufe0f", Entertainment: "\ud83c\udfac",
  Gas: "\u26fd", Groceries: "\ud83d\uded2", Home: "\ud83c\udfe0", Health: "\ud83d\udc8a",
  Shopping: "\ud83d\udc57", Travel: "\u2708\ufe0f", Subscriptions: "\ud83d\udce6", Other: "\ud83d\udcb8",
};

const SpendingBreakdown = ({ expensesByCategory = [], previousTotal }) => {
  const total = useMemo(() => expensesByCategory.reduce((s, c) => s + c.total, 0), [expensesByCategory]);
  const data = useMemo(() => expensesByCategory.map((c) => ({ name: c.category, value: c.total })).sort((a, b) => b.value - a.value), [expensesByCategory]);

  if (!data.length) {
    return (
      <div className="spending-section">
        <h2 className="section-title">Spending Breakdown</h2>
        <p className="empty-hint">No expenses logged yet. Add your first one above.</p>
      </div>
    );
  }

  const diff = previousTotal != null ? total - previousTotal : null;

  return (
    <div className="spending-section">
      <h2 className="section-title">Spending Breakdown</h2>
      <div className="spending-layout">
        <div className="spending-chart">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}>
                {data.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
              </Pie>
              <Tooltip formatter={(v) => currency.format(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="spending-legend">
          {data.map((item, i) => (
            <div key={item.name} className="legend-row">
              <span className="legend-dot-color" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="legend-name">{CATEGORY_ICONS[item.name] || ""} {item.name}</span>
              <span className="legend-amount">{currency.format(item.value)}</span>
              <span className="legend-pct">{total > 0 ? Math.round((item.value / total) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
      {diff != null && (
        <p className={`spending-comparison ${diff > 0 ? "negative" : "positive"}`}>
          {diff > 0
            ? `You've spent ${currency.format(diff)} more than last period`
            : `You've spent ${currency.format(Math.abs(diff))} less than last period`}
        </p>
      )}
    </div>
  );
};

export default SpendingBreakdown;
