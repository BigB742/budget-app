import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const CATEGORY_OPTIONS = ["All", "Food", "Dining Out", "Entertainment", "Gas", "Groceries", "Home", "Health", "Shopping", "Travel", "Subscriptions", "Other"];
const CATEGORY_ICONS = { Food: "\ud83c\udf54", "Dining Out": "\ud83c\udf7d\ufe0f", Entertainment: "\ud83c\udfac", Gas: "\u26fd", Groceries: "\ud83d\uded2", Home: "\ud83c\udfe0", Health: "\ud83d\udc8a", Shopping: "\ud83d\udc57", Travel: "\u2708\ufe0f", Subscriptions: "\ud83d\udce6", Other: "\ud83d\udcb8" };

const quickRanges = () => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  return [
    { label: "This month", from: `${y}-${String(m + 1).padStart(2, "0")}-01`, to: "" },
    { label: "Last 3 months", from: `${y}-${String(m - 2 > 0 ? m - 2 : m + 10).padStart(2, "0")}-01`, to: "" },
    { label: "All time", from: "", to: "" },
  ];
};

const ExpenseHistory = () => {
  const [expenses, setExpenses] = useState([]);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

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
      params.set("limit", "25");

      const data = await authFetch(`/api/expenses?${params.toString()}`);
      if (Array.isArray(data)) {
        setExpenses(data);
        setTotal(data.reduce((s, e) => s + Number(e.amount || 0), 0));
        setCount(data.length);
        setPages(1);
      } else {
        setExpenses(data.expenses || []);
        setTotal(data.total || 0);
        setCount(data.count || data.expenses?.length || 0);
        setPages(data.pages || 1);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.category && filters.category !== "All") params.set("category", filters.category);
    const token = localStorage.getItem("token");
    window.open(`/api/export/csv?${params.toString()}&token=${token}`);
  };

  const handleDelete = async (id) => {
    try {
      await authFetch(`/api/expenses/${id}`, { method: "DELETE" });
      loadExpenses();
    } catch (err) { console.error(err); }
  };

  const formatDate = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="history-page">
      <div className="history-header">
        <h1>Expense History</h1>
        <button type="button" className="secondary-button" onClick={handleExportCSV}>Export CSV</button>
      </div>

      <div className="history-filters">
        <input type="date" value={filters.from} onChange={(e) => { setFilters((p) => ({ ...p, from: e.target.value })); setPage(1); }} />
        <input type="date" value={filters.to} onChange={(e) => { setFilters((p) => ({ ...p, to: e.target.value })); setPage(1); }} />
        <select value={filters.category} onChange={(e) => { setFilters((p) => ({ ...p, category: e.target.value })); setPage(1); }}>
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" placeholder="Search expenses..." value={filters.search} onChange={(e) => { setFilters((p) => ({ ...p, search: e.target.value })); setPage(1); }} />
      </div>

      <div className="history-summary">
        <span>Total: <strong>{currency.format(total)}</strong></span>
        <span>{count} expense{count !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <p className="status">Loading...</p>
      ) : expenses.length === 0 ? (
        <div className="empty-state"><p>No expenses yet. Start adding them from the dashboard.</p></div>
      ) : (
        <ul className="history-list">
          {expenses.map((exp) => (
            <li key={exp._id} className="history-row">
              <span className="history-date">{formatDate(exp.date)}</span>
              <span className="history-icon">{CATEGORY_ICONS[exp.category] || "\ud83d\udcb8"}</span>
              <span className="history-desc">{exp.description || exp.category || "Expense"}</span>
              <span className="history-amount">{currency.format(exp.amount)}</span>
              <button type="button" className="ghost-button" onClick={() => handleDelete(exp._id)}>x</button>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="history-pagination">
          <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" className="ghost-button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
};

export default ExpenseHistory;
