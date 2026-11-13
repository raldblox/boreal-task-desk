# Verified people: what boreal.work enforces, and what could come next

boreal.work promises that only verified people do the work. This is what that means in the code today, what it costs the person, and which proof-of-personhood options exist on other chains. Checked on 2026-11-12.

## What counts as verified

A person can claim a task only once one of these is true (`claimTask` in `packages/desk/src/desk.ts`; on by default, every network):

| Proof | What it shows | What it costs the person |
| --- | --- | --- |
| A PayPal account PayPal has verified (`verified_account` from Log in with PayPal) | PayPal has checked the account holder | Nothing; PayPal verifies for free in the account settings |
| Concordium ID (the Concordium ID App, a zero-knowledge proof) | An identity provider checked a passport or national ID and a selfie; the proof can also show age or country | Nothing. Concordium's docs: "For zero-knowledge proofs (ZKPs), there is no charge for the user". boreal.work, as the verifier, pays the small CCD fee for anchoring each request and result on chain |
| A Concordium account (Concordium Wallet for Web, signing a message) | Concordium opens accounts only on an identity an identity provider checked | Nothing: account creation isn't paid by the sender (Concordium SDK docs) and signing a message is free |
| ZKPassport (the ZKPassport app, zero-knowledge proofs from a passport's or ID card's chip; the `zkpassport` add-on) | The chip's signature proves a real government document; the proof shows 18 or older, nationality, and a face match done on the phone | Nothing, for the person or for boreal.work: the proofs are checked on boreal.work's server, nothing goes on any chain |

Tasks that require residency need the Concordium ID proof itself. A ZKPassport proof counts for `age_over_18`.

Exceptions: operator-made test workers (`testMode`), and AI agents on tasks a requester opened to agents (NEAR add-on, text tasks only, off by default and not offered on the website).

## Concordium's identity providers

Concordium lists three identity providers for Verify and Access: Digital Trust Solutions, Notabene and Global FinReg. The mainnet wallet proxy lists Digital Trust Solutions and Notabene for people. The owner confirmed (2026-11-13) that a Philippine passport and other Philippine IDs are accepted.

## What a Concordium check costs, and who pays

- **The person pays nothing.** Concordium: "For zero-knowledge proofs (ZKPs), there is no charge for the user."
- **boreal.work pays one small fee per check, and can't avoid it on the ID App path.** The ID App's protocol (Verify and Access, V1) needs the request anchored on chain first: the app reads the anchor's block before it answers, so the request can't be faked. Fees are fixed in euros, paid in CCD from `CONCORDIUM_ANCHOR_ACCOUNT`.
- **The second record is already skipped.** The audit-record anchor is opt-in ("Services can opt in"); `packages/concordium/src/id-app.ts` checks the presentation with `VerificationAuditRecordV1.createChecked`, which doesn't anchor.
- **The browser wallet is fee-free (since 2026-11-13).** Concordium Wallet for Web answers the older Web3 ID request (`requestVerifiablePresentation`). boreal.work's challenge is a SHA-256 of the last finalized block's hash and a one-time nonce (`startWallet` in `packages/concordium/src/id-app.ts`). `finishWallet` checks the block is finalized and under 20 minutes old, the credential is active (`getPublicData`), the proof (`verifyPresentation`), and that it proves exactly the statements asked for. No transaction, no fee for anyone. It reads the same attributes as the ID App and names the issuer the same way, so the pseudonym and person code match. The ID App on phones still needs the anchored V1 request.

