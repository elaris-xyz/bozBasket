// One keeper pass over every due plan.
//
// Shared by the long-running worker (src/index.ts) and the web app's
// serverless tick (apps/web/src/lib/keeperRunner.ts), so a plan executes the
// same way whichever of them happens to run. Nothing here reads a file or
// assumes the process lives on, which is what lets it run inside a Vercel
// function.

import { PublicKey } from "@solana/web3.js";
import { sessionAt } from "@bozbasket/shared";
import { chainNow, connect, loadActivePlans, type Chain } from "./chain";
import type { Deployment, KeeperConfig } from "./config";
import { Executor, type PassResult } from "./executor";
import { HermesClient } from "./hermes";
import { LogLedger, PgLedger, type Ledger } from "./ledger";
import { JUPITER_API_DEFAULT, MainnetShadow, mainnetRpcFor } from "./shadow";

export type Keeper = { chain: Chain; cfg: KeeperConfig; executor: Executor; ledger: Ledger; shadow: MainnetShadow | null };

export type Log = (message: string) => void;

/** Wires a keeper from explicit inputs. `migrate: false` skips the schema
 *  check, for a caller that runs every minute and has already done it once:
 *  the ALTER statements take a brief table lock even when they change nothing. */
export async function createKeeper(cfg: KeeperConfig, deployment: Deployment, opts: { log?: Log; migrate?: boolean } = {}): Promise<Keeper> {
	const log = opts.log ?? console.log;
	const chain = connect(cfg.rpcUrl, cfg.keeper);
	const hermes = new HermesClient(cfg.hermesUrl, cfg.pythApiKey);

	// The chain is the source of truth; a ledger outage must never stop the
	// keeper. Neon was unreachable from the dev host on 2026-09-13.
	let ledger: Ledger = new LogLedger();
	if (cfg.databaseUrl) {
		const pg = new PgLedger(cfg.databaseUrl);
		if (opts.migrate === false) {
			ledger = pg;
		} else {
			try {
				await pg.migrate();
				ledger = pg;
				log("ledger: postgres");
			} catch (err) {
				log(`ledger: postgres unreachable (${(err as Error).message}); logging only`);
				await pg.close().catch(() => undefined);
			}
		}
	} else {
		log("ledger: log only (DATABASE_URL unset)");
	}

	const shadow = cfg.mainnetShadow === false ? null : new MainnetShadow(hermes, cfg.mainnetRpcUrl ?? mainnetRpcFor(cfg.rpcUrl), cfg.jupiterUrl ?? JUPITER_API_DEFAULT);
	return { chain, cfg, executor: new Executor(chain, cfg, deployment, hermes, ledger), ledger, shadow };
}

export type PlanOutcome = { plan: string; kind: PassResult["kind"]; signature?: string; detail: string };

export type PassSummary = {
	/** Cluster time when the pass began. */
	ts: number;
	active: number;
	due: number;
	outcomes: PlanOutcome[];
	/** Due plans left for the next pass because the deadline arrived. */
	deferredToNextPass: number;
};

/** Execute every due plan once, oldest first. With a `deadline` (epoch ms) no
 *  new plan starts after it, so a serverless caller never runs into its hard
 *  duration limit mid-transaction; whatever is left stays due for the next pass. */
export async function runPass(k: Keeper, opts: { onlyPlan?: string; deadline?: number; log?: Log } = {}): Promise<PassSummary> {
	const log = opts.log ?? console.log;
	const { chain, cfg, executor, ledger } = k;
	const startedMs = Date.now();

	const now = await chainNow(chain.connection);
	const skew = now - Math.floor(startedMs / 1000);
	if (Math.abs(skew) > 30) log(`host clock is ${-skew} s off the cluster clock; using cluster time`);

	let plans = await loadActivePlans(chain.basket);
	if (opts.onlyPlan) {
		const only = new PublicKey(opts.onlyPlan);
		plans = plans.filter((p) => p.pubkey.equals(only));
	}
	const due = (opts.onlyPlan ? plans : plans.filter((p) => p.account.nextExecution.toNumber() <= now)).sort(
		(a, b) => a.account.nextExecution.toNumber() - b.account.nextExecution.toNumber(),
	);
	log(`[${new Date(now * 1000).toISOString()}] ${plans.length} active plan(s), ${due.length} due`);
	await ledger.beat({ ts: now, cluster: cfg.cluster, activePlans: plans.length, duePlans: due.length, note: sessionAt(new Date(now * 1000)).label });

	const outcomes: PlanOutcome[] = [];
	for (const plan of due) {
		if (opts.deadline !== undefined && Date.now() > opts.deadline) {
			log(`deadline reached; ${due.length - outcomes.length} due plan(s) left for the next pass`);
			break;
		}
		const address = plan.pubkey.toBase58();
		// Keep cluster time current across a long pass: ages in the guard
		// snapshot and the ledger timestamp should describe this plan's attempt.
		const planNow = now + Math.floor((Date.now() - startedMs) / 1000);
		try {
			const result = await executor.run(plan, planNow);
			const signature = "signature" in result ? result.signature : undefined;
			outcomes.push({ plan: address, kind: result.kind, signature, detail: result.detail });
			log(`  ${address}: ${result.kind}${signature ? ` ${signature}` : ""} ${result.detail}`);
		} catch (err) {
			const detail = (err as Error).message.slice(0, 300);
			outcomes.push({ plan: address, kind: "error", detail });
			log(`  ${address}: failed ${detail}`);
			await ledger.record({ plan: address, ts: planNow, kind: "error", reason: 0, detail, signature: null, usdcIn: null, legs: null });
		}
	}

	// The mainnet shadow check rides along after the plans, which always come
	// first, and never fails the pass. A single-plan run is a test; it skips it.
	if (k.shadow && !opts.onlyPlan && (opts.deadline === undefined || Date.now() < opts.deadline)) {
		const shadowNow = now + Math.floor((Date.now() - startedMs) / 1000);
		try {
			const { due: shadowDue, multipliers } = await ledger.shadowDue(shadowNow);
			if (shadowDue) {
				const rows = await k.shadow.sample(shadowNow, multipliers);
				await ledger.recordShadow(rows);
				log(`  mainnet shadow: ${rows.map((r) => (r.error ? `${r.symbol} ${r.error}` : `${r.symbol} ${r.divergenceBps?.toFixed(1)} bps, reason ${r.reason}`)).join(" | ")}`);
			}
		} catch (err) {
			log(`  mainnet shadow failed: ${(err as Error).message.slice(0, 200)}`);
		}
	}

	return { ts: now, active: plans.length, due: due.length, outcomes, deferredToNextPass: due.length - outcomes.length };
}
