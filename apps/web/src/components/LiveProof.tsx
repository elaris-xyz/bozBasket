"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { REASON } from "@bozbasket/shared";
import type { ProofResponse } from "@/app/api/proof/route";
import { fmtDuration, fmtUsd, reasonLabel } from "@/lib/format";
import { pythResumeLabel } from "@/lib/deferral";
import { SessionPill } from "@/components/SessionPill";

/** The whole pitch, demonstrated before a single click: whether the US market
 *  is open, and how old and how certain each reference price is right now. */
export function LiveProof() {
	const [data, setData] = useState<ProofResponse | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let alive = true;
		const load = () =>
			fetchJson<ProofResponse & { error?: string }>("/api/proof")
				.then((b) => {
					if (!alive) return;
					if (b.error || !Array.isArray(b.feeds) || b.feeds.length === 0) setFailed(true);
					else {
						setData(b);
						setFailed(false);
					}
				})
				.catch(() => alive && setFailed(true));
		load();
		const t = setInterval(load, 30_000);
		return () => {
			alive = false;
			clearInterval(t);
		};
	}, []);

	if (failed && !data) {
		return <section className="card text-sm text-slate-400">Live prices are unavailable right now. This panel retries every 30 seconds.</section>;
	}

	if (!data) {
		return (
			<section className="card" aria-busy="true" aria-label="Loading live prices">
				<div className="skeleton h-4 w-44" />
				<div className="skeleton mt-3 h-6 w-3/4" />
				<div className="mt-4 grid gap-3 sm:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<div key={i} className="skeleton h-20" />
					))}
				</div>
			</section>
		);
	}

	const { session, feeds, verdict, thresholds } = data;
	const oldest = feeds.reduce((m, f) => Math.max(m, f.ageSecs), 0);
	const blocked = verdict !== REASON.OK;

	let headline: string;
	let consequence: string;
	if (blocked) {
		const why = verdict === REASON.REFERENCE_STALE ? `the reference prices are ${fmtDuration(oldest)} old` : `a reference price fails the guard: ${reasonLabel(verdict).toLowerCase()}`;
		headline = `The US market is ${session.open ? "open" : "closed"}, and ${why}.`;
		consequence = "A timer-based bot would buy right now at whatever the pool says. bozBasket defers the buy and records why on chain.";
		// Older cached bodies lack the field; say nothing rather than guess.
		if (verdict === REASON.REFERENCE_STALE && (data.pythResumesInSecs ?? 0) > 0) consequence += ` Pyth publishes again ${pythResumeLabel(data.now, data.pythResumesInSecs)}, and the first fresh price lets the buy through.`;
	} else if (!session.open) {
		// The deployment runs the keeper "guarded": it judges the price, not the
		// calendar, and Pyth publishes US equities outside the regular session.
		headline = "The US regular session is closed, but Pyth is still publishing and every reference price is fresh.";
		consequence = "The guard judges the price, not the calendar, so a scheduled buy would go through now, as long as the venue quotes close to these prices.";
	} else {
		headline = "The US market is open and every reference price is fresh.";
		consequence = "The guard would let a scheduled buy through, as long as the venue quotes close to these prices.";
	}

	return (
		<section className="card" aria-live="polite">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="label">Right now, live from Pyth</p>
				<SessionPill open={session.open} secondsUntilOpen={session.secondsUntilOpen} pythResumesIn={data.pythResumesInSecs ?? 0} />
			</div>
			<p className={`mt-2 text-lg font-semibold leading-snug ${blocked ? "text-amber" : "text-mint"}`}>{headline}</p>
			<p className="mt-1 text-sm text-slate-300">{consequence}</p>
			<ul className="mt-4 grid gap-3 sm:grid-cols-3">
				{feeds.map((f) => {
					const stale = f.ageSecs > thresholds.maxStalenessSecs;
					const wide = f.confBps > thresholds.maxConfBps;
					return (
						<li key={f.ticker} className="rounded-xl border border-white/10 bg-ink-900/60 p-3">
							<div className="flex items-baseline justify-between gap-2">
								<span className="font-semibold">
									<span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: f.color }} />
									{f.ticker}
								</span>
								<span className="font-mono text-sm text-slate-200">{fmtUsd(f.price)}</span>
							</div>
							<p className="mt-0.5 truncate text-xs text-slate-500">{f.name}</p>
							<div className="mt-2 flex justify-between gap-2 text-xs">
								<span className={stale ? "text-amber" : "text-mint"}>{stale ? `${fmtDuration(f.ageSecs)} old` : "fresh"}</span>
								<span className={wide ? "text-amber" : "text-slate-400"}>conf {f.confBps.toFixed(1)} bps</span>
							</div>
						</li>
					);
				})}
			</ul>
			{data.tightened && (
				<p className="mt-3 rounded-lg bg-amber/10 px-3 py-2 text-xs text-amber">
					The on-chain limits are tighter than normal right now because someone is using the demo controls. The verdict above reflects those limits, not the market alone.
				</p>
			)}
			<p className="mt-3 text-xs text-slate-500">
				The guard defers when a price is older than {thresholds.maxStalenessSecs} s or its confidence band is wider than {thresholds.maxConfBps} bps. Both limits are read from
				the program&apos;s on-chain config.
			</p>
		</section>
	);
}
