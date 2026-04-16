import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyRow = () => ({ date: "", amount: "" });

const PaymentPlans = () => {
  const cache = useDataCache();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [form, setForm] = useState({ name: "", totalAmount: "", payments: [emptyRow()] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authFetch("/api/payment-plans");
      setPlans(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const openAdd = () => {
    setEditingPlan(null);
    setForm({ name: "", totalAmount: "", payments: [emptyRow()] });
    setError("");
    setShowModal(true);
  };

  const openEdit = (plan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      totalAmount: plan.totalAmount != null ? String(plan.totalAmount) : "",
      payments: plan.payments.map((p) => ({
        id: p.id,
        date: p.date ? new Date(p.date).toISOString().slice(0, 10) : "",
        amount: String(p.amount),
        paid: p.paid,
        paidDate: p.paidDate,
      })),
    });
    setError("");
    setShowModal(true);
  };

  const handlePaymentChange = (idx, field, value) => {
    setForm((prev) => {
      const next = [...prev.payments];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, payments: next };
    });
  };

  const addPaymentRow = () => setForm((p) => ({ ...p, payments: [...p.payments, emptyRow()] }));
  const removePaymentRow = (idx) => setForm((p) => ({ ...p, payments: p.payments.filter((_, i) => i !== idx) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) { setError("Plan name is required."); return; }
    const unpaidPayments = form.payments.filter((p) => !p.paid);
    if (unpaidPayments.length === 0) { setError("At least one payment entry is required."); return; }
    for (const p of unpaidPayments) {
      if (!p.date || !Number.isFinite(Number(p.amount)) || Number(p.amount) <= 0) {
        setError("Every payment needs a valid date and positive amount.");
        return;
      }
    }

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        totalAmount: form.totalAmount ? Number(form.totalAmount) : null,
        payments: form.payments.map((p) => ({
          id: p.id,
          date: p.date,
          amount: Number(p.amount),
          paid: !!p.paid,
        })),
      };
      if (editingPlan) {
        await authFetch(`/api/payment-plans/${editingPlan._id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await authFetch("/api/payment-plans", { method: "POST", body: JSON.stringify(body) });
      }
      setShowModal(false);
      loadPlans();
      cache?.fetchSummary?.(true);
    } catch (err) {
      setError(err?.message || "Failed to save. Please try again.");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await authFetch(`/api/payment-plans/${id}`, { method: "DELETE" });
      loadPlans();
      cache?.fetchSummary?.(true);
    } catch { /* ignore */ }
  };

  const handleMarkPaid = async (planId, paymentId) => {
    try {
      await authFetch(`/api/payment-plans/${planId}/payments/${paymentId}`, { method: "PATCH" });
      loadPlans();
      cache?.fetchSummary?.(true);
    } catch { /* ignore */ }
  };

  return (
    <div className="history-page">
      <div className="history-header">
        <h1>Payment Plans</h1>
        <button type="button" className="primary-button" onClick={openAdd}>+ Add Plan</button>
      </div>

      {loading ? (
        <p className="status">Loading...</p>
      ) : plans.length === 0 ? (
        <div className="empty-state">
          <p>No payment plans yet. Add one to track installments, Klarna payments, or anything you owe on specific dates.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {plans.map((plan) => {
            const remaining = plan.payments.filter((p) => !p.paid).length;
            const total = plan.payments.length;
            return (
              <div key={plan._id} className="bi-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{plan.name}</strong>
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>
                      {remaining} of {total} payment{total !== 1 ? "s" : ""} remaining
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
                    <button type="button" className="link-button" onClick={() => openEdit(plan)}>Edit</button>
                    <button type="button" className="link-button" style={{ color: "var(--red)" }} onClick={() => handleDelete(plan._id)}>Delete</button>
                  </div>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {plan.payments
                    .slice()
                    .sort((a, b) => new Date(a.date) - new Date(b.date))
                    .map((p) => (
                      <li
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          background: "var(--card-2)",
                          borderRadius: 10,
                          fontSize: 14,
                          opacity: p.paid ? 0.5 : 1,
                          textDecoration: p.paid ? "line-through" : "none",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {p.paid && <span style={{ color: "#00C9A7" }}>✓</span>}
                          <span>{fmtDate(p.date)}</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{currency.format(p.amount)}</span>
                          {!p.paid && (
                            <button
                              type="button"
                              className="link-button"
                              style={{ fontSize: 12, color: "var(--teal)" }}
                              onClick={() => handleMarkPaid(plan._id, p.id)}
                            >
                              Mark paid
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>{editingPlan ? "Edit Payment Plan" : "New Payment Plan"}</h4>
              <button type="button" className="ghost-button" onClick={() => setShowModal(false)}>x</button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <label>
                Plan Name
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Klarna - Nike Shoes"
                  required
                />
              </label>
              <label>
                Total Amount (optional)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.totalAmount}
                  onChange={(e) => setForm((p) => ({ ...p, totalAmount: e.target.value }))}
                  placeholder="Total cost (optional)"
                />
              </label>

              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginTop: 8 }}>Payments</div>
              {form.payments.map((p, i) => (
                <div key={i} className="pp-payment-row">
                  {p.paid ? (
                    <span style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "line-through" }}>
                      {fmtDate(p.date)} — {currency.format(Number(p.amount) || 0)} (paid)
                    </span>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Payment {i + 1}</span>
                        <button type="button" className="ghost-button" style={{ padding: "2px 8px", fontSize: 12, height: 24 }} onClick={() => removePaymentRow(i)}>×</button>
                      </div>
                      <div className="pp-payment-fields">
                        <label style={{ flex: "1 1 55%", minWidth: 0 }}>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Date</span>
                          <input
                            type="date"
                            value={p.date}
                            onChange={(e) => handlePaymentChange(i, "date", e.target.value)}
                            required
                            style={{ width: "100%" }}
                          />
                        </label>
                        <label style={{ flex: "1 1 40%", minWidth: 0 }}>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Amount</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="$0.00"
                            value={p.amount}
                            onChange={(e) => handlePaymentChange(i, "amount", e.target.value)}
                            required
                            style={{ width: "100%" }}
                          />
                        </label>
                      </div>
                    </>
                  )}
                </div>
              ))}
              <button type="button" className="link-button" style={{ fontSize: 13, color: "var(--teal)" }} onClick={addPaymentRow}>+ Add Payment</button>

              {error && <div className="inline-error">{error}</div>}
              <button type="submit" className="primary-button" style={{ width: "100%" }} disabled={saving}>
                {saving ? "Saving..." : editingPlan ? "Save Changes" : "Save Payment Plan"}
              </button>
              <button type="button" className="link-button" style={{ textAlign: "center", width: "100%", fontSize: 13 }} onClick={() => setShowModal(false)}>Cancel</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentPlans;
