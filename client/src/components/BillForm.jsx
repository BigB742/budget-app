import { useState } from "react";
import { BILL_CATS } from "./billFormValues";

/**
 * Presentational bill form. Uses local useState seeded from
 * initialValues on mount — the parent re-mounts on open via key, so
 * defaults are always fresh.
 *
 * Value factories (emptyBillValues / toBillFormValues) live in
 * ./billFormValues.js so fast-refresh can treat this file as pure
 * component exports.
 */
export default function BillForm({ initialValues, editing, onSubmit, onCancel, saving }) {
  const [form, setForm] = useState(initialValues);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name: form.name,
      amount: Number(form.amount),
      dueDayOfMonth: Number(form.dueDay),
      category: form.category,
      startDate: form.startDate || null,
      lastPaymentDate: form.lastPaymentDate || null,
      lastPaymentAmount: form.lastPaymentAmount ? Number(form.lastPaymentAmount) : null,
    });
  };

  return (
    <form className="pp5-modal-body" onSubmit={handleSubmit}>
      <div className="pp5-field">
        <label className="pp5-field-label">Name</label>
        <input className="pp5-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
      </div>
      <div className="pp5-field">
        <label className="pp5-field-label">Amount</label>
        <input className="pp5-input" type="number" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required />
      </div>
      <div className="pp5-field">
        <label className="pp5-field-label">Due day of month</label>
        <input className="pp5-input" type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm((p) => ({ ...p, dueDay: e.target.value }))} required />
      </div>
      <div className="pp5-field">
        <label className="pp5-field-label">Category</label>
        <select className="pp5-select" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
          {BILL_CATS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="pp5-field">
        <label className="pp5-field-label">Start date</label>
        <input className="pp5-input" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
        <p className="pp5-field-help">Optional. When did this bill start?</p>
      </div>
      <div className="pp5-field">
        <label className="pp5-field-label">End date</label>
        <input className="pp5-input" type="date" value={form.lastPaymentDate} onChange={(e) => setForm((p) => ({ ...p, lastPaymentDate: e.target.value }))} />
        <p className="pp5-field-help">Optional. For payment plans or ending subscriptions.</p>
      </div>
      <div className="pp5-field">
        <label className="pp5-field-label">Final payment amount</label>
        <input className="pp5-input" type="number" step="0.01" value={form.lastPaymentAmount} onChange={(e) => setForm((p) => ({ ...p, lastPaymentAmount: e.target.value }))} placeholder="If different from regular amount" />
        <p className="pp5-field-help">Optional.</p>
      </div>
      <div className="pp5-modal-actions">
        <button type="button" className="pp5-btn pp5-btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="pp5-btn pp5-btn-primary" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Add bill"}
        </button>
      </div>
    </form>
  );
}
