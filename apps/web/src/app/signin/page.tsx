import { connection } from "next/server";
import { Suspense } from "react";

import { signIn, signInTest } from "@/app/actions";
import { ConcordiumSignIn } from "@/components/concordium-sign-in";
import { DevWallet, TestSignIn } from "@/components/worker-forms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getConcordium, getDesk } from "@/server/desk";
import { getIdAppVerifier } from "@/server/id-app";

function TesterCard() {
  if (!process.env.TEST_WORKER_INVITE) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Testers</CardTitle>
        <CardDescription>
          Have an invite? Sign in to run test tasks. Test tasks pay in test money only, and your attributes are
          self-declared.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TestSignIn action={signInTest} />
      </CardContent>
    </Card>
  );
}

async function SignIn() {
  await connection();

  if (getIdAppVerifier()) {
    const network = process.env.CONCORDIUM_NETWORK === "mainnet" ? "mainnet" : "testnet";
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Concordium ID</CardTitle>
            <CardDescription>
              Scan the code with the Concordium ID App and approve the request. You prove you are 18 or older and share
              your country of residence; boreal never sees your name or documents.
              {network === "testnet" ? " (Concordium testnet)" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConcordiumSignIn projectId={process.env.NEXT_PUBLIC_REOWN_PROJECT_ID!} network={network} />
          </CardContent>
        </Card>
        <TesterCard />
      </div>
    );
  }

  if (getConcordium()) {
    // Local stand-in mode (pnpm dev:local): a fresh, signed challenge each time.
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

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <AlertTitle>Sign-in opens with Concordium ID</AlertTitle>
        <AlertDescription>
          Workers sign in by proving only what tasks need, like residency or age, with Concordium ID.
        </AlertDescription>
      </Alert>
      <TesterCard />
    </div>
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
