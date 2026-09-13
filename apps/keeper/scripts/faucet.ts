// Mints mock devnet USDC to a wallet (signed by the faucet identity).
//
//   pnpm --filter keeper exec tsx scripts/faucet.ts <wallet> [amountUsdc=10000]

import fs from "node:fs";
import path from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { loadConfig, loadDeployment } from "../src/config";
import { connect } from "../src/chain";

async function main() {
	const [to, amountArg] = process.argv.slice(2);
	if (!to) throw new Error("usage: faucet.ts <wallet> [amountUsdc]");
	const amount = Math.round(Number(amountArg ?? 10_000) * 1_000_000);
	const cfg = loadConfig();
	const dep = loadDeployment(cfg.deploymentFile);
	const chain = connect(cfg.rpcUrl, cfg.keeper);
	// The mint authority moved to the faucet identity; see setup-faucet.ts.
	const faucetFile = path.join(path.dirname(cfg.deploymentFile), "faucet.keypair.json");
	const authority = fs.existsSync(faucetFile) ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(faucetFile, "utf8")))) : cfg.keeper;
	const mint = new PublicKey(dep.usdcMint);
	const ata = await getOrCreateAssociatedTokenAccount(chain.connection, cfg.keeper, mint, new PublicKey(to));
	const sig = await mintTo(chain.connection, cfg.keeper, mint, ata.address, authority, amount);
	console.log(`minted ${amount / 1e6} USDC to ${ata.address.toBase58()} (${sig})`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
