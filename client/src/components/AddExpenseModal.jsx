import { useState } from "react";
import { authFetch } from "../apiClient";
import { useToast } from "../context/ToastContext";
import { useDataCache } from "../context/DataCache";
import { getFirstName } from "../utils/userHelpers";

const CATEGORIES = [
  "Dining Out", "Entertainment", "Food", "Gas", "Groceries",
  "Gym", "Health", "Home", "Shopping", "Subscriptions", "Travel", "Other",
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const AddExpenseModal = ({ onClose, onSaved }) => {
  const toast = useToast();
  const cache = useDataCache();
  const [form, setForm] = useState({ date: todayISO(), description: "", amount: "", category: "Food" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isOther = form.category === "Other";
  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    if (isOther && !form.description.trim()) { setError("Please specify what this expense is for."); return; }
    setSaving(true); setError("");
    try {
      await authFetch("/api/expenses", { method: "POST", body: JSON.stringify({ date: form.date, amount: Number(form.amount), category: form.category, description: form.description }) });
      // Check first-expense-of-period toast
      try {
        const p = cache?.summary?.period;
        if (p?.start && p?.end) {
          const s = new Date(p.start);
          const e = new Date(p.end);
          const from = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
          const to = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
          const res = await authFetch(`/api/expenses?from=${from}&to=${to}&excludeSavings=true&limit=2&page=1`);
          const count = res?.total ?? (Array.isArray(res) ? res.length : 0);
          if (count === 1) {
            const fn = getFirstName();
            toast?.showToast?.(`Period started. Stay on top of it${fn ? `, ${fn}` : ""}.`);
          }
        }
      } catch { /* non-critical */ }
      onSaved?.();
    } catch { setError("Failed to save expense."); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h4>Add Expense</h4><button type="button" className="ghost-button" onClick={onClose}>x</button></div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>Date<input type="date" name="date" value={form.date} onChange={handleChange} required /></label>
          <label>Description<input type="text" name="description" placeholder="e.g. Coffee, Lunch" value={form.description} onChange={handleChange} /></label>
          <label>Amount<input type="number" name="amount" step="0.01" min="0.01" placeholder="0.00" value={form.amount} onChange={handleChange} required /></label>
          <label>Category<select name="category" value={form.category} onChange={handleChange}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          {isOther && <label>Specify (required)<input type="text" name="description" placeholder="e.g. Birthday gift, parking, donation..." value={form.description} onChange={handleChange} required /></label>}
          {error && <div className="inline-error">{error}</div>}
          <div className="modal-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save Expense"}</button></div>
        </form>
      </div>
    </div>
  );
};

export default AddExpenseModal;
