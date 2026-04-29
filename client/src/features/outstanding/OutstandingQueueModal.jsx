import { useOutstandingQueue } from "./useOutstandingQueue";
import PaymentStatusModal from "../../components/PaymentStatusModal";

const itemKindFor = (type) => {
  if (type === "plan") return "plan_installment";
  if (type === "expense") return "expense";
  return "bill";
};

const itemNameFor = (item) => {
  if (item.type === "plan") return `${item.planName} payment`;
  return item.name;
};

const dueDateFor = (item) => (item.type === "expense" ? item.date : item.dueDate);

/**
 * Login pop-up queue mounted in AppShell. Renders one outstanding item
 * at a time through PaymentStatusModal so users get the same three-way
 * choice (unpaid / paid_deduct / paid_accounted) they see when adding
 * an item. The hook owns the side effects: "unpaid" dismisses for the
 * session, the two paid options PATCH the item and refresh the
 * dashboard summary.
 */
export default function OutstandingQueueModal() {
  const { current, dismiss, select, isEmpty } = useOutstandingQueue();
  if (isEmpty || !current) return null;

  return (
    <PaymentStatusModal
      isOpen
      onClose={dismiss}
      onSelect={select}
      itemName={itemNameFor(current)}
      itemAmount={current.amount}
      itemDueDate={dueDateFor(current)}
      itemKind={itemKindFor(current.type)}
    />
  );
}
