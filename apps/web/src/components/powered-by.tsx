import { ConcordiumLogo, NearLogo } from "@/components/chain-logos";
import { PayPalLogo } from "@/components/paypal-brand";
import { getAddons } from "@/server/addons";
import { getRails } from "@/server/desk";

// Which integrations run this deployment, and what each one does here. The product copy stays
// neutral ("held in escrow", "verified"); this row is where providers get named, and only the
// ones that are actually on.

type Integration = { name: string; does: string; logo?: "paypal" | "near" | "concordium" };

const list = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? ""));

export function integrations(): Integration[] {
  const addons = getAddons();
  const rails = getRails();
  const out: Integration[] = [];
  if (rails.paypal) out.push({ name: "PayPal", does: "sign-in, payment holds and payouts", logo: "paypal" });
  if (addons.on("near")) {
    const parts = [
      addons.ready("near", "rail") && "USDC escrow",
      addons.ready("near", "privateReview") && "private AI review",
    ].filter((p): p is string => Boolean(p));
    if (parts.length) out.push({ name: "NEAR", does: list(parts), logo: "near" });
  }
  if (addons.on("concordium")) {
    const parts = [
      addons.ready("concordium", "id") && "ID checks",
      addons.ready("concordium", "rail") && "stablecoin escrow",
      addons.ready("concordium", "anchors") && "anchored records",
    ].filter((p): p is string => Boolean(p));
    if (parts.length) out.push({ name: "Concordium", does: list(parts), logo: "concordium" });
  }
  return out;
}

/** A quiet row of the integrations that are on: "Powered by PayPal · NEAR · Concordium". */
export function PoweredBy({ className = "" }: { className?: string }) {
  const items = integrations();
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground ${className}`}>
      <span>Powered by</span>
      {items.map(({ name, does, logo }) => (
        <span
          key={name}
          title={`${name}: ${does}`}
          // PayPal's colour logo is made for light grounds: its pill uses PayPal's own button grey.
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium ${logo === "paypal" ? "border-transparent bg-[#eeeeee]" : "bg-card text-foreground"}`}
        >
          {logo === "paypal" ? (
            <>
              <PayPalLogo className="h-3.5 w-auto" />
              <span className="sr-only">: {does}</span>
            </>
          ) : null}
          {logo === "near" && <NearLogo className="size-3" />}
          {logo === "concordium" && <ConcordiumLogo className="size-3" />}
          {logo !== "paypal" && (
            <>
              {name}
              <span className="sr-only">: {does}</span>
            </>
          )}
        </span>
      ))}
    </div>
  );
}
