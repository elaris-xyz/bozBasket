"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LoadedPlan, Prices } from "@/lib/usePlans";
import { chartRows, type HeldBack, type TimelinePoint } from "@/lib/timeline";
import { symbolByMint } from "@/lib/solana";
import { fmtPct, fmtTs, fmtUsd, reasonLabel } from "@/lib/format";

type TimelineResponse = { points: TimelinePoint[]; heldBack: HeldBack[]; invested: number; note?: string | null; error?: string };
type Row = ReturnType<typeof chartRows>[number];

const VALUE = "#3B82F6";
const INVESTED = "#94a3b8";
const AMBER = "#F59E0B";

/** Where the plan stands now, valued exactly as the Portfolio card values it,
 *  so the line ends on the card's number. Null until every leg has a price. */
function nowPoint(plan: LoadedPlan, prices: Prices | null): TimelinePoint | null {
	if (!prices || prices.rows.length === 0) return null;
	const a = plan.account;
	let value = 0;
	for (const l of a.legs.slice(0, a.legCount)) {
		const price = prices.rows.find((p) => p.symbol === symbolByMint(l.mint.toBase58()))?.price;
		if (price === undefined) return null;
		value += (l.unitsBought.toNumber() / 1e6) * price;
	}
	const oldest = Math.max(...prices.rows.map((r) => prices.fetchedAt - r.publishTime));
	return { ts: prices.fetchedAt, invested: a.totalInvested.toNumber() / 1e6, value, stale: oldest > 120, fill: false };
}

const tickFor = (span: number) => (ts: number) =>
	new Date(ts * 1000).toLocaleString("en-US", span <= 36 * 3600 ? { weekday: "short", hour: "2-digit", minute: "2-digit" } : { month: "short", day: "numeric" });

/** Round bounds and about four ticks on a 1-2-2.5-5 step, so the axis never
 *  ends on a number like $922. */
function niceAxis(lo: number, hi: number): { domain: [number, number]; ticks: number[] } {
	const rough = Math.max(hi - lo, 1) / 4;
	const mag = 10 ** Math.floor(Math.log10(rough));
	const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= rough) ?? 10) * mag;
	const min = Math.max(0, Math.floor(lo / step) * step);
	const max = Math.ceil(hi / step) * step;
	const ticks: number[] = [];
	for (let t = min; t <= max + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
	return { domain: [min, max], ticks };
}

const fmtAxisUsd = (v: number) => (v >= 10_000 ? `$${(v / 1000).toFixed(0)}k` : v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
	if (!active || !payload?.length) return null;
	const p = payload[0].payload;
	const pnl = p.value !== null ? p.value - p.invested : null;
	return (
		<div className="rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-xs">
			<p className="text-slate-400">{fmtTs(p.ts)}</p>
			<p className="mt-1 text-slate-300">Invested {fmtUsd(p.invested)}</p>
			{p.value !== null && (
				<p className="text-slate-200">
					Value {fmtUsd(p.value)}
					{pnl !== null && p.invested > 0 && <span className={pnl >= 0 ? "text-mint" : "text-rose"}> {fmtPct((pnl / p.invested) * 100)}</span>}
				</p>
			)}
			{p.fill && <p className="text-mint">Bought here</p>}
			{p.stale && <p className="text-amber">Pyth published no price: valued at the last one</p>}
		</div>
	);
}

/** What the plan has put in and what it is worth, over its life, with the
 *  stretches in which the guard held the buy back. */
