import { useMemo, useState } from "react";

import AddEntryInlineForm from "./AddEntryInlineForm";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const DayCard = ({ date, income = [], expenses = [], onAddIncome, onAddExpense }) => {
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  const totals = useMemo(() => {
    const incomeTotal = income.reduce((sum, item) => sum + (item.amount || 0), 0);
    const expenseTotal = expenses.reduce((sum, item) => sum + (item.amount || 0), 0);
    return { incomeTotal, expenseTotal, net: incomeTotal - expenseTotal };
  }, [income, expenses]);

  const formattedDate = useMemo(
    () =>
      date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [date]
  );

  return (
    <div className="day-card">
      <div className="day-card-header">
        <div>
          <p className="eyebrow">{date.toLocaleDateString("en-US", { weekday: "long" })}</p>
          <h3>{formattedDate}</h3>
        </div>
        <span className={`net-pill ${totals.net >= 0 ? "positive" : "negative"}`}>
          Net: {currency.format(totals.net)}
        </span>
      </div>

      <div className="entry-section">
        <div className="entry-section-header">
          <h4>Income</h4>
          <span className="section-total">{currency.format(totals.incomeTotal)}</span>
        </div>
        {income.length === 0 ? (
          <p className="empty-row">No income yet.</p>
        ) : (
          <ul className="entry-list">
            {income.map((item) => (
              <li key={item.id || item.description}>
                <div>
                  <span className="entry-title">{item.description || "Income"}</span>
                  {item.isRecurring && <span className="pill">Recurring</span>}
                </div>
                <span className="entry-amount positive">{currency.format(item.amount || 0)}</span>
              </li>
            ))}
          </ul>
        )}
        {showIncomeForm && (
          <AddEntryInlineForm
            submitLabel="Add income"
            onSubmit={(payload) => onAddIncome?.(payload)}
            onCancel={() => setShowIncomeForm(false)}
          />
        )}
      </div>

      <div className="entry-section">
        <div className="entry-section-header">
          <h4>Expenses</h4>
          <span className="section-total">{currency.format(totals.expenseTotal)}</span>
        </div>
        {expenses.length === 0 ? (
          <p className="empty-row">No expenses yet.</p>
        ) : (
          <ul className="entry-list">
            {expenses.map((item) => (
              <li key={item.id || item.description}>
                <div>
                  <span className="entry-title">{item.description || "Expense"}</span>
                  {item.isRecurring && <span className="pill">Recurring</span>}
                </div>
                <span className="entry-amount negative">
                  {currency.format(item.amount || 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {showExpenseForm && (
          <AddEntryInlineForm
            submitLabel="Add expense"
            onSubmit={(payload) => onAddExpense?.(payload)}
            onCancel={() => setShowExpenseForm(false)}
          />
        )}
      </div>

      <div className="day-card-footer">
        <button type="button" className="primary-button ghost" onClick={() => setShowIncomeForm(true)}>
          + Income
        </button>
        <button type="button" className="primary-button" onClick={() => setShowExpenseForm(true)}>
          + Expense
        </button>
      </div>
    </div>
  );
};

export default DayCard;
