// Guard API v1: bozBasket's fair-value guard as a service, for any app about to
// buy an xStock on Solana mainnet, such as a wallet, a recurring-buy tool or a
// lending protocol pricing collateral. It answers "would the guard let this
// buy through right now, and if not, why", with the numbers behind it.
//
// Read-only. The verdict comes from the same checkLeg the keeper and the guard
// panel use, applied to a live Jupiter quote for the caller's size and the
// latest Pyth price (keeper/shadow). Parsing and shaping live here, pure, so
// they are unit tested; the routes under app/api/v1 do the I/O.

import { DEFAULT_THRESHOLDS, MAINNET_XSTOCKS, REASON, reasonLabel, sessionAt } from "@bozbasket/shared";
import type { GuardLimits, ShadowRow } from "keeper/shadow";

export const API_VERSION = "1";
export const USDC_DEFAULT = 100;
export const USDC_MAX = 100_000;
export const HISTORY_LIMIT_DEFAULT = 288;
export const HISTORY_LIMIT_MAX = 1000;

export type XStockInfo = (typeof MAINNET_XSTOCKS)[number];

export const CORS_HEADERS = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "GET, OPTIONS",
	"access-control-allow-headers": "content-type",
	"access-control-max-age": "86400",
};

export type ApiErrorCode = "bad_request" | "rate_limited" | "upstream_unavailable" | "not_configured";
export type ApiError = { error: { code: ApiErrorCode; message: string } };
export const apiError = (code: ApiErrorCode, message: string): ApiError => ({ error: { code, message } });

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const REASON_NAMES: Record<number, string> = Object.fromEntries(Object.entries(REASON).map(([name, code]) => [code, name]));

function numberParam(sp: URLSearchParams, name: string, min: number, max: number): Parsed<number | undefined> {
	const raw = sp.get(name);
	if (raw === null || raw.trim() === "") return { ok: true, value: undefined };
	const n = Number(raw);
	if (!Number.isFinite(n) || n < min || n > max) return { ok: false, message: `${name} must be a number from ${min} to ${max}` };
	return { ok: true, value: n };
}

/** `symbol` (or `symbols`): xStocks or their underlying tickers, any case. */
export function parseSymbols(sp: URLSearchParams): Parsed<XStockInfo[]> {
	const raw = sp.get("symbol") ?? sp.get("symbols") ?? "";
	const out: XStockInfo[] = [];
	for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
		const stock = MAINNET_XSTOCKS.find((s) => s.symbol.toLowerCase() === part.toLowerCase() || s.ticker.toLowerCase() === part.toLowerCase());
		if (!stock) return { ok: false, message: `unknown symbol "${part}"; supported: ${MAINNET_XSTOCKS.map((s) => s.symbol).join(", ")}` };
		if (!out.includes(stock)) out.push(stock);
	}
	return { ok: true, value: out.length ? out : [...MAINNET_XSTOCKS] };
}

export type VerdictQuery = { stocks: XStockInfo[]; usdc: number; limits: GuardLimits };

export function parseVerdictQuery(sp: URLSearchParams): Parsed<VerdictQuery> {
	const stocks = parseSymbols(sp);
	if (!stocks.ok) return stocks;
	const usdc = numberParam(sp, "usdc", 1, USDC_MAX);
	const staleness = numberParam(sp, "maxStalenessSecs", 0, 7 * 86_400);
	const conf = numberParam(sp, "maxConfBps", 0, 10_000);
	const divergence = numberParam(sp, "maxDivergenceBps", 0, 10_000);
	const depth = numberParam(sp, "minLiquidityUsd", 0, 1_000_000_000);
	for (const p of [usdc, staleness, conf, divergence, depth]) if (!p.ok) return { ok: false, message: p.message };
	const value = (p: Parsed<number | undefined>) => (p.ok ? p.value : undefined);
	const depthUsd = value(depth);
	return {
		ok: true,
		value: {
			stocks: stocks.value,
			usdc: Math.round((value(usdc) ?? USDC_DEFAULT) * 100) / 100,
			limits: {
				maxStalenessSecs: Math.round(value(staleness) ?? DEFAULT_THRESHOLDS.maxStalenessSecs),
				maxConfBps: value(conf) ?? DEFAULT_THRESHOLDS.maxConfBps,
				maxDivergenceBps: value(divergence) ?? DEFAULT_THRESHOLDS.maxDivergenceBps,
				minLiquidityUsdc: depthUsd === undefined ? DEFAULT_THRESHOLDS.minLiquidityUsdc : Math.round(depthUsd * 1e6),
			},
		},
	};
}

