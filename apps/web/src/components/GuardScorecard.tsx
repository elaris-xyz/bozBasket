"use client";

import type { Scorecard } from "@/lib/scorecard";
import { fmtUsd, reasonLabel } from "@/lib/format";

/** The number the whole product rests on: what did waiting actually do.
 *  Deliberately conservative, and computed in lib/scorecard.ts where it is
 *  tested: one blind fill per held-back buy however often the keeper retried,
 *  forced deferrals never counted, and losses reported alongside savings. */
export function GuardScorecard({ scorecard }: { scorecard: Scorecard | null }) {
	if (!scorecard || scorecard.deferrals + scorecard.executions === 0) return null;
	const { avoidedUsdc, staleSavedUsdc, deferrals, forcedDeferrals, executions, heldBackBuys, byReason } = scorecard;
	const reasons = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
	const signed = (n: number) => (n > 0 ? `+${fmtUsd(n)}` : n < 0 ? `−${fmtUsd(-n)}` : fmtUsd(0));

	return (
		<div className="card">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h3 className="font-semibold">What the guard did</h3>
					<p className="text-xs text-slate-500">
						{executions} execution{executions === 1 ? "" : "s"} · {heldBackBuys} scheduled buy{heldBackBuys === 1 ? "" : "s"} held back by the market, across {deferrals - forcedDeferrals}{" "}
						deferral attempt{deferrals - forcedDeferrals === 1 ? "" : "s"}
						{forcedDeferrals > 0 && ` · ${forcedDeferrals} forced from the demo controls, never counted`}
					</p>
				</div>
				<div className="flex gap-6 text-right">
					<div>
						<p className="label">Overpayment avoided</p>
						<p className={`num text-lg font-semibold ${avoidedUsdc > 0 ? "text-mint" : ""}`}>{fmtUsd(avoidedUsdc)}</p>
						<p className="text-[11px] text-slate-500">venue quoted above fair value</p>
					</div>
					<div>
						<p className="label">Waiting on stale prices</p>
						<p className={`num text-lg font-semibold ${staleSavedUsdc > 0 ? "text-mint" : staleSavedUsdc < 0 ? "text-rose" : ""}`}>{signed(staleSavedUsdc)}</p>
						<p className="text-[11px] text-slate-500">saved (+) or cost (−)</p>
					</div>
				</div>
			</div>
			{reasons.length > 0 && (
				<div className="mt-3 flex flex-wrap gap-1.5">
					{reasons.map(([reason, count]) => (
						<span key={reason} className="pill bg-white/5 text-slate-300">
							{reasonLabel(Number(reason))} × {count}
						</span>
					))}
				</div>
			)}
			<p className="mt-3 text-xs text-slate-500">
				Each held-back buy counts once, as the single fill a timer-based bot would have made at the scheduled time, however many times the keeper retried. The stale figure
				compares the stale reference price with the reference at the fill that followed: positive means the price fell in between, so buying on the old number would have
				overpaid; negative means it rose and waiting cost money. Both are shown, because a guard that only reports wins is a sales pitch, not a measurement.
			</p>
		</div>
	);
}
