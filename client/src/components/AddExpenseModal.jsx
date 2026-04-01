import { useState } from "react";
import { authFetch } from "../apiClient";

const CATEGORY_OPTIONS = [
  { value: "Food", label: "\ud83c\udf54 Food" },
  { value: "Dining Out", label: "\ud83c\udf7d\ufe0f Dining Out" },
  { value: "Entertainment", label: "\ud83c\udfac Entertainment" },
  { value: "Gas", label: "\u26fd Gas" },
  { value: "Groceries", label: "\ud83d\uded2 Groceries" },
  { value: "Home", label: "\ud83c\udfe0 Home" },
  { value: "Health", label: "\ud83d\udc8a Health" },
  { value: "Shopping", label: "\ud83d\udc57 Shopping" },
  { value: "Travel", label: "\u2708\ufe0f Travel" },
  { value: "Subscriptions", label: "\ud83d\udce6 Subscriptions" },
  { value: "Other", label: "\ud83d\udcb8 Other" },
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const AddExpenseModal = ({ onClose, onSaved }) => {
  const [form, setForm] = useState({ date: todayISO(), description: "", amount: "", category: "Food" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isOther = form.category === "Other";

  const handleChange = (e) => { setForm((p) => ({ ...p, [e.target.name]: e.target.value })); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    if (isOther && !form.description.trim()) { setError("Please describe what this expense is for."); return; }
    setSaving(true);
    setError("");
    try {
      await authFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify({ date: form.date, amount: Number(form.amount), category: form.category, description: form.description }),
      });
      onSaved?.();
    } catch { setError("Failed to save expense."); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h4>Add Expense</h4><button type="button" className="ghost-button" onClick={onClose}>&#x2715;</button></div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>Date<input type="date" name="date" value={form.date} onChange={handleChange} required /></label>
          <label>Description{isOther && <span style={{ color: "var(--red)", fontSize: "0.72rem" }}> (required for Other)</span>}
            <input type="text" name="description" placeholder={isOther ? "e.g. Birthday gift, parking, donation..." : "e.g. Coffee, Lunch"} value={form.description} onChange={handleChange} required={isOther} />
          </label>
          <label>Amount<input type="number" name="amount" step="0.01" min="0.01" placeholder="0.00" value={form.amount} onChange={handleChange} required /></label>
          <label>Category
            <select name="category" value={form.category} onChange={handleChange}>
              {CATEGORY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>
          {error && <div className="inline-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save Expense"}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddExpenseModal;
