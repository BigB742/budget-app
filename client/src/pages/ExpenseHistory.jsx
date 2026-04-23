import { useCallback, useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { authFetch } from "../apiClient";
import { formatDate } from "../utils/dateUtils";
import { useDataCache } from "../context/DataCache";
import AddExpenseModal from "../components/AddExpenseModal";
import EditExpenseModal from "../components/EditExpenseModal";
import PageContainer from "../components/PageContainer";

// Classify an expense date relative to the user's current pay period.
// Returns "current" | "upcoming" | "past" | null (null if we don't have
// the period yet, e.g. the dashboard hasn't loaded summary).
const classifyPayPeriod = (expenseDate, currentPeriod) => {
  if (!currentPeriod?.start || !currentPeriod?.end || !expenseDate) return null;
  const d = new Date(expenseDate);
  const s = new Date(currentPeriod.start);
  const e = new Date(currentPeriod.end);
  if (d < s) return "past";
  if (d > e) return "upcoming";
  return "current";
};

import { getCategoryColor } from "../utils/categoryColors";
import { currency } from "../utils/currency";

const CATEGORIES = ["All categories", "Dining Out", "Entertainment", "Food", "Gas", "Groceries", "Gym", "Health", "Home", "Shopping", "Subscriptions", "Travel", "Other"];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "highest", label: "Highest amount" },
  { value: "lowest", label: "Lowest amount" },
];
const QUICK_TABS = ["This period", "Last period", "This year", "All time"];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const ExpenseHistory = () => {
  const cache = useDataCache();
  const currentPeriod = cache?.summary?.period || null;
  const [expenses, setExpenses] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  // When non-null, the edit modal is open for this expense.
  const [editingExpense, setEditingExpense] = useState(null);

  const [activeTab, setActiveTab] = useState("This period");
  const [filters, setFilters] = useState({ from: "", to: "", category: "All categories", search: "" });
  const [sort, setSort] = useState("newest");

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.category && filters.category !== "All categories") params.set("category", filters.category);
      if (filters.search) params.set("search", filters.search);
      // Savings deposits are category:"Savings" Expense docs but they are
      // transfers to self, not spending — hide them from the spending list.
      // The Savings page still reads them via its own endpoint.
      params.set("excludeSavings", "true");
      params.set("page", String(page));
      params.set("limit", "50");
      const data = await authFetch(`/api/expenses?${params.toString()}`);
      const list = Array.isArray(data) ? data : (data.expenses || []);
      setExpenses(list);
      setPages(data.pages || 1);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);
  // Ensure the dashboard summary is loaded so we know the current pay
  // period — needed by the per-row "This period / Upcoming / Past" pill
  // AND the quick-filter tabs.
  useEffect(() => { cache?.fetchSummary?.(); }, [cache]);

  // When summary data first arrives and the default "This period" tab is
  // active but no date filters have been set yet, set the date range so
  // the list actually filters to the current period.
  useEffect(() => {
    const p = cache?.summary?.period;
    if (p?.start && p?.end && activeTab === "This period" && !filters.from) {
      handleTabClick("This period");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache?.summary]);

  const handleDelete = async (id) => { try { await authFetch(`/api/expenses/${id}`, { method: "DELETE" }); loadExpenses(); cache?.fetchSummary?.(true); } catch {} };

  // Derive date range from the tab name + cache period data, then push
  // into filters which triggers the re-fetch via the loadExpenses dependency.
  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setPage(1);
    const p = cache?.summary?.period;
    const pp = cache?.summary?.previousPeriod;
    let from = "";
    let to = "";

    if (tab === "This period" && p?.start && p?.end) {
      const s = new Date(p.start);
      const e = new Date(p.end);
      from = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
      to = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
    } else if (tab === "Last period" && pp?.start && pp?.end) {
      from = pp.start;
      to = pp.end;
    } else if (tab === "This year") {
      from = `${new Date().getFullYear()}-01-01`;
      to = "";
    }
    // "All time" → from="" to="" → no date filter
    setFilters((prev) => ({ ...prev, from, to }));
  };

  // Sort expenses client-side
  const sortedExpenses = useMemo(() => {
    const list = [...expenses];
    if (sort === "newest") list.sort((a, b) => new Date(b.date) - new Date(a.date));
    else if (sort === "oldest") list.sort((a, b) => new Date(a.date) - new Date(b.date));
    else if (sort === "highest") list.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    else if (sort === "lowest") list.sort((a, b) => (a.amount || 0) - (b.amount || 0));
    return list;
  }, [expenses, sort]);

  // Chart data: group by category
  const categoryData = useMemo(() => {
    const map = {};
    expenses.forEach((e) => { const cat = e.category || "Other"; map[cat] = (map[cat] || 0) + Number(e.amount || 0); });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  const chartTotal = categoryData.reduce((s, c) => s + c.value, 0);
  const catColorMap = {};
  categoryData.forEach((c) => { catColorMap[c.name] = getCategoryColor(c.name); });

  return (
    <PageContainer>
      <h1 className="heading-display" style={{ marginBottom: 32 }}>Expenses</h1>
      <div className="history-page">
      <div className="history-header">
        <button type="button" className="primary-button" onClick={() => setShowAddModal(true)}>+ Add Expense</button>
      </div>

      {/* Filter bar */}
      <div className="hf-bar">
        {/* Quick range pills */}
        <div className="hf-pills">
          {QUICK_TABS.map((tab) => (
            <button key={tab} type="button" className={`hf-pill${activeTab === tab ? " active" : ""}`} onClick={() => handleTabClick(tab)}>{tab}</button>
          ))}
        </div>
        <div className="hf-controls">
          <input type="date" value={filters.from} className="hf-input" onChange={(e) => { setFilters((p) => ({ ...p, from: e.target.value })); setActiveTab(""); setPage(1); }} />
          <input type="date" value={filters.to} className="hf-input" onChange={(e) => { setFilters((p) => ({ ...p, to: e.target.value })); setActiveTab(""); setPage(1); }} />
          <select value={sort} className="hf-input" onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filters.category} className="hf-input" onChange={(e) => { setFilters((p) => ({ ...p, category: e.target.value })); setPage(1); }}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="text" placeholder="Search..." value={filters.search} className="hf-input hf-search" onChange={(e) => { setFilters((p) => ({ ...p, search: e.target.value })); setPage(1); }} />
        </div>
      </div>

      {/* Category donut chart */}
      {expenses.length > 0 && (
        <div className="history-chart-single">
          <div className="donut-wrapper" style={{ margin: "0 auto", maxWidth: 280 }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart><Pie data={categoryData} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={1} stroke="none">
                {categoryData.map((_, i) => <Cell key={i} fill={getCategoryColor(categoryData[i]?.name || "Other")} />)}
              </Pie><Tooltip formatter={(v) => currency.format(v)} /></PieChart>
            </ResponsiveContainer>
            <div className="donut-center"><span className="donut-center-label">Total</span><span className="donut-center-value">{currency.format(chartTotal)}</span></div>
          </div>
          <div className="spending-legend" style={{ maxWidth: 400, margin: "0.5rem auto 0" }}>
            {categoryData.map((c, i) => (
              <div key={c.name} className="legend-row">
                <span className="legend-dot-color" style={{ background: getCategoryColor(categoryData[i]?.name || "Other") }} />
                <span className="legend-name">{c.name}</span>
                <span className="legend-amount">{currency.format(c.value)}</span>
                <span className="legend-pct">{chartTotal > 0 ? Math.round((c.value / chartTotal) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expense list */}
      {loading ? <p className="status">Loading...</p> : sortedExpenses.length === 0 ? (
        <div className="empty-state"><p>No expenses yet. Start adding them from the dashboard.</p></div>
      ) : (
        <ul className="history-list">
          {sortedExpenses.map((exp) => {
            const periodClass = classifyPayPeriod(exp.date, currentPeriod);
            return (
              <li key={exp._id} className="history-row">
                <span className="legend-dot-color" style={{ background: catColorMap[exp.category] || "var(--text-muted)", width: 8, height: 8, flexShrink: 0 }} />
                <span className="history-date">{formatDate(exp.date)}</span>
                <span className="history-desc">
                  {exp.description || exp.category || "Expense"}
                  {periodClass && (
                    <span className={`period-pill period-pill-${periodClass}`}>
                      {periodClass === "current" ? "This period" : periodClass === "upcoming" ? "Upcoming" : "Past period"}
                    </span>
                  )}
                </span>
                <span className="history-amount">{currency.format(exp.amount)}</span>
                <button
                  type="button"
                  className="history-edit-btn"
                  aria-label="Edit expense"
                  title="Edit"
                  onClick={() => setEditingExpense(exp)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  aria-label="Delete expense"
                  title="Delete"
                  onClick={() => handleDelete(exp._id)}
                >
                  x
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <div className="history-pagination">
          <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {page} of {pages}</span>
          <button type="button" className="ghost-button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      {showAddModal && <AddExpenseModal onClose={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); loadExpenses(); cache?.fetchSummary?.(true); }} />}

      {editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSaved={() => {
            // Close, refetch the list so the row shows new values, and
            // force-refresh the dashboard summary so "You Can Spend"
            // recalculates immediately with the edited amount/date.
            setEditingExpense(null);
            loadExpenses();
            cache?.fetchSummary?.(true);
          }}
        />
      )}
      </div>
    </PageContainer>
  );
};

export default ExpenseHistory;
