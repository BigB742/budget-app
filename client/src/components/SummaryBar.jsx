const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

const SummaryBar = ({ periodLabel, totalIncome, totalExpenses, leftToSpend, daysUntilNextPaycheck }) => {
  const stats = [
    { label: "Current period", value: periodLabel, tone: "muted" },
    { label: "Total income", value: formatCurrency(totalIncome), tone: "positive" },
    { label: "Total expenses", value: formatCurrency(totalExpenses), tone: "neutral" },
    { label: "Left to spend", value: formatCurrency(leftToSpend), tone: leftToSpend >= 0 ? "positive" : "negative" },
    {
      label: "Days until next paycheck",
      value: daysUntilNextPaycheck != null ? `${daysUntilNextPaycheck} days` : "—",
      tone: "neutral",
    },
  ];

  return (
    <div className="summary-bar">
      {stats.map((stat) => (
        <div key={stat.label} className="summary-tile">
          <span className="summary-label">{stat.label}</span>
          <span className={`summary-value ${stat.tone}`}>
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export default SummaryBar;
