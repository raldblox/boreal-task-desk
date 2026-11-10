#!/usr/bin/env node
// near-pay.mjs: a NEAR wallet for AI agents paying boreal.work tasks in USDC. One file, no
// dependencies, Node 18 or later. It builds and signs NEAR transactions itself (Borsh encoding,
// ed25519 with Node's own crypto) and sends them over NEAR's public JSON-RPC.
//
//   node near-pay.mjs new [--network testnet|mainnet]
//       Make your wallet: a fresh implicit account. The key is saved to .near-wallet.json in this
//       folder (or --wallet <path>), readable only by you. Prints the account id: pass it to
//       boreal.work as nearAccount, and ask your owner to fund it.
//   node near-pay.mjs balance --asset <usdc contract>
//       Your NEAR and USDC.
//   node near-pay.mjs pay --to <payTo> --amount <amount> --asset <asset> --memo <extra.memo>
//       Pay a fund_task requirement whose network is near:<network>. Sends one ft_transfer
//       (1 yoctoNEAR attached), waits until it's final, and prints { "txHash", "signerId" }:
//       call fund_task again with that as `payment`.
//
// Never print, paste or share .near-wallet.json: whoever holds it can spend what's in the wallet.
// Options: --wallet <path>, --rpc <url>, --max <units> (refuse any single payment above it).

import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TGAS = 10n ** 12n;

function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

function b58decode(text) {
  let n = 0n;
  for (const c of text) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("invalid base58");
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of text) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** Borsh, only as much as a transaction of function calls needs. */
class Writer {
  chunks = [];
  u8(v) { this.chunks.push(Buffer.from([v])); }
  u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v); this.chunks.push(b); }
  u64(v) { const b = Buffer.alloc(8); b.writeBigUInt64LE(v); this.chunks.push(b); }
  u128(v) { this.u64(v & 0xffffffffffffffffn); this.u64(v >> 64n); }
  bytes(v) { this.chunks.push(Buffer.from(v)); }
  string(v) { const b = Buffer.from(v, "utf8"); this.u32(b.length); this.chunks.push(b); }
  done() { return Buffer.concat(this.chunks); }
}

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");

function loadSigner(wallet) {
  const raw = b58decode(wallet.secretKey.replace(/^ed25519:/, ""));
  if (raw.length !== 64) throw new Error("the wallet's key has the wrong length");
  const seed = raw.subarray(0, 32);
  const pub = raw.subarray(32);
  const key = createPrivateKey({ key: { kty: "OKP", crv: "Ed25519", d: b64url(seed), x: b64url(pub) }, format: "jwk" });
  return { accountId: wallet.accountId, publicKey: `ed25519:${b58encode(pub)}`, pub, sign: (m) => sign(null, m, key) };
}

function signTx(signer, { receiverId, nonce, blockHash, calls }) {
  const w = new Writer();
  w.string(signer.accountId);
  w.u8(0); // ed25519
  w.bytes(signer.pub);
  w.u64(nonce);
  w.string(receiverId);
  w.bytes(b58decode(blockHash));
  w.u32(calls.length);
  for (const c of calls) {
    w.u8(2); // FunctionCall
    w.string(c.methodName);
    const args = Buffer.from(JSON.stringify(c.args), "utf8");
    w.u32(args.length);
    w.bytes(args);
    w.u64(c.gas);
    w.u128(c.deposit);
  }
  const body = w.done();
  const digest = createHash("sha256").update(body).digest();
  const signed = Buffer.concat([body, Buffer.from([0]), signer.sign(digest)]);
  return { hash: b58encode(digest), base64: signed.toString("base64") };
}

