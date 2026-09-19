"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLegend } from "@/components/ChartLegend";
import { NoVooNote } from "@/components/NoVooNote";
import { TipBox, TipRow, TipTitle, type TipProps } from "@/components/ChartTip";
import { DEMO_STOCKS, REASON } from "@bozbasket/shared";
import type { ShadowResponse } from "@/app/api/shadow/route";
import type { ShadowPoint } from "@/lib/shadow";
import { fmtDuration, fmtTs, fmtUsd, reasonLabel } from "@/lib/format";

const colorOf = (symbol: string) => DEMO_STOCKS.find((s) => s.ticker === symbol.replace(/x$/, ""))?.color ?? "#94a3b8";
/** One check time, each xStock's gap to Pyth in its own colour. */
function GapTip({ active, payload, label }: TipProps) {
	if (!active || !payload?.length) return null;
	return (
		<TipBox>
			<TipTitle>{fmtTs(Number(label))}</TipTitle>
			{payload
				.filter((i) => i.value !== null && i.value !== undefined)
				.map((i) => (
					<TipRow key={String(i.name)} color={i.color} label={String(i.name)} value={`${Number(i.value) > 0 ? "+" : ""}${i.value} bps`} />
				))}
		</TipBox>
	);
}

const fmtGap = (bps: number) => `${bps >= 0 ? "+" : "−"}${(Math.abs(bps) / 100).toFixed(2)}%`;
const tickTime = (ts: number) => new Date(ts * 1000).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" });

function headline(rows: ShadowPoint[]): { text: string; blocked: boolean } {
	const judged = rows.filter((r) => r.reason !== null);
	if (judged.length === 0) return { text: "The latest mainnet check could not reach a verdict. The next one runs within five minutes.", blocked: true };
	const stale = judged.find((r) => r.reason === REASON.REFERENCE_STALE);
	if (stale) return { text: `xStocks keep trading on mainnet while the Pyth price is ${fmtDuration(stale.refAgeSecs ?? 0)} old. The guard would defer.`, blocked: true };
	const blocked = judged.filter((r) => r.reason !== REASON.OK);
	if (blocked.length) return { text: `${blocked.map((r) => `${r.symbol}: ${reasonLabel(r.reason as number).toLowerCase()}`).join("; ")}. The guard would defer.`, blocked: true };
	const gaps = judged.map((r) => `${r.symbol} ${fmtGap(r.divergenceBps ?? 0)}`).join(", ");
	return { text: `$100 on Jupiter right now: ${gaps} against the Pyth price. The guard would buy.`, blocked: false };
}

/** The problem on the real market: what a $100 xStock buy on Solana mainnet
 *  costs against Pyth right now, and what the guard would do. Read-only. */
