import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const formatDateLabel = (dateString) => {
  const [year, month, day] = dateString.slice(0, 10).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("default", { month: "short", day: "numeric" });
};

const ProjectedBalanceGraph = ({ data }) => {
  const chartData = (data || []).map((item) => ({
    ...item,
    label: formatDateLabel(item.date),
    balance: Number(item.balance) || 0,
  }));

  if (!chartData.length) {
    return (
      <div className="circle-card">
        <h2>Projected balance</h2>
        <p className="status status-empty">No projected data available yet.</p>
      </div>
    );
  }

  return (
    <div className="circle-card">
      <h2>Projected balance</h2>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, "Balance"]} />
            <Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ProjectedBalanceGraph;
