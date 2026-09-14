// Mainnet shadow check: what the guard would decide about real xStocks on the
// real market, right now. Read-only; nothing is signed or sent.
//
// bozBasket's fills are synthetic on devnet, but the problem it addresses is
// not: xStocks trade on mainnet pools around the clock, while Pyth publishes
// nothing for US equities from Friday 20:00 ET to Sunday 20:00 ET. So a keeper
// pass, every few minutes, asks Jupiter what $100 of USDC buys in each xStock,
// takes the Pyth reference, and runs both through the same `checkLeg` the
// keeper and the guard panel use. It uses the default limits, not the devnet
// config, which the demo controls can tighten.
//
// Like pass.ts, nothing here reads a file, so it runs inside a Vercel function.

import { Connection, PublicKey } from "@solana/web3.js";
import { checkLeg, DEFAULT_THRESHOLDS, MAINNET_USDC_MINT, MAINNET_XSTOCKS, REASON, sessionAt, type ReferencePrice } from "@bozbasket/shared";
import type { HermesClient } from "./hermes";

/** USDC per simulated buy: the demo basket's period amount. */
export const SHADOW_USDC_IN = 100;

/** At most one sample in this window. Shorter than the scheduler's five
 *  minutes, so every scheduled pass samples and visitor passes add none. */
export const SHADOW_EVERY_SECS = 240;

export const MAINNET_RPC_DEFAULT = "https://api.mainnet-beta.solana.com";
export const JUPITER_API_DEFAULT = "https://lite-api.jup.ag";

/** The mainnet twin of a Helius devnet URL, same key; the public endpoint
 *  otherwise, which rate-limits cloud hosts. */
export function mainnetRpcFor(devnetRpcUrl: string): string {
	try {
		const u = new URL(devnetRpcUrl);
		if (u.hostname !== "devnet.helius-rpc.com") return MAINNET_RPC_DEFAULT;
		u.hostname = "mainnet.helius-rpc.com";
		return u.toString();
	} catch {
		return MAINNET_RPC_DEFAULT;
	}
}

/** What a row needs to know about the stock it prices. */
export type StockRef = { symbol: string; mint: string; decimals: number };

export type ShadowRow = {
	ts: number;
	symbol: string;
	mint: string;
	usdcIn: number;
	/** Shares bought, with the issuer's multiplier applied. */
	shares: number | null;
	/** USDC paid per share, price impact included. */
	venuePrice: number | null;
	priceImpactBps: number | null;
	route: string | null;
	multiplier: number | null;
	liquidityUsd: number | null;
	refPrice: number | null;
	refAgeSecs: number | null;
	confBps: number | null;
	/** Signed: above zero the pool charges more than the reference. */
	divergenceBps: number | null;
	/** The guard's verdict; null when the check itself could not run. */
	reason: number | null;
	session: string;
	error: string | null;
};

export type ScaledUiAmountConfig = { multiplier: string | number; newMultiplier: string | number; newMultiplierEffectiveTimestamp: string | number };

/** The issuer schedules a new multiplier ahead of a corporate action, and it
 *  applies from its effective timestamp on. */
export function effectiveMultiplier(c: ScaledUiAmountConfig, now: number): number {
	const from = Number(c.newMultiplierEffectiveTimestamp);
	return Number(from > 0 && now >= from ? c.newMultiplier : c.multiplier);
}

const thresholds = () => ({ ...DEFAULT_THRESHOLDS, minLiquidityUsdc: BigInt(DEFAULT_THRESHOLDS.minLiquidityUsdc) });

const sessionLabel = (now: number) => sessionAt(new Date(now * 1000)).label;

