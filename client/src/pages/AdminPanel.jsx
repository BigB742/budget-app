import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { authFetch } from "../apiClient";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const AdminPanel = () => {
  const user = (() => { try { return JSON.parse(localStorage.getItem("user")); } catch { return null; } })();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [tempPw, setTempPw] = useState("");

  if (!user?.isAdmin) return <Navigate to="/app" replace />;

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

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-";

  return (
    <div className="admin-page">
      <h1>Admin Panel</h1>
      <input type="text" placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="admin-search" />

      {loading ? <p className="status">Loading...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Plan</th></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u._id} onClick={() => setSelected(u)} className={selected?._id === u._id ? "active" : ""}>
                  <td>{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td>{u.phone || "-"}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td><span className={`admin-badge ${u.subscriptionStatus}`}>{u.subscriptionStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => { setSelected(null); setTempPw(""); }}>
          <div className="modal-card" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>{selected.firstName} {selected.lastName}</h4><button type="button" className="ghost-button" onClick={() => { setSelected(null); setTempPw(""); }}>x</button></div>

            <div className="admin-detail">
              <h5>Identity Verification</h5>
              <div className="admin-detail-row"><span>Full name</span><span>{selected.firstName} {selected.lastName}</span></div>
              <div className="admin-detail-row"><span>Email</span><span>{selected.email}</span></div>
              <div className="admin-detail-row"><span>Phone</span><span>{selected.phone || "-"}</span></div>
              <div className="admin-detail-row"><span>Date of birth</span><span>{formatDate(selected.dateOfBirth)}</span></div>

              <h5>Account</h5>
              <div className="admin-detail-row"><span>Joined</span><span>{formatDate(selected.createdAt)}</span></div>
              <div className="admin-detail-row"><span>Plan</span><span>{selected.subscriptionStatus}</span></div>
              <div className="admin-detail-row"><span>Stripe ID</span><span>{selected.stripeCustomerId || "-"}</span></div>
              <div className="admin-detail-row"><span>Current balance</span><span>{currency.format(selected.currentBalance || 0)}</span></div>
              <div className="admin-detail-row"><span>Bills</span><span>{selected.billCount || 0}</span></div>
              <div className="admin-detail-row"><span>Income sources</span><span>{selected.incomeCount || 0}</span></div>

              {selected.incomeSources?.length > 0 && (
                <>
                  <h5>Income</h5>
                  {selected.incomeSources.map((s) => (
                    <div key={s._id} className="admin-detail-row"><span>{s.name} ({s.frequency})</span><span>{currency.format(s.amount)}</span></div>
                  ))}
                </>
              )}

              <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--card-border)" }}>
                <button type="button" className="delete-button" onClick={() => handleResetPassword(selected._id)}>Reset Password (Admin Override)</button>
                {tempPw && <p style={{ marginTop: "0.5rem", fontSize: "0.88rem", fontWeight: 700, color: "var(--teal)" }}>Temporary password: {tempPw}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
