import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { authFetch } from "../apiClient";

const OnboardingIncome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isEditMode = location.pathname.startsWith("/settings/income");
  const [form, setForm] = useState({
    lastPaycheckDate: "",
    amount: "",
    frequency: "biweekly",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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
    const loadProfile = async () => {
      try {
        setLoading(true);
        const profile = await authFetch("/api/user/me");
        if (profile?.incomeSettings) {
          setForm({
            lastPaycheckDate: profile.incomeSettings.lastPaycheckDate
              ? profile.incomeSettings.lastPaycheckDate.slice(0, 10)
              : "",
            amount: profile.incomeSettings.amount || "",
            frequency: profile.incomeSettings.frequency || "biweekly",
          });
        }
        localStorage.setItem("user", JSON.stringify(profile));
      } catch (err) {
        handleAuthError(err);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await authFetch("/api/user/me", {
        method: "PUT",
        body: JSON.stringify({
          incomeSettings: {
            amount: Number(form.amount),
            frequency: form.frequency,
            lastPaycheckDate: form.lastPaycheckDate,
          },
        }),
      });
      localStorage.setItem("user", JSON.stringify(updated));
      if (isEditMode) {
        navigate("/app");
      } else {
        navigate("/onboarding/bills");
      }
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{isEditMode ? "Edit your income" : "Set up your income"}</h1>
        <p className="auth-subtitle">Share your pay schedule so we can plan your paychecks.</p>
        {loading ? (
          <p className="status">Loading...</p>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              Last paycheck date
              <input
                type="date"
                name="lastPaycheckDate"
                value={form.lastPaycheckDate}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Paycheck amount
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
              Frequency
              <select name="frequency" value={form.frequency} onChange={handleChange}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>

            {error && <p className="status status-error">{error}</p>}
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : "Continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default OnboardingIncome;
