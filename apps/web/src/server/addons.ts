import "server-only";

import { addonEnv, type Addons, deskVerification, pseudonymSecretFrom, readAddons } from "@boreal/core";
import { DeskError } from "@boreal/desk";

// The deployment's add-ons (BOREAL_ADDONS), read once per process. boreal runs on PayPal; NEAR
// and Concordium switch on here. Loaders read `addonEnv()`, which leaves out every setting of
// an add-on that's off, so nothing of it can half-start.

let addons: Addons | undefined;
let env: Record<string, string | undefined> | undefined;

export function getAddons(): Addons {
  addons ??= readAddons(process.env);
  return addons;
}

/** process.env with the settings of add-ons that are off removed. */
export function gatedEnv(): Record<string, string | undefined> {
  env ??= addonEnv(process.env);
  return env;
}

/** How people verify here (see deskVerification). */
export function verification() {
  return deskVerification(getAddons());
}

/** The secret keying PayPal and Concordium ID pseudonyms, when it is long enough. */
export function pseudonymSecret(): string | null {
  const secret = pseudonymSecretFrom(process.env);
  return secret && secret.length >= 32 ? secret : null;
}

/**
 * Refuses an add-on's endpoint when that part isn't on here: 404 when the add-on is off (it
 * doesn't exist on this site), 503 with the reason when it's on but missing what it needs.
 */
export function addonRefusal(id: "concordium" | "near", part: string): Response | null {
  const status = getAddons()[id];
  const found = status.parts.find((p) => p.id === part);
  if (found?.state === "ready") return null;
  if (!status.enabled) {
    return Response.json(
      { error: "addon_off", message: `${found?.name ?? status.name} is part of the ${status.name} add-on, which isn't on here. This site runs on PayPal.` },
      { status: 404 },
    );
  }
  return Response.json({ error: "unavailable", message: `${found?.name ?? status.name} isn't ready here. ${found?.reason ?? ""}`.trim() }, { status: 503 });
}

/** For agents (get_account): which add-ons are on here. PayPal is always the core. */
export function addonFlags(): { concordium: boolean; near: boolean } {
  const addons = getAddons();
  return { concordium: addons.on("concordium"), near: addons.on("near") };
}

/** Throws a desk refusal unless this add-on part is ready, naming why (for server actions). */
export function requireAddonPart(id: "concordium" | "near", part: string): void {
  const status = getAddons()[id];
  const found = status.parts.find((p) => p.id === part);
  if (found?.state === "ready") return;
  throw new DeskError(
    "unavailable",
    status.enabled
      ? `${found?.name ?? status.name} isn't ready here. ${found?.reason ?? ""}`.trim()
      : `${found?.name ?? status.name} is part of the ${status.name} add-on, which isn't on here. This site runs on PayPal.`,
  );
}
