import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { authFetch } from "../../apiClient";
import { parseDateOnly } from "../../lib/date";

const typeWeight = { bill: 0, plan: 1, expense: 2 };

/**
 * Hook that drives the login pop-up queue from GET /api/outstanding.
 *
 * Per §6.5 / §6.6:
 *  - Sorted by due date ascending, then bill → plan → expense on ties.
 *  - "Not paid yet" dismisses in-session only — next login re-prompts.
 *  - "Mark as paid" PATCHes the appropriate endpoint and the item
 *    disappears (and never re-prompts, because it's truly paid now).
 *  - Dismissed ids live in a ref (no localStorage), so re-login clears
 *    them and the queue rebuilds from server state.
 */
export function useOutstandingQueue() {
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const dismissedRef = useRef(new Set());

  const build = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authFetch("/api/outstanding").catch(() => null);
      if (!data) { setItems([]); setIndex(0); return; }
      const flat = [
        ...(data.bills || []).map((b) => ({ ...b, type: "bill", sortDate: b.dueDate })),
        ...(data.plans || []).map((p) => ({ ...p, type: "plan", sortDate: p.dueDate })),
        ...(data.expenses || []).map((e) => ({ ...e, type: "expense", sortDate: e.date })),
      ].filter((i) => !dismissedRef.current.has(`${i.type}:${i.id}`));
      flat.sort((a, b) => {
        const da = parseDateOnly(a.sortDate)?.getTime() || 0;
        const db = parseDateOnly(b.sortDate)?.getTime() || 0;
        if (da !== db) return da - db;
        return typeWeight[a.type] - typeWeight[b.type];
      });
      setItems(flat);
      setIndex(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { build(); }, [build]);

  const current = items[index] ?? null;
  const isEmpty = !current;

  const dismiss = useCallback(() => {
    if (!current) return;
    dismissedRef.current.add(`${current.type}:${current.id}`);
    setIndex((i) => i + 1);
  }, [current]);

  const markPaid = useCallback(async () => {
    if (!current) return;
    try {
      if (current.type === "bill") {
        await authFetch(`/api/bills/${current.id}/paid`, {
          method: "PATCH",
          body: JSON.stringify({ paid: true, dueDate: current.dueDate }),
        });
      } else if (current.type === "plan") {
        await authFetch(`/api/payment-plans/${current.planId}/payments/${current.paymentId}/paid`, {
          method: "PATCH",
          body: JSON.stringify({ paid: true }),
        });
      } else if (current.type === "expense") {
        await authFetch(`/api/expenses/${current.id}/paid`, {
          method: "PATCH",
          body: JSON.stringify({ paid: true }),
        });
      }
    } catch { /* non-critical; queue advances regardless */ }
    setIndex((i) => i + 1);
  }, [current]);

  return useMemo(
    () => ({ current, dismiss, markPaid, isEmpty, loading }),
    [current, dismiss, markPaid, isEmpty, loading],
  );
}
