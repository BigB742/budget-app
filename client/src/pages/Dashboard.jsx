import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { authFetch } from "../apiClient";
import DailyPlanner from "../components/DailyPlanner";
import DayExpensesModal from "../components/DayExpensesModal";
import RecurringPanel from "../components/RecurringPanel";
import SavingsPanel from "../components/SavingsPanel";
import InvestmentsPanel from "../components/InvestmentsPanel";
import { useCurrentPaycheckSummary } from "../hooks/useCurrentPaycheckSummary";
import { useCurrentPayPeriodDays } from "../hooks/useCurrentPayPeriodDays";
import { stripTime } from "../utils/dateUtils";

const buildDateRange = (start, endExclusive) => {
  const days = [];
  if (!start || !endExclusive) return days;
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor < endExclusive) {
    days.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return days;
};

const Dashboard = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [plannerLoading, setPlannerLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(true);
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
  const [triggerAddBill, setTriggerAddBill] = useState(0);
  const [triggerAddIncome, setTriggerAddIncome] = useState(0);
  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    refresh: refreshSummary,
  } = useCurrentPaycheckSummary();
  const {
    summary: payPeriodSummary,
    days: payPeriodDays,
    loading: payPeriodLoading,
    error: payPeriodError,
    refresh: refreshPayPeriod,
  } = useCurrentPayPeriodDays();
  const [selectedDay, setSelectedDay] = useState(null);
  const [resettingExpenses, setResettingExpenses] = useState(false);

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
        currentPassword: "",
        newPassword: "",
        confirmNewPassword: "",
      }));
      localStorage.setItem("user", JSON.stringify(profile));
    } catch (err) {
      console.error(err);
      handleAuthError(err, "Unable to load profile.");
    }
  }, [handleAuthError]);

  const loadCoreData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedIncomes, fetchedBills] = await Promise.all([
        authFetch("/api/income"),
        authFetch("/api/bills"),
      ]);

      const sortedBills = [...(fetchedBills || [])].sort(
        (a, b) => (a.dueDay || 0) - (b.dueDay || 0)
      );

      setIncomes(fetchedIncomes || []);
      setBills(sortedBills);
    } catch (err) {
      console.error(err);
      handleAuthError(err, "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  const loadExpensesForPeriod = useCallback(async (periodStart, periodEndExclusive) => {
    if (!periodStart || !periodEndExclusive) {
      setExpenses([]);
      return;
    }
    const endInclusive = new Date(
      periodEndExclusive.getFullYear(),
      periodEndExclusive.getMonth(),
      periodEndExclusive.getDate() - 1
    );
    const params = new URLSearchParams({
      from: stripTime(periodStart).toISOString(),
      to: stripTime(endInclusive).toISOString(),
    });
    const data = await authFetch(`/api/expenses?${params.toString()}`);
    setExpenses(data || []);
  }, []);

  useEffect(() => {
    loadCoreData();
    loadUserProfile();
  }, [loadCoreData, loadUserProfile]);

  const payPeriod = useMemo(() => {
    if (!incomes.length) return null;

    const paychecks = (incomes.some((inc) => inc.type === "paycheck")
      ? incomes.filter((inc) => inc.type === "paycheck")
      : incomes
    )
      .filter((inc) => inc?.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!paychecks.length) return null;

    const today = stripTime(new Date());
    let lastPayday = paychecks[0];
    let nextPayday = null;

    paychecks.forEach((p) => {
      const d = stripTime(new Date(p.date));
      if (d <= today) {
        lastPayday = p;
      } else if (!nextPayday && d > today) {
        nextPayday = p;
      }
    });

    const periodStart = stripTime(new Date(lastPayday.date));
    const periodEndExclusive = nextPayday
      ? stripTime(new Date(nextPayday.date))
      : stripTime(new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + 14));

    return { periodStart, periodEndExclusive, nextPayday: nextPayday?.date || null };
  }, [incomes]);

  const periodRange = useMemo(() => {
    if (!payPeriod) return null;
    return { start: payPeriod.periodStart, endExclusive: payPeriod.periodEndExclusive };
  }, [payPeriod]);

  useEffect(() => {
    const loadExpenses = async () => {
      setPlannerLoading(true);
      try {
        if (!periodRange) {
          setExpenses([]);
          return;
        }
        await loadExpensesForPeriod(periodRange.start, periodRange.endExclusive);
      } catch (err) {
        console.error(err);
        handleAuthError(err, "Unable to load expenses.");
      } finally {
        setPlannerLoading(false);
      }
    };
    loadExpenses();
  }, [periodRange, loadExpensesForPeriod]);

  const days = useMemo(() => {
    if (!periodRange) return [];
    return buildDateRange(periodRange.start, periodRange.endExclusive);
  }, [periodRange]);

  const entriesByDate = useMemo(() => {
    if (!days.length) return {};
    const map = {};
    days.forEach((d) => {
      const key = stripTime(d).toISOString().slice(0, 10);
      map[key] = { income: [], expenses: [] };
    });

    const withinPeriod = (date) =>
      periodRange &&
      stripTime(date) >= stripTime(periodRange.start) &&
      stripTime(date) < stripTime(periodRange.endExclusive);

    incomes
      .filter((item) => item?.date && withinPeriod(item.date))
      .forEach((item) => {
        const key = stripTime(new Date(item.date)).toISOString().slice(0, 10);
        if (!map[key]) map[key] = { income: [], expenses: [] };
        map[key].income.push({
          id: item._id || item.id,
          description: item.description || "Income",
          amount: Number(item.amount) || 0,
          category: item.category,
          isRecurring: item.type === "paycheck",
        });
      });

    expenses
      .filter((exp) => exp?.date && withinPeriod(exp.date))
      .forEach((exp) => {
        const key = stripTime(new Date(exp.date)).toISOString().slice(0, 10);
        if (!map[key]) map[key] = { income: [], expenses: [] };
        map[key].expenses.push({
          id: exp._id || exp.id,
          description: exp.description || exp.category || "Expense",
          amount: Number(exp.amount) || 0,
          category: exp.category,
        });
      });

    days.forEach((d) => {
      const key = stripTime(d).toISOString().slice(0, 10);
      bills.forEach((bill) => {
        if (bill.dueDay === d.getDate()) {
          map[key].expenses.push({
            id: bill._id,
            description: bill.name,
            amount: Number(bill.amount) || 0,
            category: bill.category,
            isRecurring: true,
          });
        }
      });
    });

    return map;
  }, [bills, days, expenses, incomes, periodRange]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  const handleAddIncome = async (date, payload) => {
    if (!date) return;
    try {
      const isoDate = stripTime(date).toISOString();
      const created = await authFetch("/api/income", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(payload.amount),
          date: isoDate,
          description: payload.description,
          type: "paycheck",
        }),
      });
      setIncomes((prev) => [...prev, created]);
    } catch (err) {
      console.error(err);
      handleAuthError(err, "Unable to add income.");
    }
  };

  const handleDeleteIncome = async (id) => {
    try {
      await authFetch(`/api/income/${id}`, { method: "DELETE" });
      setIncomes((prev) => prev.filter((i) => i._id !== id));
    } catch (err) {
      console.error(err);
      handleAuthError(err, "Unable to delete income.");
    }
  };

  const handleAddExpense = async (date, payload) => {
    if (!date) return;
    try {
      const iso = stripTime(date).toISOString().slice(0, 10);
      const created = await authFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          date: iso,
          amount: Number(payload.amount),
          category: payload.category || "Other",
          description: payload.description,
        }),
      });
      setExpenses((prev) => [...prev, created]);
    } catch (err) {
      console.error(err);
      handleAuthError(err, "Unable to add expense.");
    }
  };

  const handleCreateBill = async (payload) => {
    try {
      const newBill = await authFetch("/api/bills", {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          amount: Number(payload.amount),
          dueDay: Number(payload.dueDay),
          category: payload.category || "Other",
        }),
      });
      setBills((prev) => [...prev, newBill].sort((a, b) => (a.dueDay || 0) - (b.dueDay || 0)));
    } catch (err) {
      console.error(err);
      handleAuthError(err, "Unable to save bill.");
    }
  };

  const handleDeleteBill = async (id) => {
    try {
      await authFetch(`/api/bills/${id}`, { method: "DELETE" });
      setBills((prev) => prev.filter((bill) => bill._id !== id));
    } catch (err) {
      console.error(err);
      handleAuthError(err, "Unable to remove bill.");
    }
  };

  const openAddIncomeModal = () => {
    setMobilePanelOpen(true);
    setTriggerAddIncome((prev) => prev + 1);
  };

  const openAddBillModal = () => {
    setMobilePanelOpen(true);
    setTriggerAddBill((prev) => prev + 1);
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
      console.error(err);
      setProfileError(err?.message || "Unable to update profile.");
      handleAuthError(err, "Unable to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const hasAnyRecurringIncome = (incomes || []).length > 0;
  const showOnboarding = !loading && bills.length === 0 && !hasAnyRecurringIncome;

  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : "—");
  const formatDateLabel = (iso) => {
    if (!iso) return "";
    const [year, month, day] = iso.split("-");
    if (!year || !month || !day) return "";
    return `${month}/${day}/${year}`;
  };

  const handleDevResetExpenses = async () => {
    const confirmed = window.confirm(
      "This will delete ALL your expenses. This is for development/testing only. Continue?"
    );
    if (!confirmed) return;
    try {
      setResettingExpenses(true);
      await authFetch("/api/expenses/dev-reset", { method: "DELETE" });
      refreshSummary?.();
      refreshPayPeriod?.();
    } catch (err) {
      console.error(err);
      setError("Failed to reset expenses.");
    } finally {
      setResettingExpenses(false);
    }
  };

  return (
    <div className="dashboard-page">
      <header className="planner-header">
        <div>
          <h1 className="text-3xl font-bold">
            Welcome Back, {user?.firstName || user?.name || "User"}!
          </h1>
          <p className="muted">Here’s your current paycheck snapshot.</p>
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
          <h2>Current Paycheck</h2>
          {summary && (
            <p className="muted">
              Period:{" "}
              {summary.periodLabel?.start
                ? formatDateLabel(summary.periodLabel.start)
                : formatDate(summary?.period?.start)}{" "}
              –{" "}
              {summary.periodLabel?.end
                ? formatDateLabel(summary.periodLabel.end)
                : formatDate(summary?.period?.end)}
            </p>
          )}
        </div>
        {summaryLoading && <p className="status">Loading paycheck summary...</p>}
        {summaryError && (
          <p className="status status-error">Unable to load paycheck summary: {summaryError}</p>
        )}
        {summary && !summaryLoading && !summaryError && (
          <div className="paycheck-grid">
            <div className="paycheck-card">
              <p className="eyebrow">Paycheck amount</p>
              <p className="paycheck-value">{currency.format(summary.paycheckAmount || 0)}</p>
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
            <p className="paycheck-value">
              {currency.format(summary.savingsThisPeriod ?? summary.totalSavings ?? 0)}
            </p>
            </div>
            <div className="paycheck-card">
              <p className="eyebrow">Investments this period</p>
              <p className="paycheck-value">
                {currency.format(summary.investmentsThisPeriod ?? summary.totalInvestments ?? 0)}
              </p>
            </div>
            <div className="paycheck-card highlight">
              <p className="eyebrow">Left to spend</p>
              <p className="paycheck-value">{currency.format(summary.leftToSpend || 0)}</p>
            </div>
            <div className="paycheck-card">
              <p className="eyebrow">Days until next paycheck</p>
              <p className="paycheck-value">
                {summary.daysUntilNextPaycheck != null ? summary.daysUntilNextPaycheck : "—"}
              </p>
            </div>
          </div>
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
        ) : !payPeriodSummary?.period ? (
          <div className="onboarding-card">
            <p>Set your pay schedule to see your daily planner.</p>
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
        <button
          type="button"
          className="ghost-button"
          style={{ marginTop: "0.35rem", padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
          onClick={handleDevResetExpenses}
          disabled={resettingExpenses}
        >
          Reset expenses (dev only)
          <span style={{ color: "#6b7280", marginLeft: "0.35rem" }}>(testing only)</span>
        </button>
      </section>

      {error && <p className="status status-error">{error}</p>}
      {loading && <p className="status">Loading your planner...</p>}

      {!loading && (
        <>
          {showOnboarding && (
            <div className="onboarding-card">
              <h3>Let’s set up your money flow</h3>
              <p>Add your paycheck and recurring bills so we can build your daily plan.</p>
              <div className="onboarding-actions">
                <button type="button" className="primary-button" onClick={openAddIncomeModal}>
                  Add income
                </button>
                <button type="button" className="secondary-button" onClick={openAddBillModal}>
                  Add bills
                </button>
              </div>
            </div>
          )}

          <div className="planner-grid">
            <section className="planner-left">
              <DailyPlanner
                days={days}
                entriesByDate={entriesByDate}
                loading={plannerLoading}
                onAddIncome={handleAddIncome}
                onAddExpense={handleAddExpense}
              />
            </section>
            <section className="planner-right">
              <div className="space-y-6">
                <RecurringPanel
                  bills={bills}
                  incomes={incomes}
                  onAddBill={handleCreateBill}
                  onDeleteBill={handleDeleteBill}
                  onAddIncome={(payload) => handleAddIncome(new Date(payload.date), payload)}
                  onDeleteIncome={handleDeleteIncome}
                  mobileOpen={mobilePanelOpen}
                  onToggleMobile={() => setMobilePanelOpen((prev) => !prev)}
                  triggerAddBill={triggerAddBill}
                  triggerAddIncome={triggerAddIncome}
                  incomeSettings={user?.incomeSettings}
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
              <button type="button" className="ghost-button" onClick={() => setShowProfileModal(false)}>
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
                <button type="button" className="ghost-button" onClick={() => setShowProfileModal(false)}>
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
