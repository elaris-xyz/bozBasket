// Admin demo control: make a plan due now (or at a unix timestamp).
//
//   pnpm --filter keeper exec tsx scripts/nudge.ts <plan> [ts=0]

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "../src/config";
import { connect, configPda } from "../src/chain";

async function main() {
	const [planArg, tsArg = "0"] = process.argv.slice(2);
	if (!planArg) throw new Error("usage: nudge.ts <plan> [ts]");
	const cfg = loadConfig();
	const chain = connect(cfg.rpcUrl, cfg.keeper);
	const plan = new PublicKey(planArg);
	await chain.basket.methods
		.nudgePlan(new anchor.BN(Number(tsArg)))
		.accountsPartial({ config: configPda(chain.basket.programId), plan, admin: chain.wallet.publicKey })
		.rpc();
	const p = await chain.basket.account.plan.fetch(plan);
	console.log(`plan ${plan.toBase58()} next_execution ${new Date(p.nextExecution.toNumber() * 1000).toISOString()}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
