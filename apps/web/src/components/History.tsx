"use client";

import { DEMO_STOCKS, REASON } from "@bozbasket/shared";
import { isFillLeg, isGuardLeg, scaledPrice, type GuardLeg, type HistoryRow } from "@/lib/scorecard";
import { EXPLORER, symbolByMint } from "@/lib/solana";
import { fmtTs, fmtUsd, reasonLabel, short } from "@/lib/format";

const KIND: Record<HistoryRow["kind"], string> = {
	executed: "bg-mint/15 text-mint",
	deferred: "bg-amber/15 text-amber",
	skipped: "bg-white/10 text-slate-300",
	error: "bg-rose/15 text-rose",
};

const tickerOf = (feedId: string) => DEMO_STOCKS.find((s) => s.feedId === feedId.replace(/^0x/i, "").toLowerCase())?.ticker ?? feedId.slice(0, 6);

/** The one number that explains a deferral, from the guard's snapshot. */
function whyDeferred(leg: GuardLeg): string {
	const t = tickerOf(leg.feedId);
	switch (leg.reason) {
		case REASON.REFERENCE_STALE:
			return `${t} price ${leg.ageSecs >= 7200 ? `${Math.round(leg.ageSecs / 3600)} h` : `${Math.round(leg.ageSecs / 60)} min`} old`;
		case REASON.CONFIDENCE_TOO_WIDE:
			return `${t} confidence ${leg.confBps} bps`;
		case REASON.DIVERGENCE:
			return `${t} venue ${leg.divergenceBps ?? "?"} bps from reference`;
		case REASON.LOW_LIQUIDITY:
			return `${t} venue depth ${leg.liquidityUsdc === null || leg.liquidityUsdc === undefined ? "too thin" : fmtUsd(leg.liquidityUsdc, 0)} for a ${fmtUsd(leg.legUsdc)} leg`;
		default:
			return "";
	}
}

export function History({ rows, note }: { rows: HistoryRow[] | null; note: string | null }) {
	return (
		<div className="card">
			<h3 className="font-semibold">History</h3>
			<p className="text-xs text-slate-500">Every keeper pass: executions, deferrals with their reason, and off-hours skips.</p>
			{note && (
				<p className="mt-2 text-xs text-amber" title={note}>
					{note === "ledger not configured" ? "History is not configured on this deployment." : "History is temporarily unavailable. The plan's on-chain state above is unaffected."}
				</p>
			)}
			{rows === null ? (
				<p className="mt-3 text-sm text-slate-400">Loading…</p>
			) : rows.length === 0 ? (
				<p className="mt-3 text-sm text-slate-400">No keeper activity yet.</p>
			) : (
				<ul className="mt-3 divide-y divide-white/5">
					{rows.map((r) => {
						const legs: unknown[] = Array.isArray(r.legs) ? r.legs : [];
						const fills = r.kind === "executed" ? legs.filter(isFillLeg) : [];
						const failing = r.kind === "deferred" ? legs.filter(isGuardLeg).find((l) => l.reason !== REASON.OK) : undefined;
						return (
							<li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
								<div>
									<span className={`pill mr-2 ${KIND[r.kind]}`}>{r.kind}</span>
									<span className="text-slate-300">{r.kind === "executed" ? `Bought ${fmtUsd(r.usdcIn ?? 0)} across ${fills.length} legs` : reasonLabel(r.reason) ?? r.detail}</span>
									{r.forced && <span className="pill ml-2 bg-white/5 text-slate-400">demo control</span>}
									{r.kind !== "executed" && !failing && r.detail && <span className="ml-2 text-xs text-slate-500">{r.detail}</span>}
									{fills.length > 0 && (
										<p className="mt-0.5 text-xs text-slate-500">
											{fills.map((l) => `${symbolByMint(l.mint).replace(/^m/, "")} ${(Number(l.units) / 1e6).toFixed(4)} @ ${fmtUsd(scaledPrice(l.venuePrice, l.exponent))}`).join(" · ")}
										</p>
									)}
									{failing && (
										<p className="mt-0.5 text-xs text-slate-500">
											{whyDeferred(failing)}
											{r.avoidedUsdc ? ` · avoided ${fmtUsd(r.avoidedUsdc)} overpayment` : ""}
										</p>
									)}
								</div>
								<div className="text-right text-xs text-slate-500">
									<p>{fmtTs(r.ts)}</p>
									{r.signature && (
										<a className="font-mono underline" href={EXPLORER(r.signature)} target="_blank" rel="noreferrer">
											{short(r.signature, 6)}
										</a>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
