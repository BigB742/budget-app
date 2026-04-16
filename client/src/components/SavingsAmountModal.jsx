import { useEffect, useRef, useState } from "react";

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4>{title}</h4>
          <button type="button" className="ghost-button" onClick={onClose}>x</button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>
            Amount
            <input
              ref={inputRef}
              type="number"
              step="0.01"
              min="0.01"
              placeholder="$0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e); }}
              required
            />
          </label>
          {error && <div className="inline-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button">{buttonLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SavingsAmountModal;
