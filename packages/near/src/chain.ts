// The slice of NEAR's JSON-RPC that the rail uses, behind an interface so tests run on a fake.

export interface TxOutcome {
  hash: string;
  status: "success" | "failed";
  signerId: string;
  receiverId: string;
  /** The transaction's function calls, with JSON arguments decoded. */
  calls: { methodName: string; args: unknown }[];
  error?: string;
}

export interface NearChain {
  /** A view call on a contract, its JSON result decoded. */
  view(contractId: string, methodName: string, args: unknown): Promise<unknown>;
  /** The key's current nonce and a recent final block hash to sign against. */
  accessKey(accountId: string, publicKey: string): Promise<{ nonce: bigint; blockHash: string }>;
  /** What a key may do on the account, or null when it isn't one of the account's keys. */
  keyPermission(accountId: string, publicKey: string): Promise<"FullAccess" | "FunctionCall" | null>;
  /** Sends a signed transaction and waits until it is final. */
  send(signedBase64: string): Promise<TxOutcome>;
  /** A sent transaction's final outcome, or null while the chain doesn't know it. */
  status(hash: string, senderId: string): Promise<TxOutcome | null>;
}

export class NearRpcError extends Error {
  constructor(
    message: string,
    readonly cause?: string,
  ) {
    super(message);
  }
}

interface RpcOutcome {
  status: { SuccessValue?: string; Failure?: unknown } | string;
  transaction: {
    hash: string;
    signer_id: string;
    receiver_id: string;
    actions: ({ FunctionCall?: { method_name: string; args: string } } | string)[];
  };
  receipts_outcome: { outcome: { status: { Failure?: unknown } | object } }[];
}

function toOutcome(r: RpcOutcome): TxOutcome {
  const failure =
    (typeof r.status === "object" && "Failure" in r.status && r.status.Failure) ||
    r.receipts_outcome.map((o) => ("Failure" in o.outcome.status ? o.outcome.status.Failure : null)).find(Boolean);
  const calls = r.transaction.actions.flatMap((a) => {
    if (typeof a !== "object" || !a.FunctionCall) return [];
    let args: unknown = null;
    try {
      args = JSON.parse(Buffer.from(a.FunctionCall.args, "base64").toString("utf8"));
    } catch {
      // Non-JSON arguments are never ours.
    }
    return [{ methodName: a.FunctionCall.method_name, args }];
  });
  return {
    hash: r.transaction.hash,
    status: failure ? "failed" : "success",
    signerId: r.transaction.signer_id,
    receiverId: r.transaction.receiver_id,
    calls,
    ...(failure ? { error: JSON.stringify(failure) } : {}),
  };
}

export function createNearRpc(url: string, fetchImpl: typeof fetch = fetch): NearChain {
  async function call<T>(method: string, params: unknown): Promise<T> {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "boreal", method, params }),
      // Funding checks and payouts wait on this; an RPC node that never answers must fail, not hang.
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new NearRpcError(`NEAR RPC ${method} answered ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: { message?: string; name?: string; cause?: { name?: string; info?: unknown } } };
    if (body.error) {
      const cause = body.error.cause?.name;
      throw new NearRpcError(`NEAR RPC ${method}: ${cause ?? body.error.name ?? body.error.message ?? "error"}`, cause);
    }
    // View queries report contract errors in the result, not as RPC errors.
    const result = body.result as T & { error?: string };
    if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
      throw new NearRpcError(`NEAR RPC ${method}: ${result.error}`);
    }
    return result;
  }

  return {
    async view(contractId, methodName, args) {
      const r = await call<{ result: number[] }>("query", {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: methodName,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      });
      return JSON.parse(Buffer.from(r.result).toString("utf8"));
    },
    async accessKey(accountId, publicKey) {
      const r = await call<{ nonce: number | string; block_hash: string }>("query", {
        request_type: "view_access_key",
        finality: "final",
        account_id: accountId,
        public_key: publicKey,
      });
      return { nonce: BigInt(r.nonce), blockHash: r.block_hash };
    },
    async keyPermission(accountId, publicKey) {
      try {
        const r = await call<{ permission: "FullAccess" | { FunctionCall: unknown } }>("query", {
          request_type: "view_access_key",
          finality: "final",
          account_id: accountId,
          public_key: publicKey,
        });
        return r.permission === "FullAccess" ? "FullAccess" : "FunctionCall";
      } catch (error) {
        if (error instanceof NearRpcError && /UNKNOWN_ACCESS_KEY|UNKNOWN_ACCOUNT|does not exist/.test(error.message)) return null;
        throw error;
      }
    },
    async send(signedBase64) {
      return toOutcome(await call<RpcOutcome>("send_tx", { signed_tx_base64: signedBase64, wait_until: "FINAL" }));
    },
    async status(hash, senderId) {
      try {
        return toOutcome(await call<RpcOutcome>("tx", { tx_hash: hash, sender_account_id: senderId, wait_until: "FINAL" }));
      } catch (error) {
        if (error instanceof NearRpcError && (error.cause === "UNKNOWN_TRANSACTION" || error.cause === "TIMEOUT_ERROR")) return null;
        throw error;
      }
    },
  };
}
