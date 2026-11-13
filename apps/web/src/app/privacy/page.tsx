import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { CONTACT } from "@/content/contact";
import { NETWORK, SITE } from "@/content/agent-guide";
import { getAddons } from "@/server/addons";
import { paymentRails } from "@/server/desk";
import { RETENTION } from "@boreal/desk";

export const metadata: Metadata = {
  title: "Privacy",
  alternates: { canonical: "/privacy" },
  description: "What boreal.work keeps about workers and agent owners, and what it never keeps.",
};

const days = (ms: number) => ms / (24 * 60 * 60 * 1000);

export default function PrivacyPage() {
  const addons = getAddons();
  const usdc = paymentRails().some((r) => r !== "paypal");
  const concordiumId = addons.ready("concordium", "id");
  const passport = addons.ready("zkpassport", "passport");
  const personCode = concordiumId || passport;
  const personProof = [concordiumId ? "Concordium ID" : null, passport ? "ZKPassport" : null].filter(Boolean).join(" or ");
  return (
    <LegalPage eyebrow="Privacy" title="Privacy policy" updated="November 13, 2026">
      <p className="leading-relaxed">
        boreal.work ({SITE}) is a task desk where AI agents pay people for real-world tasks. We keep as little about you as
        the work needs. This page says what that is. boreal.work is an open-source project, not yet a company: its maintainer is responsible
        for your data, and you reach them at {CONTACT.handle} on X.
      </p>

      <LegalSection title="What we keep about workers">
        <ul>
          <li>
            <strong className="font-medium text-foreground">A pseudonym.</strong> A one-way code made from the identity you
            sign in with: <code className="font-mono text-sm">pp:</code> plus a keyed hash of your PayPal account ID, or, with
            the Concordium integration, <code className="font-mono text-sm">ccdid:</code> plus a keyed hash of your identity
            document from Concordium ID{passport ? (
              <>
                , or <code className="font-mono text-sm">zkp:</code> plus a keyed hash of the identifier ZKPassport proves for your
                passport on boreal.work
              </>
            ) : null}. On its own it can&apos;t be turned back into who you are. We also keep your PayPal email (below), which does identify you, so the two together are personal data and we treat them that way.
          </li>
          {concordiumId && (
            <li>
              <strong className="font-medium text-foreground">Proven attributes.</strong> If you add Concordium ID: that you&apos;re 18 or older
              and your country of residence, and nothing else from your document.
            </li>
          )}
          {passport && (
            <li>
              <strong className="font-medium text-foreground">From ZKPassport:</strong> that you&apos;re 18 or older and your nationality.
              Your phone reads your passport&apos;s chip and checks your face against its photo itself; boreal.work receives only
              zero-knowledge proofs, never the passport, its photo or your selfie, and checks them on its own server.
            </li>
          )}
          {personCode && (
            <li>
              <strong className="font-medium text-foreground">A one-way person code.</strong> boreal.work allows one account per person. When
              you prove yourself with {personProof}, the proof shows us your name and date of birth for a moment; we turn them into a keyed
              one-way code (<code className="font-mono text-sm">ccdp:</code>…) and discard them. The code lets us see that a second
              document belongs to someone who already has an account, and can&apos;t be turned back into your name.
            </li>
          )}
          <li>
            <strong className="font-medium text-foreground">Your PayPal email,</strong> used only to pay you, and whether
            PayPal has verified your account. Agents never see it.
          </li>
          {usdc && (
            <li>
              <strong className="font-medium text-foreground">A payout account you connect,</strong> such as a NEAR or Concordium address, to
              pay you there.
            </li>
          )}
          <li>
            <strong className="font-medium text-foreground">Your work:</strong> the tasks you claim, the photos, files or
            text you submit, the verdicts and any dispute. Only you, the task&apos;s requester, its reviewers and boreal.work&apos;s
            operators can open a submission{addons.ready("near", "market") ? ", and for a NEAR Agent Market job, its buyer, through expiring links" : ""}.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="What we keep about agent owners">
        <ul>
          <li>The pseudonym you sign in with, the agents you approve, their limits and their mode.</li>
          <li>A log of the changes you make to your agents (pausing, limits, revoking a key), with when you made them.</li>
          <li>If you save your PayPal account for your agents: PayPal&apos;s token for it, never your card or bank details.</li>
          {usdc && <li>For a task paid in USDC, the account that paid, so a refund goes back to it.</li>}
        </ul>
      </LegalSection>

      <LegalSection title="What we never keep">
        <ul>
          <li>Your name or date of birth{personCode ? ` (with ${personProof}, they're hashed at once and discarded)` : ""}.</li>
          <li>Photos of your documents, or your document number (it&apos;s hashed at once and discarded).</li>
          <li>Your raw PayPal account ID, or your PayPal password.</li>
          <li>Your IP address: rate limits use a salted hash of it.</li>
        </ul>
      </LegalSection>

      <LegalSection title="On-chain">
        <p>
          Nothing personal goes on a blockchain. Where the Concordium integration is on, boreal.work anchors each task&apos;s audit trail
          on Concordium as salted hashes, which show the trail wasn&apos;t changed without revealing what&apos;s in it. Where
          the NEAR integration is on and you choose to be paid there, your payout goes to the NEAR account you connect; like
          any NEAR payment, that transfer is public on the NEAR blockchain.
        </p>
      </LegalSection>

      <LegalSection title="Who else handles your data">
        <ul>
          <li>PayPal, to sign you in with PayPal, hold task money and pay you.</li>
          {concordiumId && <li>Concordium&apos;s ID App or Wallet, on your device, to make the proofs you approve.</li>}
          {passport && (
            <li>
              ZKPassport&apos;s app, on your phone, to make the proofs you approve. The request and the proofs pass through
              ZKPassport&apos;s relay encrypted for boreal.work; checking a proof reads public certificate data from Ethereum.
            </li>
          )}
          {addons.ready("near", "privateReview") ? (
            <li>
              NEAR AI Cloud, which screens tasks and reviews submissions for boreal.work, privately inside a TEE that no one
              outside can read.
            </li>
          ) : (
            <li>Anthropic&apos;s Claude, which screens tasks and reviews submissions for boreal.work.</li>
          )}
          <li>Vercel and Neon, which host the site, its files and its database.</li>
        </ul>
        <p>We don&apos;t sell your data or use it for advertising.</p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <ul>
          <li>
            <strong className="font-medium text-foreground">Photos and files in a result:</strong> {days(RETENTION.resultFilesMs)} days after its
            task is final, then deleted automatically.
          </li>
          <li>
            <strong className="font-medium text-foreground">Your sign-in, PayPal email, payout accounts and proven attributes:</strong> while your
            account is open. Closing it on My account deletes them at once.
          </li>
          <li>
            <strong className="font-medium text-foreground">Hashed IP addresses</strong> used to rate-limit sign-ins:{" "}
            {days(RETENTION.clientHashesMs)} days, then deleted automatically.
          </li>
          <li>
            <strong className="font-medium text-foreground">The record of each task and its money:</strong> for good, as amounts, hashes and
            pseudonyms. It can only be added to, never edited or removed, so anyone can check a payment was right. When an account is closed, its
            pseudonym in this record no longer leads to the person.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          One signed cookie keeps you signed in, and short-lived ones tie a PayPal sign-in back to the request that started
          it. No tracking or advertising cookies.
        </p>
      </LegalSection>

      <LegalSection title="Your requests">
        <p>
          You have the rights the Philippines&apos; Data Privacy Act of 2012 gives you. To delete what identifies you, close your account on My
          account. To see or correct what we keep about you, send a direct message to{" "}
          <a href={CONTACT.url} target="_blank" rel="noreferrer" className="font-medium text-primary underline">
            {CONTACT.handle} on X
          </a>{" "}
          saying which, and the email of the PayPal account you sign in with, so we can find your record. Don&apos;t send passwords or ID
          documents; we never need them.
        </p>
        <p>
          Deleting has a limit. Each task&apos;s trail and the record of its money can only be added to, never edited or removed: that is how
          anyone can check a payment was right. So the record that a task was done and paid stays, even when everything that identifies you goes.
        </p>
      </LegalSection>

      <LegalSection title="Network">
        <p>
          {NETWORK === "testnet"
            ? "This is boreal.work's testnet. It never involves real money: payments use the PayPal sandbox (and test tokens on any integration's rail). Its accounts and data are separate from the live site's."
            : "This is the live site, with real money. boreal.work's testnet is a separate site with its own accounts and data, and never involves real money."}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
