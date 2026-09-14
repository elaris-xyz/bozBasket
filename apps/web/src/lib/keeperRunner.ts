import "server-only";

// Runs keeper passes inside the web app, so the deployed demo executes plans
// without an always-on worker.
//
// Three callers ask for a pass: any open page (KeeperPulse), the demo
// "make the plan due" control, and an external scheduler hitting
// /api/keeper/tick. All of them, and the keeper process too, share one
// Postgres lock (keeper/lock): one pass at a time, scheduled passes at most
// once a minute. That bound is also what makes the trigger safe to leave
// public: a pass can only *attempt* executions the program itself guards.
//
// The pass runs in `after()`, once the response has been sent, so a caller
// with a short timeout gets an answer immediately while the function keeps
// running up to its maxDuration.

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { Keypair } from "@solana/web3.js";
import { createKeeper, runPass } from "keeper/pass";
import { LOCK_TIMING, PassLock } from "keeper/lock";
import type { Deployment, KeeperConfig } from "keeper/config";
import deployment from "@/generated/devnet.json";
import { autoRestoreDemo } from "./demoState";

export type Trigger = "visitor" | "cron" | "demo";

export type TickResult =
	| { started: true; trigger: Trigger }
	| { started: false; trigger: Trigger; reason: "busy" }
	| { started: false; trigger: Trigger; reason: "cooldown"; retryInSecs: number }
	| { started: false; trigger: Trigger; reason: "unavailable"; detail: string };

let lock: PassLock | null = null;
const getLock = () => (lock ??= new PassLock(process.env.DATABASE_URL as string));

/** Schema migration for the ledger, once per server instance. */
let migrated = false;

function keeperConfig(): KeeperConfig {
	const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL;
	if (!rpcUrl) throw new Error("no Solana RPC URL configured");
	return {
		rpcUrl,
		cluster: "devnet",
		keeper: Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.KEEPER_SECRET_KEY as string) as number[])),
		hermesUrl: (process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network").replace(/\/$/, ""),
		pythApiKey: process.env.PYTH_API_KEY as string,
		databaseUrl: process.env.DATABASE_URL,
		// Submit off-hours too, so a stale weekend price produces an on-chain
		// deferral with its reason rather than a silent skip.
		offHours: process.env.OFF_HOURS_POLICY === "strict" ? "strict" : "guarded",
		pollSeconds: 60,
		deploymentFile: "(bundled into the web app)",
		computeUnitPriceMicroLamports: Number(process.env.CU_PRICE_MICROLAMPORTS ?? 50_000),
		skipStaleOlderThanSecs: Number(process.env.SKIP_STALE_OLDER_THAN_SECS ?? 7 * 86_400),
		referenceSource: process.env.REFERENCE_SOURCE === "mock" ? "mock" : "pyth",
		mainnetRpcUrl: process.env.MAINNET_RPC_URL || undefined,
		jupiterUrl: process.env.JUPITER_API_URL || undefined,
		mainnetShadow: process.env.MAINNET_SHADOW !== "0",
	};
}

/** Start a keeper pass if the lock allows it. `force` skips the once-a-minute
 *  spacing but never runs two passes at once; the demo uses it so "make the
 *  plan due" is followed by an attempt straight away. */
export async function schedulePass(trigger: Trigger, opts: { force?: boolean } = {}): Promise<TickResult> {
	const missing = ["DATABASE_URL", "KEEPER_SECRET_KEY", "PYTH_API_KEY"].filter((k) => !process.env[k]);
	if (missing.length) return { started: false, trigger, reason: "unavailable", detail: `not configured: ${missing.join(", ")}` };

	const holder = `${trigger}:${randomUUID()}`;
	try {
		const got = await getLock().acquire(holder, { holdSecs: LOCK_TIMING.holdSecs, force: opts.force });
		if (!got.acquired) return got.running ? { started: false, trigger, reason: "busy" } : { started: false, trigger, reason: "cooldown", retryInSecs: got.waitSecs };
	} catch (err) {
		// Without the lock a public trigger would be unbounded, so refuse.
		return { started: false, trigger, reason: "unavailable", detail: (err as Error).message.slice(0, 200) };
	}

	after(async () => {
		const startedMs = Date.now();
		const log = (m: string) => console.log(`[keeper:${trigger}] ${m}`);
		try {
			const keeper = await createKeeper(keeperConfig(), deployment as Deployment, { log, migrate: !migrated });
			migrated = true;
			try {
				const s = await runPass(keeper, { deadline: startedMs + LOCK_TIMING.passBudgetMs, log });
				log(`pass finished in ${Math.round((Date.now() - startedMs) / 1000)} s: ${s.outcomes.length} of ${s.due} due plan(s) attempted`);
			} finally {
				await keeper.ledger.close().catch(() => undefined);
			}
			// Still under the lock, so it cannot interleave with a pass or the scenario sweep.
			await autoRestoreDemo(log);
		} catch (err) {
			console.error(`[keeper:${trigger}] pass failed:`, (err as Error).message);
		} finally {
			await getLock()
				.release(holder, LOCK_TIMING.spacingSecs)
				.catch((err) => console.warn("keeper lock: release failed", (err as Error).message));
		}
	});

	return { started: true, trigger };
}
