import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";
import { formatDate } from "../utils/dateUtils";
import { useSubscription } from "../hooks/useSubscription";
import { useToast } from "../context/ToastContext";
import FreeLimitModal from "../components/FreeLimitModal";
import { currency } from "../utils/currency";
import PageContainer from "../components/PageContainer";
import AnimatedNumber from "../components/AnimatedNumber";
import Modal from "../components/ui/Modal";
import BillForm, { emptyBillValues, toBillFormValues } from "../components/BillForm";

const Bills = () => {
  const { isFree } = useSubscription();
  const toast = useToast();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limitModal, setLimitModal] = useState(null);
  // Discriminated dialog state. `mode` determines which view the modal
  // carries; the bill payload for edits rides on the same object.
  const [dialog, setDialog] = useState({ mode: "closed" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await authFetch("/api/bills");
      setBills([...(b || [])].sort((a, b2) => (a.dueDayOfMonth || 0) - (b2.dueDayOfMonth || 0)));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    if (isFree && bills.length >= 5) { setLimitModal("bills"); return; }
    setDialog({ mode: "create" });
  };
  const openEdit = (bill) => setDialog({ mode: "edit", bill });
  const closeDialog = () => setDialog({ mode: "closed" });

  const handleSave = async (payload) => {
    setSaving(true);
    try {
      const isEdit = dialog.mode === "edit";
      const wasFirst = !isEdit && bills.length === 0;
      if (isEdit) {
        await authFetch(`/api/bills/${dialog.bill._id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await authFetch("/api/bills", { method: "POST", body: JSON.stringify(payload) });
      }
      closeDialog();
      load();
      if (wasFirst) toast?.showToast?.("First bill saved. PayPulse will track this every month.");
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this bill?")) return;
    try { await authFetch(`/api/bills/${id}`, { method: "DELETE" }); load(); } catch {}
  };

  const monthlyObligations = bills.reduce((s, b) => s + Number(b.amount || 0), 0);

  return (
    <PageContainer>
      <div className="pp5-page-header">
        <h1 className="type-display">Bills</h1>
        <p className="pp5-page-subtitle">Your recurring obligations.</p>
      </div>

      <section className="pp5-card-xl has-inset-highlight" style={{ marginBottom: "var(--space-7)" }}>
        <div className="type-eyebrow" style={{ marginBottom: 12 }}>Total monthly payments</div>
        <div className="type-headline" style={{ color: "var(--color-semantic-negative)", fontVariantNumeric: "tabular-nums" }}>
          <AnimatedNumber value={monthlyObligations} />
        </div>
        {bills.length > 0 && (
          <div className="type-secondary" style={{ marginTop: 8 }}>
            {bills.length} {bills.length === 1 ? "bill" : "bills"}
          </div>
        )}
      </section>

      <section className="pp5-section">
        <div className="pp5-section-header">
          <h2 className="type-headline">Recurring bills</h2>
          <button type="button" className="pp5-btn pp5-btn-primary" onClick={openAdd}>Add bill</button>
        </div>

        {loading ? (
          <p className="pp5-empty">Loading…</p>
        ) : bills.length === 0 ? (
          <p className="pp5-empty">No bills yet.</p>
        ) : (
          <div className="pp5-list-card stagger-list">
            {bills.map((b) => (
              <div key={b._id} className="pp5-row">
                <div className="pp5-row-left">
                  <div className="pp5-row-primary">
                    {b.name}
                    {b.lastPaymentDate && <span className="pp5-pill pp5-pill-orange">Ends {formatDate(b.lastPaymentDate)}</span>}
                    {b.startDate && <span className="pp5-pill pp5-pill-neutral">From {formatDate(b.startDate)}</span>}
                  </div>
                  <div className="pp5-row-secondary">Due day {b.dueDayOfMonth} · {b.category}</div>
                </div>
                <div className="pp5-row-right">
                  <span className="pp5-row-amount negative">{currency.format(b.amount)}</span>
                  <button type="button" className="pp5-icon-btn" onClick={() => openEdit(b)} title="Edit">Edit</button>
                  <button type="button" className="pp5-icon-btn destructive" onClick={() => handleDelete(b._id)} title="Remove">×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        key={dialog.mode === "edit" ? `edit-${dialog.bill._id}` : dialog.mode}
        isOpen={dialog.mode !== "closed"}
        onClose={closeDialog}
        titleId="bill-dialog-title"
        size="lg"
      >
        <div className="pp5-modal-header">
          <h2 id="bill-dialog-title" className="pp5-modal-title">
            {dialog.mode === "edit" ? "Edit bill" : "New bill"}
          </h2>
          <button type="button" className="pp5-modal-close" onClick={closeDialog} aria-label="Close">×</button>
        </div>
        <BillForm
          initialValues={dialog.mode === "edit" ? toBillFormValues(dialog.bill) : emptyBillValues()}
          editing={dialog.mode === "edit"}
          onSubmit={handleSave}
          onCancel={closeDialog}
          saving={saving}
        />
      </Modal>

      {limitModal && <FreeLimitModal type={limitModal} onClose={() => setLimitModal(null)} />}
    </PageContainer>
  );
};

export default Bills;
