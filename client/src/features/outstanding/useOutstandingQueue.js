import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { authFetch } from "../../apiClient";
import { parseDateOnly } from "../../lib/date";
import { useDataCache } from "../../context/DataCache";

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
  const cache = useDataCache();
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

  // Three-way action driven by PaymentStatusModal:
  //   "unpaid"          → in-session dismiss (no API call). Re-prompts
  //                       on next login.
  //   "paid_deduct"     → PATCH paid:true, accountedFor:false.
  //   "paid_accounted"  → PATCH paid:true, accountedFor:true (item is
  //                       already reflected in the user's onboarding
  //                       seed balance — engine will skip both sides).
  // Any "paid_*" call triggers a dashboard summary refresh so the
  // spendable card updates immediately. "unpaid" doesn't change server
  // state so no refresh is needed.
  const select = useCallback(async (status) => {
    if (!current) return;
    if (status === "unpaid") {
      dismissedRef.current.add(`${current.type}:${current.id}`);
      setIndex((i) => i + 1);
      return;
    }
    const accountedFor = status === "paid_accounted";
    try {
      if (current.type === "bill") {
        await authFetch(`/api/bills/${current.id}/paid`, {
          method: "PATCH",
          body: JSON.stringify({ paid: true, dueDate: current.dueDate, accountedFor }),
        });
      } else if (current.type === "plan") {
        await authFetch(`/api/payment-plans/${current.planId}/payments/${current.paymentId}/paid`, {
          method: "PATCH",
          body: JSON.stringify({ paid: true, accountedFor }),
        });
      } else if (current.type === "expense") {
        await authFetch(`/api/expenses/${current.id}/paid`, {
          method: "PATCH",
          body: JSON.stringify({ paid: true, accountedFor }),
        });
      }
    } catch { /* non-critical; queue advances regardless */ }
    cache?.fetchSummary?.(true);
    setIndex((i) => i + 1);
  }, [current, cache]);

  return useMemo(
    () => ({ current, dismiss, select, isEmpty, loading }),
    [current, dismiss, select, isEmpty, loading],
  );
}
