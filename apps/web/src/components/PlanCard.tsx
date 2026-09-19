"use client";

import Link from "next/link";
import type { LoadedPlan } from "@/lib/usePlans";
import { symbolByMint } from "@/lib/solana";
import { cadenceLabel, fmtUsd, reasonLabel } from "@/lib/format";
import { Countdown } from "./Countdown";
import { StatusPill } from "./StatusPill";

export function PlanCard({ plan }: { plan: LoadedPlan }) {
	const a = plan.account;
	const legs = a.legs.slice(0, a.legCount);
	return (
		<Link href={`/plan/${plan.address.toBase58()}`} className="card block transition hover:border-mint/40">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="label">Plan #{a.planId}</p>
					<p className="num mt-1 text-xl font-semibold">
						{fmtUsd(a.amountPerPeriod.toNumber() / 1e6, 0)} <span className="text-sm font-normal text-slate-400">{cadenceLabel(a.periodSeconds.toNumber())}</span>
					</p>
				</div>
				<StatusPill status={a.status} />
			</div>
			<div className="mt-3 flex flex-wrap gap-1.5">
				{legs.map((l, i) => (
					<span key={i} className="pill bg-white/5 text-slate-300">
						{symbolByMint(l.mint.toBase58()).replace(/^m/, "")} {l.weightBps / 100}%
					</span>
				))}
			</div>
			<div className="mt-4 grid grid-cols-3 gap-2 text-sm">
				<div>
					<p className="label">Vault</p>
					<p className="font-semibold">{fmtUsd(plan.vaultUsdc)}</p>
				</div>
				<div>
					<p className="label">Invested</p>
					<p className="font-semibold">{fmtUsd(a.totalInvested.toNumber() / 1e6)}</p>
				</div>
				<div>
					<p className="label">Next buy</p>
					<p className="font-semibold">
						<Countdown ts={a.nextExecution.toNumber()} />
					</p>
				</div>
			</div>
			{a.lastReason !== 0 && <p className="mt-3 text-xs text-amber">Last attempt deferred: {reasonLabel(a.lastReason)}</p>}
		</Link>
	);
}
