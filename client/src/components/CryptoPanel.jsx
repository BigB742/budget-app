import { useCallback, useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { authFetch } from "../apiClient";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const CryptoPanel = ({ showChart = false }) => {
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ assetName: "", ticker: "", amount: "", pricePerCoin: "", date: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await authFetch("/api/investments"); setInvestments(Array.isArray(d) ? d : []); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalInvested = investments.reduce((s, inv) => {
    const fromPurchases = (inv.purchases || []).reduce((t, p) => t + (p.amount * p.pricePerCoin), 0);
    const legacy = (inv.startingBalance || 0) + (inv.contributions || []).reduce((t, c) => t + (c.amount || 0), 0);
    return s + fromPurchases + legacy;
  }, 0);

  // Build chart data: cumulative investment over time
  const chartData = (() => {
    const points = [];
    investments.forEach((inv) => {
      (inv.purchases || []).forEach((p) => { points.push({ date: p.date, amount: p.amount * p.pricePerCoin }); });
      (inv.contributions || []).forEach((c) => { if (c.date && c.amount) points.push({ date: c.date, amount: c.amount }); });
    });
    points.sort((a, b) => new Date(a.date) - new Date(b.date));
    let cumulative = 0;
    return points.map((p) => {
      cumulative += p.amount;
      const d = new Date(p.date);
      return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: cumulative };
    });
  })();

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authFetch("/api/investments", {
        method: "POST",
        body: JSON.stringify({
          assetName: form.assetName, ticker: form.ticker,
          purchases: [{ amount: Number(form.amount), pricePerCoin: Number(form.pricePerCoin), date: form.date || new Date().toISOString() }],
        }),
      });
      setForm({ assetName: "", ticker: "", amount: "", pricePerCoin: "", date: "" });
      setShowAdd(false);
      load();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this crypto position?")) return;
    try { await authFetch(`/api/investments/${id}`, { method: "DELETE" }); load(); } catch { /* ignore */ }
  };

  // Dashboard chart-only view
  if (showChart) {
    if (loading) return null;
    if (investments.length === 0) return (
      <div className="spending-section">
        <h2 className="section-title">Crypto</h2>
        <p className="empty-hint">No crypto tracked yet.</p>
        <a href="/app/bills" className="link-button" style={{ color: "var(--accent)", fontSize: "0.82rem" }}>Add your first position &rarr;</a>
      </div>
    );
    return (
      <div className="spending-section">
        <h2 className="section-title">Crypto</h2>
        <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem", fontSize: "0.82rem" }}>
          <span>Total invested: <strong>{currency.format(totalInvested)}</strong></span>
          <span>{investments.length} position{investments.length !== 1 ? "s" : ""}</span>
        </div>
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={50} />
              <Tooltip formatter={(v) => currency.format(v)} />
              <Line type="monotone" dataKey="value" stroke="var(--navy)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 100, background: "var(--bg)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.78rem" }}>
            Investment history chart — add more purchases to see trends
          </div>
        )}
      </div>
    );
  }

  // Full panel view (Bills & Income page)
  return (
    <div className="recurring-section" style={{ borderBottom: "none" }}>
      <div className="recurring-section-header">
        <div>
          <h4>Crypto</h4>
          {investments.length > 0 && <p className="muted">Total invested: {currency.format(totalInvested)}</p>}
        </div>
        <button type="button" className="primary-button" onClick={() => setShowAdd(true)}>Add crypto</button>
      </div>

      {loading ? <p className="status">Loading...</p> : investments.length === 0 ? (
        <p className="empty-row">No crypto tracked yet.</p>
      ) : (
        <div className="recurring-list">
          {investments.map((inv) => {
            const invTotal = (inv.purchases || []).reduce((t, p) => t + (p.amount * p.pricePerCoin), 0)
              + (inv.startingBalance || 0) + (inv.contributions || []).reduce((t, c) => t + (c.amount || 0), 0);
            const totalCoins = (inv.purchases || []).reduce((t, p) => t + p.amount, 0);
            const avgPrice = totalCoins > 0 ? invTotal / totalCoins : 0;
            return (
              <div key={inv._id} className="recurring-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p className="entry-title">{inv.assetName} {inv.ticker && <span className="muted" style={{ fontSize: "0.75rem" }}>{inv.ticker}</span>}</p>
                    <p className="muted">{totalCoins > 0 ? `${totalCoins.toFixed(6)} coins` : ""} &middot; Avg: {currency.format(avgPrice)}</p>
                  </div>
                  <div className="recurring-actions">
                    <span className="entry-amount" style={{ color: "var(--text)" }}>{currency.format(invTotal)}</span>
                    <button type="button" className="ghost-button" onClick={() => handleDelete(inv._id)}>x</button>
                  </div>
                </div>
                <p className="muted" style={{ fontSize: "0.7rem", marginTop: "0.25rem", color: "var(--text-muted)" }}>Live prices coming soon</p>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>Add crypto</h4><button type="button" className="ghost-button" onClick={() => setShowAdd(false)}>&#x2715;</button></div>
            <form className="modal-form" onSubmit={handleAdd}>
              <label>Coin name<input value={form.assetName} onChange={(e) => setForm((p) => ({ ...p, assetName: e.target.value }))} placeholder="e.g. Bitcoin" required /></label>
              <label>Ticker symbol<input value={form.ticker} onChange={(e) => setForm((p) => ({ ...p, ticker: e.target.value }))} placeholder="e.g. BTC" /></label>
              <label>Amount owned<input type="number" step="any" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0.005" required /></label>
              <label>Purchase price per coin ($)<input type="number" step="0.01" value={form.pricePerCoin} onChange={(e) => setForm((p) => ({ ...p, pricePerCoin: e.target.value }))} required /></label>
              <label>Purchase date<input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} /></label>
              <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowAdd(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "..." : "Save"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CryptoPanel;