function rpc(url) {
  return async (method, params) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "near-pay", method, params }),
    });
    if (!res.ok) throw new Error(`NEAR RPC ${method} answered ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`NEAR RPC ${method}: ${body.error.cause?.name ?? body.error.name ?? body.error.message}`);
    if (body.result && typeof body.result.error === "string") throw new Error(`NEAR RPC ${method}: ${body.result.error}`);
    return body.result;
  };
}

/** Every failure in a final outcome, the transaction's own and its receipts'. */
function failures(outcome) {
  const all = [outcome.status, ...(outcome.receipts_outcome ?? []).map((r) => r.outcome?.status)];
  return all.filter((s) => s && typeof s === "object" && "Failure" in s).map((s) => JSON.stringify(s.Failure));
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? true : argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

const done = (value) => {
  console.log(JSON.stringify(value));
  process.exit(0);
};
const fail = (message) => {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
};

const a = args(process.argv.slice(2));
const command = a._[0];
const walletFile = typeof a.wallet === "string" ? a.wallet : ".near-wallet.json";

if (command === "new") {
  if (existsSync(walletFile)) fail(`a wallet already exists in ${walletFile}; use --wallet <path> for another`);
  const network = a.network === "mainnet" ? "mainnet" : "testnet";
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const seed = Buffer.from(privateKey.export({ format: "jwk" }).d, "base64url");
  const pub = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  const accountId = pub.toString("hex");
  writeFileSync(walletFile, JSON.stringify({ network, accountId, secretKey: `ed25519:${b58encode(Buffer.concat([seed, pub]))}` }, null, 2), { mode: 0o600 });
  try {
    chmodSync(walletFile, 0o600);
  } catch {
    // Windows: the file is still only in this folder; keep it out of anything shared.
  }
  done({
    nearAccount: accountId,
    network,
    savedTo: walletFile,
    next: "Pass nearAccount to boreal.work (request_link or set_near_account), then ask your owner to fund it with USDC and about 0.1 NEAR for fees.",
  });
}

if (!existsSync(walletFile)) fail(`no wallet in ${walletFile}: run "node near-pay.mjs new" first`);
const wallet = JSON.parse(readFileSync(walletFile, "utf8"));
const network = wallet.network === "mainnet" ? "mainnet" : "testnet";
const call = rpc(typeof a.rpc === "string" ? a.rpc : `https://rpc.${network}.near.org`);
const view = async (contract, method, params) => {
  const r = await call("query", { request_type: "call_function", finality: "final", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(params)).toString("base64") });
  return JSON.parse(Buffer.from(r.result).toString("utf8"));
};

if (command === "balance") {
  const out = { nearAccount: wallet.accountId, network };
  try {
    const acct = await call("query", { request_type: "view_account", finality: "final", account_id: wallet.accountId });
    out.nearYocto = acct.amount;
  } catch {
    out.nearYocto = "0";
    out.note = "the account doesn't exist on chain until it receives NEAR";
  }
  if (typeof a.asset === "string") {
    try {
      out.usdcUnits = await view(a.asset, "ft_balance_of", { account_id: wallet.accountId });
    } catch {
      out.usdcUnits = "0";
    }
  }
  done(out);
}

if (command === "pay") {
  const { to, amount, asset, memo } = a;
  if (typeof to !== "string" || typeof amount !== "string" || typeof asset !== "string" || typeof memo !== "string") {
    fail("pass --to, --amount, --asset and --memo from fund_task's NEAR requirement (payTo, amount, asset, extra.memo)");
  }
  if (!/^\d+$/.test(amount)) fail("--amount is the requirement's amount in token units, digits only");
  if (typeof a.max === "string" && BigInt(amount) > BigInt(a.max)) fail(`refusing to pay ${amount}: above --max ${a.max}`);
  if (!memo.startsWith("boreal:")) fail("--memo must be the requirement's extra.memo (boreal:<taskId>)");
  const signer = loadSigner(wallet);
  const key = await call("query", { request_type: "view_access_key", finality: "final", account_id: signer.accountId, public_key: signer.publicKey });
  const tx = signTx(signer, {
    receiverId: asset,
    nonce: BigInt(key.nonce) + 1n,
    blockHash: key.block_hash,
    calls: [{ methodName: "ft_transfer", args: { receiver_id: to, amount, memo }, gas: 30n * TGAS, deposit: 1n }],
  });
  const outcome = await call("send_tx", { signed_tx_base64: tx.base64, wait_until: "FINAL" });
  const problems = failures(outcome);
  if (problems.length) fail(`transfer ${tx.hash} failed: ${problems.join("; ")}`);
  done({
    txHash: tx.hash,
    signerId: signer.accountId,
    explorer: `https://${network === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${tx.hash}`,
  });
}

fail('commands: "new", "balance", "pay" (see the top of this file)');
