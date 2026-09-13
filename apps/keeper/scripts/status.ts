// Prints the live devnet state: config thresholds, each market, and a plan.
//   pnpm --filter keeper exec tsx scripts/status.ts [plan]

import { PublicKey } from "@solana/web3.js";
import { loadConfig, loadDeployment } from "../src/config";
import { connect, configPda } from "../src/chain";

async function main() {
	const cfg = loadConfig();
	const dep = loadDeployment(cfg.deploymentFile);
	const chain = connect(cfg.rpcUrl, cfg.keeper);
	const c = await chain.basket.account.config.fetch(configPda(chain.basket.programId));
	const mode = c.referenceProgram.equals(chain.market.programId) ? "mock" : "pyth";
	console.log(`reference_program ${c.referenceProgram.toBase58()} (${mode})`);
	console.log(`thresholds: ${c.maxStalenessSecs}s staleness, ${c.maxConfBps} bps conf, ${c.maxDivergenceBps} bps divergence, $${Number(c.minLiquidityUsdc) / 1e6} min depth`);
	for (const [symbol, m] of Object.entries(dep.markets)) {
		const mk = await chain.market.account.market.fetch(new PublicKey(m.market));
		console.log(`  ${symbol.padEnd(6)} override ${Number(mk.priceOverride)} · depth $${Number(mk.liquidityUsdc) / 1e6} · spread ${mk.spreadBps} bps`);
	}
	const planArg = process.argv[2];
	if (planArg) {
		const p = await chain.basket.account.plan.fetch(new PublicKey(planArg));
		const v = await chain.connection.getTokenAccountBalance(p.vault).catch(() => null);
		console.log(`plan: status ${p.status} · executions ${p.executions} · deferrals ${p.deferrals} · invested $${p.totalInvested.toNumber() / 1e6} · last reason ${p.lastReason}`);
		console.log(`      vault $${v ? Number(v.value.amount) / 1e6 : "?"} · $${p.amountPerPeriod.toNumber() / 1e6} per period · next ${new Date(p.nextExecution.toNumber() * 1000).toISOString()}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
