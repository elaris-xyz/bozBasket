"use client";

import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePlan, usePrices } from "@/lib/usePlans";
import { EXPLORER, EXPLORER_ACCOUNT, symbolByMint } from "@/lib/solana";
import { cadenceLabel, fmtTs, fmtUsd, reasonLabel, short } from "@/lib/format";
import { Countdown } from "@/components/Countdown";
import { StatusPill } from "@/components/StatusPill";
import { PlanActions } from "@/components/PlanActions";
import { Portfolio } from "@/components/Portfolio";
import { History } from "@/components/History";
import { GuardPanel } from "@/components/GuardPanel";

export default function PlanPage({ params }: { params: Promise<{ address: string }> }) {
	const { address } = use(params);
	const created = useSearchParams().get("created");
	const { plan, error, reload } = usePlan(address);
	const prices = usePrices();
	const [refreshKey, setRefreshKey] = useState(0);
	const onDone = () => {
		reload();
		setRefreshKey((k) => k + 1);
	};

	if (error) return <p className="card text-rose">Could not load plan {short(address)}: {error}</p>;
	if (!plan) return <p className="card text-slate-400">Loading plan…</p>;
	const a = plan.account;

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
					Last attempt was deferred: <strong>{reasonLabel(a.lastReason)}</strong>. The reason is recorded on chain; the keeper retries at the next safe window.
				</p>
			)}

			<GuardPanel plan={address} refreshKey={refreshKey} />

			<div className="grid gap-5 lg:grid-cols-[1fr_320px]">
				<div className="space-y-5">
					<Portfolio plan={plan} prices={prices} />
					<History plan={address} refreshKey={refreshKey} />
				</div>
				<div className="space-y-4">
					<PlanActions plan={plan} onDone={onDone} />
				</div>
			</div>
		</div>
	);
}
