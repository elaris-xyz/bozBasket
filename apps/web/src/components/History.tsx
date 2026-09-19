"use client";

import { useState } from "react";
import { DEMO_STOCKS, REASON } from "@bozbasket/shared";
import { groupHistory, type HistoryGroup } from "@/lib/historyGroups";
import { isFillLeg, isGuardLeg, scaledPrice, type GuardLeg, type HistoryRow } from "@/lib/scorecard";
import { EXPLORER, symbolByMint } from "@/lib/solana";
import { deferralDetail, fmtAge } from "@/lib/deferral";
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
			return `${t} price ${fmtAge(leg.ageSecs)} old`;
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

/** The entries shown before "show all": a plan's recent story fits a phone
 *  screen or two. */
const SHOWN = 10;

/** One entry: a buy, or a run of identical attempts told by its latest. */
function Entry({ g, legTickers }: { g: HistoryGroup; legTickers: string[] }) {
	const r = g.rows[0];
	const n = g.rows.length;
	const legs: unknown[] = Array.isArray(r.legs) ? r.legs : [];
	const fills = r.kind === "executed" ? legs.filter(isFillLeg) : [];
	const failing = r.kind === "deferred" ? legs.filter(isGuardLeg).find((l) => l.reason !== REASON.OK) : undefined;
	const fromDetail = r.kind === "deferred" && !failing ? deferralDetail(r.reason, r.detail, legTickers) : null;
	return (
		<li className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
			<div className="min-w-0">
				<span className={`pill mr-2 ${KIND[r.kind]}`}>
					{r.kind}
					{n > 1 && ` ×${n}`}
				</span>
				<span className="text-slate-300">{r.kind === "executed" ? `Bought ${fmtUsd(r.usdcIn ?? 0)} across ${fills.length} legs` : reasonLabel(r.reason) ?? r.detail}</span>
				{r.forced && <span className="pill ml-2 bg-white/5 text-slate-400">demo control</span>}
				{r.kind !== "executed" && !failing && !fromDetail && r.detail && <span className="ml-2 text-xs text-slate-500">{r.detail}</span>}
				{fromDetail && <p className="mt-0.5 text-xs text-slate-500">{fromDetail}</p>}
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
				{n > 1 && (
					<details className="mt-0.5 text-xs text-slate-500">
						<summary className="cursor-pointer select-none py-1 text-slate-400 hover:text-slate-200">
							{n} attempts since {fmtTs(g.rows[n - 1].ts)}
						</summary>
						<ul className="mt-1 space-y-0.5">
							{g.rows.map((x) => (
								<li key={x.id} className="flex justify-between gap-3">
									<span>{fmtTs(x.ts)}</span>
									{x.signature && (
										<a className="font-mono underline" href={EXPLORER(x.signature)} target="_blank" rel="noreferrer">
											{short(x.signature, 6)}
										</a>
									)}
								</li>
							))}
						</ul>
					</details>
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
}

/** `legTickers` are the plan's legs in order, for deferrals whose only detail
 *  is the on-chain "leg <index>: <value>". */
export function History({ rows, note, legTickers = [] }: { rows: HistoryRow[] | null; note: string | null; legTickers?: string[] }) {
	const [all, setAll] = useState(false);
	const groups = rows ? groupHistory(rows) : [];
	const shown = all ? groups : groups.slice(0, SHOWN);
	return (
		<div className="card">
			<h3 className="font-semibold">History</h3>
			<p className="text-xs text-slate-500">Every keeper pass: executions, deferrals with their reason, and off-hours skips. Repeated attempts with the same outcome are folded into one entry.</p>
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
				<>
					<ul className="mt-3 divide-y divide-white/5">
						{shown.map((g) => (
							<Entry key={g.rows[0].id} g={g} legTickers={legTickers} />
						))}
					</ul>
					{groups.length > SHOWN && (
						<button className="mt-2 w-full rounded-lg border border-white/10 py-2 text-xs text-slate-300 hover:bg-white/5" onClick={() => setAll((v) => !v)}>
							{all ? "Show the latest only" : `Show all ${groups.length} entries (${rows.length} attempts)`}
						</button>
					)}
				</>
			)}
		</div>
	);
}
