// How to tell that the demo controls have left the deployment changed, and
// when to put it back. Pure, so it is unit tested; lib/demoState.ts acts on it.

import { DEFAULT_MARKET, DEFAULT_THRESHOLDS } from "@bozbasket/shared";

/** Untouched for this long, a changed demo is restored by the next keeper pass. */
export const AUTO_RESTORE_IDLE_SECS = 600;

type Num = number | { toString(): string };
export type ConfigLike = { maxStalenessSecs: number; maxConfBps: number; maxDivergenceBps: number; minLiquidityUsdc: Num };
export type MarketLike = { symbol: string; priceOverride: Num; liquidityUsdc: Num };

const n = (v: Num) => Number(v.toString());

/** One entry per change a control has left behind; empty when the demo is as
 *  "restore" leaves it. Fills draw a market's depth down a little, so only
 *  depth below half the default counts: "drain" sets it to $10. */
export function demoDrift(config: ConfigLike, markets: MarketLike[]): string[] {
	const out: string[] = [];
	if (config.maxStalenessSecs !== DEFAULT_THRESHOLDS.maxStalenessSecs) out.push(`max staleness ${config.maxStalenessSecs} s`);
	if (config.maxConfBps !== DEFAULT_THRESHOLDS.maxConfBps) out.push(`max confidence ${config.maxConfBps} bps`);
	if (config.maxDivergenceBps !== DEFAULT_THRESHOLDS.maxDivergenceBps) out.push(`max divergence ${config.maxDivergenceBps} bps`);
	if (n(config.minLiquidityUsdc) !== DEFAULT_THRESHOLDS.minLiquidityUsdc) out.push(`min depth $${n(config.minLiquidityUsdc) / 1e6}`);
	for (const m of markets) {
		if (n(m.priceOverride) !== 0) out.push(`${m.symbol} price override`);
		if (n(m.liquidityUsdc) < DEFAULT_MARKET.liquidityUsdc / 2) out.push(`${m.symbol} depth $${n(m.liquidityUsdc) / 1e6}`);
	}
	return out;
}

/** Restore when something is changed and no control has been used for the
 *  idle window. A demo nobody has touched through the app counts as idle. */
export function shouldAutoRestore(drift: string[], lastActionAt: number | null, now: number): boolean {
	return drift.length > 0 && (lastActionAt === null || now - lastActionAt >= AUTO_RESTORE_IDLE_SECS);
}
