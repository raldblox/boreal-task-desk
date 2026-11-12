# The EVM add-on: USDC on an EVM chain

Prepared and off. Nothing here runs until `BOREAL_ADDONS` lists `evm` and every setting below is present; with it off the app runs on PayPal alone, as before. It has **not** been run against a real chain yet: see [Before real money](#before-real-money).

Code: `packages/evm` (`payments.ts` the rail, `chain.ts` the JSON-RPC client, `fake-evm.ts` the in-memory chain the tests use).

## What it does

- **Funding is x402 `exact` on EVM.** `fund_task` answers with a requirement; the agent signs an EIP-3009 `TransferWithAuthorization` (an EIP-712 message) for the exact amount to escrow and sends the signature back. The agent sends no transaction and needs no gas.
- **boreal.work is its own facilitator.** Inside `fundTask`'s checks it verifies the signature, the amount, the recipient and the validity window, then submits `transferWithAuthorization` from the escrow key and waits for it to be mined. A task its checks refuse never takes money (unlike NEAR, where the agent pays first: readiness RS-20).
- **One authorization, one task.** The EIP-3009 nonce is `keccak256("boreal:<taskId>")`, so a signed payment can fund nothing else, and the token refuses to run it twice.
- **Payouts and refunds** are `transfer` calls from escrow, journaled on their outbox row before they are sent. An EVM transaction never expires, so a retry re-sends at the **same account nonce** (only one transaction per nonce can ever be mined) and sends afresh only once that nonce was used by something else or the transfer reverted. Refunds go back to the account that paid.
- **Workers connect a wallet by signing a free message** (`verifyEvmConnect`); nobody types an address. The address is kept in `workers.evm_address`.
- **Escrow against the ledger** is checked every tick like the other chain rails: short of the ledger pauses this rail's payouts and refunds only.

## Settings

| Variable | What |
| --- | --- |
| `BOREAL_ADDONS` | include `evm` |
| `EVM_CHAIN_ID` | The chain. It must match `BOREAL_NETWORK`: a test chain (Base Sepolia `84532`, Sepolia `11155111`, …) is refused on mainnet, and a real chain on testnet |
| `EVM_RPC_URL` | A JSON-RPC endpoint for that chain. It is checked to be that chain before anything is sent. Use one provider, not a pool of them: the payout retry reads the account nonce and then the receipts, and needs both from the same view of the chain |
| `EVM_TOKEN_CONTRACT` | The token (USDC). No default: copy it from the issuer's own page (Circle's for USDC) and check it on the chain's explorer |
| `EVM_TOKEN_NAME`, `EVM_TOKEN_VERSION` | The token's EIP-712 domain, read from the contract (`name()` and `version()`). They differ between chains and between mainnet and testnet deployments; a wrong value makes every signature fail, it can't move money wrongly |
| `EVM_TOKEN_DECIMALS` | Default `6` |
| `EVM_ESCROW_KEY` | The escrow account's private key (`0x` + 64 hex). Its own account: it holds only task money, plus the chain's gas coin to pay for transfers |
| `EVM_OPERATING_ADDRESS` | Where the platform fee is paid. Required: the rail is blocked without it |
| `PAYMENT_RAILS` | Optional; if set it must list `evm` |

`/admin` and `/status` show the add-on, each requirement and whether it is met. The rail can be closed to new money at any time from `/admin/controls` without a deploy.

## Before real money

In this order, on testnet.boreal.work first:

1. Create an escrow account, fund it with test ETH and note its address; set the variables above for Base Sepolia.
2. Fund one task from a test wallet holding test USDC; check `tasks.funding_payer`, the ledger and the explorer agree.
3. Take it through a pass (the worker's wallet receives the budget, the operating address the fee) and a second one through a cancel (the payer gets everything back).
4. Kill the monitor between a payout's send and its ledger update, restart, and check it settles without a second transfer.
5. Only then set it up on boreal.work with a mainnet chain, and keep the rail closed in `/admin/controls` until the first task is funded on purpose.

## Not built yet

- **No button for workers to connect a wallet.** The server action exists (`connectPayoutAccount` with `rail: "evm"`); the component that asks the wallet to sign is a handoff note.
- **The agent guide doesn't describe this rail.** MCP's `fund_task` reply explains what to sign; `/agents.md` should gain a section when the rail is switched on somewhere.
- **Smart-contract wallets** (ERC-1271 signatures) can't fund: the payer must be the signing key's own account.
- **A funding transaction submitted but not mined within 45 seconds** is logged and refused; if it lands later the money is in escrow with no task (the EVM form of RS-20, far narrower than NEAR's). The escrow check reports it as unmatched.
- **Hermes plugin**: no change; it funds over PayPal.
