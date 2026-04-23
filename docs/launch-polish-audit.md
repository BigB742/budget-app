# Launch-polish pre-flight audit

Recorded before writing any fix-code for the launch-polish pass layered on
`redesign-c3`. Everything below reflects the tree at commit `c416c75`. Use
this as the source of truth for §§2–10 of the brief.

## 1. Modal inventory

grep targets: `pp5-modal`, `p4-modal`, `modal-overlay`, `modal-card`, `day-modal`, `role="dialog"`, `createPortal`, any `isOpen` / `show*Modal` state.

### Already on `.pp5-modal-*` (universal spec card after `5d785fc`)

| File | Modal | Centering | Portal? |
|---|---|---|---|
| [client/src/pages/Bills.jsx](client/src/pages/Bills.jsx#L139) | New / Edit bill | flex-center via `.pp5-modal-overlay` | no |
| [client/src/pages/PaymentPlans.jsx](client/src/pages/PaymentPlans.jsx#L234) | New / Edit plan | flex-center via `.pp5-modal-overlay` | no |
| [client/src/pages/Settings.jsx](client/src/pages/Settings.jsx#L377) | Change password | flex-center | no |
| [client/src/pages/Settings.jsx](client/src/pages/Settings.jsx#L408) | Delete account (code-gated, destructive) | flex-center | no |
| [client/src/pages/Settings.jsx](client/src/pages/Settings.jsx#L471) | Cancel / manage subscription (destructive) | flex-center | no |
| [client/src/pages/Settings.jsx](client/src/pages/Settings.jsx#L527) | Reset onboarding (destructive) | flex-center | no |
| [client/src/pages/Settings.jsx](client/src/pages/Settings.jsx#L568) | Contact support | flex-center | no |
| [client/src/components/AddExpenseModal.jsx](client/src/components/AddExpenseModal.jsx) | Add expense | flex-center | no |
| [client/src/components/EditExpenseModal.jsx](client/src/components/EditExpenseModal.jsx) | Edit expense | flex-center | no |
| [client/src/components/SavingsAmountModal.jsx](client/src/components/SavingsAmountModal.jsx) | Savings deposit/withdraw | flex-center | no |

### Still on legacy `.p4-modal-*` (Savings page)

| File | Modal |
|---|---|
| [client/src/pages/Savings.jsx](client/src/pages/Savings.jsx#L56) | New savings goal |
| [client/src/pages/Savings.jsx](client/src/pages/Savings.jsx#L133) | Deposit / withdraw amount (page-local fork of SavingsAmountModal) |
| [client/src/pages/Savings.jsx](client/src/pages/Savings.jsx#L194) | Edit target |
| [client/src/pages/Savings.jsx](client/src/pages/Savings.jsx#L244) | Delete goal (destructive) |

`.p4-modal-*` CSS was upgraded in-place in `5d785fc` to match the universal spec, but the JSX still renders its own overlay element.

### Still on legacy `.modal-overlay` / `.modal-card`

| File | Modal | Notes |
|---|---|---|
| [client/src/pages/BillsIncome.jsx](client/src/pages/BillsIncome.jsx#L285) | New / Edit bill (legacy BillsIncome page) | **Route unused in navigation** — TopNav wires `/app/bills` to `Bills.jsx`. Candidate for deletion after verification. |
| [client/src/pages/ManageIncome.jsx](client/src/pages/ManageIncome.jsx) | New / Edit income source + one-time income | **Legacy** — redesigned flow lives on `Income.jsx` routes; ManageIncome still mounted? Verify before migration. |
| [client/src/pages/AdminPanel.jsx](client/src/pages/AdminPanel.jsx) | Admin user-edit, confirm delete | Admin-only; low user exposure but still needs centering. |
| [client/src/components/OverdueCheckModal.jsx](client/src/components/OverdueCheckModal.jsx#L179) | "Did you pay this?" login prompt | **Being replaced by §6 outstanding queue.** |
| [client/src/components/DayExpensesModal.jsx](client/src/components/DayExpensesModal.jsx) | Legacy calendar-day modal — **no longer mounted after the SideSheet rewrite**. Candidate for deletion. |
| [client/src/components/DebtPanel.jsx](client/src/components/DebtPanel.jsx) | Debt sub-panel modal — legacy, not in current nav. |
| [client/src/components/SavingsPanel.jsx](client/src/components/SavingsPanel.jsx) | Legacy savings sub-panel — not in current nav. |
| [client/src/components/SessionTimeout.jsx](client/src/components/SessionTimeout.jsx) | Idle timeout warning | Mounted in AppShell — user-visible. Needs migration. |
| [client/src/components/FreeLimitModal.jsx](client/src/components/FreeLimitModal.jsx) | Free-tier paywall nudge | Rendered from Bills/Plans when limit hit. |
| [client/src/components/UpgradeModal.jsx](client/src/components/UpgradeModal.jsx) | Upgrade CTA | Used by Dashboard premium-gate. |

### SideSheet (not a modal — keep separate)

| File | Role |
|---|---|
| [client/src/components/SideSheet.jsx](client/src/components/SideSheet.jsx) | Calendar day-detail panel. Slides from the right; different primitive from the centered `<Modal>`. **Do not migrate through the Modal primitive.** |

### Tour

[client/src/components/TourOverlay.jsx](client/src/components/TourOverlay.jsx) — renders its own `.pp-tour-overlay` + `.pp-tour-tooltip`. Per §10.5, the tour pop-up should portal to `#modal-root` but use Floating UI positioning, not `<Modal>`.

## 2. Form inventory (Add/Edit modals)

All Add/Edit forms in the app are **controlled** with local `useState`; none use react-hook-form. Initial values are seeded from the edit target via an effect or through lifting state up.

| Form | File | Pattern | Reset on open? |
|---|---|---|---|
| Bill | Bills.jsx, BillsIncome.jsx | `useState` keyed off `editingBill` | partial — clears on close but retains last values across `Add → Close → Add` (the Fix 6 bug) |
| Payment plan | PaymentPlans.jsx | `useState` keyed off `editingPlan` | partial — same bug |
| Expense add | AddExpenseModal.jsx | `useState` inside the component | every mount ✓ (component unmounts on close) |
| Expense edit | EditExpenseModal.jsx | `useState` seeded from `expense` prop | every mount ✓ |
| Savings goal | Savings.jsx (inner component) | `useState` | every mount ✓ |
| Savings amount | SavingsAmountModal.jsx | `useState` | every mount ✓ |
| One-time income | ManageIncome.jsx (legacy), Calendar SideSheet | `useState` | Calendar SideSheet resets via the sheet lifecycle; ManageIncome has the Fix 6 bug |
| Settings – password / support | Settings.jsx | `useState` at page level | retained across opens (bug) — cleared manually on submit |

None of the forms mutate parent state directly; all submit via `authFetch` and the parent re-fetches. **Key-based remount per §3.2 will fix the retention bug for the long-lived forms (Bills, PaymentPlans, Settings modals).**

## 3. Tour inventory

Single source of truth: [client/src/components/TourOverlay.jsx](client/src/components/TourOverlay.jsx#L9).

| # | selector | Resolves after C.3? | Notes |
|---|---|---|---|
| 1 | `.hero` | **No** — Dashboard hero now renders as `.hero-c3` | **BROKEN** |
| 2 | `.hero-balance` | **No** — renamed | **BROKEN** |
| 3 | `.planner-section` | likely yes (Dashboard bills planner still carries this class) | verify |
| 4 | `.dash-chart-col` | verify in Dashboard markup | |
| 5 | `[href="/app/calendar"]` | yes | — |
| 6 | `[href="/app/expenses"]` | yes | — |
| 7 | `[href="/app/bills"]` | yes | — |
| 8 | `[href="/app/payment-plans"]` | yes | — |
| 9 | `[href="/app/income"]` | yes | — |
| 10 | `[href="/app/savings"]` | yes | — |
| 11 | `[href="/app/settings"]` | yes | — |
| 12 | final card, no selector | n/a | — |

Currently 12 steps in code (11 selector-driven + 1 final card). Brief calls it "11 steps" — will normalize to 11 data-attr selectors + final card matches.

Settings "Take tour" flow ([client/src/pages/Settings.jsx](client/src/pages/Settings.jsx#L320-L340)) is broken in one subtle way: it clears `tourCompleted` in localStorage+backend then calls `window.__ppLaunchTour()`, but **if the Dashboard is already the current route** AppShell's `__ppLaunchTour` just calls `setShowTour(true)` — which works. **But** AppShell also gates `setShowTour(true)` in its first effect on `tourCompleted === false` only once per mount. If the user has the tour open, dismisses, then clicks "Take tour" on Settings without a route change, the flag flips but the tour re-mounts. That path works. **The actual break: the TourOverlay's selectors at steps 1 and 2 no longer resolve, so the tour opens, spotlights nothing, and the tooltip renders at screen-center for the first two panels.** Fix is §10.

## 4. Stripe surfaces

### Server

- [routes/stripe.js](routes/stripe.js) — mounts 3 routes: `POST /create-checkout-session`, `DELETE /subscription` (existing cancel), `POST /webhook` (signature-verified, no dedupe).
- [api/stripe/webhook.js](api/stripe/webhook.js) — parallel webhook file (Vercel-style?). Check mount status.
- Webhook raw-body middleware: [index.js:149-151](index.js#L149-L151) — `app.use("/api/stripe/webhook", express.raw({ type: "application/json" }))` mounted **before** `express.json()`. ✓ correct order.

### Existing webhook event coverage (routes/stripe.js)

| Event | Handled | Notes |
|---|---|---|
| `checkout.session.completed` | ✓ | Sets isPremium, subscriptionStatus, stripeCustomerId, stripeSubscriptionId, trialEndDate. Calls upsertPremiumBill. |
| `customer.subscription.updated` | ✓ | Mirrors Stripe status → internal enum (`trialing`, `premium`, `past_due`, `free`). |
| `customer.subscription.deleted` | ✓ | subscriptionStatus → `canceled`, isPremium false, removePremiumBill. |
| `invoice.payment_failed` | ✓ | isPremium false, status past_due. **Brief says don't revoke here — revisit in §5.** |
| `invoice.payment_succeeded` | ✗ | Not handled today. **Add in §5** to track `subscriptionCurrentPeriodEnd`. |
| `customer.subscription.created` | ✗ | Not handled today. `checkout.session.completed` seeds the user row, so subscription.updated currently does the heavy lifting. **Add in §5** for completeness. |

**Dedupe via event.id: not implemented today.** Add `StripeEvent` model + unique index per §5.

**Out-of-order guard (`subscriptionLastEventAt`): not implemented today.** Add per §5.

### Client

- [client/src/pages/Settings.jsx](client/src/pages/Settings.jsx) — `Manage subscription` opens the cancel modal (`5d785fc`).
- [client/src/pages/Subscription.jsx](client/src/pages/Subscription.jsx) — upgrade flow.
- [client/src/pages/SubscriptionCancel.jsx](client/src/pages/SubscriptionCancel.jsx) — Stripe cancel-url landing page.
- [client/src/pages/SubscriptionSuccess.jsx](client/src/pages/SubscriptionSuccess.jsx) — Stripe success-url landing page.
- [client/src/hooks/useSubscription.js](client/src/hooks/useSubscription.js) — derives `isPremium`, `isTrialing`, `isCanceled` from the stored user object.
- **Gold ring** — [client/src/components/TopNav.jsx:83](client/src/components/TopNav.jsx#L83) keys off `isPremium` from the hook. No single `isEffectivelyPremium` helper today. **Add in §5.4.**

End-to-end cancel path today: `DELETE /api/stripe/subscription` → Stripe `cancel_at_period_end: true` → immediately writes `subscriptionStatus: "canceled"` + `subscriptionEndDate` to Mongo, then calls `removePremiumBill`. The webhook layer doesn't need to do the cancel bookkeeping because the route does it. **After §5 rewrite this flips:** the route returns optimistic success, the webhook is the authoritative writer.

## 5. Date utilities (offenders to replace)

### Client — `toISOString().slice(0, 10)` used as "today" or date-input value

| File | Line | Usage |
|---|---|---|
| [client/src/hooks/useCurrentPayPeriodDays.js](client/src/hooks/useCurrentPayPeriodDays.js#L25) | day-key generator | low risk — UTC offset could push midnight users to neighboring day |
| [client/src/components/DayExpensesModal.jsx](client/src/components/DayExpensesModal.jsx#L28) | stripTime → iso slice | legacy, modal retired |
| [client/src/pages/Onboarding.jsx](client/src/pages/Onboarding.jsx#L266,L278) | onboarding row date | date ingested server-side immediately |
| [client/src/pages/BillsIncome.jsx](client/src/pages/BillsIncome.jsx#L67,L68) | date-input seed | legacy page |
| [client/src/pages/Bills.jsx](client/src/pages/Bills.jsx#L50,L51) | date-input seed | active page |
| [client/src/pages/ManageIncome.jsx](client/src/pages/ManageIncome.jsx#L78,L105) | date-input seed | legacy page |

### Client — `new Date(YYYY-MM-DD)` (UTC-parse trap)

| File | Line | Usage |
|---|---|---|
| [client/src/pages/PaymentPlans.jsx](client/src/pages/PaymentPlans.jsx#L50) | converts back via getUTC*; works by accident | replace with `toDateOnly(parseDateOnly(...))` |
| [client/src/pages/Dashboard.jsx](client/src/pages/Dashboard.jsx#L37) | constructs new Date(y, m-1, d) — already local | ✓ OK as-is |

Also: [client/src/utils/dateUtils.js](client/src/utils/dateUtils.js) exists with `parseLocalDateString` and `stripTime`. **Consolidate into `client/src/lib/date.js` per §4.**

### Server — date handling

- [routes/paymentPlanRoutes.js](routes/paymentPlanRoutes.js#L10-L20) — home-rolled `parseLocalDate(str)` (noon-local) and `todayLocalStart()`. Pattern is correct; extract to `server/lib/date.js`.
- [routes/billPaymentRoutes.js](routes/billPaymentRoutes.js#L38-L39,L51-L52) — `new Date(dueDate + "T12:00:00")` inline. Works but duplicate logic.
- [utils/paycheckUtils.js](utils/paycheckUtils.js), [utils/financeEngine.js](utils/financeEngine.js) — **do not touch**. Finance engine calls getTime() for period comparisons which is already UTC-safe for the way dates are stored.

No `new Date('YYYY-MM-DD')` literals found on the server grep. No `toISOString().slice(0,10)` on the server.

## 6. Dependencies to add

- `focus-trap-react` — for §2 Modal primitive focus trap.
- `@floating-ui/react` — for §10 tour positioning.
- `date-fns` — for §4 date utilities. Not currently installed.

All three are authorized by the brief. Will install in `client/` (root npm scripts are server-side; client has its own package.json).

## 7. Finance-engine touch surface — confirmation

Files touched by the planned fixes: [routes/billPaymentRoutes.js](routes/billPaymentRoutes.js), [routes/paymentPlanRoutes.js](routes/paymentPlanRoutes.js), [routes/expenseRoutes.js](routes/expenseRoutes.js), [routes/stripe.js](routes/stripe.js), [models/User.js](models/User.js), [models/Expense.js](models/Expense.js).

**Not touched:** [utils/financeEngine.js](utils/financeEngine.js), [utils/paycheckUtils.js](utils/paycheckUtils.js), [utils/subscriptionBill.js](utils/subscriptionBill.js), [routes/summaryRoutes.js](routes/summaryRoutes.js), [routes/savingsRoutes.js](routes/savingsRoutes.js), [routes/savingsV2Routes.js](routes/savingsV2Routes.js), the paidEarly routing path inside paymentPlanRoutes' PATCH, and the auto-expense-on-early-payment logic inside billPaymentRoutes' POST.

The new `PATCH /api/bills/:id/paid` will delegate to the existing POST /api/bill-payments and DELETE /api/bill-payments/:id handler bodies (extracted into internal helpers) so the paidEarly code path, the auto-expense creation on early payment, and the cascade-delete of auto-expenses all continue to run. Same for `PATCH /api/plans/:planId/payments/:paymentId/paid` → delegate to the existing PATCH handler with explicit `{ paid: true|false }`. `PATCH /api/expenses/:id/paid` is genuinely new because expenses have no existing "mark paid" route today.