export function MainnetShadow() {
	const [data, setData] = useState<ShadowResponse | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let alive = true;
		const load = () =>
			fetch("/api/shadow")
				.then((r) => r.json())
				.then((b) => {
					if (!alive) return;
					if (b.error || !b.summary) setFailed(true);
					else {
						setData(b);
						setFailed(false);
					}
				})
				.catch(() => alive && setFailed(true));
		load();
		const t = setInterval(load, 60_000);
		return () => {
			alive = false;
			clearInterval(t);
		};
	}, []);

	if (!data) {
		if (failed) return <section className="card text-sm text-slate-400">The mainnet check is unavailable right now. This panel retries every minute.</section>;
		return (
			<section className="card" aria-busy="true" aria-label="Loading the mainnet check">
				<div className="skeleton h-4 w-52" />
				<div className="skeleton mt-3 h-6 w-3/4" />
				<div className="skeleton mt-4 h-40" />
			</section>
		);
	}

	const { symbols, latest, series, summary, limits } = data;
	const rows = symbols.map((s) => latest[s]).filter((r): r is ShadowPoint => !!r);
	if (rows.length === 0) {
		return <section className="card text-sm text-slate-400">Collecting: the keeper checks the xStocks on Solana mainnet every five minutes.</section>;
	}

	const head = headline(rows);
	// Symmetric around zero with the guard's limit always in view, and ticks
	// short enough for a narrow axis: "-175 bp" wrapped onto the time axis.
	const limit = limits.maxDivergenceBps;
	const maxAbs = series.reduce((m, r) => Math.max(m, ...symbols.map((s) => Math.abs(r[s] ?? 0))), 0);
	const bound = Math.ceil(Math.max(maxAbs, limit + 25) / 25) * 25;
	const ticks = [...(bound > limit + 25 ? [-bound] : []), -limit, -limit / 2, 0, limit / 2, limit, ...(bound > limit + 25 ? [bound] : [])];
	const deferrals = Object.entries(summary.byReason).sort(([, a], [, b]) => b - a);
	const worst = summary.worstPremium;

	return (
		<section className="card" aria-live="polite">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="label">The real market: xStocks on Solana mainnet</p>
				<span className="pill bg-white/10 text-slate-300">read-only · every 5 min</span>
			</div>
			<p className={`mt-2 text-lg font-semibold leading-snug ${head.blocked ? "text-amber" : "text-mint"}`}>{head.text}</p>

			<ul className="mt-4 grid gap-3 sm:grid-cols-2">
				{rows.map((r) => {
					const wide = r.divergenceBps !== null && Math.abs(r.divergenceBps) > limits.maxDivergenceBps;
					const stale = r.refAgeSecs !== null && r.refAgeSecs > limits.maxStalenessSecs;
					return (
						<li key={r.symbol} className="rounded-xl border border-white/10 bg-ink-900/60 p-3">
							<div className="flex items-baseline justify-between gap-2">
								<span className="font-semibold">
									<span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorOf(r.symbol) }} />
									{r.symbol}
								</span>
								<span className={`pill ${r.reason === REASON.OK ? "bg-mint/15 text-mint" : "bg-amber/15 text-amber"}`}>
									{r.reason === null ? "no verdict" : r.reason === REASON.OK ? "would buy" : `would defer: ${reasonLabel(r.reason).toLowerCase()}`}
								</span>
							</div>
							{r.venuePrice === null || r.refPrice === null ? (
								<p className="mt-2 text-xs text-slate-500">{r.error ?? "no price"}</p>
							) : (
								<dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
									<dt className="text-slate-500">Jupiter, per share</dt>
									<dd className="text-right font-mono text-slate-200">{fmtUsd(r.venuePrice)}</dd>
									<dt className="text-slate-500">Pyth</dt>
									<dd className="text-right font-mono text-slate-200">
										{fmtUsd(r.refPrice)} <span className={stale ? "text-amber" : "text-slate-500"}>· {stale ? `${fmtDuration(r.refAgeSecs ?? 0)} old` : "fresh"}</span>
									</dd>
									<dt className="text-slate-500">Gap</dt>
									<dd className={`text-right font-mono ${wide ? "text-amber" : "text-slate-200"}`}>{fmtGap(r.divergenceBps ?? 0)}</dd>
								</dl>
							)}
						</li>
					);
				})}
			</ul>
			<NoVooNote missing="no market price to check" />

			{series.length >= 2 ? (
				<div className="mt-4">
					<ChartLegend caption="Gap to the Pyth price, in bps" series={symbols.map((s) => ({ name: s, color: colorOf(s) }))} shape="line" />
					<div className="h-48 sm:h-56" aria-label="Gap between the Jupiter price and the Pyth price over time, in basis points">
						<ResponsiveContainer>
							<LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
								<CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
								<XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} tickFormatter={tickTime} stroke="#64748b" fontSize={11} tickLine={false} minTickGap={48} />
								<YAxis
									stroke="#64748b"
									fontSize={11}
									tickLine={false}
									width={40}
									domain={[-bound, bound]}
									ticks={ticks}
									tickFormatter={(v: number) => (v > 0 ? `+${v}` : String(v))}
								/>
								<ReferenceArea y1={-limit} y2={limit} fill="#10B981" fillOpacity={0.06} stroke="none" />
								<ReferenceArea y1={limit} y2={bound} fill="#F59E0B" fillOpacity={0.05} stroke="none" />
								<ReferenceArea y1={-bound} y2={-limit} fill="#F59E0B" fillOpacity={0.05} stroke="none" />
								<ReferenceLine y={limit} stroke="#F59E0B" strokeDasharray="4 4" />
								<ReferenceLine y={-limit} stroke="#F59E0B" strokeDasharray="4 4" />
								<ReferenceLine y={0} stroke="rgba(255,255,255,.2)" />
								<Tooltip content={(p) => <GapTip {...(p as TipProps)} />} />
								{symbols.map((s) => (
									<Line key={s} dataKey={s} stroke={colorOf(s)} dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
								))}
							</LineChart>
						</ResponsiveContainer>
					</div>
				</div>
			) : (
				<p className="mt-4 text-xs text-slate-500">The chart fills in as checks arrive, one every five minutes.</p>
			)}

			{summary.since !== null && (
				<p className="mt-3 text-sm text-slate-300">
					{summary.checks} price checks across {symbols.join(" and ")} since {fmtTs(summary.since)}. The guard would have bought {summary.wouldBuy} times
					{deferrals.length > 0 ? ` and deferred ${deferrals.map(([reason, n]) => `${n} for ${reasonLabel(Number(reason)).toLowerCase()}`).join(", ")}` : " and deferred none"}.
					{worst
						? ` The most a blind $100 buy would have paid over Pyth: ${fmtGap(worst.bps)} on ${worst.symbol}, ${fmtTs(worst.ts)}, when the guard would have ${worst.reason === REASON.OK ? "bought, inside its limit" : `deferred for ${reasonLabel(worst.reason).toLowerCase()}`}.`
						: " No buy would have paid more than the Pyth price."}
					{summary.medianGapBps.stale === null
						? " No stale window yet; the next one starts Friday 20:00 ET."
						: ` Median gap: ${summary.medianGapBps.fresh?.toFixed(0) ?? "–"} bps with a fresh Pyth price, ${summary.medianGapBps.stale.toFixed(0)} bps with a stale one.`}
				</p>
			)}

			<details className="mt-3 text-xs text-slate-500">
				<summary className="cursor-pointer select-none py-1.5 text-slate-400 hover:text-slate-200">How this is measured</summary>
				<p className="mt-2">
				Nothing is bought on mainnet. Every five minutes the keeper asks Jupiter what $100 of USDC buys in each xStock and runs the answer through the same guard code,
				with the default limits: {limits.maxStalenessSecs} s staleness, {limits.maxConfBps} bps confidence, {limits.maxDivergenceBps} bps gap (dashed). Share counts include
				the issuer&apos;s multiplier. VOOx is left out: no pool holds it, so Jupiter finds no route.
				</p>
			</details>
		</section>
	);
}
