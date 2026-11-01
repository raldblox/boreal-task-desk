# Deployments: testnet and live

boreal runs as two separate Vercel projects built from the same repo (`main`), each with its
own database, file storage, secrets, keys and accounts. Nothing is shared between them.

| | testnet.boreal.work | boreal.work (`www` redirects here) |
| --- | --- | --- |
| Vercel project | `boreal-testnet` | `boreal-mainnet` |
| `BOREAL_NETWORK` | `testnet` | `mainnet` |
| Database (Neon, Singapore) | `boreal-testnet-db`: all history since the start | `boreal-mainnet-db`: started empty on 2026-11-01 |
| Files (Vercel Blob) | `boreal-task-desk-submissions` | `boreal-mainnet-files` |
| Money | PayPal sandbox, Concordium testnet tokens: never real | Live PayPal once approved; Concordium mainnet later |
| Sign-in | Log in with PayPal (sandbox) or Concordium ID on testnet | Log in with PayPal (live), or Concordium ID on mainnet (needs a mainnet anchor account) |
| Banner | "Testnet … never real money", with a link to the live site | None |
| Worker IDs | Testnet pseudonym secret | Its own secret, so IDs differ from testnet |

The code enforces the split: PayPal follows `BOREAL_NETWORK` and refuses sandbox on mainnet or
live on testnet, the Concordium testnet adapters refuse mainnet, and every link an agent sees
(guide, MCP replies, PayPal return URLs) comes from `PUBLIC_URL`.

## Deploys and migrations

A push to `main` deploys both projects. Each production build first migrates its own project's
database (`packages/db/scripts/migrate-on-deploy.mjs`, run by `apps/web`'s build), so new
tables reach both sites without anyone running migrations by hand. Preview and local builds
skip it.

## Variables

Set each project's variables on that project only. Vercel "sensitive" values can't be read
back, so keep their source (a local env file) or generate new ones.

- **Both:** `BOREAL_NETWORK`, `CONCORDIUM_NETWORK` (same value), `PUBLIC_URL`, `SESSION_SECRET`,
  `CRON_SECRET`, `CONCORDIUM_PSEUDONYM_SECRET` (never change it, or every worker gets a new
  ID), `NEXT_PUBLIC_REOWN_PROJECT_ID`, `ADMIN_PSEUDONYMS` (that site's worker IDs), the Neon
  connection (`DATABASE_URL`, …) and `BLOB_READ_WRITE_TOKEN` from their Vercel integrations.
- **Testnet only:** `CONCORDIUM_ANCHOR_ACCOUNT`/`_KEY` (a testnet account), `PAYMENT_RAILS=paypal`,
  `PAYPAL_ENV=sandbox` and the sandbox app's `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
  `PAYPAL_WEBHOOK_ID`, `PAYPAL_REVIEWER_EMAILS`, `PAYPAL_LOGIN=on`.
- **Mainnet, still to add:**
  - `CONCORDIUM_ANCHOR_ACCOUNT`/`_KEY` for a **mainnet** account holding a little CCD. Sign-in
    anchors each proof request on-chain; without it boreal.work shows "sign-in opening soon".
  - Live PayPal: a live app on boreal's PayPal business account with Payouts, Save payment
    methods and Log in with PayPal (return URL `https://boreal.work/paypal/login/done`; share
    email, PayPal account ID and account verification status), and a webhook to
    `https://boreal.work/api/paypal/webhook`. Then set the PayPal variables above (live values,
    no `PAYPAL_ENV` needed), `PAYMENT_RAILS=paypal` and `PAYPAL_LOGIN=on`. Workers can then sign in
    and be paid before boreal has CCD for Concordium ID.
  - `ADMIN_PSEUDONYMS`: your mainnet worker ID, after your first sign-in there.
  - Concordium escrow on mainnet needs mainnet adapters, which aren't built yet.

## Outside services, per site

- PayPal sandbox app → webhook `https://testnet.boreal.work/api/paypal/webhook`, Log in with
  PayPal return URL `https://testnet.boreal.work/paypal/login/done`, sharing email, PayPal
  account ID and account verification status.
- Reown (WalletConnect) project → allowed domains `boreal.work` and `testnet.boreal.work`.

## Copying variables between projects

Use `vercel env pull`, which decrypts. The API's project env list returns encrypted values, and
`vercel api … -X DELETE` asks for a confirmation that's invisible when output is captured: use
`POST /v10/projects/<project>/env?upsert=true` to replace a value instead.
