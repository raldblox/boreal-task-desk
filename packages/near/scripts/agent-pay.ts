// An agent's own NEAR wallet, for paying boreal.work tasks in USDC from the command line. Made for the
// demo agent (Hermes), and usable by any agent that can run a command but has no NEAR SDK:
//
//   pnpm --filter @boreal/near agent-pay --new
//       make the wallet (once): a fresh implicit account whose key goes only into the git-ignored
//       packages/near/.env.agent-wallet; prints the account id to fund
//   pnpm --filter @boreal/near agent-pay --balance --asset <usdc contract>
//       the wallet's NEAR and USDC
//   pnpm --filter @boreal/near agent-pay --to <payTo> --amount <amount> --asset <asset> --memo <extra.memo>
//       pay fund_task's NEAR requirement: one ft_transfer (1 yoctoNEAR attached), waits until final,
//       then prints { "txHash", "signerId" } to hand back to fund_task as `payment`
//
// Safety: testnet unless NEAR_NETWORK=mainnet is in the wallet file, and no single payment above
// NEAR_AGENT_MAX_UNITS (default 50 USDC at 6 decimals). The key is never printed.

import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { createNearRpc } from "../src/chain";
import { base58Encode, nearSigner, signTransaction } from "../src/tx";

const file = join(import.meta.dirname, "..", ".env.agent-wallet");
const TGAS = BigInt("1000000000000");

function readWallet(): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

const fail = (message: string): never => {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
};

const { values: args } = parseArgs({
  options: {
    new: { type: "boolean" },
    balance: { type: "boolean" },
    to: { type: "string" },
    amount: { type: "string" },
    asset: { type: "string" },
    memo: { type: "string" },
  },
});

const wallet = readWallet();
const network = wallet.NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
const rpc = createNearRpc(wallet.NEAR_RPC_URL || `https://rpc.${network}.near.org`);

if (args.new) {
  if (wallet.NEAR_AGENT_ACCOUNT) fail(`a wallet already exists: ${wallet.NEAR_AGENT_ACCOUNT}`);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = Buffer.from(privateKey.export({ format: "jwk" }).d!, "base64url");
  const pub = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const accountId = pub.toString("hex");
  writeFileSync(
    file,
    `# The demo agent's NEAR wallet. Never commit or print the key.\nNEAR_NETWORK=testnet\nNEAR_AGENT_ACCOUNT=${accountId}\nNEAR_AGENT_KEY=ed25519:${base58Encode(Buffer.concat([seed, pub]))}\n`,
  );
  console.log(JSON.stringify({ account: accountId, network, next: "send it ~0.5 testnet NEAR, then testnet USDC (faucet.circle.com)" }));
  process.exit(0);
}

const account = wallet.NEAR_AGENT_ACCOUNT;
const key = wallet.NEAR_AGENT_KEY;
if (!account || !key) fail(`no wallet yet: run with --new (it writes ${file})`);
const signer = nearSigner(account!, key!);

if (args.balance) {
  const out: Record<string, string> = { account: account! };
  if (args.asset) out.usdcUnits = String(await rpc.view(args.asset, "ft_balance_of", { account_id: account }));
  console.log(JSON.stringify(out));
  process.exit(0);
}

const { to, amount, asset, memo } = args;
if (!to || !amount || !asset || !memo) fail("pass --to, --amount, --asset and --memo from fund_task's NEAR requirement");
if (!/^\d+$/.test(amount!)) fail("--amount is the requirement's amount in token units, digits only");
const max = BigInt(wallet.NEAR_AGENT_MAX_UNITS || "50000000");
if (BigInt(amount!) > max) fail(`refusing to pay ${amount} units: above this wallet's per-payment cap of ${max}`);
if (!memo!.startsWith("boreal:")) fail("the memo must be the requirement's extra.memo (boreal:<taskId>)");

const { nonce, blockHash } = await rpc.accessKey(signer.accountId, signer.publicKey);
const tx = signTransaction(signer, {
  receiverId: asset!,
  nonce: nonce + BigInt("1"),
  blockHash,
  calls: [{ methodName: "ft_transfer", args: { receiver_id: to, amount, memo }, gas: BigInt("30") * TGAS, deposit: BigInt("1") }],
});
const outcome = await rpc.send(tx.base64);
if (outcome.status !== "success") fail(`transfer ${tx.hash} failed: ${outcome.error ?? "unknown"}`);
console.log(
  JSON.stringify({
    txHash: tx.hash,
    signerId: signer.accountId,
    explorer: `https://${network === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${tx.hash}`,
  }),
);
