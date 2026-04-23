import { useState } from "react";
import { authFetch } from "../apiClient";

// Category list matches AddExpenseModal so edits can pick any of the
// same options a new expense could have been created with.
const CATEGORIES = [
  "Dining Out", "Entertainment", "Food", "Gas", "Groceries",
  "Gym", "Health", "Home", "Shopping", "Subscriptions", "Travel", "Other",
];

// Convert a Date/string to the YYYY-MM-DD format an <input type="date">
// expects, using local-time components (not UTC) so a user who logged
// an expense at 11pm local doesn't see it shift to the next day.
const toInputDate = (value) => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const EditExpenseModal = ({ expense, onClose, onSaved }) => {
  // Preserve a category that isn't in the canonical list (e.g. a legacy
  // value) by injecting it as an extra option so opening the modal never
  // silently changes the saved value.
  const initialCategory = expense?.category || "Other";
  const categoryOptions = CATEGORIES.includes(initialCategory)
    ? CATEGORIES
    : [initialCategory, ...CATEGORIES];

  const [form, setForm] = useState({
    date: toInputDate(expense?.date),
    description: expense?.description || "",
    amount: expense?.amount != null ? String(expense.amount) : "",
    category: initialCategory,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validate before hitting the network so the inline error shows
    // immediately without a server round-trip.
    const numericAmount = Number(form.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    if (!form.date) {
      setError("Please pick a date.");
      return;
    }
    const parsedDate = new Date(form.date);
    if (Number.isNaN(parsedDate.getTime())) {
      setError("Please pick a valid date.");
      return;
    }
    if (form.category === "Other" && !form.description.trim()) {
      setError("Please specify what this expense is for.");
      return;
    }

    setSaving(true);
    try {
      const updated = await authFetch(`/api/expenses/${expense._id}`, {
        method: "PUT",
        body: JSON.stringify({
          date: form.date,
          amount: numericAmount,
          category: form.category,
          description: form.description,
        }),
      });
      // Pass the server-returned document back so the parent can patch
      // its list without a full refetch if it wants.
      onSaved?.(updated);
    } catch (err) {
      setError(err?.message || "Failed to update expense. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pp5-modal-overlay" onClick={onClose}>
      <div className="pp5-modal has-inset-highlight" onClick={(e) => e.stopPropagation()}>
        <div className="pp5-modal-header">
          <h4 className="pp5-modal-title">Edit expense</h4>
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
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {error && <p className="pp5-field-error">{error}</p>}
          <div className="pp5-modal-actions">
            <button type="button" className="pp5-btn pp5-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="pp5-btn pp5-btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditExpenseModal;
