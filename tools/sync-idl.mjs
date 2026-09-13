// Copies the Anchor build output into idl/, which is committed.
//
//   node tools/sync-idl.mjs      (run after `anchor build`)
//
// The keeper and the web app both read the program interface from idl/. A
// fresh checkout has no target/ directory, so without this a CI runner or a
// Vercel build cannot talk to the programs at all.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "idl");
fs.mkdirSync(out, { recursive: true });

const files = [
	["target/idl/basket_dca.json", "basket_dca.json"],
	["target/idl/mock_market.json", "mock_market.json"],
	["target/types/basket_dca.ts", "basket_dca.ts"],
	["target/types/mock_market.ts", "mock_market.ts"],
];
let copied = 0;
for (const [from, to] of files) {
	const src = path.join(root, from);
	if (!fs.existsSync(src)) {
		console.error(`sync-idl: ${from} is missing — run \`anchor build\` first`);
		process.exit(1);
	}
	fs.copyFileSync(src, path.join(out, to));
	copied++;
}
console.log(`sync-idl: copied ${copied} files into idl/`);
