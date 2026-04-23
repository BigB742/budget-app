import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";
import { currency } from "../utils/currency";
import PageContainer from "../components/PageContainer";

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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
        date: p.date ? (() => { const dt = new Date(p.date); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`; })() : "",
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
  const duplicatePaymentRow = (idx) => setForm((p) => {
    const src = p.payments[idx];
    const copy = { date: "", amount: src?.amount || "" };
    const next = [...p.payments];
    next.splice(idx + 1, 0, copy);
    return { ...p, payments: next };
  });

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
      const computedTotal = form.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const body = {
        name: form.name.trim(),
        totalAmount: computedTotal,
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
      setError(err?.message || "Couldn't save. Try again.");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this plan?")) return;
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

  const handleUnmarkPaid = async (planId, paymentId) => {
    try {
      await authFetch(`/api/payment-plans/${planId}/payments/${paymentId}`, { method: "PATCH", body: JSON.stringify({ paid: false }) });
      loadPlans();
      cache?.fetchSummary?.(true);
    } catch { /* ignore */ }
  };

  return (
    <PageContainer>
      <div className="pp5-page-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="type-display">Payment plans</h1>
          <p className="pp5-page-subtitle">Installment payment schedules.</p>
        </div>
        <button type="button" className="pp5-btn pp5-btn-primary" onClick={openAdd}>Add plan</button>
      </div>

      {loading ? (
        <p className="pp5-empty">Loading…</p>
      ) : plans.length === 0 ? (
        <p className="pp5-empty">No payment plans yet.</p>
      ) : (
        <div className="stagger-list" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {plans.map((plan) => {
            const remaining = plan.payments.filter((p) => !p.paid).length;
            const total = plan.payments.length;
            const paidCount = total - remaining;
            const pct = total > 0 ? (paidCount / total) * 100 : 0;
            return (
              <div key={plan._id} className="pp5-card-xl has-inset-highlight">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
                  <div>
                    <div className="type-title">{plan.name}</div>
                    <div className="type-secondary" style={{ marginTop: 4 }}>
                      {paidCount} of {total} payment{total !== 1 ? "s" : ""} paid
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button type="button" className="pp5-btn pp5-btn-teal" onClick={() => openEdit(plan)}>Edit</button>
                    <button type="button" className="pp5-btn pp5-btn-text" style={{ color: "var(--color-semantic-negative)" }} onClick={() => handleDelete(plan._id)}>Delete</button>
                  </div>
                </div>

                {total > 0 && (
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: "var(--color-bg-subtle)",
                      overflow: "hidden",
                      marginBottom: "var(--space-5)",
                    }}
                    aria-hidden="true"
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: "var(--color-accent-teal)",
                        transition: "width 400ms var(--ease-out-soft)",
                      }}
                    />
                  </div>
                )}

                <div>
                  {plan.payments
                    .slice()
                    .sort((a, b) => new Date(a.date) - new Date(b.date))
                    .map((p) => (
                      <div key={p.id} className="pp5-row" style={{ padding: "16px 0" }}>
                        <div className="pp5-row-primary" style={{
                          color: p.paid ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                          textDecoration: p.paid ? "line-through" : "none",
                        }}>
                          {fmtDate(p.date)}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span className="pp5-row-amount" style={{
                            color: p.paid ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                            textDecoration: p.paid ? "line-through" : "none",
                          }}>
                            {currency.format(p.amount)}
                          </span>
                          {!p.paid ? (
                            <button type="button" className="pp5-btn pp5-btn-teal" onClick={() => handleMarkPaid(plan._id, p.id)}>Mark paid</button>
                          ) : (
                            <button type="button" className="pp5-btn pp5-btn-text" onClick={() => handleUnmarkPaid(plan._id, p.id)}>Undo</button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="pp5-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pp5-modal pp5-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="pp5-modal-header">
              <h4 className="pp5-modal-title">{editingPlan ? "Edit payment plan" : "New payment plan"}</h4>
              <button type="button" className="pp5-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form className="pp5-modal-body" onSubmit={handleSubmit}>
              <div className="pp5-field">
                <label className="pp5-field-label">Plan name</label>
                <input
                  className="pp5-input"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Klarna, Nike shoes"
                  required
                />
              </div>

              <div className="type-eyebrow" style={{ marginTop: 8 }}>Payments</div>
              {form.payments.map((p, i) => (
                <div key={i} style={{ background: "var(--color-bg-elevated-2)", borderRadius: "var(--radius-md)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  {p.paid ? (
                    <span className="type-secondary" style={{ textDecoration: "line-through" }}>
                      {fmtDate(p.date)}, {currency.format(Number(p.amount) || 0)} (paid)
                    </span>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="type-caption" style={{ fontWeight: 600 }}>Payment {i + 1}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button type="button" className="pp5-btn pp5-btn-text pp5-btn-sm" onClick={() => duplicatePaymentRow(i)}>Duplicate</button>
                          <button type="button" className="pp5-btn pp5-btn-text pp5-btn-sm" onClick={() => removePaymentRow(i)}>Remove</button>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <div className="pp5-field" style={{ flex: "1 1 55%" }}>
                          <label className="pp5-field-label">Date</label>
                          <input className="pp5-input" type="date" value={p.date} onChange={(e) => handlePaymentChange(i, "date", e.target.value)} required />
                        </div>
                        <div className="pp5-field" style={{ flex: "1 1 40%" }}>
                          <label className="pp5-field-label">Amount</label>
                          <input className="pp5-input" type="number" step="0.01" min="0.01" placeholder="0.00" value={p.amount} onChange={(e) => handlePaymentChange(i, "amount", e.target.value)} required />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
              <button type="button" className="pp5-btn pp5-btn-teal" style={{ alignSelf: "flex-start" }} onClick={addPaymentRow}>Add payment</button>

              <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0 4px", borderTop: "1px solid var(--color-border-subtle)" }}>
                <span className="type-secondary">Total</span>
                <span className="type-subtitle" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {currency.format(form.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0))}
                </span>
              </div>

              {error && <p className="pp5-field-error">{error}</p>}
              <div className="pp5-modal-actions">
                <button type="button" className="pp5-btn pp5-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="pp5-btn pp5-btn-primary" disabled={saving}>
                  {saving ? "Saving…" : editingPlan ? "Save changes" : "Save plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default PaymentPlans;
