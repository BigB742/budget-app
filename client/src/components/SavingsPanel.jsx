import { useState } from "react";

import { useSavingsGoals } from "../hooks/useSavingsGoals";

const CATEGORY_OPTIONS = ["Emergency", "Travel", "Debt", "Other"];

const SavingsPanel = () => {
  const { goals, loading, error, createGoal, deleteGoal, contribute } = useSavingsGoals();
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    targetAmount: "",
    perPaycheckAmount: "",
    category: "Other",
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createGoal({
        name: form.name,
        targetAmount: Number(form.targetAmount),
        perPaycheckAmount: Number(form.perPaycheckAmount) || 0,
        category: form.category,
      });
      setForm({ name: "", targetAmount: "", perPaycheckAmount: "", category: "Other" });
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
      alert("Failed to create goal.");
    } finally {
      setSaving(false);
    }
  };

  const handleContribute = async (goal) => {
    const input = window.prompt(
      `Add contribution to "${goal.name}"`,
      String(goal.perPaycheckAmount || 0)
    );
    if (!input) return;
    const amount = Number(input);
    if (!amount || amount <= 0) return;
    try {
      await contribute(goal._id, amount);
    } catch (err) {
      console.error(err);
      alert("Failed to add contribution.");
    }
  };

  const progressPercent = (goal) => {
    if (!goal.targetAmount) return 0;
    return Math.min(100, Math.round(((goal.savedAmount || 0) / goal.targetAmount) * 100));
  };

  return (
    <div className="recurring-section" style={{ marginTop: "1rem" }}>
      <div className="recurring-section-header">
        <div>
          <h4>Savings goals</h4>
        </div>
        <button type="button" className="secondary-button" onClick={() => setShowAddModal(true)}>
          Add goal
        </button>
      </div>
      {error && <p className="status status-error">{error}</p>}
      {loading ? (
        <p className="status">Loading goals...</p>
      ) : goals.length === 0 ? (
        <p className="empty-row">No goals yet. Add your first savings goal.</p>
      ) : (
        <div className="recurring-list">
          {goals.map((goal) => (
            <div key={goal._id} className="recurring-card">
              <div>
                <p className="entry-title">{goal.name}</p>
                <p className="muted">
                  {goal.category} · ${Number(goal.savedAmount || 0).toFixed(2)} of $
                  {Number(goal.targetAmount || 0).toFixed(2)}
                </p>
                <div className="progress-bar" style={{ marginTop: "0.35rem" }}>
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${progressPercent(goal)}%` }}
                  ></div>
                </div>
                <p className="muted" style={{ marginTop: "0.35rem" }}>
                  ${Number(goal.perPaycheckAmount || 0).toFixed(2)} per paycheck
                </p>
              </div>
              <div className="recurring-actions">
                <button type="button" className="secondary-button" onClick={() => handleContribute(goal)}>
                  + Add
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    const confirmed = window.confirm(`Delete goal "${goal.name}"?`);
                    if (confirmed) deleteGoal(goal._id).catch(() => alert("Failed to delete goal."));
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h4>Add savings goal</h4>
              <button type="button" className="ghost-button" onClick={() => setShowAddModal(false)}>
                ✕
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <label>
                Goal name
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="Emergency fund"
                />
              </label>
              <label>
                Target amount
                <input
                  type="number"
                  step="0.01"
                  name="targetAmount"
                  value={form.targetAmount}
                  onChange={handleChange}
                  required
                />
              </label>
              <label>
                Per-paycheck amount
                <input
                  type="number"
                  step="0.01"
                  name="perPaycheckAmount"
                  value={form.perPaycheckAmount}
                  onChange={handleChange}
                  required
                />
              </label>
              <label>
                Category
                <select name="category" value={form.category} onChange={handleChange}>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Saving..." : "Save goal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SavingsPanel;
