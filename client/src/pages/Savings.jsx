import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";
import { currency } from "../utils/currency";
import PageContainer from "../components/PageContainer";

// ═══════════════════════════════════════════════════════════════════
// Savings — Phase 4 web-first rebuild
// ═══════════════════════════════════════════════════════════════════
// Desktop: full-width header (title left, Add goal right), full-width
// Total Saved card, 2-column grid of goal cards. Every bar is the same
// visual width; fill percentage is relative to that goal's own target.
// ═══════════════════════════════════════════════════════════════════

// ─── Skeleton ──────────────────────────────────────────────────────
const Skeleton = () => (
  <div className="sv-p4-grid">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="sv-p4-skeleton" />
    ))}
  </div>
);

// ─── Three dots icon ───────────────────────────────────────────────
const DotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </svg>
);

// ─── New Goal modal ────────────────────────────────────────────────
const NewGoalModal = ({ onClose, onCreated }) => {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Give your goal a name."); return; }
    setSaving(true);
    try {
      const body = { name: name.trim() };
      if (target) body.targetAmount = Number(target);
      const created = await authFetch("/api/savings/goals", { method: "POST", body: JSON.stringify(body) });
      onCreated(created);
    } catch (err) {
      setError(err?.message || "Could not create goal.");
    } finally { setSaving(false); }
  };

  return (
    <div className="p4-modal-overlay" onClick={onClose}>
      <div className="p4-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="p4-modal-title">New savings goal</h2>
        <form onSubmit={submit}>
          <div className="p4-field">
            <label className="p4-field-label" htmlFor="sv-name">Goal name</label>
            <input
              id="sv-name"
              className="p4-field-input"
              type="text"
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vacation fund"
              autoFocus
              required
            />
          </div>
          <div className="p4-field">
            <label className="p4-field-label" htmlFor="sv-target">Target</label>
            <input
              id="sv-target"
              className="p4-field-input"
              type="number"
              step="0.01"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0.00"
            />
            <span className="p4-field-help">Leave blank to set later.</span>
          </div>
          {error && <p className="p4-field-error">{error}</p>}
          <div className="p4-modal-actions">
            <button type="button" className="p4-btn p4-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="p4-btn p4-btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create goal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Amount modal (deposit / withdraw) ─────────────────────────────
const AmountModal = ({ goal, mode, onClose, onDone }) => {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const title = mode === "deposit" ? `Add to ${goal.name}` : `Withdraw from ${goal.name}`;
  const cta = mode === "deposit" ? "Add" : "Withdraw";
  const balance = goal.currentBalance || 0;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setError("Enter a positive amount."); return; }
    if (mode === "withdraw" && n > balance) {
      setError(`You can withdraw up to ${currency.format(balance)}.`);
      return;
    }
    setSaving(true);
    try {
      const endpoint = mode === "deposit" ? "deposit" : "withdraw";
      const updated = await authFetch(`/api/savings/goals/${goal._id}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({ amount: n }),
      });
      onDone(updated);
    } catch (err) {
      setError(err?.message || "Could not save.");
    } finally { setSaving(false); }
  };

  return (
    <div className="p4-modal-overlay" onClick={onClose}>
      <div className="p4-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="p4-modal-title">{title}</h2>
        <form onSubmit={submit}>
          <div className="p4-field">
            <label className="p4-field-label" htmlFor="sv-amt">Amount</label>
            <input
              id="sv-amt"
              className="p4-field-input"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
              required
            />
            {mode === "withdraw" && (
              <span className="p4-field-help">Available: {currency.format(balance)}</span>
            )}
          </div>
          {error && <p className="p4-field-error">{error}</p>}
          <div className="p4-modal-actions">
            <button type="button" className="p4-btn p4-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="p4-btn p4-btn-primary" disabled={saving}>{saving ? "Saving…" : cta}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Edit target modal ────────────────────────────────────────────
const TargetModal = ({ goal, onClose, onDone }) => {
  const [target, setTarget] = useState(goal.targetAmount != null ? String(goal.targetAmount) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const n = target === "" ? null : Number(target);
      if (n !== null && (!Number.isFinite(n) || n < 0)) {
        setError("Enter a positive number or leave blank.");
        setSaving(false);
        return;
      }
      const updated = await authFetch(`/api/savings/goals/${goal._id}`, {
        method: "PATCH",
        body: JSON.stringify({ targetAmount: n }),
      });
      onDone(updated);
    } catch (err) {
      setError(err?.message || "Could not save.");
    } finally { setSaving(false); }
  };

  return (
    <div className="p4-modal-overlay" onClick={onClose}>
      <div className="p4-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="p4-modal-title">Set target for {goal.name}</h2>
        <form onSubmit={submit}>
          <div className="p4-field">
            <label className="p4-field-label" htmlFor="sv-tgt">Target</label>
            <input
              id="sv-tgt"
              className="p4-field-input"
              type="number"
              step="0.01"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
            <span className="p4-field-help">Leave blank to clear the target.</span>
          </div>
          {error && <p className="p4-field-error">{error}</p>}
          <div className="p4-modal-actions">
            <button type="button" className="p4-btn p4-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="p4-btn p4-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Delete confirmation modal ─────────────────────────────────────
const DeleteModal = ({ goal, onClose, onDone }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const balance = goal.currentBalance || 0;
  const hasMoney = balance > 0;

  const doDelete = async (withdraw) => {
    setSaving(true);
    setError("");
    try {
      await authFetch(`/api/savings/goals/${goal._id}?withdraw=${withdraw ? "true" : "false"}`, { method: "DELETE" });
      onDone();
    } catch (err) {
      setError(err?.message || "Could not delete.");
      setSaving(false);
    }
  };

  return (
    <div className="p4-modal-overlay" onClick={onClose}>
      <div className="p4-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="p4-modal-title">Delete this goal?</h2>
        <p className="p4-modal-body">
          {hasMoney
            ? `This goal has ${currency.format(balance)} in it. What should happen to that money?`
            : "Are you sure? This cannot be undone."}
        </p>
        {error && <p className="p4-field-error">{error}</p>}
        {hasMoney ? (
          <div className="p4-modal-actions-stack">
            <button type="button" className="p4-btn p4-btn-primary p4-btn-block" disabled={saving} onClick={() => doDelete(true)}>
              Withdraw and delete
            </button>
            <button type="button" className="p4-btn p4-btn-danger p4-btn-block" disabled={saving} onClick={() => doDelete(false)}>
              Delete only
            </button>
            <button type="button" className="p4-btn p4-btn-text p4-btn-block" disabled={saving} onClick={onClose}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="p4-modal-actions-stack">
            <button type="button" className="p4-btn p4-btn-danger p4-btn-block" disabled={saving} onClick={() => doDelete(false)}>
              Delete
            </button>
            <button type="button" className="p4-btn p4-btn-text p4-btn-block" disabled={saving} onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Goal card ─────────────────────────────────────────────────────
const GoalCard = ({ goal, onChanged, onDeposit, onWithdraw, onEditTarget, onDelete }) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(goal.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const balance = goal.currentBalance || 0;
  const target = goal.targetAmount;
  const hasTarget = target != null && target > 0;
  const pct = hasTarget ? Math.min(balance / target, 1) * 100 : 0;
  const reached = hasTarget && balance >= target;

  const commitName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === goal.name) { setEditingName(false); setNameDraft(goal.name); return; }
    try {
      const updated = await authFetch(`/api/savings/goals/${goal._id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      onChanged(updated);
    } catch { setNameDraft(goal.name); }
    setEditingName(false);
  };

  return (
    <div className="sv-p4-card">
      <div className="sv-p4-card-top">
        {editingName ? (
          <input
            className="sv-p4-name-input"
            value={nameDraft}
            maxLength={50}
            autoFocus
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") { setNameDraft(goal.name); setEditingName(false); }
            }}
          />
        ) : (
          <button type="button" className="sv-p4-name-btn" onClick={() => setEditingName(true)} title="Click to rename">
            {goal.name}
          </button>
        )}
        <div className="sv-p4-menu-wrap" ref={menuRef}>
          <button type="button" className="sv-p4-menu-trigger" onClick={() => setMenuOpen((v) => !v)} aria-label="Goal options">
            <DotsIcon />
          </button>
          {menuOpen && (
            <div className="sv-p4-menu">
              <button type="button" onClick={() => { setMenuOpen(false); onEditTarget(goal); }}>Edit target</button>
              <button type="button" onClick={() => { setMenuOpen(false); onDelete(goal); }}>Delete goal</button>
            </div>
          )}
        </div>
      </div>

      <div className="sv-p4-bar-row">
        <div className="sv-p4-bar">
          {hasTarget ? (
            <div className="sv-p4-bar-fill" style={{ width: `${pct}%` }} />
          ) : (
            <button type="button" className="sv-p4-set-target" onClick={() => onEditTarget(goal)}>Set target</button>
          )}
        </div>
        {reached && <span className="sv-p4-reached">Goal reached</span>}
      </div>

      <div className="sv-p4-balance-row">
        <span className="sv-p4-current">{currency.format(balance)}</span>
        {hasTarget ? (
          <button type="button" className="sv-p4-target-btn" onClick={() => onEditTarget(goal)}>
            of {currency.format(target)}
          </button>
        ) : (
          <span className="sv-p4-no-target">No target set</span>
        )}
      </div>

      <div className="sv-p4-actions">
        <button type="button" className="sv-p4-btn sv-p4-btn-add" onClick={() => onDeposit(goal)}>Add</button>
        {balance > 0 && (
          <button type="button" className="sv-p4-btn sv-p4-btn-withdraw" onClick={() => onWithdraw(goal)}>Withdraw</button>
        )}
      </div>
    </div>
  );
};

