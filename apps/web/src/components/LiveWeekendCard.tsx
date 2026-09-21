import type { LiveWeekendView } from "@/lib/liveWeekend";

const bps = (v: number | null, digits = 0) => (v === null ? "–" : `${v.toFixed(digits)} bps`);
const small = (v: number | null) => bps(v, v !== null && Math.abs(v) < 10 ? 1 : 0);
const saturday = (v: number | null) => (v === null ? "–" : v < 0 ? `${Math.abs(v).toFixed(0)} bps cheaper` : `${v.toFixed(0)} bps dearer`);
const joined = (xs: number[]) => [...new Set(xs)].join(" and ");

/** "18–20 September", from the Friday the pause began. */
function dates(friday: string): string {
	const f = new Date(`${friday}T12:00:00Z`);
	const sun = new Date(f.getTime() + 2 * 86_400_000);
	const month = (d: Date) => d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
	return month(f) === month(sun) ? `${f.getUTCDate()}–${sun.getUTCDate()} ${month(sun)}` : `${f.getUTCDate()} ${month(f)} – ${sun.getUTCDate()} ${month(sun)}`;
}

/** The weekend the live mainnet check measured last. Every sentence below is
 *  built from the file, because the next weekend may read the other way. */
export function LiveWeekendCard({ live, limitBps }: { live: LiveWeekendView; limitBps: number }) {
	const s = live.symbols;
	const ratios = s.filter((x) => x.weekendGapBps !== null && x.weekdayGapBps).map((x) => Math.round((x.weekendGapBps as number) / (x.weekdayGapBps as number)));
	const beyond = s.reduce((n, x) => n + x.hoursBeyondLimit, 0);
	const noon = s.map((x) => x.saturdayNoonBps).filter((v): v is number => v !== null);
	const drift = ratios.length ? `about ${Math.min(...ratios) === Math.max(...ratios) ? Math.min(...ratios) : `${Math.min(...ratios)}–${Math.max(...ratios)}`} times their weekday gap` : "away from their weekday gap";
	const limit = beyond === 0 ? "never far enough to trip the limit" : `${beyond} traded hours beyond the limit`;
	const waiting =
		noon.length && noon.every((v) => v < 0)
			? "and a blind Saturday buy would have come in cheaper than waiting"
			: noon.length && noon.every((v) => v > 0)
				? "and a blind Saturday buy would have paid more than waiting"
				: "and a blind Saturday buy would have come in cheaper on one stock and dearer on the other";

	return (
		<section className="card">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="label">Last weekend, measured live</p>
				<span className="pill bg-white/10 text-slate-300">{dates(live.friday)} · Jupiter quotes every 5 min</span>
			</div>
			<p className="mt-2 text-lg font-semibold leading-snug text-slate-100">
				Pyth was silent for {live.pauseHours} hours. The live check ran {joined(s.map((x) => x.checks))} times per stock, and the guard would have deferred{" "}
				{joined(s.map((x) => x.wouldDefer))}.
			</p>

			<div className="mt-4 overflow-x-auto">
				<table className="w-full min-w-[420px] text-sm">
					<thead>
						<tr className="text-left">
							<th className="label pb-2 font-medium" />
							{s.map((x) => (
								<th key={x.symbol} className="pb-2 text-right text-xs font-medium text-slate-300">
									{x.symbol}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-white/5">
						<tr>
							<td className="py-2 text-slate-400">Pool vs Pyth&apos;s first price back, median</td>
							{s.map((x) => (
								<td key={x.symbol} className="num py-2 text-right text-slate-100">
									{bps(x.weekendGapBps)}
								</td>
							))}
						</tr>
						<tr>
							<td className="py-2 text-slate-400">Same pools, on the weekdays before</td>
							{s.map((x) => (
								<td key={x.symbol} className="num py-2 text-right text-slate-300">
									{small(x.weekdayGapBps)}
								</td>
							))}
						</tr>
						<tr>
							<td className="py-2 text-slate-400">Traded hours beyond the {limitBps} bps limit</td>
							{s.map((x) => (
								<td key={x.symbol} className="num py-2 text-right text-slate-300">
									{x.hoursBeyondLimit} of {x.tradedHours}
								</td>
							))}
						</tr>
						<tr>
							<td className="py-2 text-slate-400">A blind buy at Saturday noon ET</td>
							{s.map((x) => (
								<td key={x.symbol} className="num py-2 text-right text-slate-300">
									{saturday(x.saturdayNoonBps)}
								</td>
							))}
						</tr>
					</tbody>
				</table>
			</div>

			<p className="mt-3 text-sm text-slate-400">
				The pools drifted {drift}, {limit}, {waiting}. The guard removes the uncertainty, not a premium; the eight weekends below show how wide that uncertainty runs.
			</p>
		</section>
	);
}
