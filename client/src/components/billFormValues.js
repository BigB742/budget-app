export const BILL_CATS = [
  "Car Payment", "Gym", "Insurance", "Internet", "Phone",
  "Rent", "Subscriptions", "Utilities", "Other",
];

export const emptyBillValues = () => ({
  name: "",
  amount: "",
  dueDay: "",
  category: "Other",
  startDate: "",
  lastPaymentDate: "",
  lastPaymentAmount: "",
});

export const toBillFormValues = (b) => ({
  name: b?.name || "",
  amount: b?.amount != null ? String(b.amount) : "",
  dueDay: String(b?.dueDayOfMonth || b?.dueDay || ""),
  category: b?.category || "Other",
  startDate: b?.startDate ? String(b.startDate).slice(0, 10) : "",
  lastPaymentDate: b?.lastPaymentDate ? String(b.lastPaymentDate).slice(0, 10) : "",
  lastPaymentAmount: b?.lastPaymentAmount != null ? String(b.lastPaymentAmount) : "",
});
