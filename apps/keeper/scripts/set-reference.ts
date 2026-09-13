// Switches which program execute_basket trusts for reference prices.
//
//   pnpm --filter keeper exec tsx scripts/set-reference.ts pyth   # real Pyth receiver (default)
//   pnpm --filter keeper exec tsx scripts/set-reference.ts mock   # mock_market, devnet demo mode
//
// Admin only. Run the keeper with the matching REFERENCE_SOURCE.

import { loadConfig } from "../src/config";
import { connect, configPda } from "../src/chain";
import { PYTH_RECEIVER } from "../src/executor";

async function main() {
	const mode = process.argv[2];
	if (mode !== "pyth" && mode !== "mock") throw new Error("usage: set-reference.ts pyth|mock");
	const cfg = loadConfig();
	const chain = connect(cfg.rpcUrl, cfg.keeper);
	const config = configPda(chain.basket.programId);
	const c = await chain.basket.account.config.fetch(config);
	const referenceProgram = mode === "pyth" ? PYTH_RECEIVER : chain.market.programId;
	await chain.basket.methods
		.updateConfig({
			keeper: c.keeper,
			maxStalenessSecs: c.maxStalenessSecs,
			maxConfBps: c.maxConfBps,
			maxDivergenceBps: c.maxDivergenceBps,
			minLiquidityUsdc: c.minLiquidityUsdc,
			fillProgram: c.fillProgram,
			referenceProgram,
		})
		.accountsPartial({ config, admin: chain.wallet.publicKey })
		.rpc();
	console.log(`reference_program = ${referenceProgram.toBase58()} (${mode})`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
