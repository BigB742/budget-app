import Modal from "../../components/ui/Modal";
import { currency } from "../../utils/currency";
import { useOutstandingQueue } from "./useOutstandingQueue";
import { parseDateOnly } from "../../lib/date";

const formatDue = (s) => {
  const d = parseDateOnly(s);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const labelFor = (item) => {
  if (item.type === "bill") return `${item.name} bill`;
  if (item.type === "plan") return `${item.planName} payment`;
  return `${item.name} expense`;
};

/**
 * Login pop-up queue mounted in AppShell. Renders one item at a time
 * through the universal Modal primitive so body scroll lock + focus
 * trap + ESC semantics come along for free. ESC / "Not paid yet" both
 * dismiss for the session; "Mark as paid" PATCHes the server and the
 * item never re-prompts.
 */
export default function OutstandingQueueModal() {
  const { current, dismiss, markPaid, isEmpty } = useOutstandingQueue();
  if (isEmpty || !current) return null;

  const dueLine = current.type === "expense"
    ? formatDue(current.date)
    : formatDue(current.dueDate);

  return (
    <Modal
      isOpen
      onClose={dismiss}
      titleId="outstanding-queue-title"
      size="sm"
    >
      <div className="pp5-modal-header">
        <h2 id="outstanding-queue-title" className="pp5-modal-title">
          Did you pay this?
        </h2>
      </div>
      <div style={{ padding: "8px 0 20px" }}>
        <p style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px", color: "var(--color-text-primary)" }}>
          {current.type === "plan" ? current.planName : current.name}
        </p>
        <p style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px", color: "var(--color-semantic-negative)" }}>
          {currency.format(current.amount)}
        </p>
        <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
          {labelFor(current)} · Due {dueLine}
        </p>
      </div>
      <div className="pp5-modal-actions-stack">
        <button type="button" className="pp5-btn pp5-btn-primary pp5-btn-block" onClick={markPaid}>
          Mark as paid
        </button>
        <button type="button" className="pp5-btn pp5-btn-secondary pp5-btn-block" onClick={dismiss}>
          Not paid yet
        </button>
      </div>
    </Modal>
  );
}
