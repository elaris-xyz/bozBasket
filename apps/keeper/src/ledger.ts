// Postgres ledger of every keeper decision. The chain is the source of truth;
// this exists so the web app can list history and deferral reasons without
// scanning transaction logs. It also keeps the mainnet shadow check
// (./shadow), which has no chain state behind it at all.

import { Pool } from "pg";
import { SHADOW_EVERY_SECS, type ShadowRow } from "./shadow";
import type { ReferenceRow } from "./references";

export type LedgerRow = {
	plan: string;
	ts: number;
	kind: "executed" | "deferred" | "skipped" | "error";
	reason: number; // ReasonCode; 0 for executed
	detail: string | null;
	signature: string | null;
	usdcIn: string | null; // base units as string
	/** LegFill[] for an execution, the guard's per-leg snapshot for a deferral. */
	legs: unknown | null;
	/** True when a demo control caused this deferral rather than the market.
	 *  Forced deferrals are never counted as savings. */
	forced?: boolean;
	/** USDC the deferral avoided overpaying, where that is computable. */
	avoidedUsdc?: number | null;
};

/** Written once per keeper loop so the web app can tell "the guard deferred"
 *  apart from "nothing is running". */
export type Heartbeat = { ts: number; cluster: string; activePlans: number; duePlans: number; note: string };

export interface Ledger {
	record(row: LedgerRow): Promise<void>;
	beat(h: Heartbeat): Promise<void>;
	/** Whether the mainnet shadow check is due, and the last share multiplier
	 *  stored per mint, for when the mainnet RPC is unreachable. */
	shadowDue(now: number): Promise<{ due: boolean; multipliers: Record<string, number> }>;
	recordShadow(rows: ShadowRow[]): Promise<void>;
	/** Whether the quarter hour `slot` still lacks its reference prices. */
	referenceDue(slot: number): Promise<boolean>;
	recordReferences(rows: ReferenceRow[]): Promise<void>;
	close(): Promise<void>;
}

const SHADOW_COLUMNS = [
	"ts",
	"symbol",
	"mint",
	"usdc_in",
	"shares",
	"venue_price",
	"price_impact_bps",
	"route",
	"multiplier",
	"liquidity_usd",
	"ref_price",
	"ref_age_secs",
	"conf_bps",
	"divergence_bps",
	"reason",
	"session",
	"error",
] as const;

const shadowValues = (r: ShadowRow) => [
	r.ts,
	r.symbol,
	r.mint,
	r.usdcIn,
	r.shares,
	r.venuePrice,
	r.priceImpactBps,
	r.route,
	r.multiplier,
	r.liquidityUsd,
	r.refPrice,
	r.refAgeSecs,
	r.confBps,
	r.divergenceBps,
	r.reason,
	r.session,
	r.error,
];

