import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";
import { currency } from "../utils/currency";
import PageContainer from "../components/PageContainer";
import Modal from "../components/ui/Modal";
import PaidToggle from "../components/ui/PaidToggle";
import PlanForm, { emptyPlanValues, toPlanFormValues } from "../components/PlanForm";

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

  const handleSubmit = async (body) => {
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
    </PageContainer>
  );
};

export default PaymentPlans;
