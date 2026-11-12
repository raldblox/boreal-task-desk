# Verified people: what boreal.work enforces, and what could come next

boreal.work promises that only verified people do the work. This is what that means in the code today, what it costs the person, and which proof-of-personhood options exist on other chains. Checked on 2026-11-12.

## What counts as verified

A person can claim a task only once one of these is true (`claimTask` in `packages/desk/src/desk.ts`; on by default, every network):

| Proof | What it shows | What it costs the person |
| --- | --- | --- |
| A PayPal account PayPal has verified (`verified_account` from Log in with PayPal) | PayPal has checked the account holder | Nothing; PayPal verifies for free in the account settings |
| Concordium ID (the Concordium ID App, a zero-knowledge proof) | An identity provider checked a passport or national ID and a selfie; the proof can also show age or country | Nothing. Concordium's docs: "For zero-knowledge proofs (ZKPs), there is no charge for the user". boreal.work, as the verifier, pays the small CCD fee for anchoring each request and result on chain |
| A Concordium account (Concordium Wallet for Web, signing a message) | Concordium opens accounts only on an identity an identity provider checked | Nothing: account creation isn't paid by the sender (Concordium SDK docs) and signing a message is free |

Tasks that require proven attributes (age, country) need the Concordium ID proof itself.

Exceptions: operator-made test workers (`testMode`), and AI agents on tasks a requester opened to agents (NEAR add-on, text tasks only, off by default and not offered on the website).

## Concordium's identity providers

Concordium lists three identity providers for Verify and Access: Digital Trust Solutions, Notabene and Global FinReg. The mainnet wallet proxy lists Digital Trust Solutions and Notabene for people. Neither page lists supported countries; before telling Filipino workers to use it, try the Concordium ID App with a Philippine passport and a PhilSys ID and record which works.

Sources: [How it works](https://docs.concordium.com/en/mainnet/how-to/concordium-id/verify-and-access/how-it-works.html), [Manage transaction costs](https://docs.concordium.com/en/mainnet/how-to/concordium-id/verify-and-access/manage-transaction-costs.html), [Select identity provider](https://docs.concordium.com/en/mainnet/how-to/concordium-id/verify-and-access/select-identity-provider.html), [Account creation](https://docs.concordium.com/concordium-node-sdk-js/pages/misc-pages/account-creation.html), [Concordium ID App launch](https://www.concordium.com/article/concordium-debuts-id-app-with-coin98-to-solve-the-internets-age-check-problem).

## Not enforced yet

- **Uniqueness.** Verified isn't unique: one person with two verified PayPal accounts, or two Concordium accounts on one identity, can work as two (RS-28 in `docs/readiness.md`).

## NEAR and EVM: options to add later

None is ready to be a gate for workers in the Philippines today:

| Option | Chain | Proof | Why not yet |
| --- | --- | --- | --- |
| World ID | EVM (World Chain), any app via SDK | Iris scan at an Orb, or an NFC passport for a lower level | The Philippines' National Privacy Commission ordered Tools for Humanity to stop processing personal data there (October 2025); World said it would appeal. Check the order's status before relying on it. |
| I-Am-Human | NEAR | Fractal face scan, issued as a soulbound token | Built by the NEAR Digital Collective; its request for continued funding was rejected, so its future is unclear. |
| Human Passport (was Gitcoin Passport) | EVM | A score from stamps (accounts, on-chain history) | A score, not a proof of a person; it can be farmed. Fine as an extra signal, not as the gate. |
| Self | EVM | A zero-knowledge proof from a passport's NFC chip | Now a paid, credit-based service; Philippine passport support not confirmed. |
| Human ID (was Holonym) | EVM | Zero-knowledge proof over a government ID, phone or biometrics | Worth a look; not tested here. |

Recommendation: keep PayPal plus Concordium as the gate. Add an EVM option only once one is confirmed to work for Philippine documents, is free or cheap per worker, and gives a uniqueness guarantee.

Sources: [World and the Philippine order](https://www.biometricupdate.com/202510/world-to-appeal-philippine-order-to-stop-collecting-biometric-data), [I-Am-Human funding request](https://gov.near.org/t/rejected-by-house-of-merit-securing-one-person-one-vote-integrity-in-near-sustaining-sybil-attack-prevention-with-i-am-human/38148), [Self docs](https://docs.self.xyz/).