// ─── Page ──────────────────────────────────────────────────────────
const Savings = () => {
  const cache = useDataCache();
  const [goals, setGoals] = useState(null);
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [amountModal, setAmountModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [targetModal, setTargetModal] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await authFetch("/api/savings/goals");
      setGoals(Array.isArray(data) ? data : []);
    } catch { setGoals([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const replaceGoal = (updated) => {
    setGoals((prev) => (prev || []).map((g) => (g._id === updated._id ? updated : g)));
  };

  const totalSaved = (goals || []).reduce((s, g) => s + (g.currentBalance || 0), 0);

  return (
    <PageContainer>
      <div className="sv-p4">
        <header className="sv-p4-header">
          <div className="sv-p4-header-text">
            <h1 className="heading-display">Savings</h1>
            <p className="text-secondary">Track your goals and watch progress build.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => setNewGoalOpen(true)}>Add goal</button>
        </header>

        <section className="sv-p4-total">
          <span className="text-label">Total saved</span>
          <span className="sv-p4-total-value">{currency.format(totalSaved)}</span>
        </section>

        {goals === null ? (
          <Skeleton />
        ) : goals.length === 0 ? (
          <div className="sv-p4-empty">
            <p>You have no savings goals yet. Click Add goal to create your first one.</p>
          </div>
        ) : (
          <div className="sv-p4-grid">
            {goals.map((g) => (
              <GoalCard
                key={g._id}
                goal={g}
                onChanged={replaceGoal}
                onDeposit={(goal) => setAmountModal({ goal, mode: "deposit" })}
                onWithdraw={(goal) => setAmountModal({ goal, mode: "withdraw" })}
                onEditTarget={(goal) => setTargetModal(goal)}
                onDelete={(goal) => setDeleteModal(goal)}
              />
            ))}
          </div>
        )}
      </div>

      {newGoalOpen && (
        <NewGoalModal
          onClose={() => setNewGoalOpen(false)}
          onCreated={(g) => {
            setGoals((prev) => [...(prev || []), g]);
            setNewGoalOpen(false);
            cache?.fetchSummary?.(true);
          }}
        />
      )}
      {amountModal && (
        <AmountModal
          goal={amountModal.goal}
          mode={amountModal.mode}
          onClose={() => setAmountModal(null)}
          onDone={(updated) => { replaceGoal(updated); setAmountModal(null); cache?.fetchSummary?.(true); }}
        />
      )}
      {targetModal && (
        <TargetModal
          goal={targetModal}
          onClose={() => setTargetModal(null)}
          onDone={(updated) => { replaceGoal(updated); setTargetModal(null); }}
        />
      )}
      {deleteModal && (
        <DeleteModal
          goal={deleteModal}
          onClose={() => setDeleteModal(null)}
          onDone={() => {
            setGoals((prev) => (prev || []).filter((g) => g._id !== deleteModal._id));
            setDeleteModal(null);
            cache?.fetchSummary?.(true);
          }}
        />
      )}
    </PageContainer>
  );
};

export default Savings;
