import { normaliseLinkCode } from "@boreal/desk";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Container, PageHero } from "@/components/page";
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
    <main className="flex-1">
      <PageHero
        kicker="Link an agent"
        title={<>Enter your agent&apos;s code</>}
        lede={
          <>
            Your agent shows a code like <span className="font-mono">K7QM-2XPA</span> when it asks to connect to boreal.
          </>
        }
      />
      <Container className="flex flex-col gap-6 py-10 md:py-14 [&>*]:max-w-[560px]">
      <Suspense>
        <GoToCode {...props} />
      </Suspense>
      <form method="get" className="flex flex-col gap-3">
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" placeholder="XXXX-XXXX" autoComplete="off" spellCheck={false} className="font-mono uppercase" required />
        <Button type="submit" size="lg" className="h-11 text-base">
          Continue
        </Button>
        <p className="text-sm text-muted-foreground">
          Next you sign in, set how much the agent may spend, and approve. Codes work for 15 minutes; if yours has run out,
          ask your agent for a new one.
        </p>
      </form>
      </Container>
    </main>
  );
}
