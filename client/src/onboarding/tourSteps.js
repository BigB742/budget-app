// Single source of truth for onboarding-tour steps. Each step selects
// its target via a data-tour="..." attribute so CSS refactors don't
// break the tour. Keep step copy at two sentences or fewer.
//
// The final step has target: null — it renders as a full-screen card
// with a CTA that closes the tour.

export const tourSteps = [
  {
    id: "balance",
    target: '[data-tour="dashboard-balance"]',
    title: "Your Spendable Balance",
    body: "This big number is what's actually yours to spend after every bill is covered. Check it before you spend anything.",
    placement: "bottom",
  },
  {
    id: "upcoming",
    target: '[data-tour="dashboard-upcoming"]',
    title: "Bills this period",
    body: "These are the bills due before your next paycheck. PayPulse already subtracted them from your balance.",
    placement: "top",
  },
  {
    id: "calendar",
    target: '[data-tour="nav-calendar"]',
    title: "Your Calendar",
    body: "Every dollar laid out day by day. Tap any day to see details, add an expense, or mark a bill paid.",
    placement: "bottom",
  },
  {
    id: "expenses",
    target: '[data-tour="nav-expenses"]',
    title: "Expenses",
    body: "Log anything you spend outside your bills here. The more you log, the more accurate your balance gets.",
    placement: "bottom",
  },
  {
    id: "bills",
    target: '[data-tour="nav-bills"]',
    title: "Bills",
    body: "Your recurring monthly bills live here. Add them once and PayPulse tracks them every month automatically.",
    placement: "bottom",
  },
  {
    id: "plans",
    target: '[data-tour="nav-plans"]',
    title: "Payment plans",
    body: "Klarna installments or scheduled payments you owe on specific dates. PayPulse puts each one on your calendar and subtracts it from the right paycheck.",
    placement: "bottom",
  },
  {
    id: "income",
    target: '[data-tour="nav-income"]',
    title: "Income",
    body: "Your paychecks and any extra money go here. Keep this accurate — everything else is calculated from it.",
    placement: "bottom",
  },
  {
    id: "savings",
    target: '[data-tour="nav-savings"]',
    title: "Savings",
    body: "Money you set aside for yourself. It leaves your spendable balance but stays yours — withdraw anytime.",
    placement: "bottom",
  },
  {
    id: "settings",
    target: '[data-tour="nav-settings"]',
    title: "Settings",
    body: "Update your profile, bill reminders, and subscription. You can relaunch this tour from here anytime.",
    placement: "bottom",
  },
  {
    id: "avatar",
    target: '[data-tour="topnav-avatar"]',
    title: "Your account",
    body: "Trial and premium status lives on your avatar. Tap it for quick links to Settings and sign out.",
    placement: "bottom",
  },
  {
    id: "final",
    target: null,
    title: null,
    body: null,
    final: true,
  },
];

export const tourStepCount = tourSteps.filter((s) => !s.final).length;
