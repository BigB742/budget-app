import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../apiClient";

const Settings = () => {
  const navigate = useNavigate();

  // ── Appearance state ──
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "system");
  const [textSize, setTextSize] = useState(() => localStorage.getItem("textSize") || "medium");
  const [accent, setAccent] = useState(() => localStorage.getItem("accent") || "teal");

  // ── Account state ──
  const [user, setUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
  });
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // ── Notifications state (UI only) ──
  const [billReminder, setBillReminder] = useState(false);
  const [lowBalance, setLowBalance] = useState(false);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState("100");

  // ── Danger zone state ──
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // ── Apply appearance settings on mount and change ──
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-text-size", textSize);
    localStorage.setItem("textSize", textSize);
  }, [textSize]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
    localStorage.setItem("accent", accent);
  }, [accent]);

  // ── Fetch user profile ──
  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const profile = await authFetch("/api/user/me");
      setUser(profile);
      setProfileForm({
        firstName: profile?.firstName || "",
        lastName: profile?.lastName || "",
      });
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
        return;
      }
      setProfileError(err?.message || "Unable to load profile.");
    } finally {
      setProfileLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ── Save profile ──
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess("");
    setSaving(true);

    try {
      const body = {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
      };

      if (showPasswordSection) {
        body.passwordChange = {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
          confirmNewPassword: passwordForm.confirmNewPassword,
        };
      }

      const updated = await authFetch("/api/user/me", {
        method: "PUT",
        body: JSON.stringify(body),
      });

      setUser(updated);
      localStorage.setItem("user", JSON.stringify(updated));
      setProfileForm({
        firstName: updated?.firstName || "",
        lastName: updated?.lastName || "",
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
      setShowPasswordSection(false);
      setSaveSuccess("Profile updated.");
    } catch (err) {
      setSaveError(err?.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  };

  // ── Avatar initials ──
  const initials =
    ((profileForm.firstName?.[0] || "") + (profileForm.lastName?.[0] || "")).toUpperCase() || "?";

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Settings</h1>

      {/* ── APPEARANCE ── */}
      <div className="settings-section">
        <h2 className="section-title">Appearance</h2>

        <div className="settings-field">
          <span className="settings-label">Theme</span>
          <div className="settings-radio-group">
            {["light", "dark", "system"].map((value) => (
              <label key={value} className="settings-radio">
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => setTheme(value)}
                />
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <span className="settings-label">Text size</span>
          <div className="settings-radio-group">
            {["small", "medium", "large"].map((value) => (
              <label key={value} className="settings-radio">
                <input
                  type="radio"
                  name="textSize"
                  value={value}
                  checked={textSize === value}
                  onChange={() => setTextSize(value)}
                />
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div className="settings-field">
          <span className="settings-label">Accent color</span>
          <div className="settings-color-group">
            {[
              { value: "teal", color: "#14b8a6" },
              { value: "purple", color: "#a855f7" },
              { value: "blue", color: "#3b82f6" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`settings-color-swatch${accent === opt.value ? " active" : ""}`}
                style={{ backgroundColor: opt.color }}
                onClick={() => setAccent(opt.value)}
                aria-label={opt.value}
                title={opt.value.charAt(0).toUpperCase() + opt.value.slice(1)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── ACCOUNT ── */}
      <div className="settings-section">
        <h2 className="section-title">Account</h2>

        {profileLoading && <p className="status">Loading profile...</p>}
        {profileError && <p className="status status-error">{profileError}</p>}

        {!profileLoading && user && (
          <form className="settings-account-form" onSubmit={handleSaveProfile}>
            <div className="settings-avatar">{initials}</div>

            <label>
              First name
              <input
                type="text"
                value={profileForm.firstName}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, firstName: e.target.value }))
                }
                required
              />
            </label>

            <label>
              Last name
              <input
                type="text"
                value={profileForm.lastName}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, lastName: e.target.value }))
                }
                required
              />
            </label>

            <label>
              Email
              <input type="email" value={user.email || ""} disabled readOnly />
            </label>

            <button
              type="button"
              className="ghost-button"
              style={{ alignSelf: "flex-start", marginTop: "0.25rem" }}
              onClick={() => {
                setShowPasswordSection((prev) => !prev);
                setPasswordForm({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
              }}
            >
              {showPasswordSection ? "Cancel password change" : "Change password"}
            </button>

            {showPasswordSection && (
              <>
                <label>
                  Current password
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  New password
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type="password"
                    value={passwordForm.confirmNewPassword}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        confirmNewPassword: e.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </>
            )}

            {saveError && <div className="inline-error">{saveError}</div>}
            {saveSuccess && <div className="inline-success">{saveSuccess}</div>}

            <div className="modal-actions">
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── NOTIFICATIONS ── */}
      <div className="settings-section">
        <h2 className="section-title">Notifications</h2>

        <div className="settings-field">
          <label className="settings-toggle-row">
            <span>
              Remind me when a bill is due
              <span className="settings-badge">Coming soon</span>
            </span>
            <input
              type="checkbox"
              checked={billReminder}
              onChange={() => setBillReminder((prev) => !prev)}
            />
          </label>
        </div>

        <div className="settings-field">
          <label className="settings-toggle-row">
            <span>
              Low balance warning
              <span className="settings-badge">Coming soon</span>
            </span>
            <input
              type="checkbox"
              checked={lowBalance}
              onChange={() => setLowBalance((prev) => !prev)}
            />
          </label>
          {lowBalance && (
            <label className="settings-threshold">
              Threshold ($)
              <input
                type="number"
                min="0"
                step="1"
                value={lowBalanceThreshold}
                onChange={(e) => setLowBalanceThreshold(e.target.value)}
              />
            </label>
          )}
        </div>
      </div>

      {/* ── DANGER ZONE ── */}
      <div className="settings-section">
        <h2 className="section-title">Danger Zone</h2>

        <div className="settings-danger-card">
          <p>Permanently delete your account and all associated data.</p>
          <button
            type="button"
            className="danger-button"
            onClick={() => setShowDeleteModal(true)}
          >
            Delete account
          </button>
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h4>Delete account</h4>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowDeleteModal(false)}
              >
                &#x2715;
              </button>
            </div>
            <div className="modal-form">
              <p>Are you sure? This cannot be undone.</p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button type="button" className="danger-button" disabled>
                Not yet available
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
