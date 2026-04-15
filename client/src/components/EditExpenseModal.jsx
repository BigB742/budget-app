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
      setError(err?.message || "Failed to update expense. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4>Edit Expense</h4>
          <button type="button" className="ghost-button" onClick={onClose}>x</button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>
            Date
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Description
            <input
              type="text"
              name="description"
              placeholder="e.g. Coffee, Lunch"
              value={form.description}
              onChange={handleChange}
            />
          </label>
          <label>
            Amount
            <input
              type="number"
              name="amount"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Category
            <select name="category" value={form.category} onChange={handleChange}>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {error && <div className="inline-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditExpenseModal;
