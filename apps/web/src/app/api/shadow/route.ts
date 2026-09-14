// The mainnet shadow check for the landing page: the latest verdict per
// xStock, a chart series and a summary over the last week. Cached, like
// /api/proof, so the most-visited page does not query the database per view.

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { DEFAULT_THRESHOLDS, MAINNET_XSTOCKS } from "@bozbasket/shared";
import { bucketSeries, latestBySymbol, summarize, type SeriesRow, type ShadowPoint, type ShadowSummary } from "@/lib/shadow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ShadowResponse = {
	symbols: string[];
	latest: Record<string, ShadowPoint>;
	series: SeriesRow[];
	summary: ShadowSummary;
	windowSecs: number;
	limits: { maxStalenessSecs: number; maxConfBps: number; maxDivergenceBps: number };
};

const WINDOW_SECS = 7 * 86_400;
const BUCKET_SECS = 15 * 60;
const TTL_MS = 60_000;

let pool: Pool | null = null;
function db(): Pool | null {
	if (!process.env.DATABASE_URL) return null;
	if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10_000 });
	return pool;
}

let cache: { at: number; body: ShadowResponse } | null = null;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function GET() {
	if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json(cache.body);
	const p = db();
	if (!p) return NextResponse.json({ error: "ledger not configured" });
	try {
		const since = Math.floor(Date.now() / 1000) - WINDOW_SECS;
		const r = await p.query(
			`SELECT ts, symbol, venue_price, ref_price, ref_age_secs, conf_bps, divergence_bps, price_impact_bps, reason, session, error
			   FROM mainnet_shadow WHERE ts >= $1 ORDER BY ts`,
			[since],
		);
		const points: ShadowPoint[] = r.rows.map((x) => ({
			ts: Number(x.ts),
			symbol: x.symbol,
			venuePrice: num(x.venue_price),
			refPrice: num(x.ref_price),
			refAgeSecs: num(x.ref_age_secs),
			confBps: num(x.conf_bps),
			divergenceBps: num(x.divergence_bps),
			priceImpactBps: num(x.price_impact_bps),
			reason: num(x.reason),
			session: x.session,
			error: x.error,
		}));
		const symbols = MAINNET_XSTOCKS.map((s) => s.symbol as string);
		const body: ShadowResponse = {
			symbols,
			latest: latestBySymbol(points),
			series: bucketSeries(points, symbols, BUCKET_SECS),
			summary: summarize(points),
			windowSecs: WINDOW_SECS,
			limits: { maxStalenessSecs: DEFAULT_THRESHOLDS.maxStalenessSecs, maxConfBps: DEFAULT_THRESHOLDS.maxConfBps, maxDivergenceBps: DEFAULT_THRESHOLDS.maxDivergenceBps },
		};
		cache = { at: Date.now(), body };
		return NextResponse.json(body);
	} catch (err) {
		// A slightly old answer beats an empty panel on the landing page.
		if (cache) return NextResponse.json(cache.body);
		return NextResponse.json({ error: (err as Error).message }, { status: 200 });
	}
}