export type Verdict = "buy" | "defer" | "unavailable";

/** No verdict when a price source failed; callers should treat that as defer. */
export const verdictOf = (reason: number | null): Verdict => (reason === null ? "unavailable" : reason === REASON.OK ? "buy" : "defer");

export type VerdictResult = {
	symbol: string;
	underlying: string;
	mint: string;
	pythFeedId: string;
	verdict: Verdict;
	reason: { code: number; name: string; label: string } | null;
	reference: { price: number; confBps: number; publishTime: number; ageSecs: number } | null;
	venue: {
		source: "jupiter";
		usdcIn: number;
		pricePerShare: number;
		shares: number;
		priceImpactBps: number | null;
		route: string | null;
		liquidityUsd: number | null;
		shareMultiplier: number | null;
	} | null;
	/** Signed: above zero the pool charges more than Pyth. */
	gapBps: number | null;
	error: string | null;
};

const round = (n: number | null, digits: number) => (n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits);

export function toResult(row: ShadowRow, stock: XStockInfo): VerdictResult {
	return {
		symbol: stock.symbol,
		underlying: stock.ticker,
		mint: stock.mint,
		pythFeedId: stock.feedId,
		verdict: verdictOf(row.reason),
		reason: row.reason === null ? null : { code: row.reason, name: REASON_NAMES[row.reason] ?? "UNKNOWN", label: reasonLabel(row.reason) },
		reference:
			row.refPrice === null || row.refAgeSecs === null
				? null
				: { price: round(row.refPrice, 4) as number, confBps: round(row.confBps, 1) ?? 0, publishTime: row.ts - row.refAgeSecs, ageSecs: row.refAgeSecs },
		venue:
			row.venuePrice === null || row.shares === null
				? null
				: {
						source: "jupiter",
						usdcIn: row.usdcIn,
						pricePerShare: round(row.venuePrice, 4) as number,
						shares: round(row.shares, 8) as number,
						priceImpactBps: round(row.priceImpactBps, 1),
						route: row.route,
						liquidityUsd: row.liquidityUsd === null ? null : Math.round(row.liquidityUsd),
						shareMultiplier: row.multiplier,
					},
		gapBps: round(row.divergenceBps, 1),
		error: row.error,
	};
}

/** A buy of several xStocks goes ahead only if every one of them passes. */
export function overallVerdict(results: VerdictResult[]): Verdict {
	if (results.some((r) => r.verdict === "defer")) return "defer";
	if (results.length === 0 || results.some((r) => r.verdict === "unavailable")) return "unavailable";
	return "buy";
}

export function verdictBody(rows: ShadowRow[], q: VerdictQuery, now: number) {
	const results = q.stocks.flatMap((s) => {
		const row = rows.find((r) => r.mint === s.mint);
		return row ? [toResult(row, s)] : [];
	});
	const session = sessionAt(new Date(now * 1000));
	return {
		apiVersion: API_VERSION,
		network: "solana-mainnet" as const,
		asOf: now,
		request: { symbols: q.stocks.map((s) => s.symbol as string), usdc: q.usdc },
		limits: {
			maxStalenessSecs: q.limits.maxStalenessSecs,
			maxConfBps: q.limits.maxConfBps,
			maxDivergenceBps: q.limits.maxDivergenceBps,
			minLiquidityUsd: q.limits.minLiquidityUsdc / 1e6,
		},
		/** Informational: the guard judges the price, not the calendar. */
		usSession: { open: session.open, label: session.label },
		overall: overallVerdict(results),
		results,
	};
}

export type VerdictResponse = ReturnType<typeof verdictBody>;

export type HistoryQuery = { stocks: XStockInfo[]; since: number; limit: number };

export function parseHistoryQuery(sp: URLSearchParams, now: number): Parsed<HistoryQuery> {
	const stocks = parseSymbols(sp);
	if (!stocks.ok) return stocks;
	const since = numberParam(sp, "since", 0, now);
	if (!since.ok) return since;
	const limit = numberParam(sp, "limit", 1, HISTORY_LIMIT_MAX);
	if (!limit.ok) return limit;
	return { ok: true, value: { stocks: stocks.value, since: Math.floor(since.value ?? now - 86_400), limit: Math.floor(limit.value ?? HISTORY_LIMIT_DEFAULT) } };
}

export type HistoryItem = {
	ts: number;
	symbol: string;
	verdict: Verdict;
	reasonCode: number | null;
	gapBps: number | null;
	referencePrice: number | null;
	refAgeSecs: number | null;
	confBps: number | null;
	pricePerShare: number | null;
	usdcIn: number;
	error: string | null;
};
