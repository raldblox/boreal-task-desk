# Deployments: testnet and live

boreal runs as two separate deployments of the same code, each with its own database, keys,
accounts and payment credentials. Nothing is shared between them.

| | testnet.boreal.work | boreal.work |
| --- | --- | --- |
| `BOREAL_NETWORK` | `testnet` | `mainnet` |
| Money | PayPal sandbox, Concordium testnet tokens: never real | Live PayPal (Concordium mainnet later) |
| Database | The original Neon database (all history so far) | Its own Neon database |
| Vercel project | `boreal-testnet` | `boreal-task-desk` |
| Banner | "Testnet … never real money", with a link to the live site | None |

The code enforces the split: PayPal follows `BOREAL_NETWORK` and refuses sandbox on mainnet or
live on testnet, the Concordium testnet adapters refuse mainnet, and every link an agent sees
(guide, MCP replies, PayPal return URLs) comes from `PUBLIC_URL`.

## 1. Stand up testnet.boreal.work (keeps today's data)

**Status: done (2026-11-01).** `boreal-testnet` serves testnet.boreal.work with the original database and the PayPal sandbox. Copy readable variables with `vercel env pull`, not the API's list endpoint: that returns encrypted values. Vercel "sensitive" variables can't be read back at all, so they were set again from `.env.local` and `.env.paypal`.

1. In Vercel, **Add New → Project**, import `raldblox/boreal-task-desk`, name it `boreal-testnet`,
   with the same Root Directory and build settings as `boreal-task-desk`.
2. Copy the current production variables into it. From the repo root:
   ```bash
   vercel env pull .env.testnet-import --environment=production
   ```
   In `boreal-testnet` → Settings → Environment Variables, use **Import .env** with that file
   (Production), then delete the file: `rm .env.testnet-import`. It holds secrets; it's gitignored.
3. In `boreal-testnet`, set `BOREAL_NETWORK=testnet`, `PUBLIC_URL=https://testnet.boreal.work`,
   and remove `PAYPAL_SANDBOX_ON_PRODUCTION` (no longer used).
4. Add the domain `testnet.boreal.work` to `boreal-testnet`, and at your DNS provider add
   `CNAME testnet → cname.vercel-dns.com`.
5. Point the sandbox services at the new address:
   - PayPal sandbox app → Webhooks: `https://testnet.boreal.work/api/paypal/webhook` (keep the
     same webhook ID, or update `PAYPAL_WEBHOOK_ID`).
   - PayPal sandbox app → Log in with PayPal → Return URL: `https://testnet.boreal.work/paypal/login/done`.
   - Reown (WalletConnect) project → allowed domains: add `testnet.boreal.work`.
6. Deploy `boreal-testnet` and check: the testnet banner shows, `/agents.md` names
   testnet.boreal.work, and an existing agent's `get_account` works there.

## 2. Make boreal.work the live site

Do this after testnet works, because boreal.work then starts empty.

1. Create a new Neon database for live (Vercel → Storage), connect it to `boreal-task-desk`
   (this replaces its `DATABASE_URL` variables), and run the migrations against it with
   `DATABASE_URL` pointing there: `pnpm db:migrate`.
2. In `boreal-task-desk`: set `BOREAL_NETWORK=mainnet` and `CONCORDIUM_NETWORK=mainnet`; remove
   the sandbox PayPal variables, `PAYPAL_SANDBOX_ON_PRODUCTION`, `PAYMENT_RAILS`, the testnet
   anchor account (`CONCORDIUM_ANCHOR_*`) and `TEST_WORKER_INVITE`. Give it its own
   `SESSION_SECRET`, `CONCORDIUM_PSEUDONYM_SECRET` and `CRON_SECRET`.
3. Until live PayPal is approved, leave `PAYMENT_RAILS` unset: agents can link, but funding
   answers that payments aren't enabled yet.
4. Live PayPal: create a **live** app on boreal's PayPal business account with Payouts, Save
   payment methods and Log in with PayPal (return URL `https://boreal.work/paypal/login/done`),
   a webhook to `https://boreal.work/api/paypal/webhook`, then set `PAYPAL_CLIENT_ID`,
   `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_REVIEWER_EMAILS`, `PAYPAL_LOGIN=on` and
   `PAYMENT_RAILS=paypal`.
5. Concordium on mainnet (escrow and anchors) needs mainnet adapters, which aren't built yet.
