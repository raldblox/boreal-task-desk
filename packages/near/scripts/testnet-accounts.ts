// Sets up and checks boreal's own NEAR testnet accounts for the NEAR add-on's demo:
//   pnpm --filter @boreal/near testnet-accounts           make the keys (once) and show what each account needs
//   pnpm --filter @boreal/near testnet-accounts --vercel  add the NEAR add-on's settings to the linked Vercel
//                                                           project (boreal-testnet), values never printed
//   pnpm --filter @boreal/near testnet-accounts --register  register escrow and the fee account with the
//                                                           USDC contract (a storage_deposit each, paid from
//                                                           their own testnet NEAR), so agents can pay escrow
//
// It makes two implicit accounts, escrow (holds open tasks' USDC) and treasury (funds NEAR
// Agent Market jobs), each with a fresh ed25519 key. The keys go only into the git-ignored
// packages/near/.env.near-testnet, never to the console. Implicit
// accounts exist on chain once they receive NEAR. Nothing here signs or sends a transaction:
// funding them (testnet NEAR from a faucet, testnet USDC from Circle's faucet) is yours to do.
// Only --register sends anything: one testnet transaction per account that isn't registered yet.

import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createNearRpc } from "../src/chain";
import { base58Encode, nearSigner, signTransaction } from "../src/tx";

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

if (process.argv.includes("--register")) {
  if (!env.NEAR_TOKEN_CONTRACT) throw new Error("set NEAR_TOKEN_CONTRACT first");
  const chain = createNearRpc(RPC);
  for (const [account, key] of [
    [env.NEAR_ESCROW_ACCOUNT, env.NEAR_ESCROW_KEY],
    [env.NEAR_OPERATING_ACCOUNT, env.NEAR_OPERATING_KEY],
  ] as const) {
    if (!account || !key) continue;
    if ((await chain.view(env.NEAR_TOKEN_CONTRACT, "storage_balance_of", { account_id: account })) !== null) {
      console.log(`${account.slice(0, 12)}… already registered with ${env.NEAR_TOKEN_CONTRACT.slice(0, 12)}…`);
      continue;
    }
    const signer = nearSigner(account, key);
    const { nonce, blockHash } = await chain.accessKey(account, signer.publicKey);
    const tx = signTransaction(signer, {
      receiverId: env.NEAR_TOKEN_CONTRACT,
      nonce: nonce + 1n,
      blockHash,
      calls: [{ methodName: "storage_deposit", args: { account_id: account, registration_only: true }, gas: 30n * 10n ** 12n, deposit: 1_250_000_000_000_000_000_000n }],
    });
    const outcome = await chain.send(tx.base64);
    console.log(`${account.slice(0, 12)}… registered: ${outcome.status} (https://testnet.nearblocks.io/txns/${tx.hash})`);
  }
  console.log("");
}

const rows: [string, string, string, string][] = [];
for (const [role, account, needs] of [
  ["escrow", env.NEAR_ESCROW_ACCOUNT!, "~1 NEAR for gas and storage; holds only open tasks' USDC"],
  ["treasury", env.NEAR_MARKET_TREASURY_ACCOUNT!, "~1 NEAR, plus USDC to fund market jobs (e.g. 20 USDC)"],
  ...(env.NEAR_OPERATING_ACCOUNT ? ([["fees", env.NEAR_OPERATING_ACCOUNT, "receives boreal's platform and review fees"]] as const) : []),
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

if (process.argv.includes("--vercel")) {
  if (!env.NEAR_TOKEN_CONTRACT) throw new Error("set NEAR_TOKEN_CONTRACT first");
  // Signs the evidence links in market deliverables; made once and kept with the keys.
  if (!env.NEAR_MARKET_LINK_SECRET) {
    env.NEAR_MARKET_LINK_SECRET = randomBytes(32).toString("base64url");
    writeFileSync(file, readFileSync(file, "utf8").trimEnd() + `
NEAR_MARKET_LINK_SECRET=${env.NEAR_MARKET_LINK_SECRET}
`);
  }
  const settings: [string, string, boolean][] = [
    ["BOREAL_ADDONS", "concordium,near", false],
    ["PAYMENT_RAILS", "paypal,near", false],
    ["NEAR_NETWORK", "testnet", false],
    ["NEAR_TOKEN_CONTRACT", env.NEAR_TOKEN_CONTRACT, false],
    ["NEAR_TOKEN_DECIMALS", env.NEAR_TOKEN_DECIMALS || "6", false],
    ["NEAR_ESCROW_ACCOUNT", env.NEAR_ESCROW_ACCOUNT!, false],
    ["NEAR_ESCROW_KEY", env.NEAR_ESCROW_KEY!, true],
    ["NEAR_OPERATING_ACCOUNT", env.NEAR_OPERATING_ACCOUNT ?? "", false],
    ["NEAR_MARKET_TREASURY_ACCOUNT", env.NEAR_MARKET_TREASURY_ACCOUNT!, false],
    ["NEAR_MARKET_TREASURY_KEY", env.NEAR_MARKET_TREASURY_KEY!, true],
    ["NEAR_MARKET_LINK_SECRET", env.NEAR_MARKET_LINK_SECRET, true],
    ["NEAR_MARKET_TOKEN", env.NEAR_MARKET_TOKEN ?? "", true],
    ["NEAR_MARKET_AGENT_ID", env.NEAR_MARKET_AGENT_ID ?? "", false],
  ];
  for (const [name, value, sensitive] of settings) {
    if (!value) {
      console.log(`skip   ${name} (not set yet)`);
      continue;
    }
    // Replace any earlier value; the value goes in on stdin, never on the command line or the console.
    spawnSync("vercel", ["env", "rm", name, "production", "--yes"], { shell: true, stdio: "ignore" });
    const added = spawnSync("vercel", ["env", "add", name, "production", ...(sensitive ? ["--sensitive"] : [])], {
      shell: true,
      input: value,
      stdio: ["pipe", "ignore", "pipe"],
    });
    console.log(`${added.status === 0 ? "set   " : "FAILED"} ${name}${added.status === 0 ? "" : `: ${added.stderr.toString().trim().split("
").at(-1)}`}`);
  }
  console.log("
Redeploy boreal-testnet (vercel --prod, or push to main), then check /status.");
}