export class PgLedger implements Ledger {
	private pool: Pool;
	constructor(databaseUrl: string) {
		this.pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 30_000 });
		this.pool.on("error", (err) => console.warn("ledger: pool error", err.message));
	}

	async migrate() {
		await this.pool.query(`
			CREATE TABLE IF NOT EXISTS executions (
				id         bigserial PRIMARY KEY,
				plan       text        NOT NULL,
				ts         bigint      NOT NULL,
				kind       text        NOT NULL,
				reason     smallint    NOT NULL DEFAULT 0,
				detail     text,
				signature  text UNIQUE,
				usdc_in    numeric,
				legs       jsonb,
				created_at timestamptz NOT NULL DEFAULT now()
			);
			ALTER TABLE executions ADD COLUMN IF NOT EXISTS forced boolean NOT NULL DEFAULT false;
			ALTER TABLE executions ADD COLUMN IF NOT EXISTS avoided_usdc numeric;
			CREATE INDEX IF NOT EXISTS executions_plan_ts ON executions (plan, ts DESC);
			CREATE TABLE IF NOT EXISTS keeper_heartbeat (
				id           smallint PRIMARY KEY,
				ts           bigint  NOT NULL,
				cluster      text    NOT NULL,
				active_plans int     NOT NULL DEFAULT 0,
				due_plans    int     NOT NULL DEFAULT 0,
				note         text
			);
			CREATE TABLE IF NOT EXISTS mainnet_shadow (
				id               bigserial        PRIMARY KEY,
				ts               bigint           NOT NULL,
				symbol           text             NOT NULL,
				mint             text             NOT NULL,
				usdc_in          double precision NOT NULL,
				shares           double precision,
				venue_price      double precision,
				price_impact_bps double precision,
				route            text,
				multiplier       double precision,
				liquidity_usd    double precision,
				ref_price        double precision,
				ref_age_secs     bigint,
				conf_bps         double precision,
				divergence_bps   double precision,
				reason           smallint,
				session          text             NOT NULL,
				error            text
			);
			CREATE INDEX IF NOT EXISTS mainnet_shadow_ts ON mainnet_shadow (ts DESC);
			CREATE TABLE IF NOT EXISTS reference_prices (
				ts           bigint           NOT NULL,
				feed_id      text             NOT NULL,
				price        double precision,
				publish_time bigint,
				PRIMARY KEY (feed_id, ts)
			);
			CREATE INDEX IF NOT EXISTS reference_prices_ts ON reference_prices (ts);
		`);
	}

	async record(r: LedgerRow) {
		try {
			await this.insert(r);
		} catch (err) {
			console.warn(`ledger: insert failed (${(err as Error).message}); row: ${r.kind} ${r.plan} ${r.signature ?? ""}`);
		}
	}

	private async insert(r: LedgerRow) {
		await this.pool.query(
			`INSERT INTO executions (plan, ts, kind, reason, detail, signature, usdc_in, legs, forced, avoided_usdc)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			 ON CONFLICT (signature) DO NOTHING`,
			[r.plan, r.ts, r.kind, r.reason, r.detail, r.signature, r.usdcIn, r.legs === null ? null : JSON.stringify(r.legs), r.forced ?? false, r.avoidedUsdc ?? null],
		);
	}

	async beat(h: Heartbeat) {
		try {
			await this.pool.query(
				`INSERT INTO keeper_heartbeat (id, ts, cluster, active_plans, due_plans, note) VALUES (1,$1,$2,$3,$4,$5)
				 ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, cluster = EXCLUDED.cluster, active_plans = EXCLUDED.active_plans, due_plans = EXCLUDED.due_plans, note = EXCLUDED.note`,
				[h.ts, h.cluster, h.activePlans, h.duePlans, h.note],
			);
		} catch (err) {
			console.warn(`ledger: heartbeat failed (${(err as Error).message})`);
		}
	}

	async shadowDue(now: number) {
		try {
			const r = await this.pool.query(
				`SELECT (SELECT max(ts) FROM mainnet_shadow) AS last,
				        (SELECT json_object_agg(mint, multiplier) FROM (
				           SELECT DISTINCT ON (mint) mint, multiplier FROM mainnet_shadow
				            WHERE multiplier IS NOT NULL ORDER BY mint, ts DESC
				        ) latest) AS multipliers`,
			);
			const row = r.rows[0] ?? {};
			const last = row.last === null || row.last === undefined ? null : Number(row.last);
			return { due: last === null || now - last >= SHADOW_EVERY_SECS, multipliers: (row.multipliers ?? {}) as Record<string, number> };
		} catch (err) {
			console.warn(`ledger: shadow check skipped (${(err as Error).message})`);
			return { due: false, multipliers: {} };
		}
	}

	async recordShadow(rows: ShadowRow[]) {
		if (rows.length === 0) return;
		const width = SHADOW_COLUMNS.length;
		const tuples = rows.map((_, i) => `(${SHADOW_COLUMNS.map((__, j) => `$${i * width + j + 1}`).join(",")})`).join(",");
		try {
			await this.pool.query(`INSERT INTO mainnet_shadow (${SHADOW_COLUMNS.join(",")}) VALUES ${tuples}`, rows.flatMap(shadowValues));
		} catch (err) {
			console.warn(`ledger: shadow insert failed (${(err as Error).message})`);
		}
	}

	async referenceDue(slot: number) {
		try {
			const r = await this.pool.query(`SELECT 1 FROM reference_prices WHERE ts = $1 LIMIT 1`, [slot]);
			return r.rowCount === 0;
		} catch (err) {
			console.warn(`ledger: reference check skipped (${(err as Error).message})`);
			return false;
		}
	}

	async recordReferences(rows: ReferenceRow[]) {
		if (rows.length === 0) return;
		const tuples = rows.map((_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`).join(",");
		try {
			await this.pool.query(
				`INSERT INTO reference_prices (ts, feed_id, price, publish_time) VALUES ${tuples} ON CONFLICT (feed_id, ts) DO NOTHING`,
				rows.flatMap((r) => [r.ts, r.feedId, r.price, r.publishTime]),
			);
		} catch (err) {
			console.warn(`ledger: reference insert failed (${(err as Error).message})`);
		}
	}

	async close() {
		await this.pool.end();
	}
}

/** Used when DATABASE_URL is unset: prints instead of storing. */
export class LogLedger implements Ledger {
	private shadowAt = 0;
	async record(r: LedgerRow) {
		console.log(`[ledger] ${r.kind} plan=${r.plan} reason=${r.reason} ${r.detail ?? ""} ${r.signature ?? ""}`);
	}
	async beat(h: Heartbeat) {
		console.log(`[ledger] heartbeat ${new Date(h.ts * 1000).toISOString()} ${h.activePlans} active, ${h.duePlans} due`);
	}
	async shadowDue(now: number) {
		return { due: now - this.shadowAt >= SHADOW_EVERY_SECS, multipliers: {} };
	}
	async recordShadow(rows: ShadowRow[]) {
		if (rows[0]) this.shadowAt = rows[0].ts;
		for (const r of rows) console.log(`[ledger] shadow ${r.symbol} ${r.error ?? `${r.divergenceBps?.toFixed(1)} bps, reason ${r.reason}`}`);
	}
	/** Nothing would keep the prices, so never spend a Hermes call on them. */
	async referenceDue() {
		return false;
	}
	async recordReferences() {}
	async close() {}
}
