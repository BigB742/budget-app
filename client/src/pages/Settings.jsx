import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../apiClient";

const TEXT_SIZES = [
  { value: "small", label: "A", size: "0.8rem" },
  { value: "medium", label: "A", size: "0.875rem" },
  { value: "large", label: "A", size: "0.95rem" },
];

const Settings = () => {
  const navigate = useNavigate();

  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "system");
  const [textSize, setTextSize] = useState(() => localStorage.getItem("textSize") || "medium");

  const [user, setUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({ firstName: "", lastName: "", email: "", dateOfBirth: "" });
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

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    const r = document.documentElement;
    if (theme === "system") {
      r.setAttribute("data-theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } else {
      r.setAttribute("data-theme", theme);
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-text-size", textSize);
    localStorage.setItem("textSize", textSize);
  }, [textSize]);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const p = await authFetch("/api/user/me");
      setUser(p);
      setProfileForm({ firstName: p.firstName || "", lastName: p.lastName || "", email: p.email || "", dateOfBirth: p.dateOfBirth?.slice?.(0, 10) || "" });
      setBillReminders(p.notificationPrefs?.billReminders !== false);
      setLowBalanceWarning(!!p.notificationPrefs?.lowBalanceWarning);
      setLowBalanceThreshold(p.notificationPrefs?.lowBalanceThreshold || 100);
    } catch (err) {
      if (err?.status === 401) { localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/login"); }
    } finally { setProfileLoading(false); }
  }, [navigate]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleFieldChange = (field, value) => {
    setProfileForm((p) => ({ ...p, [field]: value }));
    setDirty(true);
    setSaveMsg("");
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ firstName: profileForm.firstName, lastName: profileForm.lastName, email: profileForm.email, dateOfBirth: profileForm.dateOfBirth || undefined }) });
      setUser(updated);
      localStorage.setItem("user", JSON.stringify(updated));
      setDirty(false);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) { setSaveMsg(err?.message || "Error saving."); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError("");
    if (pwForm.newPw !== pwForm.confirm) { setPwError("Passwords don't match."); return; }
    setPwSaving(true);
    try {
      await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ passwordChange: { currentPassword: pwForm.current, newPassword: pwForm.newPw, confirmNewPassword: pwForm.confirm } }) });
      setShowPwModal(false);
      setPwForm({ current: "", newPw: "", confirm: "" });
    } catch (err) { setPwError(err?.message || "Failed."); }
    finally { setPwSaving(false); }
  };

  const handleToggleNotif = async (field, value) => {
    const prefs = { billReminders, lowBalanceWarning, lowBalanceThreshold };
    prefs[field] = value;
    if (field === "billReminders") setBillReminders(value);
    if (field === "lowBalanceWarning") setLowBalanceWarning(value);
    if (field === "lowBalanceThreshold") setLowBalanceThreshold(value);
    try { await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ notificationPrefs: prefs }) }); } catch { /* best effort */ }
  };

  const initials = ((profileForm.firstName?.[0] || "") + (profileForm.lastName?.[0] || "")).toUpperCase() || "?";

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      {/* APPEARANCE */}
      <div className="settings-section">
        <h2 className="section-title">Appearance</h2>
        <div className="s-row">
          <span className="s-label">Theme</span>
          <div className="s-pills">
            {["light", "dark", "system"].map((v) => (
              <button key={v} type="button" className={`s-pill${theme === v ? " active" : ""}`} onClick={() => setTheme(v)}>
                {v === "light" ? "Light" : v === "dark" ? "Dark" : "System"}
              </button>
            ))}
          </div>
        </div>
        <div className="s-row">
          <span className="s-label">Text size</span>
          <div className="s-size-track">
            {TEXT_SIZES.map((t) => (
              <button key={t.value} type="button" className={`s-size-btn${textSize === t.value ? " active" : ""}`} style={{ fontSize: t.size }} onClick={() => setTextSize(t.value)}>{t.label}</button>
            ))}
          </div>
        </div>
        <p className="s-preview" style={{ fontSize: textSize === "small" ? "0.8rem" : textSize === "large" ? "0.95rem" : "0.875rem" }}>This is how your text will look.</p>
      </div>

      {/* ACCOUNT */}
      <div className="settings-section">
        <h2 className="section-title">Account</h2>
        {profileLoading ? <p className="status">Loading...</p> : user && (
          <>
            <div className="s-avatar">{initials}</div>
            <div className="s-field-list">
              <div className="s-field"><span className="s-field-label">First name</span><input value={profileForm.firstName} onChange={(e) => handleFieldChange("firstName", e.target.value)} /></div>
              <div className="s-field"><span className="s-field-label">Last name</span><input value={profileForm.lastName} onChange={(e) => handleFieldChange("lastName", e.target.value)} /></div>
              <div className="s-field"><span className="s-field-label">Date of birth</span><input type="date" value={profileForm.dateOfBirth} onChange={(e) => handleFieldChange("dateOfBirth", e.target.value)} /></div>
              <div className="s-field"><span className="s-field-label">Email</span><input value={profileForm.email} onChange={(e) => handleFieldChange("email", e.target.value)} /></div>
              <div className="s-field">
                <span className="s-field-label">Password</span>
                <div className="s-pw-row"><span className="s-pw-dots">&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;</span><button type="button" className="link-button s-change-pw" onClick={() => setShowPwModal(true)}>Change</button></div>
              </div>
            </div>
            {dirty && (
              <div className="s-save-bar">
                <button type="button" className="primary-button" onClick={handleSaveProfile} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
                {saveMsg && <span className="s-save-msg">{saveMsg}</span>}
              </div>
            )}
          </>
        )}
      </div>

      {/* NOTIFICATIONS */}
      <div className="settings-section">
        <h2 className="section-title">Notifications</h2>
        <label className="s-toggle-row">
          <div><span className="s-toggle-label">Bill reminders</span><span className="s-toggle-sub">Get emailed 3 days before a bill is due</span></div>
          <input type="checkbox" className="s-toggle" checked={billReminders} onChange={(e) => handleToggleNotif("billReminders", e.target.checked)} />
        </label>
        <label className="s-toggle-row">
          <div><span className="s-toggle-label">Low balance warning</span><span className="s-toggle-sub">Get alerted when balance drops below:</span></div>
          <input type="checkbox" className="s-toggle" checked={lowBalanceWarning} onChange={(e) => handleToggleNotif("lowBalanceWarning", e.target.checked)} />
        </label>
        {lowBalanceWarning && (
          <div className="s-threshold-row">
            <span>$</span>
            <input type="number" min="0" value={lowBalanceThreshold} onChange={(e) => handleToggleNotif("lowBalanceThreshold", Number(e.target.value))} />
          </div>
        )}
      </div>

      {/* DANGER ZONE */}
      <div className="settings-section danger-zone">
        <h2 className="section-title">Danger zone</h2>
        <button type="button" className="s-danger-btn" onClick={() => setShowDeleteModal(true)}>Delete account</button>
      </div>

      {/* Password modal */}
      {showPwModal && (
        <div className="modal-overlay" onClick={() => setShowPwModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>Change password</h4><button type="button" className="ghost-button" onClick={() => setShowPwModal(false)}>&#x2715;</button></div>
            <form className="modal-form" onSubmit={handleChangePassword}>
              <label>Current password<input type="password" value={pwForm.current} onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))} required /></label>
              <label>New password<input type="password" value={pwForm.newPw} onChange={(e) => setPwForm((p) => ({ ...p, newPw: e.target.value }))} required /></label>
              <label>Confirm new password<input type="password" value={pwForm.confirm} onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))} required /></label>
              {pwError && <div className="inline-error">{pwError}</div>}
              <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowPwModal(false)}>Cancel</button><button type="submit" className="primary-button" disabled={pwSaving}>{pwSaving ? "Saving..." : "Update password"}</button></div>
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
            <label className="modal-form" style={{ gap: "0.25rem" }}>Enter your password to confirm<input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} /></label>
            <div className="modal-actions" style={{ marginTop: "0.5rem" }}><button type="button" className="ghost-button" onClick={() => setShowDeleteModal(false)}>Cancel</button><button type="button" className="delete-button" disabled={!deletePassword} onClick={() => { console.log("Account deletion coming soon"); setShowDeleteModal(false); }}>Delete my account</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
