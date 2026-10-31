import { connection } from "next/server";
import { Suspense } from "react";

import { signIn, signInTest } from "@/app/actions";
import { DevWallet, TestSignIn } from "@/components/worker-forms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getConcordium, getDesk } from "@/server/desk";

async function SignIn() {
  await connection();
  if (!getConcordium()) {
    return (
      <div className="flex flex-col gap-6">
        <Alert>
          <AlertTitle>Sign-in opens with Concordium ID</AlertTitle>
          <AlertDescription>
            Workers sign in by proving only what tasks need, like residency or age, with Concordium ID. This opens on
            testnet once the integration is live.
          </AlertDescription>
        </Alert>
        {process.env.TEST_WORKER_INVITE && (
          <Card>
            <CardHeader>
              <CardTitle>Testers</CardTitle>
              <CardDescription>
                Have an invite? Sign in to run test tasks. Test tasks pay in test money only, and your attributes are
                self-declared until Concordium ID is live.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TestSignIn action={signInTest} />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  // A fresh, signed challenge each time; the wallet's proof must answer this exact one.
  const request = await getDesk().workerProofRequest([]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Development wallet</CardTitle>
        <CardDescription>
          Stands in for the Concordium ID wallet. Choose what to prove; boreal stores only a pseudonym and these
          attributes, never your name.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DevWallet action={signIn} request={JSON.stringify(request)} />
      </CardContent>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to work</h1>
        <p className="text-muted-foreground">Prove only what tasks require. Your identity stays with you.</p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Preparing sign-in…</p>}>
        <SignIn />
      </Suspense>
    </main>
  );
}
