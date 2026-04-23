import { useEffect, useState, useCallback } from "react";
import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";
import { currency } from "../utils/currency";

// "Did you pay this?" login prompt. Shows one-at-a-time for each
// overdue-and-unpaid bill or payment plan installment. Remembers which
// IDs have been prompted in localStorage so the same one never appears
// twice across refreshes or logins. Appears once per login session.

const SESSION_FLAG = "pp_overdueCheckShown";
const PROMPTED_KEY = "pp_overduePromptedIds";

const getPromptedIds = () => {
  try { return new Set(JSON.parse(localStorage.getItem(PROMPTED_KEY) || "[]")); } catch { return new Set(); }
};
const savePromptedIds = (set) => {
  try { localStorage.setItem(PROMPTED_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
};

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const todayYMD = () => {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};

const toYMD = (d) => {
  const dt = new Date(d);
  return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
};

const OverdueCheckModal = () => {
  const cache = useDataCache();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const buildQueue = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch bills, already-paid bill payments for this month, and payment plans
      const [bills, billPayments, plans, summary] = await Promise.all([
        authFetch("/api/bills").catch(() => []),
        (async () => {
          const now = new Date();
          const from = `${now.getFullYear()}-01-01`;
          const to = `${now.getFullYear()}-12-31`;
          return authFetch(`/api/bill-payments?from=${from}&to=${to}`).catch(() => []);
        })(),
        authFetch("/api/payment-plans").catch(() => []),
        cache?.summary ? Promise.resolve(cache.summary) : (cache?.fetchSummary?.() || Promise.resolve(null)),
      ]);

      const promptedIds = getPromptedIds();
      const cutoff = todayYMD();
      const periodStart = summary?.period?.start ? toYMD(summary.period.start) : 0;

      // Build set of paid bill-date keys so we can exclude bills already marked paid
      const paidBillKeys = new Set();
      (Array.isArray(billPayments) ? billPayments : []).forEach((bp) => {
        if (!bp.dueDate) return;
        const key = `${bp.bill}_${toYMD(bp.dueDate)}`;
        paidBillKeys.add(key);
      });

      const items = [];

      // Bills: due date is this month's dueDayOfMonth. Check if overdue (past or today) AND not already paid for this period.
      (Array.isArray(bills) ? bills : []).forEach((b) => {
        const day = b.dueDayOfMonth || b.dueDay;
        if (!day) return;
        const now = new Date();
        const thisMonthDue = new Date(now.getFullYear(), now.getMonth(), day);
        const dueYMD = toYMD(thisMonthDue);
        // Only consider bills due in the current period range up to today
        if (dueYMD > cutoff) return;
        if (periodStart && dueYMD < periodStart) return;
        const key = `bill_${b._id}_${dueYMD}`;
        if (promptedIds.has(key)) return;
        if (paidBillKeys.has(`${b._id}_${dueYMD}`)) return;
        items.push({
          id: key,
          kind: "bill",
          refId: b._id,
          dueDateISO: `${thisMonthDue.getFullYear()}-${String(thisMonthDue.getMonth() + 1).padStart(2, "0")}-${String(thisMonthDue.getDate()).padStart(2, "0")}`,
          dueDateDisplay: fmtDate(thisMonthDue),
          name: b.name,
          amount: b.amount,
          sortKey: dueYMD,
        });
      });

      // Payment plan installments: overdue unpaid
      (Array.isArray(plans) ? plans : []).forEach((plan) => {
        (plan.payments || []).forEach((p) => {
          if (p.paid) return;
          if (!p.date) return;
          const dueYMD = toYMD(p.date);
          if (dueYMD > cutoff) return;
          const key = `plan_${plan._id}_${p.id}`;
          if (promptedIds.has(key)) return;
          items.push({
            id: key,
            kind: "plan",
            planId: plan._id,
            paymentId: p.id,
            dueDateDisplay: fmtDate(p.date),
            name: plan.name,
            amount: p.amount,
            sortKey: dueYMD,
          });
        });
      });

      items.sort((a, b) => a.sortKey - b.sortKey);
      setQueue(items);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [cache]);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_FLAG)) return;
    sessionStorage.setItem(SESSION_FLAG, "1");
    buildQueue();
  }, [buildQueue]);

  const markPrompted = (id) => {
    const s = getPromptedIds();
    s.add(id);
    savePromptedIds(s);
  };

  const handleYes = async () => {
    const current = queue[0];
    if (!current || saving) return;
    setSaving(true);
    try {
      if (current.kind === "bill") {
        const today = new Date();
        const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        await authFetch("/api/bill-payments", {
          method: "POST",
          body: JSON.stringify({
            billId: current.refId,
            dueDate: current.dueDateISO,
            paidDate: todayISO,
            paidAmount: current.amount,
            note: "",
          }),
        });
      } else if (current.kind === "plan") {
        await authFetch(`/api/payment-plans/${current.planId}/payments/${current.paymentId}`, { method: "PATCH" });
      }
      markPrompted(current.id);
      setQueue((q) => q.slice(1));
      cache?.fetchSummary?.(true);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleNo = () => {
    const current = queue[0];
    if (!current) return;
    markPrompted(current.id);
    setQueue((q) => q.slice(1));
  };

  if (loading) return null;
  const current = queue[0];
  if (!current) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h4>Did you pay this?</h4>
        </div>
        <div style={{ padding: "8px 0 20px" }}>
          <p style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", color: "var(--text)" }}>{current.name}</p>
          <p style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px", color: "var(--red)" }}>{currency.format(current.amount)}</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Due {current.dueDateDisplay}</p>
        </div>
        <div className="modal-actions" style={{ flexDirection: "column", gap: 8 }}>
          <button type="button" className="primary-button" style={{ width: "100%" }} disabled={saving} onClick={handleYes}>
            {saving ? "Saving..." : "Yes, I paid it"}
          </button>
          <button type="button" className="ghost-button" style={{ width: "100%" }} disabled={saving} onClick={handleNo}>
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverdueCheckModal;
