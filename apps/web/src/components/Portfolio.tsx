"use client";

import { DEMO_STOCKS } from "@bozbasket/shared";
import type { LoadedPlan, Prices } from "@/lib/usePlans";
import { symbolByMint } from "@/lib/solana";
import { fmtPct, fmtUnits, fmtUsd } from "@/lib/format";

/** One labelled number in the stacked phone layout. */
function Stat({ k, v }: { k: string; v: string }) {
	return (
		<>
			<dt className="text-slate-500">{k}</dt>
			<dd className="text-right font-mono text-slate-300">{v}</dd>
		</>
	);
}

/** Holdings, average cost and P&L per leg from on-chain state plus the
 *  latest reference price. units_bought and total_invested are cumulative
 *  on the Plan; per-leg invested is weight × total_invested, which is exact
 *  because every execution spends the same split. */
export function Portfolio({ plan, prices }: { plan: LoadedPlan; prices: Prices | null }) {
	const a = plan.account;
	const invested = a.totalInvested.toNumber() / 1e6;
	const rows = a.legs.slice(0, a.legCount).map((l) => {
		const symbol = symbolByMint(l.mint.toBase58());
		const stock = DEMO_STOCKS.find((s) => s.symbol === symbol);
		const units = l.unitsBought.toNumber() / 1e6;
		const legInvested = (invested * l.weightBps) / 10_000;
		const price = prices?.rows.find((p) => p.symbol === symbol)?.price ?? null;
		const value = price !== null ? units * price : null;
		return { symbol, ticker: stock?.ticker ?? symbol, color: stock?.color ?? "#94a3b8", weight: l.weightBps / 100, units, legInvested, avgCost: units > 0 ? legInvested / units : null, price, value };
	});
	const value = rows.every((r) => r.value !== null) ? rows.reduce((s, r) => s + (r.value ?? 0), 0) : null;
	const pnl = value !== null ? value - invested : null;
	const dash = (n: number | null) => (n === null ? "—" : fmtUsd(n));

	return (
		<div className="card">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h3 className="font-semibold">Portfolio</h3>
					<p className="text-xs text-slate-500">Valued at the latest Pyth reference price{prices?.marketHours && !prices.marketHours.isOpen ? " (last close; market is closed)" : ""}.</p>
				</div>
				<div className="grid w-full grid-cols-3 gap-3 sm:flex sm:w-auto sm:gap-6 sm:text-right">
					<div>
						<p className="label">Invested</p>
						<p className="text-lg font-bold">{fmtUsd(invested)}</p>
					</div>
					<div>
						<p className="label">Value</p>
						<p className="text-lg font-bold">{dash(value)}</p>
					</div>
					<div>
						<p className="label">P&amp;L</p>
						<p className={`text-lg font-bold ${pnl === null ? "" : pnl >= 0 ? "text-mint" : "text-rose"}`}>{dash(pnl)}</p>
						{pnl !== null && <p className={`text-xs ${pnl >= 0 ? "text-mint" : "text-rose"}`}>{fmtPct(invested > 0 ? (pnl / invested) * 100 : 0)}</p>}
					</div>
				</div>
			</div>

			{/* Phones: one card per holding. */}
			<ul className="mt-4 space-y-2 sm:hidden">
				{rows.map((r) => (
					<li key={r.symbol} className="rounded-xl border border-white/10 bg-ink-900/60 p-3">
						<div className="flex items-center justify-between gap-2">
							<span className="font-semibold">
								<span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
								{r.ticker} <span className="text-xs font-normal text-slate-500">{r.weight}%</span>
							</span>
							<span className="font-mono text-sm text-slate-200">{dash(r.value)}</span>
						</div>
						<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
							<Stat k="Units" v={fmtUnits(r.units)} />
							<Stat k="Avg cost" v={dash(r.avgCost)} />
							<Stat k="Price" v={dash(r.price)} />
						</dl>
					</li>
				))}
			</ul>

			{/* Wider screens: the full table. */}
			<div className="mt-4 hidden overflow-x-auto sm:block">
				<table className="w-full text-sm">
					<thead className="text-left text-xs uppercase text-slate-500">
						<tr>
							<th className="py-1">Stock</th>
							<th>Weight</th>
							<th className="text-right">Units</th>
							<th className="text-right">Avg cost</th>
							<th className="text-right">Price</th>
							<th className="text-right">Value</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.symbol} className="border-t border-white/5">
								<td className="py-2">
									<span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
									{r.ticker}
								</td>
								<td>{r.weight}%</td>
								<td className="text-right font-mono">{fmtUnits(r.units)}</td>
								<td className="text-right font-mono">{dash(r.avgCost)}</td>
								<td className="text-right font-mono">{dash(r.price)}</td>
								<td className="text-right font-mono">{dash(r.value)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
