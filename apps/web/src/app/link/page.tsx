import { normaliseLinkCode } from "@boreal/desk";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Eyebrow } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { searchParams: Promise<{ code?: string }> };

async function GoToCode({ searchParams }: Props) {
  const { code } = await searchParams;
  if (code?.trim()) redirect(`/link/${normaliseLinkCode(code)}`);
  return null;
}

/** Where an owner types the code their agent showed them. */
export default function EnterCodePage(props: Props) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12 md:py-16">
      <Suspense>
        <GoToCode {...props} />
      </Suspense>
      <div className="flex flex-col gap-3">
        <Eyebrow>Link an agent</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight">Enter your agent&apos;s code</h1>
        <p className="text-muted-foreground">
          Your agent shows a code like <span className="font-mono">K7QM-2XPA</span> when it asks to connect to boreal.
        </p>
      </div>
      <form method="get" className="flex flex-col gap-3">
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" placeholder="XXXX-XXXX" autoComplete="off" spellCheck={false} className="font-mono uppercase" required />
        <Button type="submit" size="lg" className="h-11 text-base">
          Continue
        </Button>
      </form>
    </main>
  );
}
