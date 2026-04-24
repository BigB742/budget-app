const utcYMD = (d) => {
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};

export const emptyPlanValues = () => ({
  name: "",
  totalAmount: "",
  payments: [{ date: "", amount: "" }],
});

export const toPlanFormValues = (plan) => ({
  name: plan?.name || "",
  totalAmount: plan?.totalAmount != null ? String(plan.totalAmount) : "",
  payments: (plan?.payments || []).map((p) => ({
    id: p.id,
    date: p.date ? utcYMD(p.date) : "",
    amount: String(p.amount),
    paid: p.paid,
    paidDate: p.paidDate,
  })),
});
