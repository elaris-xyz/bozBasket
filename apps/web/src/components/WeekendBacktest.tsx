"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { DEMO_STOCKS } from "@bozbasket/shared";
import type { BacktestView, SymbolView } from "@/lib/backtestView";
import { fmtTs } from "@/lib/format";
import { ChartLegend } from "@/components/ChartLegend";
import { NoVooNote } from "@/components/NoVooNote";
import { TipBox, TipRow, TipTitle, type TipProps } from "@/components/ChartTip";

const REPO = "https://github.com/elaris-xyz/bozBasket/blob/main";
const Y_BOUND = 250;
const colorOf = (symbol: string) => DEMO_STOCKS.find((s) => s.ticker === symbol.replace(/x$/, ""))?.color ?? "#94a3b8";

/** One weekend hour: whose, when, and how far from the next Pyth price. */
function HourTip({ active, payload }: TipProps<{ x: number; y: number; symbol: string }>) {
	const p = active ? payload?.[0]?.payload : undefined;
	if (!p) return null;
	return (
		<TipBox>
			<TipTitle>{fmtTs(p.x)}</TipTitle>
			<TipRow color={colorOf(p.symbol)} label={`${p.symbol} vs next Pyth price`} value={`${p.y > 0 ? "+" : ""}${p.y} bps`} />
		</TipBox>
	);
}
const pct = (bps: number | null, signed = true) => (bps === null ? "–" : `${signed ? (bps >= 0 ? "+" : "−") : ""}${(Math.abs(bps) / 100).toFixed(2)}%`);
const day = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const range = (xs: (number | null)[]) => {
	const v = xs.filter((x): x is number => x !== null).map((x) => pct(x, false));
	return v.length === 0 ? "–" : v[0] === v[v.length - 1] ? v[0] : `${v[0]} to ${v[v.length - 1]}`;
};

/** The two numbers the card is about, large, and the rest in small print. */
function Tile({ s, limitBps }: { s: SymbolView; limitBps: number }) {
	const rows: [string, string][] = [
		["Worst weekend buy", s.worstOverpay ? `${pct(s.worstOverpay.bps)} (${day(s.worstOverpay.ts)})` : "–"],
		[`Weekend hours beyond ${limitBps} bps`, s.shareBeyondLimit === null ? "–" : `${(s.shareBeyondLimit * 100).toFixed(1)}%`],
		["Friday's stale price, off at reopen", `${pct(s.staleMoveMedianBps, false)} median, up to ${pct(s.staleMoveMaxBps, false)}`],
	];
	return (
		<li className="rounded-xl border border-white/10 bg-ink-900/60 p-4">
			<p className="flex flex-wrap items-baseline justify-between gap-2">
				<span className="font-semibold">
					<span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorOf(s.symbol) }} aria-hidden />
					{s.symbol}
				</span>
				<span className="text-xs text-slate-500">{s.tradedHours} traded weekend hours</span>
			</p>
			<div className="mt-3 grid grid-cols-2 gap-3">
				<div>
					<p className="text-xs text-slate-400">Weekend buy vs next Pyth price</p>
					<p className="mt-0.5 text-2xl font-semibold text-slate-50">{pct(s.weekendMedianGapBps, false)}</p>
					<p className="text-[11px] text-slate-500">median distance</p>
				</div>
				<div>
					<p className="text-xs text-slate-400">Weekdays, same pools</p>
					<p className="mt-0.5 text-2xl font-semibold text-slate-400">{pct(s.weekdayMedianGapBps, false)}</p>
					<p className="text-[11px] text-slate-500">median distance</p>
				</div>
			</div>
			<dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-white/5 pt-3 text-xs">
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
				<p className="label">The last {weekends} weekends</p>
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
			<NoVooNote missing="no weekend trade to measure" />

			<div className="mt-5">
				<ChartLegend caption="Each dot: one traded weekend hour, against the next Pyth price, in bps" series={bySymbol.map((s) => ({ name: s, color: colorOf(s) }))} shape="dot" />
				<div className="h-56 sm:h-64" aria-label="Weekend pool prices against the next Pyth price, per traded hour">
					<ResponsiveContainer>
						<ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
							<CartesianGrid stroke="rgba(170,186,210,.10)" vertical={false} />
							<XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={day} stroke="#6B7686" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} axisLine={{ stroke: "rgba(170,186,210,.10)" }} minTickGap={40} />
							<YAxis
								dataKey="y"
								type="number"
								orientation="right"
								stroke="#6B7686"
								fontSize={10}
								fontFamily="var(--font-mono)"
								tickLine={false}
								axisLine={false}
								width={44}
								domain={[-Y_BOUND, Y_BOUND]}
								ticks={[-200, -limit, 0, limit, 200]}
								tickFormatter={(v: number) => (v > 0 ? `+${v}` : String(v))}
							/>
							<ZAxis range={[40, 40]} />
							<ReferenceArea y1={-limit} y2={limit} fill="#10B981" fillOpacity={0.06} stroke="none" />
							<ReferenceArea y1={limit} y2={Y_BOUND} fill="#F59E0B" fillOpacity={0.05} stroke="none" />
							<ReferenceArea y1={-Y_BOUND} y2={-limit} fill="#F59E0B" fillOpacity={0.05} stroke="none" />
							<ReferenceLine y={limit} stroke="#F59E0B" strokeDasharray="4 4" />
							<ReferenceLine y={-limit} stroke="#F59E0B" strokeDasharray="4 4" />
							<ReferenceLine y={0} stroke="rgba(255,255,255,.2)" />
							<Tooltip cursor={false} content={(p) => <HourTip {...(p as TipProps<{ x: number; y: number; symbol: string }>)} />} />
							{bySymbol.map((symbol) => (
								<Scatter
									key={symbol}
									name={symbol}
									data={view.points.filter((p) => p.symbol === symbol).map((p) => ({ x: p.ts, y: p.bps, symbol }))}
									fill={colorOf(symbol)}
									fillOpacity={0.55}
									isAnimationActive={false}
								/>
							))}
						</ScatterChart>
					</ResponsiveContainer>
				</div>
			</div>

			<p className="mt-4 text-sm leading-relaxed text-slate-300">
				<span className="font-semibold text-slate-100">Waiting did not save money on average here.</span> A weekly buy at Saturday noon ET came in{" "}
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
			<details className="mt-3 text-xs text-slate-500">
				<summary className="cursor-pointer select-none py-1.5 text-slate-400 hover:text-slate-200">How this is measured</summary>
				<p className="mt-2">
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
			</details>
		</section>
	);
}
