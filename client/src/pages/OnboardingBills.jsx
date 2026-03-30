import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { authFetch } from "../apiClient";

const CATEGORY_OPTIONS = [
  "Subscriptions",
  "Food",
  "Gas",
  "Rent",
  "Utilities",
  "Gym",
  "Car Payment",
  "Insurance",
  "Other",
];

const initialFormState = {
  name: "",
  amount: "",
  dueDay: "",
  category: "Other",
};

const OnboardingBills = () => {
  const [bills, setBills] = useState([]);
  const [form, setForm] = useState(initialFormState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const loadBills = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await authFetch("/api/bills");
      setBills(data || []);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBills();
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
    if (!form.name || !form.amount || !form.dueDay) {
      setError("Please fill in name, amount, and due day.");
      return;
    }
    setError(null);
    try {
      const newBill = await authFetch("/api/bills", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          amount: Number(form.amount),
          dueDayOfMonth: Number(form.dueDay),
          category: form.category || "Other",
        }),
      });
      setBills((prev) =>
        [...prev, newBill].sort((a, b) => (a.dueDayOfMonth || a.dueDay) - (b.dueDayOfMonth || b.dueDay))
      );
      setForm(initialFormState);
    } catch (err) {
      handleAuthError(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await authFetch(`/api/bills/${id}`, { method: "DELETE" });
      setBills((prev) => prev.filter((bill) => bill._id !== id));
    } catch (err) {
      handleAuthError(err);
    }
  };

  return (
    <div className="app">
      <h1>Set Up Your Bills</h1>
      <p className="auth-subtitle">
        Add recurring monthly bills so we can remind you before they are due.
      </p>

      <form className="budget-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="bill-name">Bill Name</label>
          <input
            id="bill-name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. Rent"
          />
        </div>

        <div className="form-group">
          <label htmlFor="bill-amount">Amount</label>
          <input
            id="bill-amount"
            name="amount"
            type="number"
            step="0.01"
            value={form.amount}
            onChange={handleChange}
            placeholder="0.00"
          />
        </div>

        <div className="form-group">
          <label htmlFor="bill-dueDay">Due Day</label>
          <input
            id="bill-dueDay"
            name="dueDay"
            type="number"
            min="1"
            max="31"
            value={form.dueDay}
            onChange={handleChange}
            placeholder="1 - 31"
          />
        </div>

        <div className="form-group">
          <label htmlFor="bill-category">Category</label>
          <select
            id="bill-category"
            name="category"
            value={form.category}
            onChange={handleChange}
          >
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="primary-button">
          Add Bill
        </button>
      </form>

      {error && <p className="status status-error">{error}</p>}
      {loading ? (
        <p className="status">Loading bills...</p>
      ) : bills.length === 0 ? (
        <p className="status status-empty">No bills yet. Add your first recurring bill.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Amount</th>
                <th>Due Day</th>
                <th>Category</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr key={bill._id}>
                  <td>{bill.name}</td>
                  <td>${Number(bill.amount).toFixed(2)}</td>
                  <td>Day {bill.dueDayOfMonth || bill.dueDay}</td>
                  <td>{bill.category}</td>
                  <td>
                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => handleDelete(bill._id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ textAlign: "right", marginTop: "1.5rem" }}>
        <button
          type="button"
          className="primary-button"
          onClick={() => navigate("/app")}
          disabled={bills.length === 0}
        >
          Finish
        </button>
      </div>
    </div>
  );
};

export default OnboardingBills;
