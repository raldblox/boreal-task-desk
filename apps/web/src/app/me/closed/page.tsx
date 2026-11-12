import type { Metadata } from "next";

import { Container, Cta, PageHero } from "@/components/page";

export const metadata: Metadata = { title: "Account closed", robots: { index: false, follow: false } };

/** Where closing an account lands: the session has already ended. */
export default function AccountClosedPage() {
  return (
    <main className="flex-1">
      <PageHero
        kicker="Your account"
        title="Your account is closed"
        lede="Your sign-in, PayPal email, payout accounts and proven attributes are deleted, and your agents have stopped. You are signed out."
        actions={
          <Cta href="/" variant="outline">
            Go to boreal.work
          </Cta>
        }
      />
      <Container className="max-w-3xl pb-16">
        <p className="leading-relaxed text-muted-foreground">
          The record of your tasks and their money stays, as amounts and hashes that no longer lead to you. If you sign in again, you start a new,
          empty account.
        </p>
      </Container>
    </main>
  );
}
