// bozBasket keeper: every minute, execute every due plan, but only when the
// reference price can be trusted (the program has the final say).
//
//   pnpm --filter keeper start            # loop
//   pnpm --filter keeper once             # one pass, then exit
//   pnpm --filter keeper once -- --plan <pubkey>   # one plan, ignore schedule

import { loadConfig, loadDeployment } from "./config";
import { chainNow, connect, loadActivePlans } from "./chain";
import { sessionAt } from "@bozbasket/shared";
import { HermesClient } from "./hermes";
import { LogLedger, PgLedger, type Ledger } from "./ledger";
import { Executor } from "./executor";
import { PublicKey } from "@solana/web3.js";

async function main() {
	const args = process.argv.slice(2);
	const once = args.includes("--once");
	const onlyPlan = args.includes("--plan") ? args[args.indexOf("--plan") + 1] : undefined;

	const cfg = loadConfig();
	const deployment = loadDeployment(cfg.deploymentFile);
	const chain = connect(cfg.rpcUrl, cfg.keeper);
	const hermes = new HermesClient(cfg.hermesUrl, cfg.pythApiKey);

	// The chain is the source of truth; a ledger outage must never stop the
	// keeper. Neon was unreachable from the dev host on 2026-09-13.
	let ledger: Ledger = new LogLedger();
	if (cfg.databaseUrl) {
		const pg = new PgLedger(cfg.databaseUrl);
		try {
			await pg.migrate();
			ledger = pg;
			console.log("ledger: postgres");
		} catch (err) {
			console.warn(`ledger: postgres unreachable (${(err as Error).message}); logging only`);
			await pg.close().catch(() => undefined);
		}
	} else {
		console.log("ledger: log only (DATABASE_URL unset)");
	}
	const executor = new Executor(chain, cfg, deployment, hermes, ledger);

	console.log(`keeper ${chain.wallet.publicKey.toBase58()} on ${cfg.cluster} (${cfg.rpcUrl}); off-hours policy: ${cfg.offHours}`);

	const pass = async () => {
		const now = await chainNow(chain.connection);
		const session = sessionAt(new Date(now * 1000)).label;
		const skew = now - Math.floor(Date.now() / 1000);
		if (Math.abs(skew) > 30) console.warn(`host clock is ${-skew} s off the cluster clock; using cluster time`);
		let plans = await loadActivePlans(chain.basket);
		if (onlyPlan) plans = plans.filter((p) => p.pubkey.equals(new PublicKey(onlyPlan)));
		const due = onlyPlan ? plans : plans.filter((p) => p.account.nextExecution.toNumber() <= now);
		console.log(`[${new Date(now * 1000).toISOString()}] ${plans.length} active plan(s), ${due.length} due`);
		await ledger.beat({ ts: now, cluster: cfg.cluster, activePlans: plans.length, duePlans: due.length, note: session });
		for (const plan of due) {
			try {
				const result = await executor.run(plan, now);
				console.log(`  ${plan.pubkey.toBase58()}: ${result.kind}${"signature" in result ? " " + result.signature : ""} ${result.detail}`);
			} catch (err) {
				console.error(`  ${plan.pubkey.toBase58()}: failed`, (err as Error).message);
				await ledger.record({ plan: plan.pubkey.toBase58(), ts: now, kind: "error", reason: 0, detail: (err as Error).message.slice(0, 300), signature: null, usdcIn: null, legs: null });
			}
		}
	};

	if (once) {
		await pass();
		await ledger.close();
		return;
	}
	for (;;) {
		try {
			await pass();
		} catch (err) {
			console.error("pass failed", (err as Error).message);
		}
		await new Promise((r) => setTimeout(r, cfg.pollSeconds * 1000));
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
