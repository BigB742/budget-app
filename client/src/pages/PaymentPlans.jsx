import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";
import { currency } from "../utils/currency";
import PageContainer from "../components/PageContainer";
import Modal from "../components/ui/Modal";
import PaidToggle from "../components/ui/PaidToggle";
import PlanForm from "../components/PlanForm";
import { emptyPlanValues, toPlanFormValues } from "../components/planFormValues";
import PaymentStatusModal from "../components/PaymentStatusModal";

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

// onboardingDate as YMD integer, read from the cached user profile.
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

// Convert a YYYY-MM-DD form input to a YMD integer.
const ymdFromIso = (iso) => {
  if (!iso || typeof iso !== "string") return null;
  const parts = iso.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return parts[0] * 10000 + parts[1] * 100 + parts[2];
};

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

const PaymentPlans = () => {
  const cache = useDataCache();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ mode: "closed" });
  const [saving, setSaving] = useState(false);
  // Sequential per-installment PaymentStatusModal queue. Holds the
  // pending plan body, an index into payments[] for the next prompt,
  // and the running list of installment overrides (paid/paidDate/
  // accountedFor) the user has selected so far.
  const [planPrompt, setPlanPrompt] = useState(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authFetch("/api/payment-plans");
      setPlans(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const openAdd = () => setDialog({ mode: "create" });
  const openEdit = (plan) => setDialog({ mode: "edit", plan });
  const closeDialog = () => setDialog({ mode: "closed" });

  // Persist a plan body to the API. Used both for direct save (no
  // past installments needing the modal) and as the final step of
  // the sequential prompt walk.
  const persistPlan = async (body) => {
    setSaving(true);
    try {
      if (dialog.mode === "edit") {
        await authFetch(`/api/payment-plans/${dialog.plan._id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await authFetch("/api/payment-plans", { method: "POST", body: JSON.stringify(body) });
      }
      closeDialog();
      loadPlans();
      cache?.fetchSummary?.(true);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  // Apply a chosen status onto a single installment in the body's
  // payments[] array. Returns a new body without mutating the input.
  const applyStatusToPayment = (body, idx, status) => {
    const next = body.payments.map((p, i) => {
      if (i !== idx) return p;
      if (status === "unpaid") {
        return { ...p, paid: false, paidDate: undefined, accountedFor: false };
      }
      if (status === "paid_deduct") {
        return { ...p, paid: true, paidDate: p.date, accountedFor: false };
      }
      // paid_accounted
      return { ...p, paid: true, paidDate: p.date, accountedFor: true };
    });
    return { ...body, payments: next };
  };

  // Walk past-or-today installments one at a time, opening
  // PaymentStatusModal for each. After the last, POST the plan with
  // the collected overrides. Cancel mid-sequence aborts the whole
  // save (no partial plan written).
  const advancePromptQueue = (body, queue, queueIdx) => {
    if (queueIdx >= queue.length) {
      persistPlan(body);
      setPlanPrompt(null);
      return;
    }
    const targetIdx = queue[queueIdx];
    const installment = body.payments[targetIdx];
    setPlanPrompt({
      body,
      queue,
      queueIdx,
      installment,
      planName: body.name,
      onChosen: (status) => {
        const nextBody = applyStatusToPayment(body, targetIdx, status);
        advancePromptQueue(nextBody, queue, queueIdx + 1);
      },
      onCancel: () => setPlanPrompt(null),
    });
  };

  const handleSubmit = async (body) => {
    // For edits, skip the prompt flow — the user is amending an
    // existing plan via the inline form, not declaring fresh state.
    if (dialog.mode === "edit") {
      await persistPlan(body);
      return;
    }
    // Find unpaid installments whose scheduled date is in
    // [onboardingDate, today]. Pre-onboarding and future installments
    // save with default flags (no prompt).
    const onboardYMD = readOnboardingYMD();
    const tYMD = todayYMDLA();
    const queue = [];
    body.payments.forEach((p, i) => {
      if (p.paid) return; // already-paid installments skip the prompt
      const ymd = ymdFromIso(p.date);
      if (ymd == null) return;
      if (onboardYMD && ymd < onboardYMD) return;
      if (ymd > tYMD) return;
      queue.push(i);
    });
    if (queue.length === 0) {
      await persistPlan(body);
      return;
    }
    advancePromptQueue(body, queue, 0);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this plan?")) return;
    try {
      await authFetch(`/api/payment-plans/${id}`, { method: "DELETE" });
      loadPlans();
      cache?.fetchSummary?.(true);
    } catch { /* ignore */ }
  };

  const togglePaid = async (planId, paymentId, nextPaid) => {
    // §7 canonical endpoint — both paths end in the same togglePaymentPaid
    // helper so paidEarly stays correct.
    await authFetch(`/api/payment-plans/${planId}/payments/${paymentId}/paid`, {
      method: "PATCH",
      body: JSON.stringify({ paid: nextPaid }),
    });
    loadPlans();
    cache?.fetchSummary?.(true);
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
                    .map((p) => {
                      const label = `${plan.name} payment, ${currency.format(p.amount)}, due ${fmtDate(p.date)}`;
                      return (
                        <div key={p.id} className="pp5-row" style={{ padding: "16px 0" }}>
                          <div className="pp5-row-primary" style={{
                            color: p.paid ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                          }}>
                            {fmtDate(p.date)}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                            <span className={`pp5-row-amount pp-amount${p.paid ? " pp-amount--paid" : ""}`}>
                              {currency.format(p.amount)}
                            </span>
                            <PaidToggle
                              paid={!!p.paid}
                              label={label}
                              onToggle={() => togglePaid(plan._id, p.id, !p.paid)}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        key={dialog.mode === "edit" ? `edit-${dialog.plan._id}` : dialog.mode}
        isOpen={dialog.mode !== "closed"}
        onClose={closeDialog}
        titleId="plan-dialog-title"
        size="lg"
      >
        <div className="pp5-modal-header">
          <h2 id="plan-dialog-title" className="pp5-modal-title">
            {dialog.mode === "edit" ? "Edit payment plan" : "New payment plan"}
          </h2>
          <button type="button" className="pp5-modal-close" onClick={closeDialog} aria-label="Close">×</button>
        </div>
        <PlanForm
          initialValues={dialog.mode === "edit" ? toPlanFormValues(dialog.plan) : emptyPlanValues()}
          editing={dialog.mode === "edit"}
          onSubmit={handleSubmit}
          onCancel={closeDialog}
          saving={saving}
        />
      </Modal>

      <PaymentStatusModal
        isOpen={!!planPrompt}
        onClose={() => planPrompt?.onCancel?.()}
        onSelect={(status) => planPrompt?.onChosen?.(status)}
        itemName={planPrompt ? `${planPrompt.planName} — ${currency.format(Number(planPrompt.installment?.amount) || 0)}` : ""}
        itemAmount={Number(planPrompt?.installment?.amount) || 0}
        itemDueDate={planPrompt?.installment?.date || null}
        itemKind="plan_installment"
      />
    </PageContainer>
  );
};

export default PaymentPlans;
