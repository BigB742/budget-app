import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";
import { currency } from "../utils/currency";

// ═══════════════════════════════════════════════════════════════════
// Savings page — Phase 3 redesign
// ═══════════════════════════════════════════════════════════════════
// Layout:
//   1. Header: title + subtitle + "Add Goal" button
//   2. Total Saved card: the one big number
//   3. Goals list: one horizontal progress-bar card per goal
//
// Every goal bar gets the same full-card width. Fill % is calculated
// against that goal's own target, so a $50 / $100 goal and a
// $5,000 / $10,000 goal both show as 50% filled. Comparing goals to
// each other is not the product intent — progress toward your own
// target is.
// ═══════════════════════════════════════════════════════════════════

const Skeleton = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        borderRadius: 12,
        padding: 20,
        height: 140,
        opacity: 0.5,
        animation: "pp-fade-in 280ms ease-out",
      }}>
        <div style={{ height: 14, width: "40%", background: "var(--card-2)", borderRadius: 4, marginBottom: 18 }} />
        <div style={{ height: 12, width: "100%", background: "var(--card-2)", borderRadius: 6, marginBottom: 16 }} />
        <div style={{ height: 12, width: "30%", background: "var(--card-2)", borderRadius: 4 }} />
      </div>
    ))}
  </div>
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header"><h4>New savings goal</h4></div>
        <form className="modal-form" onSubmit={submit}>
          <label>
            Goal name
            <input type="text" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder="Vacation fund" autoFocus required />
          </label>
          <label>
            Target amount <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span>
            <input type="number" step="0.01" min="0" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0.00" />
          </label>
          {error && <div className="inline-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Creating…" : "Create goal"}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Add / Withdraw modal ──────────────────────────────────────────
