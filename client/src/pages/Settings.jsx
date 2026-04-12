import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authFetch } from "../apiClient";
import { useSubscription } from "../hooks/useSubscription";

// TODO: Implement TOTP 2FA using speakeasy or otplib.
// Send code via email or authenticator app. Require on login after password.

const FONT_SCALES = [
  { key: "xs", scale: 0.85, base: "0.75rem" },
  { key: "sm", scale: 0.92, base: "0.8rem" },
  { key: "md", scale: 1.0, base: "0.875rem" },
  { key: "lg", scale: 1.1, base: "0.96rem" },
  { key: "xl", scale: 1.25, base: "1.1rem" },
];

const Settings = () => {
  const navigate = useNavigate();
  const { isPremium, isTrialing, isCanceled, status, subscriptionEndDate } = useSubscription();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "system");
  const [fontScaleIdx, setFontScaleIdx] = useState(() => {
    const saved = localStorage.getItem("fontScale");
    const idx = FONT_SCALES.findIndex((s) => s.key === saved);
    return idx >= 0 ? idx : 2; // default: md (middle)
  });

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
  const [deleteStep, setDeleteStep] = useState("confirm"); // "confirm" | "code"
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportForm, setSupportForm] = useState({ subject: "", message: "" });
  const [supportSaving, setSupportSaving] = useState(false);
  const [supportMsg, setSupportMsg] = useState("");

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelResult, setCancelResult] = useState(null); // { wasTrialing, endDate, message }

  useEffect(() => {
    const r = document.documentElement;
    if (theme === "system") r.setAttribute("data-theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    else r.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const fs = FONT_SCALES[fontScaleIdx];
    const r = document.documentElement;
    if (fs.key === "md") r.removeAttribute("data-font-scale");
    else r.setAttribute("data-font-scale", fs.key);
    localStorage.setItem("fontScale", fs.key);
  }, [fontScaleIdx]);

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

            {/* Text size slider */}
            <div style={{ marginTop: "0.75rem" }}>
              <span className="s-label">Text size</span>
              <div className="text-size-preview" style={{ fontSize: FONT_SCALES[fontScaleIdx].base }}>
                This is how your text will look across the app.
              </div>
              <div className="text-size-slider">
                <span className="size-a-sm">A</span>
                <div className="slider-track" onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  const idx = Math.round(pct * (FONT_SCALES.length - 1));
                  setFontScaleIdx(Math.max(0, Math.min(FONT_SCALES.length - 1, idx)));
                }}>
                  <div className="slider-rail">
                    <div className="slider-fill" style={{ width: `${(fontScaleIdx / (FONT_SCALES.length - 1)) * 100}%` }} />
                  </div>
                  <div className="slider-ticks">
                    {FONT_SCALES.map((_, i) => <span key={i} className={`slider-tick${i <= fontScaleIdx ? " active" : ""}`} />)}
                  </div>
                  <div className="slider-thumb" style={{ left: `${(fontScaleIdx / (FONT_SCALES.length - 1)) * 100}%` }} />
                </div>
                <span className="size-a-lg">A</span>
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
                  <div className="s-field"><span className="s-field-label">Two-factor auth</span><div className="s-pw-row">
                    {user.twoFactorEnabled
                      ? <><span style={{ color: "var(--teal)", fontSize: "0.82rem", fontWeight: 600 }}>Enabled</span><button type="button" className="link-button" style={{ fontSize: "0.75rem", color: "var(--red)" }} onClick={async () => { try { await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ twoFactorEnabled: false }) }); const u2 = await authFetch("/api/user/me"); setUser(u2); localStorage.setItem("user", JSON.stringify(u2)); } catch {} }}>Disable</button></>
                      : <><span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Not enabled</span><button type="button" className="link-button" style={{ fontSize: "0.75rem", color: "var(--teal)" }} onClick={async () => { try { await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ twoFactorEnabled: true }) }); const u2 = await authFetch("/api/user/me"); setUser(u2); localStorage.setItem("user", JSON.stringify(u2)); } catch {} }}>Enable</button></>
                    }
                  </div></div>
                </div>
                {dirty && <div className="s-save-bar"><button type="button" className="primary-button" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>{saveMsg && <span className="s-save-msg">{saveMsg}</span>}</div>}

                {/* Subscription status + cancel */}
                <div className="s-sub-block">
                  {(isTrialing || status === "premium" || status === "premium_monthly" || status === "premium_annual") && !isCanceled && (
                    <>
                      <p className="s-sub-status">
                        {isTrialing ? "Free trial — Premium" : "Premium — active"}
                      </p>
                      <button type="button" className="link-button s-cancel-btn" onClick={() => { setShowCancelModal(true); setCancelError(""); setCancelResult(null); }}>
                        Cancel subscription
                      </button>
                    </>
                  )}
                  {isCanceled && subscriptionEndDate && (
                    <p className="s-sub-status s-sub-canceled">
                      Subscription canceled — access until {new Date(subscriptionEndDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
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
            {isPremium ? (
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
            ) : (
              <div className="s-toggle-row premium-locked-row">
                <div>
                  <span className="s-toggle-label" style={{ opacity: 0.5 }}>Low balance warning</span>
                  <span className="s-toggle-sub" style={{ color: "var(--accent)" }}>Low balance alerts are a Premium feature. Upgrade to get notified before you overdraft.</span>
                </div>
                <Link to="/subscription" className="premium-lock-badge">Premium <span style={{ fontSize: "0.65rem" }}>Upgrade</span></Link>
              </div>
            )}
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

          {/* Support */}
          <div className="settings-section">
            <h2 className="section-title">Support</h2>
            <button type="button" className="secondary-button" onClick={() => { setShowSupportModal(true); setSupportMsg(""); }}>Contact Support</button>
          </div>

          {/* Danger zone */}
          <div className="settings-section danger-zone">
            <h2 className="section-title">Danger zone</h2>
            <button type="button" className="s-danger-btn" style={{ marginBottom: "0.5rem" }} onClick={() => { setShowResetModal(true); setResetConfirm(""); setResetPassword(""); setResetError(""); }}>Reset & Re-onboard</button>
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
            <div className="modal-header"><h4>Delete account</h4><button type="button" className="ghost-button" onClick={() => { setShowDeleteModal(false); setDeleteStep("confirm"); setDeleteError(""); }}>&#x2715;</button></div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0.5rem 0" }}>This will permanently delete your account and all your data. This cannot be undone.</p>

            {deleteStep === "confirm" && (
              <>
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>We will send a 6-digit confirmation code to your registered email address.</p>
                {deleteError && <div className="inline-error" style={{ marginTop: "0.5rem" }}>{deleteError}</div>}
                <div className="modal-actions" style={{ marginTop: "0.75rem" }}>
                  <button type="button" className="ghost-button" onClick={() => { setShowDeleteModal(false); setDeleteError(""); }}>Cancel</button>
                  <button type="button" className="delete-button" disabled={deleteLoading} onClick={async () => {
                    setDeleteLoading(true); setDeleteError("");
                    try {
                      await authFetch("/api/user/send-delete-code", { method: "POST" });
                      setDeleteStep("code");
                    } catch (err) { setDeleteError(err?.message || "Failed to send code."); }
                    finally { setDeleteLoading(false); }
                  }}>{deleteLoading ? "Sending..." : "Send Confirmation Code"}</button>
                </div>
              </>
            )}

            {deleteStep === "code" && (
              <>
                <p style={{ fontSize: "0.82rem", color: "var(--teal)", fontWeight: 600, margin: "0.5rem 0" }}>Code sent. Check your email (and spam folder).</p>
                <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontWeight: 600, fontSize: "0.82rem" }}>Enter 6-digit code<input type="text" maxLength="6" value={deleteCode} onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, "").slice(0, 6))} style={{ marginTop: "0.15rem", letterSpacing: "0.3em", textAlign: "center", fontSize: "1.2rem", fontWeight: 700 }} /></label>
                {deleteError && <div className="inline-error" style={{ marginTop: "0.5rem" }}>{deleteError}</div>}
                <div className="modal-actions" style={{ marginTop: "0.5rem" }}>
                  <button type="button" className="ghost-button" onClick={() => { setShowDeleteModal(false); setDeleteStep("confirm"); setDeleteError(""); setDeleteCode(""); }}>Cancel</button>
                  <button type="button" className="link-button" style={{ fontSize: "0.75rem" }} onClick={async () => {
                    try { await authFetch("/api/user/send-delete-code", { method: "POST" }); setDeleteError(""); } catch {}
                  }}>Resend code</button>
                  <button type="button" className="delete-button" disabled={deleteCode.length !== 6 || deleteLoading} onClick={async () => {
                    setDeleteLoading(true); setDeleteError("");
                    try {
                      await authFetch("/api/user/me", { method: "DELETE", body: JSON.stringify({ code: deleteCode }) });
                      localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/");
                    } catch (err) { setDeleteError(err?.message || "Failed to delete account."); }
                    finally { setDeleteLoading(false); }
                  }}>{deleteLoading ? "Deleting..." : "Delete my account"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Cancel subscription modal */}
      {showCancelModal && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Cancel subscription</h4>
              <button type="button" className="ghost-button" onClick={() => setShowCancelModal(false)}>&#x2715;</button>
            </div>

            {!cancelResult ? (
              <>
                <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: "0.5rem 0 0.75rem" }}>
                  {isTrialing
                    ? "Are you sure? Your trial will end and you won't be charged. You'll lose premium access immediately after the trial end date."
                    : "Are you sure? You'll keep premium access until the end of your current billing period, then revert to the free plan."}
                </p>
                {cancelError && <div className="inline-error" style={{ marginBottom: "0.5rem" }}>{cancelError}</div>}
                <div className="modal-actions">
                  <button type="button" className="ghost-button" onClick={() => setShowCancelModal(false)}>Keep subscription</button>
                  <button
                    type="button"
                    className="delete-button"
                    disabled={cancelLoading}
                    onClick={async () => {
                      setCancelLoading(true);
                      setCancelError("");
                      try {
                        const data = await authFetch("/api/stripe/subscription", { method: "DELETE" });
                        setCancelResult(data);
                        // Refresh user in localStorage so useSubscription picks up the new status
                        try {
                          const refreshed = await authFetch("/api/user/me");
                          localStorage.setItem("user", JSON.stringify(refreshed));
                          setUser(refreshed);
                        } catch { /* ignore */ }
                      } catch (err) {
                        setCancelError(err?.message || "Failed to cancel subscription.");
                      } finally {
                        setCancelLoading(false);
                      }
                    }}
                  >
                    {cancelLoading ? "Canceling..." : "Yes, cancel"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--teal)", margin: "0.75rem 0 0.25rem" }}>
                  {cancelResult.wasTrialing
                    ? "Trial canceled — you won't be charged."
                    : "Subscription canceled."}
                </p>
                {!cancelResult.wasTrialing && cancelResult.endDate && (
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" }}>
                    Access continues until{" "}
                    <strong>
                      {new Date(cancelResult.endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </strong>.
                  </p>
                )}
                {cancelResult.wasTrialing && cancelResult.endDate && (
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" }}>
                    Trial ends{" "}
                    <strong>
                      {new Date(cancelResult.endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </strong>.
                  </p>
                )}
                <div className="modal-actions">
                  <button type="button" className="primary-button" onClick={() => { setShowCancelModal(false); setCancelResult(null); }}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reset account modal */}
      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>Reset account</h4><button type="button" className="ghost-button" onClick={() => setShowResetModal(false)}>&#x2715;</button></div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0.5rem 0" }}>This will delete all your financial data including bills, income, expenses, and savings. Your account will remain but you will go through onboarding again. This cannot be undone.</p>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.5rem" }}>Type RESET to confirm<input value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="RESET" style={{ marginTop: "0.15rem" }} /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontWeight: 600, fontSize: "0.82rem" }}>Enter your password<input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} style={{ marginTop: "0.15rem" }} /></label>
            {resetError && <div className="inline-error" style={{ marginTop: "0.5rem" }}>{resetError}</div>}
            <div className="modal-actions" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="ghost-button" onClick={() => setShowResetModal(false)}>Cancel</button>
              <button type="button" className="delete-button" disabled={resetConfirm !== "RESET" || !resetPassword || resetLoading} onClick={async () => {
                setResetLoading(true); setResetError("");
                try {
                  await authFetch("/api/user/reset-account", { method: "POST", body: JSON.stringify({ password: resetPassword }) });
                  // Update local session so ProtectedRoute routes to onboarding
                  const stored = JSON.parse(localStorage.getItem("user") || "{}");
                  stored.onboardingComplete = false;
                  stored.currentBalance = 0;
                  stored.totalSavings = 0;
                  localStorage.setItem("user", JSON.stringify(stored));
                  setShowResetModal(false);
                  // Hard redirect — forces ProtectedRoute to re-mount and fetch
                  // the fresh profile, which will now have onboardingComplete: false
                  window.location.href = "/onboarding";
                } catch (err) { setResetError(err?.message || "Failed to reset account."); }
                finally { setResetLoading(false); }
              }}>{resetLoading ? "Resetting..." : "Reset my account"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Support modal */}
      {showSupportModal && (
        <div className="modal-overlay" onClick={() => setShowSupportModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>Contact Support</h4><button type="button" className="ghost-button" onClick={() => setShowSupportModal(false)}>&#x2715;</button></div>
            {supportMsg ? (
              <div style={{ padding: "1rem 0", textAlign: "center" }}>
                <p style={{ color: "var(--teal)", fontWeight: 600 }}>{supportMsg}</p>
                <button type="button" className="primary-button" style={{ marginTop: "0.75rem" }} onClick={() => setShowSupportModal(false)}>Close</button>
              </div>
            ) : (
              <form className="modal-form" onSubmit={async (e) => {
                e.preventDefault();
                setSupportSaving(true);
                try {
                  await authFetch("/api/user/support-ticket", { method: "POST", body: JSON.stringify(supportForm) });
                  setSupportMsg("Your message has been sent. We'll get back to you via email.");
                  setSupportForm({ subject: "", message: "" });
                } catch { setSupportMsg("Failed to send. Please try again."); }
                finally { setSupportSaving(false); }
              }}>
                <label>Subject<input value={supportForm.subject} onChange={(e) => setSupportForm((p) => ({ ...p, subject: e.target.value }))} placeholder="What do you need help with?" required /></label>
                <label>Message<textarea rows="4" value={supportForm.message} onChange={(e) => setSupportForm((p) => ({ ...p, message: e.target.value }))} placeholder="Describe your issue..." required style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: "0.85rem", padding: "0.5rem", borderRadius: "var(--radius)", border: "1px solid var(--card-border)", background: "var(--bg)", color: "var(--text)" }} /></label>
                <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowSupportModal(false)}>Cancel</button><button type="submit" className="primary-button" disabled={supportSaving}>{supportSaving ? "Sending..." : "Send"}</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
