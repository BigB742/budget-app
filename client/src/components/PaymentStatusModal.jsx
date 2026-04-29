import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import { currency } from "../utils/currency";

// PaymentStatusModal — the shared three-option primitive for declaring
// whether a bill, plan installment, or expense is unpaid, already paid
// (deduct from spendable), or already paid AND already reflected in the
// user's onboarding starting balance. Used at every surface where a
// past-or-current-period item is added or surfaced (onboarding, Bills,
// PaymentPlans, Expenses, OutstandingQueueModal).
//
// Pure presentational — no API calls, no internal state beyond the
// hover-helper-text. The caller owns the side effects: based on the
// chosen status it does whatever combination of POST/PATCH the surface
// requires, then closes the modal.
//
// Status values:
//   "unpaid"          — leave default. Engine deducts on due date.
//   "paid_deduct"     — paid:true, accountedFor:false. Engine counts
//                       in the paidBills/paidPlans bucket.
//   "paid_accounted"  — paid:true, accountedFor:true. Engine skips
//                       both sides; bill is already reflected in
//                       currentBalance from before onboarding.

const fmtDueDate = (d) => {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
};

const COPY = {
  bill: {
    title: "Did you pay this?",
    options: {
      unpaid: "Not yet paid — keep pending",
      paid_deduct: "Already paid — deduct from my balance",
      paid_accounted: "Already paid — already in my starting balance",
    },
    helpers: {
      unpaid: "This item will be deducted on its due date.",
      paid_deduct: "This item will be marked paid and deducted now.",
      paid_accounted:
        "This item is already reflected in your starting balance — your spendable won't change.",
    },
  },
  plan_installment: {
    title: "Did you pay this?",
    options: {
      unpaid: "Not yet paid — keep pending",
      paid_deduct: "Already paid — deduct from my balance",
      paid_accounted: "Already paid — already in my starting balance",
    },
    helpers: {
      unpaid: "This item will be deducted on its due date.",
      paid_deduct: "This item will be marked paid and deducted now.",
      paid_accounted:
        "This item is already reflected in your starting balance — your spendable won't change.",
    },
  },
  expense: {
    title: "Did you spend this?",
    options: {
      unpaid: "Not yet spent — keep planned",
      paid_deduct: "Already spent — deduct from my balance",
      paid_accounted: "Already spent — already in my starting balance",
    },
    helpers: {
      unpaid: "This expense will be deducted on its date.",
      paid_deduct: "This expense will be marked spent and deducted now.",
      paid_accounted:
        "This expense is already reflected in your starting balance — your spendable won't change.",
    },
  },
};

export default function PaymentStatusModal({
  isOpen,
  onClose,
  onSelect,
  itemName,
  itemAmount,
  itemDueDate,
  itemKind = "bill",
}) {
  const copy = COPY[itemKind] || COPY.bill;
  const [hovered, setHovered] = useState("unpaid");

  // Reset hover hint each time the modal opens.
  useEffect(() => {
    if (isOpen) setHovered("unpaid");
  }, [isOpen]);

  const choose = (status) => {
    onSelect?.(status);
    onClose?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} titleId="payment-status-title" size="sm">
      <h2 id="payment-status-title" className="pp5-modal-title" style={{ textAlign: "center" }}>
        {copy.title}
      </h2>

      <div style={{ padding: "8px 0 16px", textAlign: "center" }}>
        <p
          style={{
            fontSize: 18,
            fontWeight: 600,
            margin: "0 0 8px",
            color: "var(--color-text-primary)",
          }}
        >
          {itemName}
        </p>
        <p
          style={{
            fontSize: 24,
            fontWeight: 700,
            margin: "0 0 8px",
            color: "var(--color-semantic-negative)",
          }}
        >
          {currency.format(Number(itemAmount) || 0)}
        </p>
        {itemDueDate && (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
            Due {fmtDueDate(itemDueDate)}
          </p>
        )}
      </div>

      <div className="pp5-modal-actions-stack">
        <button
          type="button"
          className="pp5-btn pp5-btn-primary pp5-btn-block"
          autoFocus
          onClick={() => choose("unpaid")}
          onMouseEnter={() => setHovered("unpaid")}
          onFocus={() => setHovered("unpaid")}
        >
          {copy.options.unpaid}
        </button>
        <button
          type="button"
          className="pp5-btn pp5-btn-secondary pp5-btn-block"
          onClick={() => choose("paid_deduct")}
          onMouseEnter={() => setHovered("paid_deduct")}
          onFocus={() => setHovered("paid_deduct")}
        >
          {copy.options.paid_deduct}
        </button>
        <button
          type="button"
          className="pp5-btn pp5-btn-text pp5-btn-block"
          onClick={() => choose("paid_accounted")}
          onMouseEnter={() => setHovered("paid_accounted")}
          onFocus={() => setHovered("paid_accounted")}
        >
          {copy.options.paid_accounted}
        </button>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-tertiary)",
          margin: "12px 0 0",
          minHeight: "1.4em",
          textAlign: "center",
        }}
      >
        {copy.helpers[hovered]}
      </p>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
        <button
          type="button"
          className="pp5-btn pp5-btn-text"
          style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
