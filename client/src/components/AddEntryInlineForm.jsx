import { useState } from "react";

const AddEntryInlineForm = ({ onSubmit, onCancel, submitLabel = "Add" }) => {
  const [form, setForm] = useState({ description: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.amount) {
      setError("Enter an amount");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onSubmit?.({
        description: form.description,
        amount: form.amount,
      });
      setForm({ description: "", amount: "" });
      onCancel?.();
    } catch (err) {
      console.error(err);
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="inline-entry-form" onSubmit={handleSubmit}>
      <input
        type="text"
        name="description"
        placeholder="Description"
        value={form.description}
        onChange={handleChange}
      />
      <input
        type="number"
        name="amount"
        step="0.01"
        placeholder="0.00"
        value={form.amount}
        onChange={handleChange}
      />
      <div className="inline-entry-actions">
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? "Saving..." : submitLabel}
        </button>
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <div className="inline-error">{error}</div>}
    </form>
  );
};

export default AddEntryInlineForm;
