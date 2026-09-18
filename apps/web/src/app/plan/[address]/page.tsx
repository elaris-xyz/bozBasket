"use client";

import { use, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePlan, usePrices } from "@/lib/usePlans";
import { EXPLORER, EXPLORER_ACCOUNT, symbolByMint } from "@/lib/solana";
import { REASON, secondsUntilPythPublishes } from "@bozbasket/shared";
import { cadenceLabel, fmtTs, fmtUsd, reasonLabel, short } from "@/lib/format";
import { retryNote } from "@/lib/deferral";
import { Countdown } from "@/components/Countdown";
import { StatusPill } from "@/components/StatusPill";
import { PlanActions } from "@/components/PlanActions";
import { Portfolio } from "@/components/Portfolio";
import { PortfolioChart } from "@/components/PortfolioChart";
import { History } from "@/components/History";
import { GuardScorecard } from "@/components/GuardScorecard";
import { useHistory } from "@/lib/useHistory";
import { GuardPanel } from "@/components/GuardPanel";
import { KeeperStatus } from "@/components/KeeperStatus";

export default function PlanPage({ params }: { params: Promise<{ address: string }> }) {
	const { address } = use(params);
	const created = useSearchParams().get("created");
	const { plan, error, reload } = usePlan(address);
	const prices = usePrices();
	const [refreshKey, setRefreshKey] = useState(0);
	const history = useHistory(address, refreshKey);
	const onDone = () => {
		reload();
		setRefreshKey((k) => k + 1);
	};

	// The plan is re-read from the chain every 20 s, but History, the scorecard
	// and the chart read the ledger only when asked. A buy the keeper makes in
	// the background would reach the cards and not the history, and the chart
	// would end $100 above its own line. So when the on-chain counters move,
	// refresh the ledger readers now, and again shortly after: the keeper writes
	// its row a few seconds after the transaction confirms.
	const counters = plan ? `${plan.account.executions}/${plan.account.deferrals}/${plan.account.totalInvested.toString()}` : null;
	const seenCounters = useRef<string | null>(null);
	useEffect(() => {
		if (counters === null || counters === seenCounters.current) return;
		const first = seenCounters.current === null;
		seenCounters.current = counters;
		if (first) return; // every reader fetches on mount already
		setRefreshKey((k) => k + 1);
		const t = setTimeout(() => setRefreshKey((k) => k + 1), 10_000);
		return () => clearTimeout(t);
	}, [counters]);

	// A failed refresh keeps the loaded plan on screen. Only a plan that has
	// never loaded shows the error, so one slow RPC call cannot blank the page.
	if (error && !plan)
		return (
			<div className="card space-y-2">
				<p className="font-semibold">This plan could not be loaded.</p>
				<p className="text-sm text-slate-400">The address may be wrong, or the devnet RPC is slow. The page retries every 20 seconds.</p>
				<p className="break-all font-mono text-xs text-slate-500">
					{short(address, 8)} · {error}
				</p>
			</div>
		);
	if (!plan)
		return (
			<div className="space-y-5" aria-busy="true" aria-label="Loading plan">
				<div className="skeleton h-8 w-56" />
				<div className="grid gap-4 sm:grid-cols-4">
					{[0, 1, 2, 3].map((i) => (
						<div key={i} className="skeleton h-20" />
					))}
				</div>
				<div className="skeleton h-40" />
			</div>
		);
	const a = plan.account;
	// The same test GuardScorecard uses to render at all.
	const hasScorecard = !!history.scorecard && history.scorecard.deferrals + history.scorecard.executions > 0;

	return (
		<div className="space-y-5">
			{created && (
				<p className="rounded-xl border border-mint/30 bg-mint/10 px-4 py-2 text-sm text-mint">
					Plan created and funded.{" "}
					<a className="underline" href={EXPLORER(created)} target="_blank" rel="noreferrer">
						View the transaction
					</a>
				</p>
			)}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="label">
						Plan #{a.planId} ·{" "}
						<a className="font-mono underline" href={EXPLORER_ACCOUNT(address)} target="_blank" rel="noreferrer">
							{short(address, 6)}
						</a>
					</p>
					<h1 className="mt-1 text-2xl font-bold">
						{fmtUsd(a.amountPerPeriod.toNumber() / 1e6, 0)} {cadenceLabel(a.periodSeconds.toNumber())}
					</h1>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{a.legs.slice(0, a.legCount).map((l, i) => (
							<span key={i} className="pill bg-white/5 text-slate-300">
								{symbolByMint(l.mint.toBase58()).replace(/^m/, "")} {l.weightBps / 100}%
							</span>
						))}
					</div>
				</div>
				<StatusPill status={a.status} />
			</div>

			<div className="grid gap-4 sm:grid-cols-4">
				{[
					["Vault", fmtUsd(plan.vaultUsdc)],
					["Invested", fmtUsd(a.totalInvested.toNumber() / 1e6)],
					["Executions / deferrals", `${a.executions} / ${a.deferrals}`],
				].map(([k, v]) => (
					<div key={k} className="card !p-4">
						<p className="label">{k}</p>
						<p className="mt-1 text-lg font-bold">{v}</p>
						{/* The chain counts demo-control tests too; History lists them, marked. */}
						{k === "Executions / deferrals" && <p className="text-xs text-slate-500">on chain, demo tests included</p>}
					</div>
				))}
				<div className="card !p-4">
					<p className="label">Next buy</p>
					<p className="mt-1 text-lg font-bold">
						<Countdown ts={a.nextExecution.toNumber()} />
					</p>
					<p className="text-xs text-slate-500">{fmtTs(a.nextExecution.toNumber())}</p>
				</div>
			</div>

			{a.lastReason !== 0 && (
				<p className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-2 text-sm text-amber">
					Last attempt was deferred: <strong>{reasonLabel(a.lastReason)}</strong>, recorded on chain.{" "}
					{retryNote(
						a.lastReason,
						Math.floor(Date.now() / 1000),
						// Only a stale price has a time worth naming, and the scan costs a few milliseconds.
						a.lastReason === REASON.REFERENCE_STALE ? secondsUntilPythPublishes(new Date()) : 0,
						Math.max(0, a.amountPerPeriod.toNumber() / 1e6 - plan.vaultUsdc),
					)}
				</p>
			)}

			<KeeperStatus />

			<GuardPanel plan={address} refreshKey={refreshKey} />

			{/* The scorecard and the plan's controls share a row; the portfolio
			    and the history get the full width. The right column used to run
			    the length of the page holding one short card. */}
			<div className={`grid gap-5 lg:items-start ${hasScorecard ? "lg:grid-cols-[1fr_320px]" : "lg:grid-cols-[minmax(0,420px)]"}`}>
				{hasScorecard && <GuardScorecard scorecard={history.scorecard} />}
				<PlanActions plan={plan} onDone={onDone} />
			</div>
			<PortfolioChart plan={plan} prices={prices} refreshKey={refreshKey} />
			<Portfolio plan={plan} prices={prices} />
			<History rows={history.rows} note={history.note} legTickers={a.legs.slice(0, a.legCount).map((l) => symbolByMint(l.mint.toBase58()).replace(/^m/, ""))} />
		</div>
	);
}
