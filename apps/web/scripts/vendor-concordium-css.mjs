// Copies the Concordium sign-in modal's stylesheet into the app so it can live in a CSS layer
// below Tailwind (its page-wide resets would otherwise restyle the whole site). The Google Fonts
// @import is dropped: it is invalid inside a layer, and the modal falls back to sans-serif.
// Run after upgrading @concordium/verification-web-ui: pnpm --filter @boreal/web vendor:concordium-css
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const cssPath = require.resolve("@concordium/verification-web-ui/styles");
const { version } = JSON.parse(readFileSync(join(dirname(cssPath), "../package.json"), "utf8"));
const css = readFileSync(cssPath, "utf8").replace(/@import\s+(url\()?["'][^"']+["']\)?[^;]*;/g, "");
const out = join(dirname(fileURLToPath(import.meta.url)), "../src/app/concordium-modal.css");
writeFileSync(out, `/* Generated from @concordium/verification-web-ui@${version} by scripts/vendor-concordium-css.mjs. Do not edit. */\n${css}`);
console.log(`wrote ${out} (${css.length} bytes)`);
