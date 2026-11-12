// The little of an EVM chain the rail needs, as an interface: the JSON-RPC implementation below
// for real chains, an in-memory one in tests.

export type Hex = `0x${string}`;

export interface EvmReceipt {
  status: "success" | "reverted";
  blockNumber: bigint;
}

export interface EvmChain {
  /** A read-only contract call; the returned data, hex encoded. */
  call(to: Hex, data: Hex): Promise<Hex>;
  /** The account's transaction count: `latest` is what has been mined, `pending` adds what is waiting. */
  nonce(address: Hex, block: "latest" | "pending"): Promise<number>;
  /** Fees that get a transaction mined promptly now. */
  fees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  estimateGas(tx: { from: Hex; to: Hex; data: Hex }): Promise<bigint>;
  /** Broadcasts a signed transaction; returns its hash. */
  send(raw: Hex): Promise<Hex>;
  /** A mined transaction's receipt, or null while the chain hasn't mined it. */
  receipt(hash: Hex): Promise<EvmReceipt | null>;
}

export class EvmRpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "EvmRpcError";
  }
}

const toBig = (hex: string) => BigInt(hex);

/** An `EvmChain` over a JSON-RPC endpoint, checked once to be the chain it was configured for. */
export function createEvmRpc(url: string, chainId: number, fetchImpl: typeof fetch = fetch): EvmChain {
  let checked: Promise<void> | undefined;

  async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      // Funding checks and payouts wait on this; a node that never answers must fail, not hang.
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new EvmRpcError(`EVM RPC ${method} answered ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: { code?: number; message?: string } };
    if (body.error) throw new EvmRpcError(`EVM RPC ${method}: ${body.error.message ?? "error"}`, body.error.code);
    return body.result as T;
  }

  /** Money must never go to the wrong chain because an RPC URL was pasted wrong. */
  async function call<T>(method: string, params: unknown[]): Promise<T> {
    checked ??= rpc<string>("eth_chainId", []).then((id) => {
      if (Number(toBig(id)) !== chainId) throw new EvmRpcError(`the RPC endpoint is chain ${Number(toBig(id))}, not ${chainId}`);
    });
    await checked.catch((error) => {
      checked = undefined;
      throw error;
    });
    return rpc<T>(method, params);
  }

  return {
    call: (to, data) => call<Hex>("eth_call", [{ to, data }, "latest"]),
    nonce: async (address, block) => Number(toBig(await call<string>("eth_getTransactionCount", [address, block]))),
    async fees() {
      const [tip, block] = await Promise.all([
        call<string>("eth_maxPriorityFeePerGas", []).then(toBig).catch(() => BigInt(1_000_000)),
        call<{ baseFeePerGas?: string }>("eth_getBlockByNumber", ["latest", false]),
      ]);
      const base = block.baseFeePerGas ? toBig(block.baseFeePerGas) : BigInt(0);
      // Twice the base fee leaves room for it to rise over the blocks the transaction may wait.
      return { maxPriorityFeePerGas: tip, maxFeePerGas: base * BigInt(2) + tip };
    },
    estimateGas: async (tx) => toBig(await call<string>("eth_estimateGas", [tx])),
    send: (raw) => call<Hex>("eth_sendRawTransaction", [raw]),
    async receipt(hash) {
      const found = await call<{ status: string; blockNumber: string } | null>("eth_getTransactionReceipt", [hash]);
      if (!found) return null;
      return { status: toBig(found.status) === BigInt(1) ? "success" : "reverted", blockNumber: toBig(found.blockNumber) };
    },
  };
}