/** RPC and API URLs can carry a key; never let one reach a log or the table. */
const redact = (s: string) => s.replace(/(api[-_]?key=)[^&\s"']+/gi, "$1***").slice(0, 200);

/** One Jupiter quote and one Pyth price in, one row out. Pure. */
export function shadowRow(i: {
	now: number;
	stock: StockRef;
	ref: ReferencePrice;
	usdcIn: number;
	/** Raw token units Jupiter quotes for the USDC. */
	outAmount: string;
	multiplier: number;
	priceImpactPct: number;
	route: string;
	liquidityUsd: number | null;
}): ShadowRow {
	// Without the multiplier a dividend-paying xStock reads as a premium: on
	// 2026-09-14 QQQx was 44 bps over Pyth raw, and 17 bps with it applied.
	const shares = (Number(i.outAmount) / 10 ** i.stock.decimals) * i.multiplier;
	const venuePrice = i.usdcIn / shares;
	const refPrice = Number(i.ref.price) * 10 ** i.ref.expo;
	// Unknown depth must not read as shallow; the quote already proves a route.
	const depth = i.liquidityUsd === null ? BigInt(Number.MAX_SAFE_INTEGER) : BigInt(Math.round(i.liquidityUsd * 1e6));
	const venue = { price: BigInt(Math.round(venuePrice / 10 ** i.ref.expo)), expo: i.ref.expo, liquidityUsdc: depth };
	const v = checkLeg(i.now, i.ref, venue, BigInt(Math.round(i.usdcIn * 1e6)), thresholds());
	return {
		ts: i.now,
		symbol: i.stock.symbol,
		mint: i.stock.mint,
		usdcIn: i.usdcIn,
		shares,
		venuePrice,
		priceImpactBps: i.priceImpactPct * 10_000,
		route: i.route,
		multiplier: i.multiplier,
		liquidityUsd: i.liquidityUsd,
		refPrice,
		refAgeSecs: v.ageSecs,
		confBps: v.confBps,
		divergenceBps: ((venuePrice - refPrice) / refPrice) * 10_000,
		reason: v.reason,
		session: sessionLabel(i.now),
		error: null,
	};
}

/** A check that produced no price. `reason` is LOW_LIQUIDITY when Jupiter
 *  found no pool, which is the market's answer; null when the failure was ours. */
export function failedRow(now: number, stock: Pick<StockRef, "symbol" | "mint">, error: string, reason: number | null): ShadowRow {
	return {
		ts: now,
		symbol: stock.symbol,
		mint: stock.mint,
		usdcIn: SHADOW_USDC_IN,
		shares: null,
		venuePrice: null,
		priceImpactBps: null,
		route: null,
		multiplier: null,
		liquidityUsd: null,
		refPrice: null,
		refAgeSecs: null,
		confBps: null,
		divergenceBps: null,
		reason,
		session: sessionLabel(now),
		error,
	};
}

type Quote = { outAmount: string; priceImpactPct: number; route: string };

export class MainnetShadow {
	private readonly connection: Connection;
	private readonly configs = new Map<string, { at: number; config: ScaledUiAmountConfig }>();

	constructor(
		private readonly hermes: HermesClient,
		rpcUrl: string = MAINNET_RPC_DEFAULT,
		private readonly jupiterUrl: string = JUPITER_API_DEFAULT,
	) {
		this.connection = new Connection(rpcUrl, "confirmed");
	}

	/** `known` is the last multiplier stored per mint, used when the RPC fails. */
	async sample(now: number, known: Record<string, number> = {}): Promise<ShadowRow[]> {
		const refs = await this.hermes.latest(MAINNET_XSTOCKS.map((s) => s.feedId));
		return Promise.all(
			MAINNET_XSTOCKS.map(async (stock) => {
				try {
					const ref = refs.parsed.find((p) => p.feedId.replace(/^0x/, "").toLowerCase() === stock.feedId);
					if (!ref) throw new Error(`no Pyth price for ${stock.ticker}`);
					const [quote, liquidityUsd, multiplier] = await Promise.all([
						this.quote(stock.mint),
						this.liquidity(stock.mint),
						this.multiplier(stock.mint, now, known[stock.mint]),
					]);
					if (typeof quote === "string") return failedRow(now, stock, quote, REASON.LOW_LIQUIDITY);
					return shadowRow({ now, stock, ref, usdcIn: SHADOW_USDC_IN, outAmount: quote.outAmount, multiplier, priceImpactPct: quote.priceImpactPct, route: quote.route, liquidityUsd });
				} catch (err) {
					return failedRow(now, stock, redact((err as Error).message), null);
				}
			}),
		);
	}

	/** A string when Jupiter says no pool can fill the buy. */
	private async quote(mint: string): Promise<Quote | string> {
		const params = new URLSearchParams({ inputMint: MAINNET_USDC_MINT, outputMint: mint, amount: String(SHADOW_USDC_IN * 1_000_000), slippageBps: "50" });
		const res = await fetch(`${this.jupiterUrl}/swap/v1/quote?${params}`, { signal: AbortSignal.timeout(10_000) });
		const body = (await res.json().catch(() => ({}))) as {
			outAmount?: string;
			priceImpactPct?: string;
			routePlan?: { swapInfo?: { label?: string } }[];
			error?: string;
			errorCode?: string;
		};
		if (res.ok && body.outAmount) {
			const route = (body.routePlan ?? []).map((r) => r.swapInfo?.label).filter(Boolean).join(" > ");
			return { outAmount: body.outAmount, priceImpactPct: Number(body.priceImpactPct ?? 0), route };
		}
		if (body.errorCode === "TOKEN_NOT_TRADABLE" || body.errorCode === "COULD_NOT_FIND_ANY_ROUTE") return body.error ?? body.errorCode;
		throw new Error(`Jupiter quote ${res.status}: ${(body.error ?? "").slice(0, 120)}`);
	}

	/** Pool liquidity in USD from Jupiter's token list, or null. */
	private async liquidity(mint: string): Promise<number | null> {
		try {
			const res = await fetch(`${this.jupiterUrl}/tokens/v2/search?query=${mint}`, { signal: AbortSignal.timeout(10_000) });
			if (!res.ok) return null;
			const list = (await res.json()) as { id: string; liquidity?: number }[];
			return list.find((t) => t.id === mint)?.liquidity ?? null;
		} catch {
			return null;
		}
	}

	/** From the mint's scaled UI amount extension, read at most hourly: it
	 *  changes only with a corporate action. */
	private async multiplier(mint: string, now: number, fallback: number | undefined): Promise<number> {
		const cached = this.configs.get(mint);
		if (cached && Date.now() - cached.at < 3_600_000) return effectiveMultiplier(cached.config, now);
		try {
			const info = await this.connection.getParsedAccountInfo(new PublicKey(mint));
			const data = info.value?.data;
			if (!data || !("parsed" in data)) throw new Error("mint account not found");
			const extensions = (data.parsed?.info?.extensions ?? []) as { extension: string; state: ScaledUiAmountConfig }[];
			// A mint without the extension has no multiplier.
			const config = extensions.find((e) => e.extension === "scaledUiAmountConfig")?.state ?? { multiplier: 1, newMultiplier: 1, newMultiplierEffectiveTimestamp: 0 };
			this.configs.set(mint, { at: Date.now(), config });
			return effectiveMultiplier(config, now);
		} catch (err) {
			// Right unless a corporate action took effect since it was stored.
			if (fallback !== undefined) return fallback;
			throw new Error(`share multiplier unavailable: ${(err as Error).message}`);
		}
	}
}
