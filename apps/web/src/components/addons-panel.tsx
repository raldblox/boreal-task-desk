import type { AddonPart, AddonStatus, Requirement } from "@boreal/core";
import { CircleAlert, CircleCheck, CircleDashed, CircleHelp, Puzzle } from "lucide-react";

import { Badge } from "@/components/ui/badge";

// The integrations area: what each optional integration (NEAR, Concordium) unlocks and what it needs,
// on top of boreal's PayPal core. Operators (admin) see the settings behind each requirement;
// the public status page sees only whether it's met.

const PART_LOOK: Record<AddonPart["state"], { label: string; tone: string; icon: typeof CircleCheck }> = {
  ready: { label: "Ready", tone: "text-primary", icon: CircleCheck },
  blocked: { label: "Blocked", tone: "text-amber-600 dark:text-amber-400", icon: CircleAlert },
  off: { label: "Off", tone: "text-muted-foreground", icon: CircleDashed },
};

function RequirementRow({ requirement, operator }: { requirement: Requirement; operator: boolean }) {
  const Icon = requirement.met === true ? CircleCheck : requirement.met === false ? CircleAlert : CircleHelp;
  const tone =
    requirement.met === true ? "text-primary" : requirement.met === false ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground";
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
      <span className="min-w-0">
        {requirement.label}
        {requirement.met === null && <span className="text-muted-foreground"> (can&apos;t be checked from settings; watch the anchor queue)</span>}
        {operator && requirement.setting && <span className="block font-mono text-xs text-muted-foreground break-all">{requirement.setting}</span>}
      </span>
    </li>
  );
}

export function AddonCard({ addon, operator = false }: { addon: AddonStatus; operator?: boolean }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5" aria-label={`${addon.name} integration`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted">
            <Puzzle className="size-5 text-muted-foreground" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">{addon.name} integration</p>
            <p className="text-sm text-muted-foreground">{addon.summary}</p>
          </div>
        </div>
        <Badge variant={addon.enabled ? "default" : "outline"}>{addon.enabled ? "On" : "Off"}</Badge>
      </div>
      <div className="text-sm">
        <p className="font-medium">People who use it need</p>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          {addon.personNeeds.map((need) => (
            <li key={need}>{need}</li>
          ))}
        </ul>
      </div>
      <ul className="flex flex-col divide-y rounded-xl border">
        {addon.parts.map((part) => {
          const look = PART_LOOK[part.state];
          const Icon = look.icon;
          return (
            <li key={part.id} className="flex flex-col gap-2 p-3">
              <div className="flex items-start gap-2">
                <Icon className={`mt-0.5 size-4 shrink-0 ${look.tone}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{part.name}</p>
                  <p className="text-sm text-muted-foreground">{part.unlocks}</p>
                  {part.reason && <p className={`text-sm ${look.tone}`}>{part.reason}</p>}
                </div>
                <span className={`shrink-0 text-xs font-medium ${look.tone}`}>{look.label}</span>
              </div>
              {(operator || part.state !== "off") && (
                <ul className="flex flex-col gap-1 pl-6">
                  {part.requirements.map((r) => (
                    <RequirementRow key={r.label} requirement={r} operator={operator} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {operator && !addon.enabled && (
        <p className="text-sm text-muted-foreground">
          To switch it on, add <code className="font-mono">{addon.id}</code> to <code className="font-mono">BOREAL_ADDONS</code> in this
          deployment&apos;s settings once the requirements above are in place, then redeploy. Nothing of it runs until then.
        </p>
      )}
    </section>
  );
}

/** Every integration, with a line on PayPal being the core and where the setting came from. */
export function AddonsPanel({
  addons,
  source,
  operator = false,
}: {
  addons: AddonStatus[];
  source: "explicit" | "inferred";
  operator?: boolean;
}) {
  const on = addons.filter((a) => a.enabled);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        boreal runs on PayPal: Log in with PayPal, PayPal escrow, saved PayPal accounts for agents and PayPal Payouts.{" "}
        {on.length === 0 ? "No integrations are on here." : `Integrations on here: ${on.map((a) => a.name).join(", ")}.`}
        {operator && source === "inferred" && (
          <>
            {" "}
            <span className="text-amber-600 dark:text-amber-400">
              BOREAL_ADDONS isn&apos;t set, so these were inferred from older settings. Set it (for example{" "}
              <code className="font-mono">concordium,near</code> or <code className="font-mono">none</code>) to make it explicit.
            </span>
          </>
        )}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {addons.map((addon) => (
          <AddonCard key={addon.id} addon={addon} operator={operator} />
        ))}
      </div>
    </div>
  );
}
