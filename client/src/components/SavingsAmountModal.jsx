import { useEffect, useRef, useState } from "react";
import Modal from "./ui/Modal";

const SavingsAmountModal = ({ goalName, mode = "add", maxAmount, onConfirm, onClose }) => {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setError("Enter a positive amount."); return; }
    if (mode === "withdraw" && maxAmount != null && n > maxAmount) {
      setError(`Maximum you can withdraw is $${maxAmount.toFixed(2)}.`);
      return;
    }
    onConfirm(n);
  };

  const title = mode === "withdraw" ? `Withdraw from ${goalName}` : `Add to ${goalName}`;
  const buttonLabel = mode === "withdraw" ? "Withdraw" : "Add";

  return (
    <Modal isOpen onClose={onClose} titleId="savings-amount-title" size="sm">
      <div className="pp5-modal-header">
        <h2 id="savings-amount-title" className="pp5-modal-title">{title}</h2>
        <button type="button" className="pp5-modal-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <form className="pp5-modal-body" onSubmit={handleSubmit}>
          <div className="pp5-field">
            <label className="pp5-field-label">Amount</label>
            <input
              ref={inputRef}
              className="pp5-input"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="$0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e); }}
              required
            />
          </div>
          {error && <p className="pp5-field-error">{error}</p>}
          <div className="pp5-modal-actions">
            <button type="button" className="pp5-btn pp5-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="pp5-btn pp5-btn-primary">{buttonLabel}</button>
          </div>
        </form>
    </Modal>
  );
};

export default SavingsAmountModal;
