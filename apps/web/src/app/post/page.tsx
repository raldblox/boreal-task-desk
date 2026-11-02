import { POLICY } from "@boreal/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Eyebrow } from "@/components/brand";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { getDesk } from "@/server/desk";
import { workerFromSession } from "@/server/session";

import { postTask } from "./actions";
import { PostForm } from "./post-form";

export const metadata: Metadata = {
  title: "Post a task · boreal.work",
  description: "Hand a task that needs a real person to a verified human, and pay only if the result passes.",
};

async function Form() {
  const worker = await workerFromSession();
  if (!worker || worker.role !== "worker") {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-6">
        <p className="font-semibold">Sign in to post a task</p>
        <p className="text-sm text-muted-foreground">
          Log in with PayPal or Concordium ID. You pay with PayPal, and only once boreal has checked your task.
        </p>
        <Link href="/signin?next=/post" className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    );
  }
  const desk = getDesk();
  const profile = await desk.getWorker(worker);
  if (profile?.testMode) {
    return (
      <Alert>
        <AlertDescription>Test worker accounts can&apos;t post tasks. Sign in with PayPal or Concordium ID.</AlertDescription>
      </Alert>
    );
  }
  // Same rule as for agents: without Concordium ID, a person posts up to the unverified cap.
  const verified = Boolean(profile?.hasConcordium);
  return <PostForm action={postTask} maxTask={verified ? POLICY.maxTaskBudget : POLICY.unverifiedTaskBudget} verified={verified} />;
}

export default function PostPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 md:py-14">
      <div className="flex flex-col gap-3">
        <Eyebrow>Post a task</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight">Hand it to a verified human</h1>
        <p className="text-muted-foreground">
          Something in the physical world, or a judgment only a person can give. A worker claims it, sends the result, and
          you pay only if it meets your checks.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Form />
      </Suspense>
    </main>
  );
}
