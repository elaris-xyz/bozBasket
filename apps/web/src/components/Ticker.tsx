"use client";

import { usePrices } from "@/lib/usePlans";
import { DEMO_STOCKS } from "@bozbasket/shared";
import { fmtDuration, fmtUsd } from "@/lib/format";

// The strip under the navigation: the three reference prices the whole product
// turns on, their age, and whether Pyth is publishing at all. Every page opens
// with the state of the market rather than with a claim about it. The prices
// come from the same /api/prices the cards use, so the strip cannot disagree
// with them.
export function Ticker() {
	const prices = usePrices();
	if (!prices || prices.rows.length === 0) return null;
	const oldest = Math.max(...prices.rows.map((r) => prices.fetchedAt - r.publishTime));
	const stale = oldest > 120;
	return (
		<div className="border-b border-white/5 bg-ink-900/60">
			<div className="mx-auto flex max-w-6xl items-center gap-4 overflow-x-auto px-4 py-1.5 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{prices.rows.map((r) => {
					const color = DEMO_STOCKS.find((s) => s.symbol === r.symbol)?.color ?? "#8C97A8";
					return (
						<span key={r.symbol} className="flex shrink-0 items-center gap-1.5" title={`${r.ticker} reference price from Pyth`}>
							<span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
							<span className="text-slate-400">{r.ticker}</span>
							<span className="num text-slate-100">{fmtUsd(r.price)}</span>
						</span>
					);
				})}
				<span className={`shrink-0 num ${stale ? "text-amber" : "text-slate-500"}`}>{stale ? `${fmtDuration(oldest)} old` : "live"}</span>
				<span className="shrink-0 text-slate-500">
					{prices.marketHours ? (prices.marketHours.isOpen ? "US session open" : "US session closed") : ""}
				</span>
			</div>
		</div>
	);
}