Sources: [Verifiable presentations (V1), JS SDK](https://docs.concordium.com/concordium-node-sdk-js/12.0.0/pages/verifiable-presentations.html), [ZK proof generation tutorial](https://docs.concordium.com/en/mainnet/tutorials/using-ID-in-dApps/zk-proofs-tutorial.html).

## One person, one account

- **Concordium ID:** a worker's `concordiumRef` is a keyed hash of the identity provider, the document's issuer and its number. One document can't make two accounts. It doesn't stop one person using a second document, or the same document at a second identity provider.
- **ZKPassport:** a worker's `passportRef` is `zkp:` plus a keyed hash of ZKPassport's salted unique identifier for that document, on boreal.work's domain and the scope `boreal.work/worker`. One document can't make two accounts. The proof also discloses name and birth date, which become the same `ccdp:` person code as Concordium ID's, so one person can't hold a Concordium ID account and a ZKPassport account, or two passport accounts. The match is as good as the names agree: a passport's machine-readable name and an identity provider's record can differ (a middle name left out), and then the codes differ.
- **PayPal:** one account per PayPal account. PayPal's own rules allow one personal account per person, but nothing here checks it.

Sources: [How it works](https://docs.concordium.com/en/mainnet/how-to/concordium-id/verify-and-access/how-it-works.html), [Manage transaction costs](https://docs.concordium.com/en/mainnet/how-to/concordium-id/verify-and-access/manage-transaction-costs.html), [Select identity provider](https://docs.concordium.com/en/mainnet/how-to/concordium-id/verify-and-access/select-identity-provider.html), [Account creation](https://docs.concordium.com/concordium-node-sdk-js/pages/misc-pages/account-creation.html), [Concordium ID App launch](https://www.concordium.com/article/concordium-debuts-id-app-with-coin98-to-solve-the-internets-age-check-problem).

## Not enforced yet

- **Uniqueness for PayPal-only workers.** One person with two verified PayPal accounts can still work as two (RS-28 in `docs/readiness.md`). Concordium ID and ZKPassport proofs carry the person code; PayPal doesn't. Payout destinations are unique and `/admin/workers` shows softer signs.

## ZKPassport

[ZKPassport](https://docs.zkpassport.id/intro) reads the NFC chip of a passport, national ID or residence permit and proves facts about it on the phone, with zero-knowledge proofs. Assessed on 2026-11-13:

- **Philippine passports:** supported. Its certificate registry lists Philippine (PHL) signing certificates (139 countries, 614 certificates, updated 2026-11-10). A Philippine ePassport has the chip; the PhilSys card doesn't follow the ICAO 9303 chip standard, so it won't work.
- **Uniqueness, built in:** it returns a unique identifier per document per site and scope, a Poseidon2 hash of the chip data with the site's domain. The same document always gives the same identifier on boreal.work and a different one elsewhere, so sites can't track a person. A salted version keeps even the issuing government from recomputing it. Like Concordium, it is one document = one identifier, not one person: someone with two passports gets two.
- **Face match:** optional, done on the phone, comparing the face to the chip's photo. It refuses rooted or untrusted phones, which some cheap Android phones may be.
- **Cost:** the SDK is open source (Apache-2.0), and the self-served mode needs no account or dashboard; verification happens in our backend. No per-check fee was found.
- **Reliability:** the chip's signature makes a forged document very hard; a photo of a passport can't pass. It has no independent audit we could find, and it is young (SDK 0.x). The app is over 400 MB, which matters on phones with little storage.

Verdict: good, and a better fit than Concordium for workers with a Philippine ePassport. Free for the person and for boreal.work, no identity provider in between, and uniqueness built in. Worth adding as a third way to verify, keyed into the same uniqueness check as Concordium.

### How boreal.work uses it (added 2026-11-13)

- **Switch:** the `zkpassport` add-on (`BOREAL_ADDONS=…,zkpassport`). It needs only `BOREAL_PSEUDONYM_SECRET`. Off, `/signin` and My account don't offer it and `/api/worker/passport/*` answer 404.
- **The question** (`packages/zkpassport/src/query.ts`, the same in the browser and on the server): age 18 or older; disclose nationality, first and last name, birth date and document type; a strict face match; and `bind("custom_data", nonce)`, a one-time nonce from `/api/worker/passport/start` stored in `verification_requests`, so a proof answers one sign-in.
- **The identifier** is the salted kind (`NullifierType.SALTED`), which ZKPassport only gives with a strict face match. Never change the identifier type or the scope `boreal.work/worker`: every passport would become a new account.
- **Checking:** `/api/worker/passport/finish` recreates the question and calls `verify()` on the server with `verifierMode: "local"`, so the proofs and disclosed names don't leave boreal.work. Local checks read ZKPassport's certificate registry root from Ethereum (`ZKPASSPORT_RPC_URL`, else the SDK's default endpoint). `ZKPASSPORT_VERIFIER=api` sends proofs to ZKPassport's verifier instead, for a host where the local verifier can't run (ZKPassport says serverless "may not work"; the route allows 120 seconds).
- **The SDK** is `@zkpassport/sdk` 0.19.3, pinned. On the server it is loaded as CommonJS: its ESM build imports `buffer/`, which Node refuses.
- **Mock passports:** `ZKPASSPORT_DEV_MODE=1` accepts ZKPassport's mock proofs for local testing. It is ignored on mainnet and blocks the add-on there. All mock proofs share one identifier, so they are all one account.
- **What a worker needs:** an NFC passport or ID card, and a phone with NFC that passes the app's device check, with about 400 MB free. The face match adds a liveness check, which some phones or lighting fail.
- **Not yet checked end to end with a real passport.** The desk, the reader and the verifier's refusal of bad proofs are tested; a real phone and passport round trip on testnet is still to do.

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
