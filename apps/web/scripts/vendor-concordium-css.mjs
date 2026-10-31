// Copies the Concordium sign-in modal's stylesheet into the app, scoped to the element the
// modal mounts into (#concordium-modal-root). The package ships page-wide resets (*, html,
// button, a…); scoped, they style only the modal, and the site's styles can't reach it either.
// Its Google Fonts @import is dropped: the app self-hosts Inter and Plus Jakarta Sans with
// next/font and points the modal's font-family declarations at them.
// Run after upgrading @concordium/verification-web-ui: pnpm --filter @boreal/web vendor:concordium-css
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = "#concordium-modal-root";
const require = createRequire(import.meta.url);
const cssPath = require.resolve("@concordium/verification-web-ui/styles");
const { version } = JSON.parse(readFileSync(join(dirname(cssPath), "../package.json"), "utf8"));
const source = readFileSync(cssPath, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/@import\s+(url\()?["'][^"']+["']\)?[^;]*;/g, "");

/** Splits on commas that aren't inside parentheses or brackets. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function scopeSelector(selector) {
  const root = selector.match(/^(:root|html|:host|body)(?![\w-])/);
  if (root) return ROOT + selector.slice(root[0].length);
  return `${ROOT} ${selector}`;
}

/** Finds the index of the brace that closes the block opened at `open`. */
function closingBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i;
  }
  throw new Error("unbalanced braces");
}

const VERBATIM = /^@(keyframes|-webkit-keyframes|font-face|property|counter-style|font-feature-values)\b/;
const RECURSE = /^@(media|supports|container|layer|document)\b/;

function scope(css) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    const semi = css.indexOf(";", i);
    if (open < 0) break;
    if (semi >= 0 && semi < open) {
      // A statement at-rule (like @layer a,b;) at this level: keep it.
      out += css.slice(i, semi + 1);
      i = semi + 1;
      continue;
    }
    const prelude = css.slice(i, open).trim();
    const close = closingBrace(css, open);
    const body = css.slice(open + 1, close);
    if (VERBATIM.test(prelude)) out += `${prelude}{${body}}`;
    else if (RECURSE.test(prelude)) out += `${prelude}{${scope(body)}}`;
    else if (prelude.startsWith("@")) out += `${prelude}{${body}}`;
    else out += `${[...new Set(splitTopLevel(prelude).map(scopeSelector))].join(",")}{${body}}`;
    i = close + 1;
  }
  return out;
}

const scoped = scope(source)
  .replace(/font-family:Inter,/g, "font-family:var(--concordium-font-inter),Inter,")
  .replace(/font-family:Plus Jakarta Sans,/g, "font-family:var(--concordium-font-jakarta),Plus Jakarta Sans,");

const out = join(dirname(fileURLToPath(import.meta.url)), "../src/app/concordium-modal.css");
writeFileSync(out, `/* Generated from @concordium/verification-web-ui@${version} by scripts/vendor-concordium-css.mjs. Do not edit. */\n${scoped}`);
const unscoped = [...scoped.matchAll(/(?:^|[{};])\s*([^{}@;]+)\{/g)]
  .map((m) => m[1].trim())
  .filter((sel) => !/^(from|to|\d+%)/.test(sel) && !splitTopLevel(sel).every((x) => x.startsWith(ROOT)));
console.log(`wrote ${out} (${scoped.length} bytes); selectors outside the root: ${unscoped.length}`);
if (unscoped.length) console.log(unscoped.slice(0, 5).join("\n"));
