import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { authFetch } from "../apiClient";

const OnboardingPaySchedule = () => {
  const [form, setForm] = useState({
    nextPayDate: "",
    frequency: "biweekly",
    amountPerPaycheck: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadSchedule = async () => {
      try {
        const data = await authFetch("/api/income/schedule");
        if (data) {
          setForm({
            nextPayDate: data.nextPayDate ? data.nextPayDate.slice(0, 10) : "",
            frequency: data.frequency,
            amountPerPaycheck: data.amountPerPaycheck,
          });
        }
      } catch (err) {
        handleAuthError(err);
      } finally {
        setLoading(false);
      }
    };

    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuthError = (err) => {
    if (err.status === 401) {
      localStorage.removeItem("token");
      navigate("/login");
      return;
    }
    setError(err.message || "Something went wrong.");
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.nextPayDate || !form.amountPerPaycheck) {
      setError("Please provide the next pay date and amount.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await authFetch("/api/income/schedule", {
        method: "POST",
        body: JSON.stringify({
          nextPayDate: form.nextPayDate,
          frequency: form.frequency,
          amountPerPaycheck: Number(form.amountPerPaycheck),
        }),
      });
      navigate("/app");
    } catch (err) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <h1>Pay Schedule</h1>
      <p className="auth-subtitle">
        Share your pay schedule so we can plan bill reminders around your income.
      </p>

      {error && <p className="status status-error">{error}</p>}

      <form className="budget-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="nextPayDate">Next Pay Date</label>
          <input
            id="nextPayDate"
            name="nextPayDate"
            type="date"
            value={form.nextPayDate}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label htmlFor="frequency">Frequency</label>
          <select id="frequency" name="frequency" value={form.frequency} onChange={handleChange}>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="amountPerPaycheck">Amount Per Paycheck</label>
          <input
            id="amountPerPaycheck"
            name="amountPerPaycheck"
            type="number"
            step="0.01"
            value={form.amountPerPaycheck}
            onChange={handleChange}
            placeholder="0.00"
          />
        </div>

        <div className="form-group note-group" style={{ alignSelf: "flex-end" }}>
          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? "Saving..." : "Save & Continue"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default OnboardingPaySchedule;
