"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { DEMO_STOCKS } from "@bozbasket/shared";
import type { BacktestView, SymbolView } from "@/lib/backtestView";
import { fmtTs } from "@/lib/format";

const REPO = "https://github.com/elaris-xyz/bozBasket/blob/main";
const colorOf = (symbol: string) => DEMO_STOCKS.find((s) => s.ticker === symbol.replace(/x$/, ""))?.color ?? "#94a3b8";
const pct = (bps: number | null, signed = true) => (bps === null ? "–" : `${signed ? (bps >= 0 ? "+" : "−") : ""}${(Math.abs(bps) / 100).toFixed(2)}%`);
const day = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const range = (xs: (number | null)[]) => {
	const v = xs.filter((x): x is number => x !== null).map((x) => pct(x, false));
	return v.length === 0 ? "–" : v[0] === v[v.length - 1] ? v[0] : `${v[0]} to ${v[v.length - 1]}`;
};

function Tile({ s, limitBps }: { s: SymbolView; limitBps: number }) {
	const rows: [string, string][] = [
		["Weekend buy vs the next Pyth price, median", pct(s.weekendMedianGapBps, false)],
		["Weekday pool vs Pyth, same moment, median", pct(s.weekdayMedianGapBps, false)],
		["Worst weekend buy", s.worstOverpay ? `${pct(s.worstOverpay.bps)} (${day(s.worstOverpay.ts)})` : "–"],
		[`Weekend hours beyond ${limitBps} bps`, s.shareBeyondLimit === null ? "–" : `${(s.shareBeyondLimit * 100).toFixed(1)}%`],
		["Friday's stale price, off at reopen", `${pct(s.staleMoveMedianBps, false)} median, up to ${pct(s.staleMoveMaxBps, false)}`],
	];
	return (
		<li className="rounded-xl border border-white/10 bg-ink-900/60 p-3">
			<p className="font-semibold">
				<span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorOf(s.symbol) }} />
				{s.symbol}
				<span className="ml-2 text-xs font-normal text-slate-500">{s.tradedHours} traded weekend hours</span>
			</p>
			<dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
				{rows.map(([k, v]) => (
					<div key={k} className="contents">
						<dt className="text-slate-500">{k}</dt>
						<dd className="text-right font-mono text-slate-200">{v}</dd>
					</div>
				))}
			</dl>
		</li>
	);
}

/** Eight real weekends of xStock trading against Pyth, including the parts that
 *  do not flatter the guard. */
