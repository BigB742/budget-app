# Budget Tracker App

A full-stack personal finance application that helps 
users manage expenses, track income, and plan for 
upcoming bills within a pay cycle.

## Features

- User authentication (JWT + bcrypt)
- Expense and income tracking
- Bill and recurring payment management
- Investment monitoring
- Pay cycle calculations with automatic rollover
- Savings tracking
- Dashboard with financial summary

## Tech Stack

**Frontend:** JavaScript, HTML, CSS  
**Backend:** Node.js, Express.js  
**Database:** MongoDB  
**Auth:** JWT, bcrypt  
**Tools:** VS Code, GitHub  

## Status

🚧 In active development

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

## Author

Jose Bryan Torres  
github.com/BigB742