export function PortfolioChart({ plan, prices, refreshKey }: { plan: LoadedPlan; prices: Prices | null; refreshKey: number }) {
	const address = plan.address.toBase58();
	const [data, setData] = useState<TimelineResponse | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let alive = true;
		fetch(`/api/timeline?plan=${address}`)
			.then((r) => r.json())
			.then((b: TimelineResponse) => {
				if (!alive) return;
				if (b.error || !Array.isArray(b.points)) setFailed(true);
				else {
					setData(b);
					setFailed(false);
				}
			})
			.catch(() => alive && setFailed(true));
		return () => {
			alive = false;
		};
	}, [address, refreshKey]);

	if (!data) {
		if (failed) return <section className="card text-sm text-slate-400">The chart is unavailable right now. The holdings below are read from the chain and are unaffected.</section>;
		return (
			<section className="card" aria-busy="true" aria-label="Loading the chart">
				<div className="skeleton h-4 w-52" />
				<div className="skeleton mt-4 h-48" />
			</section>
		);
	}

	const now = nowPoint(plan, prices);
	const points = now && (data.points.length === 0 || now.ts > data.points[data.points.length - 1].ts) ? [...data.points, now] : data.points;
	if (points.length < 2 || points.every((p) => p.invested === 0)) {
		return (
			<section className="card">
				<h3 className="font-semibold">Invested and value over time</h3>
				<p className="mt-2 text-sm text-slate-400">The chart starts with the plan&apos;s first buy.</p>
			</section>
		);
	}

	const rows = chartRows(points);
	const first = points[0].ts;
	const last = points[points.length - 1].ts;
	const ys = points.flatMap((p) => (p.value === null ? [p.invested] : [p.invested, p.value]));
	const lo = Math.min(...ys);
	const hi = Math.max(...ys);
	const pad = Math.max((hi - lo) * 0.1, hi * 0.005, 0.5);
	const axis = niceAxis(lo - pad, hi + pad);
	const organic = data.heldBack.filter((h) => !h.forced);
	const forced = data.heldBack.length - organic.length;
	const anyStale = points.some((p) => p.stale);
	// Only the chain knows every fill: the ledger is a cache the keeper may have
	// missed a write to. The last point is the chain's, so say when they differ.
	const chainInvested = plan.account.totalInvested.toNumber() / 1e6;
	const missing = chainInvested - data.invested;

	return (
		<section className="card">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h3 className="font-semibold">Invested and value over time</h3>
				<p className="text-xs text-slate-500">Valued at the Pyth reference price, as in the portfolio below</p>
			</div>

			<ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
				<li className="inline-flex items-center gap-1.5">
					<span className="h-0.5 w-4 rounded-full" style={{ background: VALUE }} aria-hidden />
					value
				</li>
				<li className="inline-flex items-center gap-1.5">
					<span className="h-0.5 w-4 rounded-full" style={{ background: INVESTED }} aria-hidden />
					invested
				</li>
				{anyStale && (
					<li className="inline-flex items-center gap-1.5">
						<span className="w-4 border-t-2 border-dashed" style={{ borderColor: VALUE }} aria-hidden />
						no Pyth price, last one held
					</li>
				)}
				{organic.length > 0 && (
					<li className="inline-flex items-center gap-1.5">
						<span className="h-2.5 w-4 rounded-sm bg-amber/25" aria-hidden />
						guard held the buy back
					</li>
				)}
				{forced > 0 && (
					<li className="inline-flex items-center gap-1.5">
						<span className="h-2.5 w-4 rounded-sm bg-white/15" aria-hidden />
						demo control
					</li>
				)}
			</ul>

			<div className="mt-2 h-52 sm:h-64" aria-label="The plan's invested amount and its value over time, with the periods in which the guard held the buy back">
				<ResponsiveContainer>
					<ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
						<CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
						<XAxis dataKey="ts" type="number" domain={[first, last]} tickFormatter={tickFor(last - first)} stroke="#64748b" fontSize={11} tickLine={false} minTickGap={48} />
						<YAxis stroke="#64748b" fontSize={11} tickLine={false} width={48} domain={axis.domain} ticks={axis.ticks} tickFormatter={fmtAxisUsd} />
						{data.heldBack.map((h) => (
							<ReferenceArea key={`a${h.from}`} x1={h.from} x2={Math.min(h.to ?? last, last)} fill={h.forced ? "#ffffff" : AMBER} fillOpacity={h.forced ? 0.06 : 0.12} stroke="none" ifOverflow="hidden" />
						))}
						{/* A held-back buy that lasted minutes is a sliver on a week's axis;
						    the line at its start keeps it visible. */}
						{data.heldBack.map((h) => (
							<ReferenceLine key={`l${h.from}`} x={h.from} stroke={h.forced ? "rgba(255,255,255,.3)" : AMBER} strokeOpacity={0.6} ifOverflow="hidden" />
						))}
						<Tooltip content={<Tip />} />
						<Line dataKey="invested" type="stepAfter" stroke={INVESTED} strokeWidth={1.5} dot={false} isAnimationActive={false} />
						<Line dataKey="live" stroke={VALUE} strokeWidth={2} dot={false} isAnimationActive={false} />
						<Line dataKey="frozen" stroke={VALUE} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
					</ComposedChart>
				</ResponsiveContainer>
			</div>

			<p className="mt-3 text-sm text-slate-300">
				{organic.length === 0
					? "The guard has not held a scheduled buy back yet."
					: `The guard held ${organic.length === 1 ? "a scheduled buy" : `${organic.length} scheduled buys`} back${organic.length > 3 ? ", the latest three" : ""}: ${organic
							.slice(-3)
							.map((h) => `${fmtTs(h.from)}${h.to ? ` until ${fmtTs(h.to)}` : ", still waiting"}, ${reasonLabel(h.reason).toLowerCase()}, ${h.attempts} ${h.attempts === 1 ? "attempt" : "attempts"}`)
							.join("; ")}.`}
				{forced > 0 && ` ${forced} more ${forced === 1 ? "was" : "were"} caused by a demo control.`}
			</p>
			{anyStale && <p className="mt-1 text-xs text-slate-500">Dashed: Pyth published no US equity price then, so the value holds at the last one. The program does not buy on a price that old.</p>}
			{Math.abs(missing) >= 0.01 && (
				<p className="mt-1 text-xs text-slate-500">
					The chain shows {fmtUsd(Math.abs(missing))} {missing > 0 ? "more" : "less"} invested than the history lists, and the last point comes from the chain. A buy that has
					just landed reaches the history a few seconds later.
				</p>
			)}
			{data.note && <p className="mt-1 text-xs text-slate-500">{data.note}.</p>}
		</section>
	);
}
