import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { authFetch } from "../apiClient";
import DayExpensesModal from "../components/DayExpensesModal";
import RecurringPanel from "../components/RecurringPanel";
import SavingsPanel from "../components/SavingsPanel";
import InvestmentsPanel from "../components/InvestmentsPanel";
import { useCurrentPaycheckSummary } from "../hooks/useCurrentPaycheckSummary";
import { useCurrentPayPeriodDays } from "../hooks/useCurrentPayPeriodDays";
import { useIncomeSources } from "../hooks/useIncomeSources";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const formatDateLabel = (iso) => {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "";
  return `${month}/${day}/${year}`;
};

const Dashboard = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(true);
  const [triggerAddBill, setTriggerAddBill] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);

  // Profile modal state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  const { sources: incomeSources, refresh: refreshSources } = useIncomeSources();

  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    refresh: refreshSummary,
  } = useCurrentPaycheckSummary();

  const {
    days: payPeriodDays,
    loading: payPeriodLoading,
    error: payPeriodError,
    refresh: refreshPayPeriod,
  } = useCurrentPayPeriodDays();

  const handleAuthError = useCallback(
    (err, fallback) => {
      if (err && err.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
        return;
      }
      setError(err?.message || fallback);
    },
    [navigate]
  );

  const loadUserProfile = useCallback(async () => {
    try {
      const profile = await authFetch("/api/user/me");
      setUser(profile);
      setProfileForm((prev) => ({
        ...prev,
        firstName: profile?.firstName || "",
        lastName: profile?.lastName || "",
        email: profile?.email || "",
      }));
      localStorage.setItem("user", JSON.stringify(profile));
    } catch (err) {
      handleAuthError(err, "Unable to load profile.");
    }
  }, [handleAuthError]);

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedBills = await authFetch("/api/bills");
      setBills(
        [...(fetchedBills || [])].sort(
          (a, b) => (a.dueDayOfMonth || 0) - (b.dueDayOfMonth || 0)
        )
      );
    } catch (err) {
      handleAuthError(err, "Unable to load bills.");
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    loadBills();
    loadUserProfile();
  }, [loadBills, loadUserProfile]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  const handleCreateBill = async (payload) => {
    try {
      const newBill = await authFetch("/api/bills", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          amount: Number(payload.amount),
          dueDayOfMonth: Number(payload.dueDay),
          category: payload.category || "Other",
        }),
      });
      setBills((prev) =>
        [...prev, newBill].sort((a, b) => (a.dueDayOfMonth || 0) - (b.dueDayOfMonth || 0))
      );
      refreshSummary();
      refreshPayPeriod();
    } catch (err) {
      handleAuthError(err, "Unable to save bill.");
    }
  };

  const handleDeleteBill = async (id) => {
    try {
      await authFetch(`/api/bills/${id}`, { method: "DELETE" });
      setBills((prev) => prev.filter((bill) => bill._id !== id));
      refreshSummary();
      refreshPayPeriod();
    } catch (err) {
      handleAuthError(err, "Unable to remove bill.");
    }
  };

  const refreshAll = () => {
    refreshSummary();
    refreshPayPeriod();
    refreshSources();
  };

  const handleProfileFieldChange = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setProfileError("");
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileSaving(true);
    try {
      const body = {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        email: profileForm.email,
      };
      if (showPasswordSection) {
        body.passwordChange = {
          currentPassword: profileForm.currentPassword,
          newPassword: profileForm.newPassword,
          confirmNewPassword: profileForm.confirmNewPassword,
        };
      }
      const updated = await authFetch("/api/user/me", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setUser(updated);
      localStorage.setItem("user", JSON.stringify(updated));
      setProfileForm((prev) => ({
        ...prev,
        firstName: updated?.firstName || "",
        lastName: updated?.lastName || "",
        email: updated?.email || "",
        currentPassword: "",
        newPassword: "",
        confirmNewPassword: "",
      }));
      setShowPasswordSection(false);
      setShowProfileModal(false);
    } catch (err) {
      setProfileError(err?.message || "Unable to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const showOnboarding = !loading && bills.length === 0 && incomeSources.length === 0;

  return (
    <div className="dashboard-page">
      <header className="planner-header">
        <div>
          <h1 className="text-3xl font-bold">
            Welcome Back, {user?.firstName || user?.name || "User"}!
          </h1>
          <p className="muted">Here's your current budget snapshot.</p>
        </div>
        <div className="planner-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setProfileError("");
              setProfileForm((prev) => ({
                ...prev,
                firstName: user?.firstName || "",
                lastName: user?.lastName || "",
                email: user?.email || "",
                currentPassword: "",
                newPassword: "",
                confirmNewPassword: "",
              }));
              setShowPasswordSection(false);
              setShowProfileModal(true);
            }}
          >
            Edit profile
          </button>
          <button type="button" className="secondary-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <section className="paycheck-summary">
        <div className="paycheck-summary-header">
          <h2>Current Budget Period</h2>
          {summary && (
            <p className="muted">
              {formatDateLabel(summary.periodLabel?.start)} –{" "}
              {formatDateLabel(summary.periodLabel?.end)}
            </p>
          )}
        </div>
        {summaryLoading && <p className="status">Loading budget summary...</p>}
        {summaryError && (
          <p className="status status-error">Unable to load budget summary: {summaryError}</p>
        )}
        {summary && !summaryLoading && !summaryError && (
          <>
            <div className="paycheck-grid">
              <div className="paycheck-card">
                <p className="eyebrow">Total income</p>
                <p className="paycheck-value">{currency.format(summary.totalIncome || 0)}</p>
              </div>
              <div className="paycheck-card">
                <p className="eyebrow">Bills this period</p>
                <p className="paycheck-value">{currency.format(summary.totalBills || 0)}</p>
              </div>
              <div className="paycheck-card">
                <p className="eyebrow">Expenses this period</p>
                <p className="paycheck-value">{currency.format(summary.totalExpenses || 0)}</p>
              </div>
              <div className="paycheck-card">
                <p className="eyebrow">Savings this period</p>
                <p className="paycheck-value">{currency.format(summary.savingsThisPeriod || 0)}</p>
              </div>
              <div className="paycheck-card">
                <p className="eyebrow">Investments this period</p>
                <p className="paycheck-value">
                  {currency.format(summary.investmentsThisPeriod || 0)}
                </p>
              </div>
              <div className="paycheck-card highlight">
                <p className="eyebrow">Left to spend</p>
                <p className="paycheck-value">{currency.format(summary.leftToSpend || 0)}</p>
              </div>
              <div className="paycheck-card">
                <p className="eyebrow">Days until next paycheck</p>
                <p className="paycheck-value">
                  {summary.daysUntilNextPaycheck != null ? summary.daysUntilNextPaycheck : "\u2014"}
                </p>
              </div>
            </div>

            {summary.sources && summary.sources.length > 1 && (
              <div className="income-breakdown">
                <h4>Income breakdown</h4>
                <div className="income-breakdown-list">
                  {summary.sources.map((source) => (
                    <div key={source.sourceId} className="income-breakdown-item">
                      <span>{source.name}</span>
                      <span className="muted">
                        {source.paydaysInPeriod}x {currency.format(source.amount)} ={" "}
                        {currency.format(source.totalForPeriod)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold" style={{ marginBottom: "0.5rem" }}>
          Daily planner
        </h2>
        {payPeriodError && (
          <p className="status status-error">Unable to load daily planner: {payPeriodError}</p>
        )}
        {payPeriodLoading ? (
          <p className="status">Loading current pay period...</p>
        ) : !payPeriodDays.length ? (
          <div className="onboarding-card">
            <p>Set your income sources to see your daily planner.</p>
          </div>
        ) : (
          <div className="paycheck-daily-grid">
            {payPeriodDays.map((day) => (
              <button
                key={day.dateKey}
                type="button"
                className="daily-day-card"
                onClick={() => setSelectedDay(day)}
              >
                <div className="daily-day-header">
                  <span className="daily-day-label">
                    {day.weekdayLabel} {day.dayOfMonth}
                  </span>
                  {day.isPayday && <span className="pill payday">Payday</span>}
                </div>
                {day.billsTotal > 0 && (
                  <div className="daily-line bills">Bills: ${day.billsTotal.toFixed(2)}</div>
                )}
                <div className="daily-line expenses">Expenses: ${day.expensesTotal.toFixed(2)}</div>
                {day.billsTotal === 0 && day.expensesTotal === 0 && (
                  <div className="daily-line muted">No activity yet</div>
                )}
              </button>
            ))}
          </div>
        )}
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          Click a day to add or review expenses.
        </p>
      </section>

      {error && <p className="status status-error">{error}</p>}
      {loading && <p className="status">Loading your data...</p>}

      {!loading && (
        <>
          {showOnboarding && (
            <div className="onboarding-card">
              <h3>Let's set up your money flow</h3>
              <p>Add your income sources and recurring bills so we can build your daily plan.</p>
              <div className="onboarding-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => navigate("/settings/income")}
                >
                  Add income source
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setTriggerAddBill((prev) => prev + 1)}
                >
                  Add bills
                </button>
              </div>
            </div>
          )}

          <div className="planner-grid">
            <section className="planner-right" style={{ gridColumn: "1 / -1" }}>
              <div className="space-y-6">
                <RecurringPanel
                  bills={bills}
                  incomeSources={incomeSources}
                  onAddBill={handleCreateBill}
                  onDeleteBill={handleDeleteBill}
                  onSourcesChanged={refreshAll}
                  mobileOpen={mobilePanelOpen}
                  onToggleMobile={() => setMobilePanelOpen((prev) => !prev)}
                  triggerAddBill={triggerAddBill}
                />
                <SavingsPanel />
                <InvestmentsPanel />
              </div>
            </section>
          </div>
        </>
      )}

      {selectedDay && (
        <DayExpensesModal
          isOpen={!!selectedDay}
          date={selectedDay.date}
          items={selectedDay.expenses}
          total={selectedDay.expensesTotal}
          onClose={() => setSelectedDay(null)}
          onExpenseSaved={() => {
            setSelectedDay(null);
            refreshPayPeriod();
          }}
        />
      )}

      {showProfileModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h4>Edit profile</h4>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowProfileModal(false)}
              >
                ✕
              </button>
            </div>
            <form className="modal-form" onSubmit={handleProfileSubmit}>
              <label>
                First name
                <input
                  name="firstName"
                  value={profileForm.firstName}
                  onChange={(e) => handleProfileFieldChange("firstName", e.target.value)}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  name="lastName"
                  value={profileForm.lastName}
                  onChange={(e) => handleProfileFieldChange("lastName", e.target.value)}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={profileForm.email}
                  onChange={(e) => handleProfileFieldChange("email", e.target.value)}
                  required
                />
              </label>

              <button
                type="button"
                className="ghost-button"
                style={{ alignSelf: "flex-start", marginTop: "0.5rem" }}
                onClick={() => setShowPasswordSection((prev) => !prev)}
              >
                {showPasswordSection ? "Cancel password change" : "Change password"}
              </button>

              {showPasswordSection && (
                <>
                  <label>
                    Current password
                    <input
                      type="password"
                      name="currentPassword"
                      value={profileForm.currentPassword}
                      onChange={(e) => handleProfileFieldChange("currentPassword", e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    New password
                    <input
                      type="password"
                      name="newPassword"
                      value={profileForm.newPassword}
                      onChange={(e) => handleProfileFieldChange("newPassword", e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Confirm new password
                    <input
                      type="password"
                      name="confirmNewPassword"
                      value={profileForm.confirmNewPassword}
                      onChange={(e) =>
                        handleProfileFieldChange("confirmNewPassword", e.target.value)
                      }
                      required
                    />
                  </label>
                </>
              )}

              {profileError && <div className="inline-error">{profileError}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowProfileModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={profileSaving}>
                  {profileSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
