import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { authFetch } from "../apiClient";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-";

const AdminPanel = () => {
  const user = (() => { try { return JSON.parse(localStorage.getItem("user")); } catch { return null; } })();
  const [tab, setTab] = useState("users");

  if (!user?.isAdmin && user?.email !== "admin@productoslaloma.com") return <Navigate to="/app" replace />;

  return (
    <div className="admin-page">
      <h1>Admin Panel</h1>
      <div className="admin-tabs">
        {["users", "billing", "flags", "tickets"].map((t) => (
          <button key={t} type="button" className={`s-pill${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "users" ? "Users" : t === "billing" ? "Billing" : t === "flags" ? "Feature Flags" : "Support Tickets"}
          </button>
        ))}
      </div>
      {tab === "users" && <UsersSection />}
      {tab === "billing" && <BillingSection />}
      {tab === "flags" && <FlagsSection />}
      {tab === "tickets" && <TicketsSection />}
    </div>
  );
};

// ── SECTION 1: Users ─────────────────────────────────────────────────────────

const UsersSection = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [tempPw, setTempPw] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await authFetch("/api/admin/users"); setUsers(Array.isArray(data) ? data : []); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || (u.email || "").toLowerCase().includes(q) || (u.firstName || "").toLowerCase().includes(q) || (u.lastName || "").toLowerCase().includes(q);
  });

  const handleResetPassword = async (userId) => {
    setTempPw("");
    try {
      const data = await authFetch("/api/admin/reset-password", { method: "POST", body: JSON.stringify({ userId }) });
      setTempPw(data.tempPassword || "");
    } catch { alert("Failed to reset password."); }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm("Permanently delete this user and ALL their data? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await authFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      setSelected(null);
      load();
    } catch { alert("Failed to delete user."); }
    finally { setDeleting(false); }
  };

  const planLabel = (s) => {
    if (s === "premium_monthly" || s === "premium_annual" || s === "premium") return "Premium";
    if (s === "trialing") return "Trial";
    return "Free";
  };

  return (
    <>
      <input type="text" placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="admin-search" />
      {loading ? <p className="status">Loading...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>DOB</th><th>Joined</th><th>Plan</th><th>Last login</th><th></th></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u._id}>
                  <td>{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td>{formatDate(u.dateOfBirth)}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td><span className={`admin-badge ${u.subscriptionStatus}`}>{planLabel(u.subscriptionStatus)}</span></td>
                  <td>{formatDate(u.lastLogin)}</td>
                  <td style={{ display: "flex", gap: "0.35rem" }}>
                    <button type="button" className="secondary-button" style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }} onClick={() => { setSelected(u); setTempPw(""); }}>View</button>
                    <button type="button" className="delete-button" style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }} onClick={() => handleDelete(u._id)} disabled={deleting}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => { setSelected(null); setTempPw(""); }}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>{selected.firstName} {selected.lastName}</h4><button type="button" className="ghost-button" onClick={() => { setSelected(null); setTempPw(""); }}>&#x2715;</button></div>
            <div className="admin-detail">
              <h5>Identity</h5>
              <div className="admin-detail-row"><span>Email</span><span>{selected.email}</span></div>
              <div className="admin-detail-row"><span>Phone</span><span>{selected.phone || "-"}</span></div>
              <div className="admin-detail-row"><span>Date of birth</span><span>{formatDate(selected.dateOfBirth)}</span></div>
              <div className="admin-detail-row"><span>Joined</span><span>{formatDate(selected.createdAt)}</span></div>

              <h5>Account</h5>
              <div className="admin-detail-row"><span>Plan</span><span>{selected.subscriptionStatus}</span></div>
              <div className="admin-detail-row"><span>Stripe ID</span><span>{selected.stripeCustomerId || "-"}</span></div>
              <div className="admin-detail-row"><span>Current balance</span><span>{currency.format(selected.currentBalance || 0)}</span></div>
              <div className="admin-detail-row"><span>Total savings</span><span>{currency.format(selected.totalSavings || 0)}</span></div>

              {selected.incomeSources?.length > 0 && (
                <>
                  <h5>Income ({selected.incomeSources.length})</h5>
                  {selected.incomeSources.map((s) => (
                    <div key={s._id} className="admin-detail-row"><span>{s.name} ({s.frequency})</span><span>{currency.format(s.amount)}</span></div>
                  ))}
                </>
              )}

              {selected.bills?.length > 0 && (
                <>
                  <h5>Bills ({selected.bills.length})</h5>
                  {selected.bills.map((b) => (
                    <div key={b._id} className="admin-detail-row"><span>{b.name} (day {b.dueDayOfMonth})</span><span>{currency.format(b.amount)}</span></div>
                  ))}
                </>
              )}

              {selected.savings?.length > 0 && (
                <>
                  <h5>Savings ({selected.savings.length})</h5>
                  {selected.savings.map((g) => (
                    <div key={g._id} className="admin-detail-row"><span>{g.name}</span><span>{currency.format(g.savedAmount || 0)}</span></div>
                  ))}
                </>
              )}

              {selected.expenses?.length > 0 && (
                <>
                  <h5>Recent Expenses (last 20)</h5>
                  {selected.expenses.map((e) => (
                    <div key={e._id} className="admin-detail-row"><span>{e.description || e.category} — {formatDate(e.date || e.createdAt)}</span><span>{currency.format(e.amount)}</span></div>
                  ))}
                </>
              )}

              <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--card-border)", display: "flex", gap: "0.5rem" }}>
                <button type="button" className="secondary-button" onClick={() => handleResetPassword(selected._id)}>Reset Password</button>
                <button type="button" className="delete-button" onClick={() => handleDelete(selected._id)} disabled={deleting}>{deleting ? "..." : "Delete Account"}</button>
              </div>
              {tempPw && <p style={{ marginTop: "0.5rem", fontSize: "0.88rem", fontWeight: 700, color: "var(--teal)" }}>Temporary password: {tempPw}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ── SECTION 2: Billing ───────────────────────────────────────────────────────

const BillingSection = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const d = await authFetch("/api/admin/billing"); setData(d); } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p className="status">Loading...</p>;
  if (!data) return <p className="status">Failed to load billing data.</p>;

  return (
    <div className="admin-billing">
      <div className="admin-billing-cards">
        <div className="admin-billing-card">
          <span className="admin-billing-label">Total Users</span>
          <span className="admin-billing-value">{data.total}</span>
        </div>
        <div className="admin-billing-card">
          <span className="admin-billing-label">Free</span>
          <span className="admin-billing-value">{data.free}</span>
        </div>
        <div className="admin-billing-card">
          <span className="admin-billing-label">Trial</span>
          <span className="admin-billing-value">{data.trialing}</span>
        </div>
        <div className="admin-billing-card">
          <span className="admin-billing-label">Premium</span>
          <span className="admin-billing-value" style={{ color: "var(--teal)" }}>{data.premium}</span>
        </div>
        <div className="admin-billing-card">
          <span className="admin-billing-label">Est. Monthly Revenue</span>
          <span className="admin-billing-value" style={{ color: "var(--accent)" }}>{currency.format(data.monthlyRevenue)}</span>
        </div>
      </div>
    </div>
  );
};

// ── SECTION 3: Feature Flags ─────────────────────────────────────────────────

const FlagsSection = () => {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await authFetch("/api/admin/feature-flags"); setFlags(Array.isArray(d) ? d : []); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (flag) => {
    try {
      await authFetch(`/api/admin/feature-flags/${flag._id}`, { method: "PUT", body: JSON.stringify({ enabled: !flag.enabled }) });
      load();
    } catch { /* ignore */ }
  };

  if (loading) return <p className="status">Loading...</p>;

  return (
    <div className="admin-flags">
      {flags.map((f) => (
        <label key={f._id} className="s-toggle-row" style={{ padding: "0.75rem 0" }}>
          <div>
            <span className="s-toggle-label">{f.label}</span>
            <span className="s-toggle-sub" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{f.key}</span>
          </div>
          <input type="checkbox" className="s-toggle" checked={f.enabled} onChange={() => toggle(f)} />
        </label>
      ))}
    </div>
  );
};

// ── SECTION 4: Support Tickets ───────────────────────────────────────────────

const TicketsSection = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await authFetch("/api/admin/support-tickets"); setTickets(Array.isArray(d) ? d : []); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (id) => {
    try { await authFetch(`/api/admin/support-tickets/${id}`, { method: "PUT", body: JSON.stringify({ status: "resolved" }) }); load(); } catch { /* ignore */ }
  };

  const handleReply = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      await authFetch(`/api/admin/support-tickets/${selected._id}/reply`, { method: "POST", body: JSON.stringify({ message: reply }) });
      setReply("");
      setSelected(null);
      load();
    } catch { alert("Failed to send reply."); }
    finally { setSending(false); }
  };

  if (loading) return <p className="status">Loading...</p>;

  return (
    <>
      {tickets.length === 0 ? <p className="empty-row">No support tickets yet.</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Date</th><th>Email</th><th>Subject</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t._id} className={t.status === "resolved" ? "resolved-row" : ""}>
                  <td>{formatDate(t.createdAt)}</td>
                  <td>{t.email}</td>
                  <td>{t.subject}</td>
                  <td><span className={`admin-badge ${t.status}`}>{t.status}</span></td>
                  <td style={{ display: "flex", gap: "0.35rem" }}>
                    <button type="button" className="secondary-button" style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }} onClick={() => { setSelected(t); setReply(""); }}>View</button>
                    {t.status === "open" && <button type="button" className="ghost-button" style={{ fontSize: "0.72rem" }} onClick={() => handleResolve(t._id)}>Resolve</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ticket detail / reply modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>{selected.subject}</h4><button type="button" className="ghost-button" onClick={() => setSelected(null)}>&#x2715;</button></div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.25rem" }}>{selected.email} — {formatDate(selected.createdAt)}</p>
            <p style={{ fontSize: "0.88rem", margin: "0.5rem 0 1rem", whiteSpace: "pre-wrap" }}>{selected.message}</p>
            {selected.status === "open" && (
              <div className="modal-form">
                <label>Reply via email<textarea rows="4" value={reply} onChange={(e) => setReply(e.target.value)} style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: "0.85rem", padding: "0.5rem", borderRadius: "var(--radius)", border: "1px solid var(--card-border)", background: "var(--bg)", color: "var(--text)" }} /></label>
                <div className="modal-actions">
                  <button type="button" className="ghost-button" onClick={() => setSelected(null)}>Cancel</button>
                  <button type="button" className="primary-button" disabled={!reply.trim() || sending} onClick={handleReply}>{sending ? "Sending..." : "Send & Resolve"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default AdminPanel;
