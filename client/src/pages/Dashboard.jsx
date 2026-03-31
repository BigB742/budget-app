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

const CATEGORY_OPTIONS = [
  { value: "Food", label: "\ud83c\udf54 Food" },
  { value: "Dining Out", label: "\ud83c\udf7d\ufe0f Dining Out" },
  { value: "Entertainment", label: "\ud83c\udfac Entertainment" },
  { value: "Gas", label: "\u26fd Gas" },
  { value: "Groceries", label: "\ud83d\uded2 Groceries" },
  { value: "Home", label: "\ud83c\udfe0 Home" },
  { value: "Health", label: "\ud83d\udc8a Health" },
  { value: "Shopping", label: "\ud83d\udc57 Shopping" },
  { value: "Travel", label: "\u2708\ufe0f Travel" },
  { value: "Subscriptions", label: "\ud83d\udce6 Subscriptions" },
  { value: "Other", label: "\ud83d\udcb8 Other" },
];

const formatReadableDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const [showAllDays, setShowAllDays] = useState(false);

  // Quick-add expense form
  const [quickForm, setQuickForm] = useState({
    description: "",
    amount: "",
    category: "Food",
  });
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState("");

  // Profile modal
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
          lastPaymentDate: payload.lastPaymentDate || null,
          lastPaymentAmount: payload.lastPaymentAmount
            ? Number(payload.lastPaymentAmount)
            : null,
        }),
      });
      setBills((prev) =>
        [...prev, newBill].sort((a, b) => (a.dueDayOfMonth || 0) - (b.dueDayOfMonth || 0))
      );
      refreshAll();
    } catch (err) {
      handleAuthError(err, "Unable to save bill.");
    }
  };

  const handleDeleteBill = async (id) => {
    try {
      await authFetch(`/api/bills/${id}`, { method: "DELETE" });
      setBills((prev) => prev.filter((bill) => bill._id !== id));
      refreshAll();
    } catch (err) {
      handleAuthError(err, "Unable to remove bill.");
    }
  };

  const refreshAll = () => {
    refreshSummary();
    refreshPayPeriod();
    refreshSources();
  };

  // Quick-add expense handler
  const handleQuickExpense = async (e) => {
    e.preventDefault();
    if (!quickForm.amount || Number(quickForm.amount) <= 0) return;
    setQuickSaving(true);
    setQuickError("");
    try {
      await authFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          date: todayISO(),
          amount: Number(quickForm.amount),
          category: quickForm.category,
          description: quickForm.description,
        }),
      });
      setQuickForm({ description: "", amount: "", category: "Food" });
      refreshAll();
    } catch (err) {
      console.error(err);
      setQuickError("Couldn't save. Try again.");
    } finally {
      setQuickSaving(false);
    }
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

  // Filter planner days: only show days with activity unless toggled
  const activeDays = payPeriodDays.filter(
    (d) => d.billsTotal > 0 || d.expensesTotal > 0 || d.isPayday
  );
  const displayDays = showAllDays ? payPeriodDays : activeDays;

  return (
    <div className="dashboard-page">
      {/* ── Top bar ── */}
      <header className="top-bar">
        <span className="top-bar-greeting">
          Hi, {user?.firstName || user?.name || "there"}
        </span>
        <div className="top-bar-actions">
          <button
            type="button"
            className="link-button"
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
            Profile
          </button>
          <button type="button" className="link-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>


      {/* ── Hero balance ── */}
      <section className="hero">
        {summaryLoading && <p className="hero-loading">Loading...</p>}
        {summaryError && (
          <p className="hero-error">Unable to load balance: {summaryError}</p>
        )}
        {summary && !summaryLoading && !summaryError && (
          <>
            <p className="hero-label">You can spend</p>
            <p className="hero-balance">{currency.format(summary.balance || 0)}</p>
            <p className="hero-sub">
              After all bills through {formatReadableDate(summary.periodLabel?.end)}
            </p>
            {summary.nextPaycheckBalance != null && summary.nextPayDateLabel && (
              <div className="hero-next-pill">
                Next paycheck ({formatReadableDate(summary.nextPayDateLabel)}):{" "}
                <strong>{currency.format(summary.nextPaycheckBalance)}</strong>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Stat cards 2x2 ── */}
      {summary && !summaryLoading && !summaryError && (
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">Bills to pay</span>
            <span className="stat-value bills">{currency.format(summary.totalBills || 0)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">What I've spent</span>
            <span className="stat-value">{currency.format(summary.totalExpenses || 0)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Days left</span>
            <span className="stat-value">
              {summary.daysUntilNextPaycheck != null ? summary.daysUntilNextPaycheck : "\u2014"}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Savings goal</span>
            <span className="stat-value">{currency.format(summary.savingsThisPeriod || 0)}</span>
          </div>
        </div>
      )}

      {/* ── Quick expense bar ── */}
      <section className="quick-add">
        <form className="quick-add-form" onSubmit={handleQuickExpense}>
          <input
            type="text"
            name="description"
            placeholder="Description"
            value={quickForm.description}
            onChange={(e) => setQuickForm((p) => ({ ...p, description: e.target.value }))}
            className="quick-input quick-desc"
          />
          <input
            type="number"
            name="amount"
            placeholder="$0.00"
            step="0.01"
            min="0.01"
            value={quickForm.amount}
            onChange={(e) => setQuickForm((p) => ({ ...p, amount: e.target.value }))}
            required
            className="quick-input quick-amount"
          />
          <select
            name="category"
            value={quickForm.category}
            onChange={(e) => setQuickForm((p) => ({ ...p, category: e.target.value }))}
            className="quick-input quick-cat"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button type="submit" className="quick-add-btn" disabled={quickSaving}>
            {quickSaving ? "..." : "+ Add"}
          </button>
        </form>
        {quickError && <p className="quick-error">{quickError}</p>}
      </section>

      {/* ── Daily planner (activity-only by default) ── */}
      <section className="planner-section">
        <div className="planner-header-row">
          <h2 className="section-title">Upcoming</h2>
          <button
            type="button"
            className="link-button"
            onClick={() => setShowAllDays((p) => !p)}
          >
            {showAllDays ? "Active only" : "Show all days"}
          </button>
        </div>

        {payPeriodError && (
          <p className="status status-error">{payPeriodError}</p>
        )}
        {payPeriodLoading ? (
          <p className="status">Loading...</p>
        ) : !payPeriodDays.length ? (
          <div className="empty-state">
            <p>Set up your income to see your daily plan.</p>
          </div>
        ) : displayDays.length === 0 ? (
          <p className="empty-hint">No upcoming bills or expenses this period.</p>
        ) : (
          <ul className="activity-list">
            {displayDays.map((day) => (
              <li key={day.dateKey}>
                <button
                  type="button"
                  className="activity-row"
                  onClick={() => setSelectedDay(day)}
                >
                  <span className="activity-date">
                    {day.weekdayLabel} {day.dayOfMonth}
                    {day.isPayday && <span className="payday-dot" title="Payday" />}
                  </span>
                  <span className="activity-details">
                    {day.bills.map((b) => (
                      <span key={b._id} className="activity-item bill-item">
                        {b.name} &minus;{currency.format(b.amount)}
                      </span>
                    ))}
                    {day.expenses.map((exp, i) => (
                      <span key={exp._id || i} className="activity-item expense-item">
                        {exp.description || exp.category || "Expense"}{" "}
                        {currency.format(exp.amount)}
                      </span>
                    ))}
                    {day.billsTotal === 0 && day.expensesTotal === 0 && !day.isPayday && (
                      <span className="activity-item empty-item">No activity</span>
                    )}
                    {day.billsTotal === 0 && day.expensesTotal === 0 && day.isPayday && (
                      <span className="activity-item payday-label">Payday</span>
                    )}
                  </span>
                  <span className="activity-total">
                    {day.billsTotal > 0 && (
                      <span className="amt-bill">&minus;{currency.format(day.billsTotal)}</span>
                    )}
                    {day.expensesTotal > 0 && (
                      <span className="amt-exp">{currency.format(day.expensesTotal)}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="planner-hint">Tap a day to add or review expenses.</p>
      </section>

      {/* ── Income & Bills / Savings / Investments ── */}
      {error && <p className="status status-error">{error}</p>}
      {loading && <p className="status">Loading...</p>}

      {!loading && (
        <>
          {showOnboarding && (
            <div className="empty-state" style={{ marginTop: "1.5rem" }}>
              <h3>Let's set up your money flow</h3>
              <p>Add your income and bills so we can show your real balance.</p>
              <div className="onboarding-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => navigate("/settings/income")}
                >
                  Add income
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

          <div className="panels-section">
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
        </>
      )}

      {/* ── Day expenses modal ── */}
      {selectedDay && (
        <DayExpensesModal
          isOpen={!!selectedDay}
          date={selectedDay.date}
          items={selectedDay.expenses}
          total={selectedDay.expensesTotal}
          onClose={() => setSelectedDay(null)}
          onExpenseSaved={() => {
            setSelectedDay(null);
            refreshAll();
          }}
        />
      )}

      {/* ── Profile modal ── */}
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
                &#x2715;
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
