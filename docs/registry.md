# Listing boreal.work in Concordium's Agent Registry

boreal lists itself in Concordium's Agent Registry as a deterministic service agent, so other
agents can check it's the real boreal with the registry's `check_badge`. The listing doesn't
need boreal to be AI-powered or to speak A2A: the registry only checks the on-chain record and
the hash of the card.

- **The card.** Each site serves its own Agent Card (A2A v1.0 Agent Card that is also an
  ERC-8004 registration file) at `/.well-known/agent-card.json`. It's built in
  `apps/web/src/content/agent-card.ts`, and the response's `x-card-sha256` header is the
  SHA-256 of the exact bytes served. That hash is what the registry pins on-chain.
- **The entry.** A CIS-8004 record (mainnet contract `<10082,0>`, testnet `<12802,0>`) holding the
  owner account, the card URL (`agent_uri`) and the card's hash (`metadata_hash`). The badge is
  the entry's token address, like `Mf22soLh1NuZYFgBK8iSs`.
- **Two variables.** Once registered, `BOREAL_REGISTRY_BADGE` (the badge) and
  `BOREAL_REGISTRY_OWNER` (the account that registered it) add the Verified by Concordium badge
  to the card. `/status` then checks the listing, and home and `/agents` show "Verified by
  Concordium" while it checks out.

Registering costs about €0.01 in CCD, signed by the owner account's wallet. Testnet goes first;
mainnet waits until the owner account has a little mainnet CCD.

## Before you start

- Deploy `main` first, so `https://testnet.boreal.work/.well-known/agent-card.json` answers.
- Read the hash the site serves, not one computed from the code: it depends on that site's
  `PUBLIC_URL`, network and payment rails.

  ```bash
  curl -sI https://testnet.boreal.work/.well-known/agent-card.json | grep -i x-card-sha256
  curl -s https://testnet.boreal.work/.well-known/agent-card.json | sha256sum
  ```

  Both should print the same hash. With today's settings (PayPal only, no badge) it's
  `d9258412a878537ff982bccd5363df36b9ceaadb3d0c4a7eb2570d8384968e5d` on testnet and
  `18c082cf44b90e755a936e2680eefa012a913b4c7935c3923164a3601e98c91d` on boreal.work.

## 1. Testnet: register testnet.boreal.work

1. **Fund the owner account.** In the Concordium Browser Wallet, switch to Testnet, pick the
   account that will own boreal's entry (it can be the one you sign in with; it doesn't have to
   be the anchor account) and use the wallet's testnet faucet ("Request CCD"). A few CCD is
   plenty.
2. **Register.** Open <https://agent-registry.concordium.com>, connect the Concordium Browser
   Wallet on Testnet and choose **Developer**. Register a new agent with:
   - `agent_uri`: `https://testnet.boreal.work/.well-known/agent-card.json`
   - metadata hash: the `x-card-sha256` from above

   Approve the transaction in the wallet.
3. **Note the badge.** The registry shows the new entry's token address (the badge). Check it:

   ```bash
   curl -s https://agent-registry-mcp.concordium.com/v1/check-badge/<badge>
   ```

   `on_chain_agent_found`, `status_active` and `hash_matches_on_chain` should be true. It also
   warns that the card has no badge yet; the next step adds it.
4. **Add the badge to the card.** On the `boreal-testnet` Vercel project (Production), set:
   - `BOREAL_REGISTRY_BADGE` = the badge
   - `BOREAL_REGISTRY_OWNER` = the owner account address

   Redeploy. The card now carries the badge under `capabilities.extensions` and a
   `registrations` entry, so its hash has changed.
5. **Pin the new hash.** Read the new `x-card-sha256` (as above), then update the entry's hash
   with the owner wallet: in the registry app, edit the agent and set the new metadata hash
   (same `agent_uri`). Without the app, build the transaction and sign it with the wallet:

   ```bash
   curl -s "https://agent-registry-mcp.concordium.com/v1/build-set-agent-uri/<badge>?metadata_hash_hex=<new hash>&sender=<owner account>"
   ```

   Until this lands, `/status` shows the listing as degraded ("differs from the served card"),
   which is expected.
6. **Confirm.** `check-badge/<badge>` should now report `badge_valid: true`, the hash matching
   and no issues. <https://testnet.boreal.work/status> shows "Registry listing: Verified by
   Concordium", and home and `/agents` show the badge within an hour (the check is cached).

## 2. Mainnet: register boreal.work

The same steps, on mainnet:

1. Put a little mainnet CCD (well under €1 covers it) on the owner account.
2. At <https://agent-registry.concordium.com>, connect the wallet on **Mainnet**, choose
   Developer and register `https://boreal.work/.well-known/agent-card.json` with boreal.work's
   `x-card-sha256`.
3. Set `BOREAL_REGISTRY_BADGE` and `BOREAL_REGISTRY_OWNER` on `boreal-mainnet` and redeploy.
4. Pin the new hash with `set_agent_uri` (step 1.5), then confirm with `check-badge`.

A testnet badge is refused on boreal.work and a mainnet badge on testnet: the card checks that
the badge belongs to that network's registry.

## Changing the card later

Any change to the card's bytes breaks the on-chain match until the new hash is pinned. That
includes:

- edits to `agent-card.ts` (names, descriptions, skills, interfaces);
- switching the Concordium rail on or off (`x402Support` follows it);
- a different `PUBLIC_URL`, or setting the registry variables.

The test in `apps/web/src/content/agent-card.test.ts` fails when the card changes without a
`CARD_VERSION` bump. Bump it, record the new hashes there, deploy, and pin each site's new
`x-card-sha256` with `set_agent_uri` (step 1.5). The guide and fees aren't in the card, so
changing them needs nothing on-chain.

## Later: a thin A2A adapter (not built)

The card lists MCP and REST as its interfaces and no A2A endpoint. If A2A clients start asking,
add a small A2A JSON-RPC route (say `/api/a2a`) that maps onto the existing desk calls, so it
behaves exactly like MCP and REST:

- `message/send` → `post_task`, taking the task (description, criteria, budget, deadline) from a
  `data` part and returning an A2A `Task` whose id is boreal's task id;
- `tasks/get` → `get_task`, mapping boreal's states onto A2A's (`posted`/`awaiting_funding` →
  `submitted` or `input-required` for funding, `open`/`claimed` → `working`, final states →
  `completed`, `failed` or `canceled`);
- `tasks/cancel` → `cancel_task`.

Auth stays the agent key as a bearer token. Funding, review and disputes stay on MCP/REST. Then
add `{ url: "<site>/api/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" }` first in
`supportedInterfaces`, an `A2A` entry in `services`, bump `CARD_VERSION` and pin the new hashes.
