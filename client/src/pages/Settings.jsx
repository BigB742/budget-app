import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../apiClient";
import { useSubscription } from "../hooks/useSubscription";
import { storeUser } from "../utils/safeStorage";
import PageContainer from "../components/PageContainer";

const FONT_SCALES = [
  { key: "xs", scale: 0.85, base: "0.75rem" },
  { key: "sm", scale: 0.92, base: "0.8rem" },
  { key: "md", scale: 1.0, base: "0.875rem" },
  { key: "lg", scale: 1.1, base: "0.96rem" },
  { key: "xl", scale: 1.25, base: "1.1rem" },
];

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

const Settings = () => {
  const navigate = useNavigate();
  const { isPremium, isTrialing, isCanceled, status, subscriptionEndDate } = useSubscription();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "system");
  const [fontScaleIdx, setFontScaleIdx] = useState(() => {
    const saved = localStorage.getItem("fontScale");
    const idx = FONT_SCALES.findIndex((s) => s.key === saved);
    return idx >= 0 ? idx : 2;
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

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState("confirm");
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
  const [cancelResult, setCancelResult] = useState(null);

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
      setUser(updated); storeUser(updated); setDirty(false);
      setSaveMsg("Saved"); setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) { setSaveMsg(err?.message || "Couldn't save."); }
    finally { setSaving(false); }
  };

  const handlePw = async (e) => {
    e.preventDefault(); setPwError("");
    if (pwForm.newPw !== pwForm.confirm) { setPwError("Passwords don't match."); return; }
    setPwSaving(true);
    try {
      await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ passwordChange: { currentPassword: pwForm.current, newPassword: pwForm.newPw, confirmNewPassword: pwForm.confirm } }) });
      setShowPwModal(false); setPwForm({ current: "", newPw: "", confirm: "" });
    } catch (err) { setPwError(err?.message || "Couldn't update password."); }
    finally { setPwSaving(false); }
  };

  const toggle2FA = async (next) => {
    try {
      await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ twoFactorEnabled: next }) });
      const u2 = await authFetch("/api/user/me");
      setUser(u2); storeUser(u2);
    } catch { /* ignore */ }
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
    return `${time} · ${browser}${os ? ` on ${os}` : ""}`;
  };

  const hasSub = isTrialing || status === "premium" || status === "premium_monthly" || status === "premium_annual";
  const fullName = [form.firstName, form.lastName].filter(Boolean).join(" ") || (user?.email ?? "Account");

  return (
    <PageContainer>
      <div className="pp5-page-header">
        <h1 className="type-display">Settings</h1>
      </div>

      <div className="pp5-settings">
        {/* Account */}
        <section className="pp5-settings-section">
          <h2 className="pp5-settings-section-title">Account</h2>
          {loading ? (
            <p className="pp5-empty">Loading…</p>
          ) : (
            <>
              <div className="pp5-settings-account-row">
                <div className="pp5-settings-avatar">{initials}</div>
                <div>
                  <div className="pp5-settings-account-name">{fullName}</div>
                  {user?.email && <div className="pp5-settings-account-email">{user.email}</div>}
                </div>
              </div>
              <div className="pp5-settings-row">
                <span className="pp5-settings-row-label">First name</span>
                <span className="pp5-settings-row-value">
                  <input value={form.firstName} onChange={(e) => handleField("firstName", e.target.value)} />
                </span>
              </div>
              <div className="pp5-settings-row">
                <span className="pp5-settings-row-label">Last name</span>
                <span className="pp5-settings-row-value">
                  <input value={form.lastName} onChange={(e) => handleField("lastName", e.target.value)} />
                </span>
              </div>
              <div className="pp5-settings-row">
                <span className="pp5-settings-row-label">Date of birth</span>
                <span className="pp5-settings-row-value">
                  <input type="date" value={form.dateOfBirth} onChange={(e) => handleField("dateOfBirth", e.target.value)} />
                </span>
              </div>
              {dirty && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20, alignItems: "center" }}>
                  {saveMsg && <span className="type-secondary" style={{ color: "var(--color-accent-teal)" }}>{saveMsg}</span>}
                  <button type="button" className="pp5-btn pp5-btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Sign-in & security */}
        {user && (
          <section className="pp5-settings-section">
            <h2 className="pp5-settings-section-title">Sign-in & security</h2>
            <div className="pp5-settings-row">
              <span className="pp5-settings-row-label">Email</span>
              <span className="pp5-settings-row-value">
                <input value={form.email} onChange={(e) => handleField("email", e.target.value)} />
              </span>
            </div>
            <div className="pp5-settings-action-row">
              <div>
                <p className="pp5-settings-action-label">Password</p>
                <p className="pp5-settings-action-description">Last changed {user.passwordChangedAt ? formatDate(user.passwordChangedAt) : "not recorded"}</p>
              </div>
              <button type="button" className="pp5-settings-action-btn teal" onClick={() => setShowPwModal(true)}>Change</button>
            </div>
            <div className="pp5-settings-action-row">
              <div>
                <p className="pp5-settings-action-label">Two-factor authentication</p>
                <p className="pp5-settings-action-description">{user.twoFactorEnabled ? "On. Codes sent to your email at sign in." : "Off. Turn on for an extra layer of security."}</p>
              </div>
              <button type="button" className="pp5-settings-action-btn teal" onClick={() => toggle2FA(!user.twoFactorEnabled)}>
                {user.twoFactorEnabled ? "Turn off" : "Turn on"}
              </button>
            </div>
          </section>
        )}

        {/* Subscription */}
        <section className="pp5-settings-section">
          <h2 className="pp5-settings-section-title">Subscription</h2>
          {hasSub && !isCanceled && (
            <div className="pp5-settings-action-row">
              <div>
                <p className="pp5-settings-action-label">PayPulse Premium</p>
                <p className="pp5-settings-action-description">
                  {isTrialing ? "Free trial active." : "Active plan."}
                  {subscriptionEndDate && ` Renews ${formatDate(subscriptionEndDate)}.`}
                </p>
              </div>
              <button type="button" className="pp5-settings-action-btn teal" onClick={() => { setShowCancelModal(true); setCancelError(""); setCancelResult(null); }}>
                Manage
              </button>
            </div>
          )}
          {isCanceled && subscriptionEndDate && (
            <div className="pp5-settings-action-row">
              <div>
                <p className="pp5-settings-action-label">PayPulse Premium</p>
                <p className="pp5-settings-action-description">Canceled. Access continues until {formatDate(subscriptionEndDate)}.</p>
              </div>
            </div>
          )}
          {!hasSub && !isCanceled && (
            <div className="pp5-settings-action-row">
              <div>
                <p className="pp5-settings-action-label">Free plan</p>
                <p className="pp5-settings-action-description">Upgrade for unlimited bills, projections, and priority support.</p>
              </div>
              <button type="button" className="pp5-settings-action-btn teal" onClick={() => navigate("/subscription")}>
                Upgrade
              </button>
            </div>
          )}
        </section>

        {/* Appearance */}
        <section className="pp5-settings-section">
          <h2 className="pp5-settings-section-title">Appearance</h2>
          <div className="pp5-settings-row">
            <span className="pp5-settings-row-label">Theme</span>
            <span className="pp5-settings-row-value" style={{ textAlign: "right" }}>
              <span className="pp5-segmented">
                {["light", "dark", "system"].map((v) => (
                  <button key={v} type="button" className={theme === v ? "active" : ""} onClick={() => setTheme(v)}>
                    {v === "light" ? "Light" : v === "dark" ? "Dark" : "System"}
                  </button>
                ))}
              </span>
            </span>
          </div>
          <div className="pp5-settings-row" style={{ alignItems: "center" }}>
            <span className="pp5-settings-row-label">Text size</span>
            <span className="pp5-settings-row-value" style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
              <span className="type-caption" style={{ fontSize: 12 }}>A</span>
              <div
                className="pp5-slider-track"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  const idx = Math.round(pct * (FONT_SCALES.length - 1));
                  setFontScaleIdx(Math.max(0, Math.min(FONT_SCALES.length - 1, idx)));
                }}
              >
                <div className="pp5-slider-rail" />
                <div className="pp5-slider-fill" style={{ width: `${(fontScaleIdx / (FONT_SCALES.length - 1)) * 100}%` }} />
                <div className="pp5-slider-thumb" style={{ left: `${(fontScaleIdx / (FONT_SCALES.length - 1)) * 100}%` }} />
              </div>
              <span className="type-body-medium" style={{ fontSize: 18 }}>A</span>
            </span>
          </div>
        </section>

        {/* Login history */}
        <section className="pp5-settings-section">
          <h2 className="pp5-settings-section-title">Login history</h2>
          {(user?.loginHistory || []).length === 0 ? (
            <p className="type-secondary">No recent sign-ins to show.</p>
          ) : (
            <div>
              {(user.loginHistory || []).slice(0, 5).map((entry, i) => (
                <div key={i} className="pp5-settings-row" style={{ justifyContent: "flex-start" }}>
                  <span className="type-secondary">{formatLogin(entry)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Help & support */}
        <section className="pp5-settings-section">
          <h2 className="pp5-settings-section-title">Help & support</h2>
          <button
            type="button"
            className="pp5-settings-link-row"
            onClick={() => {
              // Belt-and-suspenders: clear the completion flag in both
              // localStorage and the backend so the tour can launch
              // cleanly, then either invoke the global launcher (if
              // AppShell is mounted) or route to the dashboard with a
              // pending flag that AppShell's effect picks up on mount.
              try {
                const u = JSON.parse(localStorage.getItem("user") || "{}");
                if (u && typeof u === "object") {
                  u.tourCompleted = false;
                  localStorage.setItem("user", JSON.stringify(u));
                }
              } catch { /* ignore */ }
              authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ tourCompleted: false }) }).catch(() => {});
              if (typeof window.__ppLaunchTour === "function") {
                window.__ppLaunchTour();
              } else {
                sessionStorage.setItem("pp_tourPending", "1");
                navigate("/app");
              }
            }}
          >
            <span>Take the tour</span>
            <span className="chev">›</span>
          </button>
          <button type="button" className="pp5-settings-link-row" onClick={() => navigate("/app/help")}>
            <span>Help center</span>
            <span className="chev">›</span>
          </button>
          <button type="button" className="pp5-settings-link-row" onClick={() => { setShowSupportModal(true); setSupportMsg(""); }}>
            <span>Contact support</span>
            <span className="chev">›</span>
          </button>
        </section>

        {/* Account management */}
        <section className="pp5-settings-section">
          <h2 className="pp5-settings-section-title">Account management</h2>
          <div className="pp5-settings-action-row">
            <div>
              <p className="pp5-settings-action-label">Reset onboarding</p>
              <p className="pp5-settings-action-description">Start the setup flow again. Your data will be preserved.</p>
            </div>
            <button type="button" className="pp5-settings-action-btn" onClick={() => { setShowResetModal(true); setResetConfirm(""); setResetPassword(""); setResetError(""); }}>
              Reset
            </button>
          </div>
          <div className="pp5-settings-action-row">
            <div>
              <p className="pp5-settings-action-label">Delete account</p>
              <p className="pp5-settings-action-description">Permanently remove your account and all associated data.</p>
            </div>
            <button type="button" className="pp5-settings-action-btn destructive" onClick={() => setShowDeleteModal(true)}>
              Delete
            </button>
          </div>
        </section>
      </div>

      {/* Password modal */}
      {showPwModal && (
        <div className="pp5-modal-overlay" onClick={() => setShowPwModal(false)}>
          <div className="pp5-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pp5-modal-header">
              <h4 className="pp5-modal-title">Change password</h4>
              <button type="button" className="pp5-modal-close" onClick={() => setShowPwModal(false)}>×</button>
            </div>
            <form onSubmit={handlePw} className="pp5-modal-body">
              <div className="pp5-field">
                <label className="pp5-field-label">Current password</label>
                <input type="password" className="pp5-input" value={pwForm.current} onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))} required />
              </div>
              <div className="pp5-field">
                <label className="pp5-field-label">New password</label>
                <input type="password" className="pp5-input" value={pwForm.newPw} onChange={(e) => setPwForm((p) => ({ ...p, newPw: e.target.value }))} required />
              </div>
              <div className="pp5-field">
                <label className="pp5-field-label">Confirm new password</label>
                <input type="password" className="pp5-input" value={pwForm.confirm} onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))} required />
              </div>
              {pwError && <p className="pp5-field-error">{pwError}</p>}
              <div className="pp5-modal-actions">
                <button type="button" className="pp5-btn pp5-btn-secondary" onClick={() => setShowPwModal(false)}>Cancel</button>
                <button type="submit" className="pp5-btn pp5-btn-primary" disabled={pwSaving}>{pwSaving ? "Updating…" : "Update password"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDeleteModal && (
        <div className="pp5-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="pp5-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pp5-modal-header">
              <h4 className="pp5-modal-title">Delete account?</h4>
              <button type="button" className="pp5-modal-close" onClick={() => { setShowDeleteModal(false); setDeleteStep("confirm"); setDeleteError(""); }}>×</button>
            </div>
            <p className="pp5-modal-description">This permanently removes your account and all data. It cannot be undone.</p>

            {deleteStep === "confirm" && (
              <>
                <p className="type-secondary" style={{ marginTop: 16 }}>We'll send a six-digit code to your email to confirm.</p>
                {deleteError && <p className="pp5-field-error">{deleteError}</p>}
                <div className="pp5-modal-actions-stack">
                  <button type="button" className="pp5-btn pp5-btn-destructive pp5-btn-block" disabled={deleteLoading} onClick={async () => {
                    setDeleteLoading(true); setDeleteError("");
                    try {
                      await authFetch("/api/user/send-delete-code", { method: "POST" });
                      setDeleteStep("code");
                    } catch (err) { setDeleteError(err?.message || "Couldn't send code."); }
                    finally { setDeleteLoading(false); }
                  }}>{deleteLoading ? "Sending…" : "Send confirmation code"}</button>
                  <button type="button" className="pp5-btn pp5-btn-secondary pp5-btn-block" onClick={() => { setShowDeleteModal(false); setDeleteError(""); }}>Cancel</button>
                </div>
              </>
            )}

            {deleteStep === "code" && (
              <div className="pp5-modal-body" style={{ marginTop: 16 }}>
                <p className="type-secondary" style={{ color: "var(--color-accent-teal)" }}>Code sent. Check your email.</p>
                <div className="pp5-field">
                  <label className="pp5-field-label">Six-digit code</label>
                  <input
                    type="text"
                    maxLength="6"
                    className="pp5-input"
                    value={deleteCode}
                    onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    style={{ letterSpacing: "0.3em", textAlign: "center", fontSize: 20, fontWeight: 600 }}
                  />
                </div>
                {deleteError && <p className="pp5-field-error">{deleteError}</p>}
                <div className="pp5-modal-actions-stack">
                  <button type="button" className="pp5-btn pp5-btn-destructive pp5-btn-block" disabled={deleteCode.length !== 6 || deleteLoading} onClick={async () => {
                    setDeleteLoading(true); setDeleteError("");
                    try {
                      await authFetch("/api/user/me", { method: "DELETE", body: JSON.stringify({ code: deleteCode }) });
                      localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/");
                    } catch (err) { setDeleteError(err?.message || "Couldn't delete account."); }
                    finally { setDeleteLoading(false); }
                  }}>{deleteLoading ? "Deleting…" : "Delete my account"}</button>
                  <button type="button" className="pp5-btn pp5-btn-text pp5-btn-block" onClick={async () => {
                    try { await authFetch("/api/user/send-delete-code", { method: "POST" }); setDeleteError(""); } catch {}
                  }}>Resend code</button>
                  <button type="button" className="pp5-btn pp5-btn-secondary pp5-btn-block" onClick={() => { setShowDeleteModal(false); setDeleteStep("confirm"); setDeleteError(""); setDeleteCode(""); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel subscription modal */}
      {showCancelModal && (
        <div className="pp5-modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div className="pp5-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pp5-modal-header">
              <h4 className="pp5-modal-title">Manage subscription</h4>
              <button type="button" className="pp5-modal-close" onClick={() => setShowCancelModal(false)}>×</button>
            </div>
            {!cancelResult ? (
              <>
                <p className="pp5-modal-description">
                  {isTrialing
                    ? "Cancel your trial? You won't be charged, and premium access ends on the trial end date."
                    : "Cancel your subscription? You'll keep premium access until the end of your current billing period."}
                </p>
                {cancelError && <p className="pp5-field-error">{cancelError}</p>}
                <div className="pp5-modal-actions">
                  <button type="button" className="pp5-btn pp5-btn-secondary" onClick={() => setShowCancelModal(false)}>Keep subscription</button>
                  <button type="button" className="pp5-btn pp5-btn-destructive" disabled={cancelLoading} onClick={async () => {
                    setCancelLoading(true); setCancelError("");
                    try {
                      const data = await authFetch("/api/stripe/subscription", { method: "DELETE" });
                      setCancelResult(data);
                      try {
                        const refreshed = await authFetch("/api/user/me");
                        storeUser(refreshed); setUser(refreshed);
                      } catch {}
                    } catch (err) { setCancelError(err?.message || "Couldn't cancel subscription."); }
                    finally { setCancelLoading(false); }
                  }}>{cancelLoading ? "Canceling…" : "Cancel subscription"}</button>
                </div>
              </>
            ) : (
              <>
                {cancelResult.endDate ? (
                  <>
                    <p className="type-subtitle" style={{ color: "var(--color-accent-teal)", margin: "16px 0 8px" }}>
                      {cancelResult.wasTrialing ? "Trial canceled." : "Subscription canceled."}
                    </p>
                    <p className="pp5-modal-description">
                      {cancelResult.wasTrialing ? "Trial ends " : "Access continues until "}
                      <strong style={{ color: "var(--color-text-primary)" }}>{formatDate(cancelResult.endDate)}</strong>.
                    </p>
                  </>
                ) : (
                  <p className="pp5-modal-description" style={{ marginTop: 16 }}>
                    {cancelResult.message || "No active subscription found."}
                  </p>
                )}
                <div className="pp5-modal-actions">
                  <button type="button" className="pp5-btn pp5-btn-primary" onClick={() => { setShowCancelModal(false); setCancelResult(null); }}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reset account modal */}
      {showResetModal && (
        <div className="pp5-modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="pp5-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pp5-modal-header">
              <h4 className="pp5-modal-title">Reset onboarding?</h4>
              <button type="button" className="pp5-modal-close" onClick={() => setShowResetModal(false)}>×</button>
            </div>
            <p className="pp5-modal-description">This removes your financial data — bills, income, expenses, and savings. Your account stays, and you'll go through setup again.</p>
            <div className="pp5-modal-body" style={{ marginTop: 20 }}>
              <div className="pp5-field">
                <label className="pp5-field-label">Type RESET to confirm</label>
                <input className="pp5-input" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="RESET" />
              </div>
              <div className="pp5-field">
                <label className="pp5-field-label">Password</label>
                <input type="password" className="pp5-input" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
              </div>
              {resetError && <p className="pp5-field-error">{resetError}</p>}
            </div>
            <div className="pp5-modal-actions">
              <button type="button" className="pp5-btn pp5-btn-secondary" onClick={() => setShowResetModal(false)}>Cancel</button>
              <button type="button" className="pp5-btn pp5-btn-destructive" disabled={resetConfirm !== "RESET" || !resetPassword || resetLoading} onClick={async () => {
                setResetLoading(true); setResetError("");
                try {
                  await authFetch("/api/user/reset-account", { method: "POST", body: JSON.stringify({ password: resetPassword }) });
                  const stored = JSON.parse(localStorage.getItem("user") || "{}");
                  stored.onboardingComplete = false;
                  stored.currentBalance = 0;
                  stored.totalSavings = 0;
                  storeUser(stored);
                  setShowResetModal(false);
                  window.location.href = "/onboarding";
                } catch (err) { setResetError(err?.message || "Couldn't reset."); }
                finally { setResetLoading(false); }
              }}>{resetLoading ? "Resetting…" : "Reset"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Support modal */}
      {showSupportModal && (
        <div className="pp5-modal-overlay" onClick={() => setShowSupportModal(false)}>
          <div className="pp5-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pp5-modal-header">
              <h4 className="pp5-modal-title">Contact support</h4>
              <button type="button" className="pp5-modal-close" onClick={() => setShowSupportModal(false)}>×</button>
            </div>
            {supportMsg ? (
              <>
                <p className="pp5-modal-description" style={{ color: "var(--color-accent-teal)" }}>{supportMsg}</p>
                <div className="pp5-modal-actions">
                  <button type="button" className="pp5-btn pp5-btn-primary" onClick={() => setShowSupportModal(false)}>Close</button>
                </div>
              </>
            ) : (
              <form className="pp5-modal-body" onSubmit={async (e) => {
                e.preventDefault();
                setSupportSaving(true);
                try {
                  await authFetch("/api/user/support-ticket", { method: "POST", body: JSON.stringify(supportForm) });
                  setSupportMsg("Your message was sent. We'll reply by email.");
                  setSupportForm({ subject: "", message: "" });
                } catch { setSupportMsg("Couldn't send. Try again."); }
                finally { setSupportSaving(false); }
              }}>
                <div className="pp5-field">
                  <label className="pp5-field-label">Subject</label>
                  <input className="pp5-input" value={supportForm.subject} onChange={(e) => setSupportForm((p) => ({ ...p, subject: e.target.value }))} placeholder="What do you need help with?" required />
                </div>
                <div className="pp5-field">
                  <label className="pp5-field-label">Message</label>
                  <textarea rows="4" className="pp5-textarea" value={supportForm.message} onChange={(e) => setSupportForm((p) => ({ ...p, message: e.target.value }))} placeholder="Describe what's happening." required />
                </div>
                <div className="pp5-modal-actions">
                  <button type="button" className="pp5-btn pp5-btn-secondary" onClick={() => setShowSupportModal(false)}>Cancel</button>
                  <button type="submit" className="pp5-btn pp5-btn-primary" disabled={supportSaving}>{supportSaving ? "Sending…" : "Send"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default Settings;
