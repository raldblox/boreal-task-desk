// Sets up and checks boreal's own NEAR testnet accounts for the NEAR add-on's demo:
//   pnpm --filter @boreal/near testnet-accounts           make the keys (once) and show what each account needs
//   pnpm --filter @boreal/near testnet-accounts --env     also print the lines to set on boreal-testnet
//
// It makes two implicit accounts, escrow (holds open tasks' USDC) and treasury (funds NEAR
// Agent Market jobs), each with a fresh ed25519 key. The keys go only into the git-ignored
// packages/near/.env.near-testnet, never to the console unless you ask with --env. Implicit
// accounts exist on chain once they receive NEAR. Nothing here signs or sends a transaction:
// funding them (testnet NEAR from a faucet, testnet USDC from Circle's faucet) is yours to do.

import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { base58Encode } from "../src/tx";

const RPC = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
const file = join(import.meta.dirname, "..", ".env.near-testnet");

function newKey(): { accountId: string; secretKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = Buffer.from(privateKey.export({ format: "jwk" }).d!, "base64url");
  const pub = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  // An implicit account's id is its public key in hex; NEAR keys are the seed then the public key.
  return { accountId: pub.toString("hex"), secretKey: `ed25519:${base58Encode(Buffer.concat([seed, pub]))}` };
}

function readEnv(): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

let env = readEnv();
if (!env.NEAR_ESCROW_ACCOUNT) {
  const escrow = newKey();
  const treasury = newKey();
  env = {
    NEAR_NETWORK: "testnet",
    NEAR_ESCROW_ACCOUNT: escrow.accountId,
    NEAR_ESCROW_KEY: escrow.secretKey,
    NEAR_MARKET_TREASURY_ACCOUNT: treasury.accountId,
    NEAR_MARKET_TREASURY_KEY: treasury.secretKey,
    // Fill these in: the testnet USDC contract (from the explorer) and the Agent Market listing token.
    NEAR_TOKEN_CONTRACT: "",
    NEAR_TOKEN_DECIMALS: "6",
    NEAR_MARKET_TOKEN: "",
    ...env,
  };
  writeFileSync(
    file,
    `# boreal's NEAR testnet accounts (git-ignored). Never commit; set them on boreal-testnet as sensitive variables.\n` +
      Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") +
      "\n",
  );
  console.log(`Made two new testnet accounts; keys saved in ${file}\n`);
}

async function rpc(method: string, params: unknown): Promise<any> {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return res.json();
}

async function nearBalance(accountId: string): Promise<string | null> {
  const out = await rpc("query", { request_type: "view_account", finality: "final", account_id: accountId });
  if (out.error || out.result?.error) return null;
  return (Number(BigInt(out.result.amount) / 10n ** 21n) / 1000).toFixed(3);
}

async function usdcBalance(accountId: string): Promise<string | null> {
  if (!env.NEAR_TOKEN_CONTRACT) return null;
  const args = Buffer.from(JSON.stringify({ account_id: accountId })).toString("base64");
  const out = await rpc("query", { request_type: "call_function", finality: "final", account_id: env.NEAR_TOKEN_CONTRACT, method_name: "ft_balance_of", args_base64: args });
  if (out.error || out.result?.error) return null;
  const raw = JSON.parse(Buffer.from(out.result.result).toString()) as string;
  return (Number(raw) / 10 ** Number(env.NEAR_TOKEN_DECIMALS || 6)).toFixed(2);
}

const rows: [string, string, string, string][] = [];
for (const [role, account, needs] of [
  ["escrow", env.NEAR_ESCROW_ACCOUNT!, "~1 NEAR for gas and storage; holds only open tasks' USDC"],
  ["treasury", env.NEAR_MARKET_TREASURY_ACCOUNT!, "~1 NEAR, plus USDC to fund market jobs (e.g. 20 USDC)"],
] as const) {
  const near = await nearBalance(account);
  const usdc = await usdcBalance(account);
  rows.push([role, account, near === null ? "not on chain yet" : `${near} NEAR`, usdc === null ? (env.NEAR_TOKEN_CONTRACT ? "0 / no storage yet" : "set NEAR_TOKEN_CONTRACT") : `${usdc} USDC`]);
  console.log(`${role.padEnd(9)} ${account}\n          ${rows.at(-1)![2]} · ${rows.at(-1)![3]}\n          needs: ${needs}\n`);
}

const missing = [
  !env.NEAR_TOKEN_CONTRACT && "NEAR_TOKEN_CONTRACT (testnet USDC contract id)",
  !env.NEAR_MARKET_TOKEN && "NEAR_MARKET_TOKEN (aat_… from boreal's listing on market.near.ai)",
].filter(Boolean);
if (missing.length) console.log(`Still to fill in ${file}:\n  ${missing.join("\n  ")}\n`);

if (process.argv.includes("--env")) {
  console.log("For boreal-testnet (sensitive):");
  for (const [k, v] of Object.entries(env)) if (v) console.log(`${k}=${v}`);
  console.log("BOREAL_ADDONS=concordium,near\nPAYMENT_RAILS=paypal,near");
}
