// GET /api/v1/verdict: would the guard let a buy of this xStock through right
// now? The contract is in lib/guardApi.ts, the docs at /developers.

import { NextResponse } from "next/server";
import { Pool } from "pg";
import { HermesClient } from "keeper/hermes";
import { MainnetShadow, mainnetRpcFor } from "keeper/shadow";
import { apiError, CORS_HEADERS, parseVerdictQuery, verdictBody, type VerdictResponse } from "@/lib/guardApi";
import { makeLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 15_000;
const CACHE_HEADERS = { "cache-control": "public, max-age=0, s-maxage=15, stale-while-revalidate=15" };
const limited = makeLimiter(60_000, 60);
const cache = new Map<string, { at: number; body: VerdictResponse }>();

let pool: Pool | null = null;
let known: { at: number; value: Record<string, number> } | null = null;

/** The share multipliers the keeper last stored, used when the mainnet RPC
 *  does not answer. On 2026-09-14 a local run lost both xStocks to "fetch
 *  failed" from the RPC while Jupiter and Pyth answered. A multiplier changes
 *  only with a corporate action, so ten minutes old is fine. */
async function knownMultipliers(): Promise<Record<string, number>> {
	if (known && Date.now() - known.at < 10 * 60_000) return known.value;
	if (!process.env.DATABASE_URL) return {};
	try {
		pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5_000 });
		const r = await pool.query(`SELECT DISTINCT ON (mint) mint, multiplier FROM mainnet_shadow WHERE multiplier IS NOT NULL ORDER BY mint, ts DESC`);
		known = { at: Date.now(), value: Object.fromEntries(r.rows.map((x) => [x.mint as string, Number(x.multiplier)])) };
		return known.value;
	} catch {
		return known?.value ?? {};
	}
}

let shadow: MainnetShadow | null = null;
function getShadow(): MainnetShadow | null {
	const key = process.env.PYTH_API_KEY;
	if (!key) return null;
	const rpc = process.env.MAINNET_RPC_URL || mainnetRpcFor(process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "");
	shadow ??= new MainnetShadow(new HermesClient((process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network").replace(/\/$/, ""), key), rpc, process.env.JUPITER_API_URL || undefined);
	return shadow;
}

const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { ...CORS_HEADERS, ...headers } });

export function OPTIONS() {
	return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request) {
	const parsed = parseVerdictQuery(new URL(req.url).searchParams);
	if (!parsed.ok) return respond(apiError("bad_request", parsed.message), 400);
	if (limited(req)) return respond(apiError("rate_limited", "more than 60 requests a minute from this address"), 429, { "retry-after": "60" });

	const q = parsed.value;
	const key = JSON.stringify([q.stocks.map((s) => s.symbol), q.usdc, q.limits]);
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return respond(hit.body, 200, CACHE_HEADERS);

	const s = getShadow();
	if (!s) return respond(apiError("not_configured", "this deployment has no Pyth API key"), 503);
	try {
		const now = Math.floor(Date.now() / 1000);
		const rows = await s.sample(now, await knownMultipliers(), { usdcIn: q.usdc, limits: q.limits, only: q.stocks.map((x) => x.mint) });
		const body = verdictBody(rows, q, now);
		cache.set(key, { at: Date.now(), body });
		if (cache.size > 200) for (const [k, v] of cache) if (Date.now() - v.at >= TTL_MS) cache.delete(k);
		return respond(body, 200, CACHE_HEADERS);
	} catch (err) {
		const message = (err as Error).message.replace(/(api[-_]?key=)[^&\s"']+/gi, "$1***").slice(0, 160);
		return respond(apiError("upstream_unavailable", `price sources unreachable: ${message}`), 502);
	}
}
