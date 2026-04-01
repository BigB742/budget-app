import { useEffect, useMemo, useState } from "react";

import { authFetch } from "../apiClient";
import { parseLocalDateString, stripTime } from "../utils/dateUtils";

const CATEGORY_OPTIONS = [
  "Dining Out", "Entertainment", "Food", "Gas", "Groceries",
  "Gym", "Health", "Home", "Shopping", "Subscriptions", "Travel", "Other",
];

const DayExpensesModal = ({ isOpen, onClose, date, items = [], total = 0, onExpenseSaved }) => {
  const [form, setForm] = useState({
    amount: "",
    category: "Food",
    note: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dateObj = useMemo(() => {
    if (!date) return null;
    if (typeof date === "string") {
      return parseLocalDateString(date.slice(0, 10));
    }
    return new Date(date);
  }, [date]);
  const isoDate = dateObj ? stripTime(dateObj).toISOString().slice(0, 10) : "";

  useEffect(() => {
    setForm({ amount: "", category: "Food", note: "", description: "" });
    setError("");
  }, [isoDate]);

  if (!isOpen) return null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isoDate) return;
    setSaving(true);
    setError("");
    try {
      await authFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          date: isoDate,
          amount: Number(form.amount),
          category: form.category,
          note: form.note,
          description: form.description || form.note,
        }),
      });
      setForm({ amount: "", category: "Food", note: "", description: "" });
      onExpenseSaved?.();
    } catch (err) {
      console.error(err);
      setError("Failed to add expense.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!id) return;
    try {
      await authFetch(`/api/expenses/${id}`, { method: "DELETE" });
      onExpenseSaved?.();
    } catch (err) {
      console.error(err);
      setError("Failed to delete expense.");
    }
  };

  return (
    <div className="day-modal-backdrop">
      <div className="day-modal">
        <div className="day-modal-header">
          <h3>Expenses for {isoDate}</h3>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="status" style={{ marginBottom: "0.5rem" }}>
          Total: ${Number(total || 0).toFixed(2)}
        </p>
        {error && <div className="error-banner">{error}</div>}
        <form className="day-modal-form" onSubmit={handleSubmit}>
          <input
            type="number"
            name="amount"
            placeholder="Amount"
            value={form.amount}
            onChange={handleChange}
            min="0"
            step="0.01"
            required
          />
          <select name="category" value={form.category} onChange={handleChange}>
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            type="text"
            name="description"
            placeholder="Description"
            value={form.description}
            onChange={handleChange}
          />
          <input
            type="text"
            name="note"
            placeholder="Note (optional)"
            value={form.note}
            onChange={handleChange}
          />
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Add expense"}
          </button>
        </form>
        <div className="day-modal-list">
          {items.length === 0 ? (
            <p>No expenses logged for this day.</p>
          ) : (
            items.map((item, idx) => (
              <div key={item._id || item.id || idx} className="day-expense-row">
                <div>
                  <strong>${Number(item.amount).toFixed(2)}</strong>{" "}
                  {item.name || item.description || item.categoryName || "Expense"}
                  {item.category && <span> – {item.category}</span>}
                  {item.categoryName && !item.category && <span> – {item.categoryName}</span>}
                  {item.isRecurring && <span className="pill">Recurring</span>}
                </div>
                {!item.isRecurring && (item._id || item.id) && (
                  <button type="button" onClick={() => handleDelete(item._id || item.id)}>
                    Delete
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DayExpensesModal;
