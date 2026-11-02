// Helpers for tests of the NEAR rail.

import { generateKeyPairSync } from "node:crypto";

import type { SentTransfer, TransferJournal } from "@boreal/concordium";

import { base58Encode } from "./tx";

/** A fresh account key in NEAR's `ed25519:<base58 seed+public>` format. */
export function newNearKey(): string {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const d = Buffer.from(privateKey.export({ format: "jwk" }).d!, "base64url");
  const x = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  return `ed25519:${base58Encode(Buffer.concat([d, x]))}`;
}

export function memoryJournal(): TransferJournal & { entries: Map<string, SentTransfer> } {
  const entries = new Map<string, SentTransfer>();
  return {
    entries,
    async find(key) {
      return entries.get(key) ?? null;
    },
    async save(key, sent) {
      entries.set(key, sent);
    },
  };
}
