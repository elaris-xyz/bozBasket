// Copies the committed program interface and deployment addresses into
// src/generated, so the web app imports everything from inside its own
// directory (which Next.js prefers) and a Vercel build needs no Anchor.
//
// idl/ and deploy/ are committed; target/ is not, so this works on a fresh
// checkout. Refresh idl/ with `node tools/sync-idl.mjs` after `anchor build`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const out = path.resolve(here, "../src/generated");
fs.mkdirSync(out, { recursive: true });

const files = [
	["idl/basket_dca.json", "basket_dca.json"],
	["idl/mock_market.json", "mock_market.json"],
	["idl/basket_dca.ts", "basket_dca.ts"],
	["idl/mock_market.ts", "mock_market.ts"],
	["deploy/devnet.json", "devnet.json"],
	["deploy/weekend-backtest.json", "weekend-backtest.json"],
];
for (const [from, to] of files) {
	const src = path.join(root, from);
	if (!fs.existsSync(src)) {
		console.error(`sync-generated: missing ${from}`);
		process.exit(1);
	}
	fs.copyFileSync(src, path.join(out, to));
}
console.log("sync-generated: ok");
