import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { nearSigner, signTransaction } from "@boreal/near";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// public/near-pay.mjs is what any agent downloads to pay a task on NEAR. Run it as an agent would,
// against a stand-in RPC, and check that what it signs is exactly what boreal.work's own NEAR code
// signs: the same bytes, so the desk's checks accept it.

const run = promisify(execFile);
const SCRIPT = join(process.cwd(), "public", "near-pay.mjs");
const BLOCK = "11111111111111111111111111111111";

let server: Server;
let rpcUrl = "";
const sent: string[] = [];
let failNext = false;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { method, params } = JSON.parse(body);
      let result: unknown;
      if (method === "query" && params.request_type === "view_access_key") result = { nonce: 41, block_hash: BLOCK, permission: "FullAccess" };
      else if (method === "send_tx") {
        sent.push(params.signed_tx_base64);
        result = failNext
          ? { status: { SuccessValue: "" }, receipts_outcome: [{ outcome: { status: { Failure: { ActionError: { kind: "FunctionCallError" } } } } }] }
          : { status: { SuccessValue: "" }, receipts_outcome: [{ outcome: { status: { SuccessValue: "" } } }] };
        failNext = false;
      } else result = { error: "unexpected" };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: "near-pay", result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  rpcUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(() => server.close());

describe("near-pay.mjs", () => {
  const dir = mkdtempSync(join(tmpdir(), "near-pay-"));
  const wallet = join(dir, "wallet.json");
  const cli = (...args: string[]) => run(process.execPath, [SCRIPT, ...args, "--wallet", wallet, "--rpc", rpcUrl], { cwd: dir });

  it("makes an implicit account whose key never appears in its output", async () => {
    const { stdout } = await cli("new");
    const made = JSON.parse(stdout);
    const saved = JSON.parse(readFileSync(wallet, "utf8"));
    expect(made.nearAccount).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.accountId).toBe(made.nearAccount);
    expect(stdout).not.toContain(saved.secretKey);
    await expect(cli("new")).rejects.toThrow(/already exists/);
  });

  it("signs the same ft_transfer, byte for byte, as boreal.work's own NEAR code", async () => {
    const { stdout } = await cli("pay", "--to", "escrow.testnet", "--amount", "6400000", "--asset", "usdc.testnet", "--memo", "boreal:task-1");
    const paid = JSON.parse(stdout);
    const saved = JSON.parse(readFileSync(wallet, "utf8"));
    const expected = signTransaction(nearSigner(saved.accountId, saved.secretKey), {
      receiverId: "usdc.testnet",
      nonce: BigInt(42),
      blockHash: BLOCK,
      calls: [
        {
          methodName: "ft_transfer",
          args: { receiver_id: "escrow.testnet", amount: "6400000", memo: "boreal:task-1" },
          gas: BigInt(30) * BigInt("1000000000000"),
          deposit: BigInt(1),
        },
      ],
    });
    expect(sent.at(-1)).toBe(expected.base64);
    expect(paid).toMatchObject({ txHash: expected.hash, signerId: saved.accountId });
  });

  it("refuses what isn't a boreal.work payment, and reports a transfer that failed on chain", async () => {
    await expect(cli("pay", "--to", "x.testnet", "--amount", "1", "--asset", "usdc.testnet", "--memo", "hello")).rejects.toThrow(/extra.memo/);
    await expect(cli("pay", "--to", "x.testnet", "--amount", "900", "--asset", "usdc.testnet", "--memo", "boreal:t", "--max", "100")).rejects.toThrow(/above --max/);
    failNext = true;
    await expect(cli("pay", "--to", "x.testnet", "--amount", "1", "--asset", "usdc.testnet", "--memo", "boreal:t")).rejects.toThrow(/failed/);
  });
});
