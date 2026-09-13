"use client";

import { useCallback, useEffect, useState } from "react";
import type { GuardResponse } from "@/app/api/guard/route";
import { fmtDuration, fmtUsd, reasonLabel } from "@/lib/format";

const verdictClass = (reason: number) => (reason === 0 ? "bg-mint/15 text-mint" : "bg-amber/15 text-amber");
const cell = (bad: boolean) => `text-right font-mono ${bad ? "text-amber" : "text-slate-300"}`;

/** The visual proof of the differentiator: every number `execute_basket`
 *  will check, and the verdict those numbers produce. */
export function GuardPanel({ plan, refreshKey }: { plan: string; refreshKey: number }) {
	const [data, setData] = useState<GuardResponse | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(() => {
		fetch(`/api/guard?plan=${plan}`)
			.then((r) => r.json())
			.then((b) => (b.error ? setError(b.error) : (setData(b), setError(null))))
			.catch((e) => setError(String(e)));
	}, [plan]);

	useEffect(() => {
		load();
		const t = setInterval(load, 15_000);
		return () => clearInterval(t);
	}, [load, refreshKey]);

	if (error) return <div className="card text-sm text-rose">Guard unavailable: {error}</div>;
	if (!data) return <div className="card text-sm text-slate-400">Reading the guard…</div>;

	const t = data.thresholds;
	const blocked = data.verdict.reason !== 0;

	return (
		<div className="card">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h3 className="font-semibold">Execution guard</h3>
					<p className="text-xs text-slate-500">
						What the program would decide right now. Thresholds live on chain: {t.maxStalenessSecs}s staleness, {t.maxConfBps} bps confidence, {t.maxDivergenceBps} bps divergence,{" "}
						{fmtUsd(t.minLiquidityUsdc, 0)} depth.
					</p>
				</div>
				<span className={`pill ${verdictClass(data.verdict.reason)}`}>
					{blocked ? `Would defer: ${reasonLabel(data.verdict.reason)}` : "Would execute"}
					{data.verdict.legIndex !== null && ` (${data.legs[data.verdict.legIndex].ticker})`}
				</span>
			</div>

			<div className="mt-3 flex flex-wrap gap-2 text-xs">
				<span className={`pill ${data.session.open ? "bg-mint/15 text-mint" : "bg-white/10 text-slate-300"}`}>
					US session {data.session.open ? "open" : `closed · ${data.session.label}`}
					{data.session.secondsUntilOpen !== null && ` · opens in ${fmtDuration(data.session.secondsUntilOpen)}`}
				</span>
				<span className="pill bg-white/5 text-slate-400">
					reference: {data.referenceMode === "pyth" ? "Pyth receiver" : "mock, restamped by the keeper (devnet demo)"}
				</span>
				<span className="pill bg-white/5 text-slate-400">
					vault {fmtUsd(data.vaultUsdc)} / {fmtUsd(data.amountPerPeriod)} per period
				</span>
			</div>

			<div className="mt-3 overflow-x-auto">
				<table className="w-full text-sm">
					<thead className="text-left text-xs uppercase text-slate-500">
						<tr>
							<th className="py-1">Leg</th>
							<th className="text-right">Reference</th>
							<th className="text-right">Conf</th>
							<th className="text-right">Age</th>
							<th className="text-right">Venue</th>
							<th className="text-right">Divergence</th>
							<th className="text-right">Depth</th>
							<th className="text-right">Buys</th>
							<th className="text-right">Verdict</th>
						</tr>
					</thead>
					<tbody>
						{data.legs.map((l) => (
							<tr key={l.symbol} className="border-t border-white/5">
								<td className="py-2 font-semibold">
									{l.ticker}
									{l.overridden && <span className="ml-1 text-xs font-normal text-amber">forced</span>}
								</td>
								<td className={cell(false)}>{fmtUsd(l.referencePrice)}</td>
								<td className={cell(l.confBps > t.maxConfBps)}>{l.confBps.toFixed(1)} bps</td>
								<td className={cell(l.ageSecs > t.maxStalenessSecs)}>{fmtDuration(l.ageSecs)}</td>
								<td className={cell(false)}>{l.venuePrice === null ? "—" : fmtUsd(l.venuePrice)}</td>
								<td className={cell((l.divergenceBps ?? 0) > t.maxDivergenceBps)}>{l.divergenceBps === null ? "—" : `${l.divergenceBps} bps`}</td>
								<td className={cell(l.liquidityUsdc !== null && (l.liquidityUsdc < l.legUsdc || l.liquidityUsdc < t.minLiquidityUsdc))}>
									{l.liquidityUsdc === null ? "—" : fmtUsd(l.liquidityUsdc, 0)}
								</td>
								<td className={cell(false)}>{fmtUsd(l.legUsdc)}</td>
								<td className="text-right">
									<span className={`pill ${verdictClass(l.reason)}`}>{l.reason === 0 ? "pass" : reasonLabel(l.reason)}</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="mt-2 text-xs text-slate-500">
				The program recomputes all of this from the accounts in the transaction and decides on its own; this panel runs the same shared code so the reader sees the same
				numbers.
			</p>
		</div>
	);
}
