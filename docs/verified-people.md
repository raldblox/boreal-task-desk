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

Concordium lists three identity providers for Verify and Access: Digital Trust Solutions, Notabene and Global FinReg. The mainnet wallet proxy lists Digital Trust Solutions and Notabene for people. The owner confirmed (2026-11-13) that a Philippine passport and other Philippine IDs are accepted.

## What a Concordium check costs, and who pays

- **The person pays nothing.** Concordium: "For zero-knowledge proofs (ZKPs), there is no charge for the user."
- **boreal.work pays one small fee per check, and can't avoid it on the ID App path.** The ID App's protocol (Verify and Access, V1) needs the request anchored on chain first: the app reads the anchor's block before it answers, so the request can't be faked. Fees are fixed in euros, paid in CCD from `CONCORDIUM_ANCHOR_ACCOUNT`.
- **The second record is already skipped.** The audit-record anchor is opt-in ("Services can opt in"); `packages/concordium/src/id-app.ts` checks the presentation with `VerificationAuditRecordV1.createChecked`, which doesn't anchor.
- **A fee-free path exists for the browser wallet.** Concordium Wallet for Web also answers the older Web3 ID request (`requestVerifiablePresentation` with a challenge built from a recent block hash), which the verifier checks by reading the chain: no transaction, no fee for anyone. Today the wallet path sends the V1 request too; switching it to the challenge request would make wallet checks free. The ID App on phones needs V1.

Sources: [Verifiable presentations (V1), JS SDK](https://docs.concordium.com/concordium-node-sdk-js/12.0.0/pages/verifiable-presentations.html), [ZK proof generation tutorial](https://docs.concordium.com/en/mainnet/tutorials/using-ID-in-dApps/zk-proofs-tutorial.html).

## One person, one account

- **Concordium ID:** a worker's `concordiumRef` is a keyed hash of the identity provider, the document's issuer and its number. One document can't make two accounts. It doesn't stop one person using a second document, or the same document at a second identity provider.
- **PayPal:** one account per PayPal account. PayPal's own rules allow one personal account per person, but nothing here checks it.

Sources: [How it works](https://docs.concordium.com/en/mainnet/how-to/concordium-id/verify-and-access/how-it-works.html), [Manage transaction costs](https://docs.concordium.com/en/mainnet/how-to/concordium-id/verify-and-access/manage-transaction-costs.html), [Select identity provider](https://docs.concordium.com/en/mainnet/how-to/concordium-id/verify-and-access/select-identity-provider.html), [Account creation](https://docs.concordium.com/concordium-node-sdk-js/pages/misc-pages/account-creation.html), [Concordium ID App launch](https://www.concordium.com/article/concordium-debuts-id-app-with-coin98-to-solve-the-internets-age-check-problem).

## Not enforced yet

- **Uniqueness across documents and PayPal accounts.** One person with two verified PayPal accounts, or two identity documents, can still work as two (RS-28 in `docs/readiness.md`). The fix in progress: a second keyed hash per Concordium proof (name and date of birth, never stored in the clear) so a second document finds the first account; unique payout destinations; and a duplicates view in `/admin`.

## ZKPassport

[ZKPassport](https://docs.zkpassport.id/intro) reads the NFC chip of a passport, national ID or residence permit and proves facts about it on the phone, with zero-knowledge proofs. Assessed on 2026-11-13:

- **Philippine passports:** supported. Its certificate registry lists Philippine (PHL) signing certificates (139 countries, 614 certificates, updated 2026-11-10). A Philippine ePassport has the chip; the PhilSys card doesn't follow the ICAO 9303 chip standard, so it won't work.
- **Uniqueness, built in:** it returns a unique identifier per document per site and scope, a Poseidon2 hash of the chip data with the site's domain. The same document always gives the same identifier on boreal.work and a different one elsewhere, so sites can't track a person. A salted version keeps even the issuing government from recomputing it. Like Concordium, it is one document = one identifier, not one person: someone with two passports gets two.
- **Face match:** optional, done on the phone, comparing the face to the chip's photo. It refuses rooted or untrusted phones, which some cheap Android phones may be.
- **Cost:** the SDK is open source (Apache-2.0), and the self-served mode needs no account or dashboard; verification happens in our backend. No per-check fee was found.
- **Reliability:** the chip's signature makes a forged document very hard; a photo of a passport can't pass. It has no independent audit we could find, and it is young (SDK 0.x). The app is over 400 MB, which matters on phones with little storage.

Verdict: good, and a better fit than Concordium for workers with a Philippine ePassport. Free for the person and for boreal.work, no identity provider in between, and uniqueness built in. Worth adding as a third way to verify, keyed into the same uniqueness check as Concordium.

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
