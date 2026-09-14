// GET /api/v1/history: the $100 checks the keeper records every few minutes,
// newest first. The contract is in lib/guardApi.ts, the docs at /developers.

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { API_VERSION, apiError, CORS_HEADERS, parseHistoryQuery, verdictOf, type HistoryItem } from "@/lib/guardApi";
import { makeLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADERS = { "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" };
const limited = makeLimiter(60_000, 60);

let pool: Pool | null = null;
function db(): Pool | null {
	if (!process.env.DATABASE_URL) return null;
	pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10_000 });
	return pool;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { ...CORS_HEADERS, ...headers } });

export function OPTIONS() {
	return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request) {
	const now = Math.floor(Date.now() / 1000);
	const parsed = parseHistoryQuery(new URL(req.url).searchParams, now);
	if (!parsed.ok) return respond(apiError("bad_request", parsed.message), 400);
	if (limited(req)) return respond(apiError("rate_limited", "more than 60 requests a minute from this address"), 429, { "retry-after": "60" });
	const p = db();
	if (!p) return respond(apiError("not_configured", "this deployment has no history store"), 503);

	const q = parsed.value;
	try {
		const r = await p.query(
			`SELECT ts, symbol, usdc_in, venue_price, ref_price, ref_age_secs, conf_bps, divergence_bps, reason, error
			   FROM mainnet_shadow
			  WHERE ts >= $1 AND symbol = ANY($2::text[])
			  ORDER BY ts DESC, symbol
			  LIMIT $3`,
			[q.since, q.stocks.map((s) => s.symbol), q.limit],
		);
		const items: HistoryItem[] = r.rows.map((x) => {
			const reason = num(x.reason);
			const gap = num(x.divergence_bps);
			return {
				ts: Number(x.ts),
				symbol: x.symbol,
				verdict: verdictOf(reason),
				reasonCode: reason,
				gapBps: gap === null ? null : Math.round(gap * 10) / 10,
				referencePrice: num(x.ref_price),
				refAgeSecs: num(x.ref_age_secs),
				confBps: num(x.conf_bps),
				pricePerShare: num(x.venue_price),
				usdcIn: Number(x.usdc_in),
				error: x.error,
			};
		});
		return respond({ apiVersion: API_VERSION, network: "solana-mainnet", since: q.since, count: items.length, items }, 200, CACHE_HEADERS);
	} catch {
		return respond(apiError("upstream_unavailable", "the history store could not be reached"), 502);
	}
}
