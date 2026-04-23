import { useState } from "react";
import { authFetch } from "../apiClient";
import { useToast } from "../context/ToastContext";
import { useDataCache } from "../context/DataCache";
import { getFirstName } from "../utils/userHelpers";
import Modal from "./ui/Modal";

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
    <Modal isOpen onClose={onClose} titleId="add-expense-title" size="md">
      <div className="pp5-modal-header">
        <h2 id="add-expense-title" className="pp5-modal-title">Add expense</h2>
        <button type="button" className="pp5-modal-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <form className="pp5-modal-body" onSubmit={handleSubmit}>
          <div className="pp5-field">
            <label className="pp5-field-label">Date</label>
            <input className="pp5-input" type="date" name="date" value={form.date} onChange={handleChange} required />
          </div>
          <div className="pp5-field">
            <label className="pp5-field-label">Description</label>
            <input className="pp5-input" type="text" name="description" placeholder="e.g. Coffee, Lunch" value={form.description} onChange={handleChange} />
          </div>
          <div className="pp5-field">
            <label className="pp5-field-label">Amount</label>
            <input className="pp5-input" type="number" name="amount" step="0.01" min="0.01" placeholder="0.00" value={form.amount} onChange={handleChange} required />
          </div>
          <div className="pp5-field">
            <label className="pp5-field-label">Category</label>
            <select className="pp5-select" name="category" value={form.category} onChange={handleChange}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {isOther && (
            <div className="pp5-field">
              <label className="pp5-field-label">Specify (required)</label>
              <input className="pp5-input" type="text" name="description" placeholder="e.g. Birthday gift, parking, donation…" value={form.description} onChange={handleChange} required />
            </div>
          )}
          {error && <p className="pp5-field-error">{error}</p>}
          <div className="pp5-modal-actions">
            <button type="button" className="pp5-btn pp5-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="pp5-btn pp5-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save expense"}</button>
          </div>
        </form>
    </Modal>
  );
};

export default AddExpenseModal;
