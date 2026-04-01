import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../apiClient";

// TODO: Implement TOTP 2FA using speakeasy or otplib.
// Send code via email or authenticator app. Require on login after password.

const Settings = () => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "system");

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", dateOfBirth: "" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");

  const [billReminders, setBillReminders] = useState(true);
  const [lowBalanceWarning, setLowBalanceWarning] = useState(false);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(100);
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState("100");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    const r = document.documentElement;
    if (theme === "system") r.setAttribute("data-theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    else r.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const p = await authFetch("/api/user/me");
      setUser(p);
      setForm({ firstName: p.firstName || "", lastName: p.lastName || "", email: p.email || "", dateOfBirth: p.dateOfBirth?.slice?.(0, 10) || "" });
      setBillReminders(p.notificationPrefs?.billReminders !== false);
      setLowBalanceWarning(!!p.notificationPrefs?.lowBalanceWarning);
      const t = p.notificationPrefs?.lowBalanceThreshold || 100;
      setLowBalanceThreshold(t);
      setThresholdDraft(String(t));
    } catch (err) {
      if (err?.status === 401) { localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/login"); }
    } finally { setLoading(false); }
  }, [navigate]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleField = (f, v) => { setForm((p) => ({ ...p, [f]: v })); setDirty(true); setSaveMsg(""); };

  const handleSave = async () => {
    setSaving(true); setSaveMsg("");
    try {
      const updated = await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify(form) });
      setUser(updated); localStorage.setItem("user", JSON.stringify(updated)); setDirty(false);
      setSaveMsg("Saved"); setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) { setSaveMsg(err?.message || "Error"); }
    finally { setSaving(false); }
  };

  const handlePw = async (e) => {
    e.preventDefault(); setPwError("");
    if (pwForm.newPw !== pwForm.confirm) { setPwError("Passwords don't match."); return; }
    setPwSaving(true);
    try {
      await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ passwordChange: { currentPassword: pwForm.current, newPassword: pwForm.newPw, confirmNewPassword: pwForm.confirm } }) });
      setShowPwModal(false); setPwForm({ current: "", newPw: "", confirm: "" });
    } catch (err) { setPwError(err?.message || "Failed."); }
    finally { setPwSaving(false); }
  };

  const saveNotifPref = async (prefs) => {
    try { await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ notificationPrefs: prefs }) }); } catch { /* best effort */ }
  };

  const handleBillToggle = (v) => { setBillReminders(v); saveNotifPref({ billReminders: v, lowBalanceWarning, lowBalanceThreshold }); };
  const handleLowBalToggle = (v) => { setLowBalanceWarning(v); saveNotifPref({ billReminders, lowBalanceWarning: v, lowBalanceThreshold }); };
  const handleThresholdSave = () => {
    const val = Number(thresholdDraft) || 100;
    setLowBalanceThreshold(val); setEditingThreshold(false);
    saveNotifPref({ billReminders, lowBalanceWarning, lowBalanceThreshold: val });
  };

  const initials = ((form.firstName?.[0] || "") + (form.lastName?.[0] || "")).toUpperCase() || "?";

  const formatLogin = (entry) => {
    if (!entry) return "";
    const d = new Date(entry.timestamp);
    const time = d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const ua = entry.userAgent || "";
    let browser = "Unknown";
    if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Edg")) browser = "Edge";
    let os = "";
    if (ua.includes("Mac")) os = "Mac";
    else if (ua.includes("iPhone")) os = "iPhone";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("Windows")) os = "Windows";
    return `${time} — ${browser}${os ? ` on ${os}` : ""}`;
  };

  const handleLogout = () => { localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/login"); };

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <div className="settings-two-col">
        {/* LEFT */}
        <div className="settings-col">
          {/* Appearance */}
          <div className="settings-section">
            <h2 className="section-title">Appearance</h2>
            <div className="s-row"><span className="s-label">Theme</span>
              <div className="s-pills">
                {["light", "dark", "system"].map((v) => (
                  <button key={v} type="button" className={`s-pill${theme === v ? " active" : ""}`} onClick={() => setTheme(v)}>
                    {v === "light" ? "Light" : v === "dark" ? "Dark" : "System"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Account */}
          <div className="settings-section">
            <h2 className="section-title">Account</h2>
            {loading ? <p className="status">Loading...</p> : user && (
              <>
                <div className="s-avatar">{initials}</div>
                <div className="s-field-list">
                  <div className="s-field"><span className="s-field-label">First name</span><input value={form.firstName} onChange={(e) => handleField("firstName", e.target.value)} /></div>
                  <div className="s-field"><span className="s-field-label">Last name</span><input value={form.lastName} onChange={(e) => handleField("lastName", e.target.value)} /></div>
                  <div className="s-field"><span className="s-field-label">Date of birth</span><input type="date" value={form.dateOfBirth} onChange={(e) => handleField("dateOfBirth", e.target.value)} /></div>
                  <div className="s-field"><span className="s-field-label">Email</span><input value={form.email} onChange={(e) => handleField("email", e.target.value)} /></div>
                  <div className="s-field"><span className="s-field-label">Password</span><div className="s-pw-row"><span className="s-pw-dots">&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;</span><button type="button" className="link-button s-change-pw" onClick={() => setShowPwModal(true)}>Change</button></div></div>
                  <div className="s-field"><span className="s-field-label">Two-factor auth</span><div className="s-pw-row"><span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Not enabled</span><span className="coming-soon">Coming soon</span></div></div>
                </div>
                {dirty && <div className="s-save-bar"><button type="button" className="primary-button" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>{saveMsg && <span className="s-save-msg">{saveMsg}</span>}</div>}
              </>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="settings-col">
          {/* Notifications */}
          <div className="settings-section">
            <h2 className="section-title">Notifications</h2>
            <label className="s-toggle-row">
              <div><span className="s-toggle-label">Bill reminders</span><span className="s-toggle-sub">Get emailed 3 days before a bill is due</span></div>
              <input type="checkbox" className="s-toggle" checked={billReminders} onChange={(e) => handleBillToggle(e.target.checked)} />
            </label>
            <label className="s-toggle-row">
              <div>
                <span className="s-toggle-label">Low balance warning</span>
                {lowBalanceWarning && !editingThreshold && (
                  <span className="s-toggle-sub">
                    Alert me when balance drops below <strong>${lowBalanceThreshold}</strong>{" "}
                    <button type="button" className="link-button" style={{ fontSize: "0.72rem", color: "var(--accent)" }} onClick={() => { setThresholdDraft(String(lowBalanceThreshold)); setEditingThreshold(true); }}>Edit</button>
                  </span>
                )}
                {lowBalanceWarning && editingThreshold && (
                  <span className="s-toggle-sub s-threshold-edit">
                    Alert below: $<input type="number" min="0" value={thresholdDraft} onChange={(e) => setThresholdDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleThresholdSave()} className="s-threshold-input" />
                    <button type="button" className="link-button" style={{ fontSize: "0.72rem", color: "var(--accent)" }} onClick={handleThresholdSave}>Save</button>
                  </span>
                )}
              </div>
              <input type="checkbox" className="s-toggle" checked={lowBalanceWarning} onChange={(e) => handleLowBalToggle(e.target.checked)} />
            </label>
          </div>

          {/* Login history */}
          <div className="settings-section">
            <h2 className="section-title">Login history</h2>
            {(user?.loginHistory || []).length === 0 ? (
              <p className="empty-row">No login history available.</p>
            ) : (
              <div className="s-login-list">
                {(user.loginHistory || []).slice(0, 5).map((entry, i) => (
                  <div key={i} className="s-login-entry">{formatLogin(entry)}</div>
                ))}
              </div>
            )}
          </div>

          {/* Danger zone */}
          <div className="settings-section danger-zone">
            <h2 className="section-title">Danger zone</h2>
            <button type="button" className="s-danger-btn" onClick={() => setShowDeleteModal(true)}>Delete account</button>
          </div>

          {/* Logout (mobile) */}
          <button type="button" className="s-mobile-logout" onClick={handleLogout}>Log out</button>
        </div>
      </div>

      {/* Password modal */}
      {showPwModal && (
        <div className="modal-overlay" onClick={() => setShowPwModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>Change password</h4><button type="button" className="ghost-button" onClick={() => setShowPwModal(false)}>&#x2715;</button></div>
            <form className="modal-form" onSubmit={handlePw}>
              <label>Current password<input type="password" value={pwForm.current} onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))} required /></label>
              <label>New password<input type="password" value={pwForm.newPw} onChange={(e) => setPwForm((p) => ({ ...p, newPw: e.target.value }))} required /></label>
              <label>Confirm<input type="password" value={pwForm.confirm} onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))} required /></label>
              {pwError && <div className="inline-error">{pwError}</div>}
              <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowPwModal(false)}>Cancel</button><button type="submit" className="primary-button" disabled={pwSaving}>{pwSaving ? "..." : "Update"}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>Delete account</h4><button type="button" className="ghost-button" onClick={() => setShowDeleteModal(false)}>&#x2715;</button></div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0.5rem 0" }}>This will permanently delete your account and all your data. This cannot be undone.</p>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontWeight: 600, fontSize: "0.82rem" }}>Enter your password to confirm<input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} style={{ marginTop: "0.15rem" }} /></label>
            <div className="modal-actions" style={{ marginTop: "0.5rem" }}><button type="button" className="ghost-button" onClick={() => setShowDeleteModal(false)}>Cancel</button><button type="button" className="delete-button" disabled={!deletePassword} onClick={() => { setShowDeleteModal(false); }}>Delete my account</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
