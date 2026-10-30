import { TransitionError } from "@boreal/core";

export type DeskErrorCode = "not_found" | "forbidden" | "invalid" | "conflict" | "limit";

/** A refusal the caller can act on; the API maps each code to an HTTP status. */
export class DeskError extends Error {
  constructor(
    readonly code: DeskErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DeskError";
  }
}

export function fromTransitionError(error: TransitionError): DeskError {
  return new DeskError(error.code === "actor_not_allowed" ? "forbidden" : "conflict", error.message);
}
