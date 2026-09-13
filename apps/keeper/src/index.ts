// bozBasket keeper as a process: the scheduled GitHub Action runs it once, an
// always-on worker runs it in a loop. The pass itself lives in pass.ts, shared
// with the web app's serverless tick, and every keeper takes the same Postgres
// lock (lock.ts) so two of them never attempt the same plan.
//
//   pnpm --filter keeper start            # loop
//   pnpm --filter keeper once             # one pass, then exit
//   pnpm --filter keeper once -- --plan <pubkey>   # one plan, ignore schedule and spacing

import { randomUUID } from "node:crypto";
import { loadConfig, loadDeployment } from "./config";
import { LOCK_TIMING, PassLock } from "./lock";
import { createKeeper, runPass, type Keeper } from "./pass";

/** The RPC URL usually carries an API key; logs get pasted and screenshotted. */
const rpcHost = (url: string) => {
	try {
		return new URL(url).host;
	} catch {
		return "rpc";
	}
};

async function lockedPass(keeper: Keeper, lock: PassLock | null, onlyPlan: string | undefined) {
	const holder = `worker:${randomUUID()}`;
	if (lock) {
		try {
			// A named plan is a deliberate manual run, so it skips the spacing
			// window, though never a pass that is already running.
			const got = await lock.acquire(holder, { holdSecs: LOCK_TIMING.holdSecs, force: !!onlyPlan });
			if (!got.acquired) {
				console.log(got.running ? "another keeper pass is running; skipping this one" : `another keeper started a pass recently; next allowed in ${got.waitSecs} s; skipping`);
				return;
			}
		} catch (err) {
			// No database means no ledger either; the chain still rejects a
			// duplicate attempt, so run rather than stall.
			console.warn(`keeper lock unavailable (${(err as Error).message}); running without it`);
		}
	}
	try {
		await runPass(keeper, { onlyPlan, deadline: Date.now() + LOCK_TIMING.passBudgetMs });
	} finally {
		if (lock) await lock.release(holder, LOCK_TIMING.spacingSecs).catch((err) => console.warn("keeper lock: release failed", (err as Error).message));
	}
}

async function main() {
	const args = process.argv.slice(2);
	const once = args.includes("--once");
	const onlyPlan = args.includes("--plan") ? args[args.indexOf("--plan") + 1] : undefined;

	const cfg = loadConfig();
	const keeper = await createKeeper(cfg, loadDeployment(cfg.deploymentFile));
	const lock = cfg.databaseUrl ? new PassLock(cfg.databaseUrl) : null;
	console.log(`keeper ${keeper.chain.wallet.publicKey.toBase58()} on ${cfg.cluster} (${rpcHost(cfg.rpcUrl)}); off-hours policy: ${cfg.offHours}`);

	if (once) {
		try {
			await lockedPass(keeper, lock, onlyPlan);
		} finally {
			await keeper.ledger.close().catch(() => undefined);
			await lock?.close().catch(() => undefined);
		}
		return;
	}
	for (;;) {
		try {
			await lockedPass(keeper, lock, onlyPlan);
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
