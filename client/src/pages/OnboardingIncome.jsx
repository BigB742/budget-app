import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { authFetch } from "../apiClient";
import { currency } from "../utils/currency";

const OnboardingIncome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isEditMode = location.pathname.startsWith("/settings/income");

  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    frequency: "biweekly",
    nextPayDate: "",
  });

  const handleAuthError = (err) => {
    if (err?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
      return;
    }
    setError(err?.message || "Something went wrong.");
  };

  useEffect(() => {
    const loadSources = async () => {
      try {
        setLoading(true);
        const data = await authFetch("/api/income-sources");
        const list = Array.isArray(data) ? data : [];
        setSources(list);
        if (list.length === 0) {
          setShowForm(true);
        }
      } catch (err) {
        handleAuthError(err);
      } finally {
        setLoading(false);
      }
    };
    loadSources();
  }, []);

  const resetForm = () => {
    setForm({ name: "", amount: "", frequency: "biweekly", nextPayDate: "" });
    setEditingId(null);
    setShowForm(false);
    setError(null);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        amount: Number(form.amount),
        frequency: form.frequency,
        nextPayDate: form.nextPayDate,
      };

      if (editingId) {
        const updated = await authFetch(`/api/income-sources/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSources((prev) => prev.map((s) => (s._id === editingId ? updated : s)));
      } else {
        const created = await authFetch("/api/income-sources", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSources((prev) => [...prev, created]);
      }
      resetForm();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (source) => {
    setForm({
      name: source.name,
      amount: source.amount,
      frequency: source.frequency,
      nextPayDate: source.nextPayDate?.slice(0, 10) || "",
    });
    setEditingId(source._id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    try {
      await authFetch(`/api/income-sources/${id}`, { method: "DELETE" });
      setSources((prev) => prev.filter((s) => s._id !== id));
    } catch (err) {
      handleAuthError(err);
    }
  };

  const handleContinue = () => {
    if (isEditMode) {
      navigate("/app");
    } else {
      navigate("/onboarding/bills");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: "32rem" }}>
        <h1>{isEditMode ? "Manage income sources" : "Set up your income"}</h1>
        <p className="auth-subtitle">
          Add your paychecks and other income sources so we can plan your budget.
        </p>

        {loading ? (
          <p className="status">Loading...</p>
        ) : (
          <>
            {sources.length > 0 && (
              <div className="income-source-list">
                {sources.map((source) => (
                  <div key={source._id} className="income-source-card">
                    <div className="income-source-info">
                      <div className="income-source-name">
                        {source.name}
                        {source.isPrimary && (
                          <span className="pill primary-pill">Primary</span>
                        )}
                      </div>
                      <p className="muted">
                        {currency.format(source.amount)} paid {source.frequency}. Next pay{" "}
                        {source.nextPayDate?.slice(0, 10)}
                      </p>
                    </div>
                    <div className="income-source-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => handleEdit(source)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => handleDelete(source._id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showForm ? (
              <form className="auth-form" onSubmit={handleSubmit}>
                <label>
                  Source name
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g., Main Job, Side Gig"
                    required
                  />
                </label>
                <label>
                  Amount per paycheck
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    value={form.amount}
                    onChange={handleChange}
                    placeholder="0.00"
                    required
                  />
                </label>
                <label>
                  Pay frequency
                  <select name="frequency" value={form.frequency} onChange={handleChange}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label>
                  Next pay date
                  <input
                    type="date"
                    name="nextPayDate"
                    value={form.nextPayDate}
                    onChange={handleChange}
                    required
                  />
                </label>

                {error && <p className="status status-error">{error}</p>}

                <div className="form-row">
                  {(sources.length > 0 || editingId) && (
                    <button type="button" className="ghost-button" onClick={resetForm}>
                      Cancel
                    </button>
                  )}
                  <button type="submit" className="primary-button" disabled={saving}>
                    {saving ? "Saving..." : editingId ? "Update source" : "Add source"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowForm(true)}
                style={{ marginTop: "1rem" }}
              >
                Add another source
              </button>
            )}

            {sources.length > 0 && !showForm && (
              <button
                type="button"
                className="primary-button"
                onClick={handleContinue}
                style={{ marginTop: "1rem", width: "100%" }}
              >
                {isEditMode ? "Back to dashboard" : "Continue"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OnboardingIncome;
