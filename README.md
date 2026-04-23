# PayPulse

A personal finance app that shows you what you can actually spend
between paychecks — bills, expenses, savings, and payment plans
all reconciled against your real pay schedule.

## Features

- Pay-cycle aware spendable balance (not just bank balance)
- Recurring bill tracking with automatic rollover
- One-off expenses, scheduled payment plans, savings goals
- Income sources (fixed paychecks + one-time income)
- Stripe-billed Premium tier (3-day free trial on monthly)
- Email verification, optional 2FA, password reset, account lockout
- Cron-driven bill reminders, savings autopilot, payday income posting

## Tech Stack

**Frontend:** React 19 + Vite, deployed on Vercel
**Backend:** Node 18+, Express 5, deployed on Vercel serverless
**Database:** MongoDB (Atlas) via Mongoose 8
**Auth:** JWT (HMAC-SHA256) + bcrypt + tokenVersion invalidation
**Payments:** Stripe Checkout + webhooks
**Email:** Nodemailer over Gmail SMTP

## Local development

You need Node 18+, an Atlas connection string (or a local mongod),
and a Stripe test key.

```bash
git clone https://github.com/BigB742/budget-app.git
cd budget-app

# Backend
cp .env.example .env             # fill in MONGO_URI, JWT_SECRET, etc.
npm install
npm run dev                      # nodemon on PORT (default 5002)

# Frontend (in a second terminal)
cd client
npm install
npm run dev                      # vite on http://localhost:5173
```

The frontend reads `VITE_API_URL` to find the backend; for local dev
this defaults to `http://localhost:5002`. Set it explicitly in
`client/.env` if you change the backend port.

## Deployment

Both `/` (backend) and `/client` (frontend) are deployed as separate
Vercel projects pointing at this repo. The backend uses Vercel's
Node serverless runtime; `index.js` exports the Express app and only
calls `app.listen()` outside of production.

Required env vars in the **backend** Vercel project:

- `MONGO_URI`, `JWT_SECRET` (>= 32 chars — see security notes below)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_MONTHLY_PRICE_ID`, `STRIPE_ANNUAL_PRICE_ID`
- `APP_URL`, `DASHBOARD_URL`, `ALLOWED_ORIGINS`
- `EMAIL_USER`, `EMAIL_PASS` (Gmail App Password — not the account
  password)
- `CRON_SECRET` (signs cron requests)

Required in the **frontend** Vercel project:

- `VITE_API_URL` — pointing at the deployed backend URL

## Deployment notes

### Trust-proxy assumption

`index.js` calls `app.set("trust proxy", 1)`, which tells Express to trust
exactly **one** proxy hop (Vercel's edge). This is required so
`req.ip` reflects the real client IP — without it, `express-rate-limit`
would bucket every request under Vercel's load-balancer IP and the
limiters would be effectively disabled.

If you ever add another reverse proxy in front of Vercel
(Cloudflare, an API gateway, a custom CDN, etc.), bump the
`trust proxy` value to match the new hop count, or `req.ip` will
reflect the intermediate proxy and rate-limit buckets will collapse
all clients onto one IP. See
[express docs on trust proxy](https://expressjs.com/en/guide/behind-proxies.html).

### One-time data migrations

The two startup migrations in `index.js` (auto-verify legacy users,
zero out `user.totalSavings`) are gated behind
`ONE_TIME_MIGRATION_ENABLED=true`. Set this env var, deploy once,
verify the migration ran in the logs, then unset it and redeploy
so cold starts no longer pay the linear-in-user-count cost.

### JWT secret rotation

`JWT_SECRET` must be at least 32 characters of high-entropy random
data. In production the API refuses to boot if this is missing or
short. Generate a new secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Setting a new value invalidates every issued JWT — users will be
logged out and have to sign in again.

## Status

In active development. Pre-launch hardening tracked in
[`docs/launch/`](docs/launch/).

## License

UNLICENSED — proprietary, all rights reserved.

## Author

Jose Bryan Torres
[github.com/BigB742](https://github.com/BigB742)
