import { useMemo, useState } from "react";

import { useInvestments } from "../hooks/useInvestments";

const InvestmentsPanel = () => {
  const { investments, loading, error, addInvestment, contributeToInvestment, deleteInvestment } =
    useInvestments();

  const [form, setForm] = useState({ assetName: "", startingBalance: "" });
  const [saving, setSaving] = useState(false);
  const [contributionInputs, setContributionInputs] = useState({});

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await addInvestment({
        assetName: form.assetName,
        startingBalance: Number(form.startingBalance) || 0,
      });
      setForm({ assetName: "", startingBalance: "" });
    } catch (err) {
      console.error(err);
      alert("Failed to add investment.");
    } finally {
      setSaving(false);
    }
  };

  const totalInvested = (inv) =>
    Number(inv.startingBalance || 0) +
    (inv.contributions || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString();
  };

  const renderInvestment = (inv) => {
    const total = totalInvested(inv);
    const contributionInput = contributionInputs[inv._id] || { amount: "", date: "", note: "" };
    return (
      <div key={inv._id} className="recurring-card">
        <div>
          <p className="entry-title">{inv.assetName}</p>
          <p className="muted">
            Total invested: ${total.toFixed(2)} (Starting: ${Number(inv.startingBalance || 0).toFixed(2)}
            )
          </p>
          <p className="muted">
            Last updated: {inv.updatedAt ? formatDate(inv.updatedAt) : "—"}
          </p>
        </div>
        <div className="recurring-actions" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <div className="investment-contrib">
            <input
              type="number"
              step="0.01"
              placeholder="Amount"
              value={contributionInput.amount}
              onChange={(e) =>
                setContributionInputs((prev) => ({
                  ...prev,
                  [inv._id]: { ...contributionInput, amount: e.target.value },
                }))
              }
            />
            <input
              type="date"
              value={contributionInput.date}
              onChange={(e) =>
                setContributionInputs((prev) => ({
                  ...prev,
                  [inv._id]: { ...contributionInput, date: e.target.value },
                }))
              }
            />
            <input
              type="text"
              placeholder="Note (optional)"
              value={contributionInput.note}
              onChange={(e) =>
                setContributionInputs((prev) => ({
                  ...prev,
                  [inv._id]: { ...contributionInput, note: e.target.value },
                }))
              }
            />
            <button
              type="button"
              className="secondary-button"
              onClick={async () => {
                const amt = Number(contributionInput.amount);
                if (!amt || amt <= 0) return;
                try {
                  await contributeToInvestment(inv._id, {
                    amount: amt,
                    date: contributionInput.date || undefined,
                    note: contributionInput.note,
                  });
                  setContributionInputs((prev) => ({ ...prev, [inv._id]: { amount: "", date: "", note: "" } }));
                } catch (err) {
                  console.error(err);
                  alert("Failed to add contribution.");
                }
              }}
            >
              Add
            </button>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              if (window.confirm("Delete this investment? This will remove its history.")) {
                deleteInvestment(inv._id).catch(() => alert("Failed to delete investment."));
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="recurring-section" style={{ marginTop: "1rem" }}>
      <div className="recurring-section-header">
        <div>
          <h4>Investments</h4>
          <p className="muted">Track money you’re putting into Bitcoin, stocks, and more.</p>
        </div>
      </div>

      <form className="investment-form" onSubmit={handleSubmit}>
        <input
          type="text"
          name="assetName"
          placeholder="e.g. Bitcoin"
          value={form.assetName}
          onChange={handleChange}
          required
        />
        <input
          type="number"
          name="startingBalance"
          step="0.01"
          placeholder="Starting balance"
          value={form.startingBalance}
          onChange={handleChange}
        />
        <button type="submit" className="secondary-button" disabled={saving}>
          {saving ? "Saving..." : "Add investment"}
        </button>
      </form>

      {error && <p className="status status-error">{error}</p>}
      {loading ? (
        <p className="status">Loading investments...</p>
      ) : investments.length === 0 ? (
        <p className="empty-row">No investments yet. Add your first one.</p>
      ) : (
        <div className="recurring-list">{investments.map(renderInvestment)}</div>
      )}
    </div>
  );
};

export default InvestmentsPanel;
