import { useCallback, useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import { authFetch } from "../apiClient";
import { formatDate } from "../utils/dateUtils";
import AddExpenseModal from "../components/AddExpenseModal";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const COLORS = ["#00C896", "#FF6B35", "#0D1B2A", "#F6C90E", "#E53E3E", "#8B5CF6", "#3B82F6", "#F97316", "#8492A6", "#06B6D4", "#EC4899"];
const CATEGORY_OPTIONS = ["All", "Food", "Dining Out", "Entertainment", "Gas", "Groceries", "Home", "Health", "Shopping", "Travel", "Subscriptions", "Other"];
const CATEGORY_ICONS = { Food: "\ud83c\udf54", "Dining Out": "\ud83c\udf7d\ufe0f", Entertainment: "\ud83c\udfac", Gas: "\u26fd", Groceries: "\ud83d\uded2", Home: "\ud83c\udfe0", Health: "\ud83d\udc8a", Shopping: "\ud83d\udc57", Travel: "\u2708\ufe0f", Subscriptions: "\ud83d\udce6", Other: "\ud83d\udcb8" };

const ExpenseHistory = () => {
  const [expenses, setExpenses] = useState([]);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState({ from: "", to: "", category: "All", search: "" });

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.category && filters.category !== "All") params.set("category", filters.category);
      if (filters.search) params.set("search", filters.search);
      params.set("page", String(page));
      params.set("limit", "50");
      const data = await authFetch(`/api/expenses?${params.toString()}`);
      if (Array.isArray(data)) {
        setExpenses(data); setTotal(data.reduce((s, e) => s + Number(e.amount || 0), 0)); setCount(data.length); setPages(1);
      } else {
        setExpenses(data.expenses || []); setTotal(data.total || 0); setCount(data.count || 0); setPages(data.pages || 1);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const handleDelete = async (id) => { try { await authFetch(`/api/expenses/${id}`, { method: "DELETE" }); loadExpenses(); } catch {} };

  // Chart data: group by category
  const categoryData = useMemo(() => {
    const map = {};
    expenses.forEach((e) => { const cat = e.category || "Other"; map[cat] = (map[cat] || 0) + Number(e.amount || 0); });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  // Bar chart: group by week
  const weeklyData = useMemo(() => {
    const map = {};
    expenses.forEach((e) => {
      const d = new Date(e.date || e.createdAt);
      const weekStart = new Date(d); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const key = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      map[key] = (map[key] || 0) + Number(e.amount || 0);
    });
    return Object.entries(map).map(([week, total]) => ({ week, total }));
  }, [expenses]);

  const chartTotal = categoryData.reduce((s, c) => s + c.value, 0);
  const catColorMap = {};
  categoryData.forEach((c, i) => { catColorMap[c.name] = COLORS[i % COLORS.length]; });

  return (
    <div className="history-page">
      <div className="history-header">
        <h1>Expense History</h1>
        <button type="button" className="primary-button" onClick={() => setShowAddModal(true)}>+ Add Expense</button>
      </div>

      <div className="history-filters">
        <input type="date" value={filters.from} onChange={(e) => { setFilters((p) => ({ ...p, from: e.target.value })); setPage(1); }} />
        <input type="date" value={filters.to} onChange={(e) => { setFilters((p) => ({ ...p, to: e.target.value })); setPage(1); }} />
        <select value={filters.category} onChange={(e) => { setFilters((p) => ({ ...p, category: e.target.value })); setPage(1); }}>
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" placeholder="Search expenses..." value={filters.search} onChange={(e) => { setFilters((p) => ({ ...p, search: e.target.value })); setPage(1); }} />
      </div>

      {/* Charts */}
      {expenses.length > 0 && (
        <div className="history-charts">
          <div className="history-chart-col">
            <h3 className="chart-label">By category</h3>
            <div className="donut-wrapper">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart><Pie data={categoryData} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={1} stroke="none">
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Tooltip formatter={(v) => currency.format(v)} /></PieChart>
              </ResponsiveContainer>
              <div className="donut-center"><span className="donut-center-label">Total</span><span className="donut-center-value">{currency.format(chartTotal)}</span></div>
            </div>
            <div className="spending-legend">
              {categoryData.map((c, i) => (
                <div key={c.name} className="legend-row">
                  <span className="legend-dot-color" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="legend-name">{c.name}</span>
                  <span className="legend-amount">{currency.format(c.value)}</span>
                  <span className="legend-pct">{chartTotal > 0 ? Math.round((c.value / chartTotal) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="history-chart-col">
            <h3 className="chart-label">Spending over time</h3>
            {weeklyData.length > 0 && (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyData}>
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={45} />
                  <Tooltip formatter={(v) => currency.format(v)} />
                  <Bar dataKey="total" fill="var(--teal)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      <div className="history-summary"><span>Total: <strong>{currency.format(total)}</strong></span><span>{count} expense{count !== 1 ? "s" : ""}</span></div>

      {loading ? <p className="status">Loading...</p> : expenses.length === 0 ? (
        <div className="empty-state"><p>No expenses yet. Start adding them from the dashboard.</p></div>
      ) : (
        <ul className="history-list">
          {expenses.map((exp) => (
            <li key={exp._id} className="history-row">
              <span className="legend-dot-color" style={{ background: catColorMap[exp.category] || "var(--text-muted)", width: 8, height: 8, flexShrink: 0 }} />
              <span className="history-date">{formatDate(exp.date)}</span>
              <span className="history-desc">{exp.description || exp.category || "Expense"}</span>
              <span className="history-amount">{currency.format(exp.amount)}</span>
              <button type="button" className="ghost-button" onClick={() => handleDelete(exp._id)}>x</button>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="history-pagination">
          <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {page} of {pages}</span>
          <button type="button" className="ghost-button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      {showAddModal && <AddExpenseModal onClose={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); loadExpenses(); }} />}
    </div>
  );
};

export default ExpenseHistory;
