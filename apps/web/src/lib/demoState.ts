import "server-only";

// Keeps the public demo working for whoever comes next. A judge who drains a
// market and leaves would otherwise hand every later visitor a broken demo:
// on 2026-09-14 TSLA's depth stayed at $10 after a screenshot. Every demo
// action is timestamped, and when no control has been used for ten minutes
// while something is still changed, the next keeper pass restores it. That
// pass holds the keeper lock, so the restore never interleaves with another
// pass or with the scenario sweep, which holds the lock throughout.

import * as anchor from "@coral-xyz/anchor";
import { Pool } from "pg";
import { DEFAULT_MARKET, DEFAULT_THRESHOLDS } from "@bozbasket/shared";
import { AUTO_RESTORE_IDLE_SECS, demoDrift, shouldAutoRestore } from "./demoDefaults";
import { adminPrograms, MARKETS, marketPks } from "./server";
import { CONFIG } from "./solana";

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

function db(): Pool | null {
	if (!process.env.DATABASE_URL) return null;
	pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10_000 });
	return pool;
}

function ensure(p: Pool): Promise<void> {
	ready ??= p
		.query(
			`CREATE TABLE IF NOT EXISTS demo_activity (
				id               smallint PRIMARY KEY,
				last_action      text,
				last_action_at   timestamptz,
				auto_restored_at timestamptz
			);
			INSERT INTO demo_activity (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`,
		)
		.then(() => undefined)
		.catch((err) => {
			ready = null;
			throw err;
		});
	return ready;
}

export type DemoActivity = { lastAction: string | null; lastActionAt: number | null; autoRestoredAt: number | null };

/** Never throws: a demo action must not fail because its timestamp did not land. */
export async function recordDemoAction(action: string): Promise<void> {
	const p = db();
	if (!p) return;
	try {
		await ensure(p);
		await p.query(`UPDATE demo_activity SET last_action = $1, last_action_at = now() WHERE id = 1`, [action]);
	} catch (err) {
		console.warn(`demo: could not record the action (${(err as Error).message})`);
	}
}

export async function demoActivity(): Promise<DemoActivity | null> {
	const p = db();
	if (!p) return null;
	await ensure(p);
	const r = await p.query(
		`SELECT last_action,
		        EXTRACT(EPOCH FROM last_action_at)::bigint   AS action_at,
		        EXTRACT(EPOCH FROM auto_restored_at)::bigint AS restored_at
		   FROM demo_activity WHERE id = 1`,
	);
	const row = r.rows[0] ?? {};
	const epoch = (v: unknown) => (v === null || v === undefined ? null : Number(v));
	return { lastAction: row.last_action ?? null, lastActionAt: epoch(row.action_at), autoRestoredAt: epoch(row.restored_at) };
}

/** `update_config` arguments with the default thresholds, overridden by `over`,
 *  and everything else as it stands on chain. */
export async function configArgs(over: Partial<typeof DEFAULT_THRESHOLDS>) {
	const { basket } = adminPrograms();
	const c = await basket.account.config.fetch(CONFIG);
	const t = { ...DEFAULT_THRESHOLDS, ...over };
	return {
		keeper: c.keeper,
		maxStalenessSecs: t.maxStalenessSecs,
		maxConfBps: t.maxConfBps,
		maxDivergenceBps: t.maxDivergenceBps,
		minLiquidityUsdc: new anchor.BN(t.minLiquidityUsdc),
		fillProgram: c.fillProgram,
		referenceProgram: c.referenceProgram,
	};
}

/** What the "restore everything" control does: clear every price override,
 *  refill every market's depth and put the thresholds back. */
export async function restoreDemo(): Promise<string[]> {
	const { kp, basket, market } = adminPrograms();
	const admin = kp.publicKey;
	const sigs: string[] = [];
	for (const m of MARKETS) {
		const pks = marketPks(m);
		sigs.push(await market.methods.setPriceOverride(new anchor.BN(0)).accountsPartial({ market: pks.market, admin }).rpc());
		sigs.push(await market.methods.setLiquidity(new anchor.BN(DEFAULT_MARKET.liquidityUsdc)).accountsPartial({ market: pks.market, admin }).rpc());
	}
	sigs.push(await basket.methods.updateConfig(await configArgs({})).accountsPartial({ config: CONFIG, admin }).rpc());
	return sigs;
}

/** Run by the in-app keeper after each pass, under its lock. Never throws. */
export async function autoRestoreDemo(log: (message: string) => void): Promise<void> {
	if (process.env.DEMO_CONTROLS !== "1" || !db()) return;
	try {
		const activity = await demoActivity();
		const now = Math.floor(Date.now() / 1000);
		// Someone is using the controls: leave the chain alone, and skip the reads.
		if (activity?.lastActionAt != null && now - activity.lastActionAt < AUTO_RESTORE_IDLE_SECS) return;

		const { basket, market } = adminPrograms();
		const [config, accounts] = await Promise.all([basket.account.config.fetch(CONFIG), market.account.market.fetchMultiple(MARKETS.map((m) => marketPks(m).market))]);
		const drift = demoDrift(
			config,
			MARKETS.map((m, i) => ({ symbol: m.symbol, priceOverride: accounts[i]?.priceOverride ?? 0, liquidityUsdc: accounts[i]?.liquidityUsdc ?? DEFAULT_MARKET.liquidityUsdc })),
		);
		if (!shouldAutoRestore(drift, activity?.lastActionAt ?? null, now)) return;

		const sigs = await restoreDemo();
		await db()?.query(`UPDATE demo_activity SET auto_restored_at = now() WHERE id = 1`);
		log(`demo restored after ${AUTO_RESTORE_IDLE_SECS / 60} idle minutes (${drift.join(", ")}); last transaction ${sigs[sigs.length - 1]}`);
	} catch (err) {
		log(`demo auto-restore skipped: ${(err as Error).message.slice(0, 160)}`);
	}
}