export function WeekendBacktest() {
	const [view, setView] = useState<BacktestView | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		fetch("/api/backtest")
			.then((r) => r.json())
			.then((b: BacktestView) => (Array.isArray(b.symbols) ? setView(b) : setFailed(true)))
			.catch(() => setFailed(true));
	}, []);

	if (failed) return null;
	if (!view) {
		return (
			<section className="card" aria-busy="true" aria-label="Loading the weekend backtest">
				<div className="skeleton h-4 w-56" />
				<div className="skeleton mt-3 h-6 w-3/4" />
				<div className="skeleton mt-4 h-40" />
			</section>
		);
	}

	const weekends = Math.max(...view.symbols.map((s) => s.weekends));
	const bySymbol = view.symbols.map((s) => s.symbol);
	const worst = view.symbols.reduce<SymbolView | null>((w, s) => (s.worstOverpay && (!w?.worstOverpay || s.worstOverpay.bps > w.worstOverpay.bps) ? s : w), null);
	const cheapest = view.symbols.reduce<SymbolView | null>((w, s) => (s.bestUnderpayBps !== null && (w?.bestUnderpayBps == null || s.bestUnderpayBps < w.bestUnderpayBps) ? s : w), null);
	const limit = view.limitBps;
	const overpaid = view.symbols.map((s) => `${s.timerOverpaid} of ${s.timerWeekends}`);

	return (
		<section className="card">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="label">The last {weekends} weekends, measured</p>
				<span className="pill bg-white/10 text-slate-300">real pool trades · Pyth history</span>
			</div>
			<p className="mt-2 text-lg font-semibold leading-snug text-slate-100">
				A blind weekend buy landed a median {range(view.symbols.map((s) => s.weekendMedianGapBps).sort((a, b) => (a ?? 0) - (b ?? 0)))} from the next price Pyth
				published. On weekdays the same pools sit {range(view.symbols.map((s) => s.weekdayMedianGapBps).sort((a, b) => (a ?? 0) - (b ?? 0)))} from Pyth.
			</p>

			<ul className="mt-4 grid gap-3 sm:grid-cols-2">
				{view.symbols.map((s) => (
					<Tile key={s.symbol} s={s} limitBps={limit} />
				))}
			</ul>

			<div className="mt-4">
				<p className="mb-1 text-xs text-slate-500">Each dot is one weekend hour in which the pool traded: its price against the next Pyth price, in bps. Dashed: the guard&apos;s limit.</p>
				<div className="h-56" aria-label="Weekend pool prices against the next Pyth price, per traded hour">
					<ResponsiveContainer>
						<ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
							<CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
							<XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={day} stroke="#64748b" fontSize={11} tickLine={false} minTickGap={40} />
							<YAxis dataKey="y" type="number" stroke="#64748b" fontSize={11} tickLine={false} width={40} domain={[-250, 250]} ticks={[-200, -limit, 0, limit, 200]} tickFormatter={(v: number) => (v > 0 ? `+${v}` : String(v))} />
							<ZAxis range={[10, 10]} />
							<ReferenceLine y={limit} stroke="#F59E0B" strokeDasharray="4 4" />
							<ReferenceLine y={-limit} stroke="#F59E0B" strokeDasharray="4 4" />
							<ReferenceLine y={0} stroke="rgba(255,255,255,.2)" />
							<Tooltip
								cursor={false}
								formatter={(v: number, name: string) => (name === "y" ? [`${v > 0 ? "+" : ""}${v} bps`, "vs next Pyth price"] : [fmtTs(v), "hour"])}
								contentStyle={{ background: "#0f1629", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }}
							/>
							{bySymbol.map((symbol) => (
								<Scatter
									key={symbol}
									name={symbol}
									data={view.points.filter((p) => p.symbol === symbol).map((p) => ({ x: p.ts, y: p.bps }))}
									fill={colorOf(symbol)}
									fillOpacity={0.7}
									isAnimationActive={false}
								/>
							))}
						</ScatterChart>
					</ResponsiveContainer>
				</div>
			</div>

			<p className="mt-3 text-sm text-slate-300">
				Waiting did not save money on average here. A weekly buy at Saturday noon ET came in{" "}
				{view.symbols.map((s, i) => (
					<span key={s.symbol}>
						{i > 0 && " and "}
						{pct(s.timerMeanBps)} on {s.symbol}
					</span>
				))}{" "}
				against the price Pyth came back at, and paid more on {overpaid.every((c) => c === overpaid[0]) ? `${overpaid[0]} weekends for each` : `${overpaid.join(" and ")} weekends`}. What the guard
				removes is the uncertainty, not a premium: a blind buy landed anywhere from {cheapest ? `${pct(cheapest.bestUnderpayBps)} (${cheapest.symbol})` : "–"} to{" "}
				{worst?.worstOverpay ? `${pct(worst.worstOverpay.bps)} (${worst.symbol})` : "–"} against the first price anyone could vouch for, while the Friday price a timer would
				have trusted was already stale.
			</p>
			<p className="mt-3 text-xs text-slate-500">
				Weekends of {view.from} to {view.to}. Pool prices are hourly closes of the deepest USDC pool of each xStock (GeckoTerminal), per share; Pyth prices come from its
				history, which reaches back about eight weeks. The weekend measure spans up to two days of market movement; the weekday one compares prices at the same moment.{" "}
				<a className="underline" href={`${REPO}/apps/keeper/scripts/backtest-weekends.ts`} target="_blank" rel="noreferrer">
					Reproduce it
				</a>{" "}
				or read{" "}
				<a className="underline" href={`${REPO}/deploy/weekend-backtest.json`} target="_blank" rel="noreferrer">
					the data
				</a>
				.
			</p>
		</section>
	);
}