const AmountModal = ({ goal, mode, onClose, onDone }) => {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const title = mode === "deposit" ? `Add to ${goal.name}` : `Withdraw from ${goal.name}`;
  const cta = mode === "deposit" ? "Add" : "Withdraw";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setError("Enter a positive amount."); return; }
    if (mode === "withdraw" && n > (goal.currentBalance || 0)) {
      setError(`You can withdraw up to ${currency.format(goal.currentBalance || 0)}.`);
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header"><h4>{title}</h4></div>
        <form className="modal-form" onSubmit={submit}>
          <label>
            Amount
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus required />
          </label>
          {mode === "withdraw" && (
            <span style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -4 }}>
              Available: {currency.format(goal.currentBalance || 0)}
            </span>
          )}
          {error && <div className="inline-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : cta}</button>
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header"><h4>Delete this goal?</h4></div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
          {hasMoney
            ? `This goal has ${currency.format(balance)} in it. What should happen to that money?`
            : "Are you sure you want to delete this goal? This cannot be undone."}
        </div>
        {error && <div className="inline-error" style={{ marginBottom: 12 }}>{error}</div>}
        {hasMoney ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" className="primary-button" style={{ width: "100%" }} disabled={saving} onClick={() => doDelete(true)}>
              Withdraw and delete
            </button>
            <button type="button" disabled={saving} onClick={() => doDelete(false)} style={{
              width: "100%", padding: "12px 20px", borderRadius: 10, border: "1px solid #ef4444",
              background: "transparent", color: "#ef4444", fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", fontSize: 14,
            }}>
              Delete only
            </button>
            <button type="button" className="ghost-button" style={{ width: "100%" }} disabled={saving} onClick={onClose}>Cancel</button>
          </div>
        ) : (
          <div className="modal-actions">
            <button type="button" className="ghost-button" disabled={saving} onClick={onClose}>Cancel</button>
            <button type="button" disabled={saving} onClick={() => doDelete(false)} style={{
              padding: "10px 18px", borderRadius: 10, border: "1px solid #ef4444",
              background: "transparent", color: "#ef4444", fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", fontSize: 14,
            }}>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Edit Target modal ─────────────────────────────────────────────
const TargetModal = ({ goal, onClose, onDone }) => {
  const [target, setTarget] = useState(goal.targetAmount != null ? String(goal.targetAmount) : "");
  const [saving, setSaving] = useState(false);
  const max = Math.max((goal.currentBalance || 0) * 5, 1000);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const n = target === "" ? null : Number(target);
      const updated = await authFetch(`/api/savings/goals/${goal._id}`, {
        method: "PATCH",
        body: JSON.stringify({ targetAmount: n }),
      });
      onDone(updated);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header"><h4>Set target for {goal.name}</h4></div>
        <form className="modal-form" onSubmit={submit}>
          <label>
            Target amount
            <input type="number" step="0.01" min="0" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0.00" autoFocus />
          </label>
          <input
            type="range"
            min="0"
            max={max}
            step="10"
            value={Number(target) || 0}
            onChange={(e) => setTarget(e.target.value)}
            style={{ width: "100%", accentColor: "var(--teal)" }}
          />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Leave blank to clear the target.
          </span>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
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
    <div className="sv-card">
      {/* Top row: name + overflow menu */}
      <div className="sv-top-row">
        {editingName ? (
          <input
            className="sv-name-input"
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
          <button type="button" className="sv-name" onClick={() => setEditingName(true)} title="Click to rename">
            {goal.name}
          </button>
        )}
        <div className="sv-menu-wrap" ref={menuRef}>
          <button type="button" className="sv-menu-trigger" onClick={() => setMenuOpen((v) => !v)} aria-label="Goal options">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div className="sv-menu">
              <button type="button" onClick={() => { setMenuOpen(false); onEditTarget(goal); }}>Edit target</button>
              <button type="button" onClick={() => { setMenuOpen(false); onDelete(goal); }}>Delete goal</button>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="sv-bar-wrap">
        <div className="sv-bar">
          {hasTarget ? (
            <div className="sv-bar-fill" style={{ width: `${pct}%` }} />
          ) : (
            <button type="button" className="sv-set-target-btn" onClick={() => onEditTarget(goal)}>
              Set target
            </button>
          )}
        </div>
        {reached && <span className="sv-reached-badge">Goal reached</span>}
      </div>

      {/* Bottom row: balance + target + actions */}
      <div className="sv-bottom-row">
        <div className="sv-amounts">
          <span className="sv-current">{currency.format(balance)}</span>
          {hasTarget ? (
            <button type="button" className="sv-target-btn" onClick={() => onEditTarget(goal)}>
              of {currency.format(target)}
            </button>
          ) : (
            <span className="sv-no-target">No target set</span>
          )}
        </div>
        <div className="sv-actions">
          <button type="button" className="sv-btn sv-btn-add" onClick={() => onDeposit(goal)}>Add</button>
          {balance > 0 && (
            <button type="button" className="sv-btn sv-btn-withdraw" onClick={() => onWithdraw(goal)}>Withdraw</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Page ──────────────────────────────────────────────────────────
const Savings = () => {
  const cache = useDataCache();
  const [goals, setGoals] = useState(null);
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [amountModal, setAmountModal] = useState(null); // { goal, mode }
  const [deleteModal, setDeleteModal] = useState(null); // goal
  const [targetModal, setTargetModal] = useState(null); // goal

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
    <div className="savings-page-v2">
      {/* Header */}
      <div className="sv-header">
        <div>
          <h1 className="sv-title">Savings</h1>
          <p className="sv-subtitle">Track your goals and watch progress build.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => setNewGoalOpen(true)}>Add goal</button>
      </div>

      {/* Total Saved card */}
      <div className="sv-total-card">
        <span className="sv-total-label">TOTAL SAVED</span>
        <span className="sv-total-value">{currency.format(totalSaved)}</span>
      </div>

      {/* Goals list */}
      {goals === null ? (
        <Skeleton />
      ) : goals.length === 0 ? (
        <div className="sv-empty">
          <p>You have no savings goals yet. Click Add goal to create your first one.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

      {/* Modals */}
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
          onDone={(updated) => {
            replaceGoal(updated);
            setAmountModal(null);
            cache?.fetchSummary?.(true);
          }}
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
      {targetModal && (
        <TargetModal
          goal={targetModal}
          onClose={() => setTargetModal(null)}
          onDone={(updated) => { replaceGoal(updated); setTargetModal(null); }}
        />
      )}
    </div>
  );
};

export default Savings;
