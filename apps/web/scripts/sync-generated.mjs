// Copies the Anchor IDLs and the deployment file into src/generated so the
// web app never imports from outside its own directory (Next.js dislikes
// that) and so a Vercel build has them without running anchor.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const out = path.resolve(here, "../src/generated");
fs.mkdirSync(out, { recursive: true });

const files = [
	["target/idl/basket_dca.json", "basket_dca.json"],
	["target/idl/mock_market.json", "mock_market.json"],
	["target/types/basket_dca.ts", "basket_dca.ts"],
	["target/types/mock_market.ts", "mock_market.ts"],
	["deploy/devnet.json", "devnet.json"],
];
for (const [from, to] of files) {
	const src = path.join(root, from);
	const dst = path.join(out, to);
	if (fs.existsSync(src)) {
		fs.copyFileSync(src, dst);
	} else if (!fs.existsSync(dst)) {
		console.error(`sync-generated: missing ${from} and no committed copy at ${to}`);
		process.exit(1);
	}
}
console.log("sync-generated: ok");
