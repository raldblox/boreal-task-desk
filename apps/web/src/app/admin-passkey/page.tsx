import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PasskeyPanel } from "@/components/admin/passkey-panel";
import { Container, PageHero } from "@/components/page";
import { enrollCode } from "@/lib/admin-passkey";
import { when } from "@/lib/format";
import { adminPasskeyState } from "@/server/admin";
import { getDesk } from "@/server/desk";

export const metadata: Metadata = { title: "Admin passkey", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ next?: string }> };

/**
 * The second step for /admin: present a passkey, or register one. It sits outside /admin, whose
 * layout only renders once the check has passed. Anyone who isn't a signed-in, allowlisted
 * admin gets the site's 404, the same as on /admin.
 */
async function Passkeys({ searchParams }: Props) {
  const state = await adminPasskeyState();
  if (!state) notFound();
  const { next } = await searchParams;
  // Only ever back into the admin area.
  const target = next && /^\/admin(\/[\w\-/]*)?$/.test(next) ? next : "/admin";
  const passkeys = await getDesk().adminPasskeys(state.admin.ref);
  return (
    <PasskeyPanel
      passed={state.passed}
      needsCode={enrollCode(process.env) !== null || state.required}
      next={target}
      passkeys={passkeys.map((p) => ({ id: p.id, label: p.label, createdAt: when(p.createdAt), lastUsedAt: p.lastUsedAt ? when(p.lastUsedAt) : null }))}
    />
  );
}

export default function AdminPasskeyPage(props: Props) {
  return (
    <>
      <PageHero title="Admin passkey" lede="The admin area opens only with your security key, on top of signing in." />
      <Container className="max-w-2xl py-10">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <Passkeys {...props} />
        </Suspense>
      </Container>
    </>
  );
}
