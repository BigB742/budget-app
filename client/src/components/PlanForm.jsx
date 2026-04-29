import { useState } from "react";
import { currency } from "../utils/currency";

const fmtUTCDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

// Value factories (emptyPlanValues / toPlanFormValues) live in
// ./planFormValues.js so fast-refresh can treat this file as pure
// component exports.

export default function PlanForm({ initialValues, editing, onSubmit, onCancel, saving }) {
  const [form, setForm] = useState(initialValues);
  const [error, setError] = useState("");

  const handlePaymentChange = (idx, field, value) => {
    setForm((prev) => {
      const next = [...prev.payments];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, payments: next };
    });
  };
  const addPaymentRow = () =>
    setForm((p) => ({ ...p, payments: [...p.payments, { date: "", amount: "" }] }));
  const removePaymentRow = (idx) =>
    setForm((p) => ({ ...p, payments: p.payments.filter((_, i) => i !== idx) }));
  const duplicatePaymentRow = (idx) =>
    setForm((p) => {
      const src = p.payments[idx];
      const copy = { date: "", amount: src?.amount || "" };
      const next = [...p.payments];
      next.splice(idx + 1, 0, copy);
      return { ...p, payments: next };
    });

  const handleSubmit = (e) => {
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
    const computedTotal = form.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    onSubmit({
      name: form.name.trim(),
      totalAmount: computedTotal,
      // Pass paid / paidDate / accountedFor through if the parent set
      // them via the PaymentStatusModal flow. The plan POST forwards
      // these per installment so the engine sees the right state.
      payments: form.payments.map((p) => ({
        id: p.id,
        date: p.date,
        amount: Number(p.amount),
        paid: !!p.paid,
        paidDate: p.paidDate || undefined,
        accountedFor: p.accountedFor === true,
      })),
    });
  };

  return (
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
              {fmtUTCDate(p.date)}, {currency.format(Number(p.amount) || 0)} (paid)
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
        <button type="button" className="pp5-btn pp5-btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="pp5-btn pp5-btn-primary" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save plan"}
        </button>
      </div>
    </form>
  );
}
