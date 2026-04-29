import { useState } from "react";
import { authFetch } from "../apiClient";
import { useToast } from "../context/ToastContext";
import { useDataCache } from "../context/DataCache";
import { getFirstName } from "../utils/userHelpers";
import Modal from "./ui/Modal";
import PaymentStatusModal from "./PaymentStatusModal";

const CATEGORIES = [
  "Dining Out", "Entertainment", "Food", "Gas", "Groceries",
  "Gym", "Health", "Home", "Shopping", "Subscriptions", "Travel", "Other",
];

// LA-pinned today (y/m/d → integer key). Mirrors server resolveToday.
const todayYMDLA = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year").value);
  const m = Number(parts.find((p) => p.type === "month").value);
  const d = Number(parts.find((p) => p.type === "day").value);
  return y * 10000 + m * 100 + d;
};

const ymdFromIso = (iso) => {
  if (!iso || typeof iso !== "string") return null;
  const parts = iso.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return parts[0] * 10000 + parts[1] * 100 + parts[2];
};

const readOnboardingYMD = () => {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    if (!u?.onboardingDate) return null;
    const dt = new Date(u.onboardingDate);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
  } catch {
    return null;
  }
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const AddExpenseModal = ({ onClose, onSaved }) => {
  const toast = useToast();
  const cache = useDataCache();
  const [form, setForm] = useState({ date: todayISO(), description: "", amount: "", category: "Food" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusPrompt, setStatusPrompt] = useState(null);

  const isOther = form.category === "Other";
  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const persistExpense = async (paid, accountedFor) => {
    setSaving(true); setError("");
    try {
      await authFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          date: form.date,
          amount: Number(form.amount),
          category: form.category,
          description: form.description,
          paid,
          accountedFor,
        }),
      });
      try {
        const p = cache?.summary?.period;
        if (p?.start && p?.end) {
          const s = new Date(p.start);
          const e2 = new Date(p.end);
          const from = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
          const to = `${e2.getFullYear()}-${String(e2.getMonth() + 1).padStart(2, "0")}-${String(e2.getDate()).padStart(2, "0")}`;
          const res = await authFetch(`/api/expenses?from=${from}&to=${to}&excludeSavings=true&limit=2&page=1`);
          const count = res?.total ?? (Array.isArray(res) ? res.length : 0);
          if (count === 1) {
            const fn = getFirstName();
            toast?.showToast?.(`Period started. Stay on top of it${fn ? `, ${fn}` : ""}.`);
          }
        }
      } catch { /* non-critical */ }
      onSaved?.();
    } catch { setError("Failed to save expense."); }
    finally { setSaving(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    if (isOther && !form.description.trim()) { setError("Please specify what this expense is for."); return; }

    // Three-branch routing based on the expense date relative to the
    // user's tracking window:
    //   • before onboardingDate → save with accountedFor:true (history-
    //     only, excluded by the engine — no spendable impact)
    //   • inside [onboardingDate, today] → open PaymentStatusModal so
    //     the user picks unpaid / paid+deduct / paid+accounted
    //   • future → save with defaults (planning use case; not yet spent)
    const expenseYMD = ymdFromIso(form.date);
    const onboardYMD = readOnboardingYMD();
    const todayYMD = todayYMDLA();

    if (expenseYMD == null) {
      await persistExpense(undefined, false);
      return;
    }
    if (onboardYMD && expenseYMD < onboardYMD) {
      await persistExpense(true, true);
      return;
    }
    if (expenseYMD > todayYMD) {
      await persistExpense(undefined, false);
      return;
    }
    // In tracking window AND past-or-today → ask the user.
    setStatusPrompt({
      itemName: form.description.trim() || form.category || "Expense",
      itemAmount: Number(form.amount) || 0,
      itemDueDate: form.date,
      onChosen: async (status) => {
        setStatusPrompt(null);
        if (status === "unpaid") await persistExpense(false, false);
        else if (status === "paid_deduct") await persistExpense(true, false);
        else await persistExpense(true, true); // paid_accounted
      },
      onCancel: () => setStatusPrompt(null),
    });
  };

  return (
    <Modal isOpen onClose={onClose} titleId="add-expense-title" size="md">
      <div className="pp5-modal-header">
        <h2 id="add-expense-title" className="pp5-modal-title">Add expense</h2>
        <button type="button" className="pp5-modal-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <form className="pp5-modal-body" onSubmit={handleSubmit}>
          <div className="pp5-field">
            <label className="pp5-field-label">Date</label>
            <input className="pp5-input" type="date" name="date" value={form.date} onChange={handleChange} required />
          </div>
          <div className="pp5-field">
            <label className="pp5-field-label">Description</label>
            <input className="pp5-input" type="text" name="description" placeholder="e.g. Coffee, Lunch" value={form.description} onChange={handleChange} />
          </div>
          <div className="pp5-field">
            <label className="pp5-field-label">Amount</label>
            <input className="pp5-input" type="number" name="amount" step="0.01" min="0.01" placeholder="0.00" value={form.amount} onChange={handleChange} required />
          </div>
          <div className="pp5-field">
            <label className="pp5-field-label">Category</label>
            <select className="pp5-select" name="category" value={form.category} onChange={handleChange}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {isOther && (
            <div className="pp5-field">
              <label className="pp5-field-label">Specify (required)</label>
              <input className="pp5-input" type="text" name="description" placeholder="e.g. Birthday gift, parking, donation…" value={form.description} onChange={handleChange} required />
            </div>
          )}
          {error && <p className="pp5-field-error">{error}</p>}
          <div className="pp5-modal-actions">
            <button type="button" className="pp5-btn pp5-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="pp5-btn pp5-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save expense"}</button>
          </div>
        </form>
      <PaymentStatusModal
        isOpen={!!statusPrompt}
        onClose={() => statusPrompt?.onCancel?.()}
        onSelect={(status) => statusPrompt?.onChosen?.(status)}
        itemName={statusPrompt?.itemName || ""}
        itemAmount={statusPrompt?.itemAmount || 0}
        itemDueDate={statusPrompt?.itemDueDate || null}
        itemKind="expense"
      />
    </Modal>
  );
};

export default AddExpenseModal;
