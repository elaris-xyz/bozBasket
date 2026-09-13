"use client";

import Link from "next/link";
import { useDemoWallet } from "@/lib/wallet";
import { usePlans } from "@/lib/usePlans";
import { PlanCard } from "@/components/PlanCard";

export default function Home() {
	const w = useDemoWallet();
	const { plans, loading } = usePlans(w.publicKey);

	return (
		<div className="space-y-8">
			<section className="card overflow-hidden bg-gradient-to-br from-ink-800 to-ink-700">
				<p className="label">Tokenized stocks trade 24/7. A trustworthy price does not.</p>
				<h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">
					Buy a basket of US stocks on a schedule, <span className="text-mint">only when the price can be trusted.</span>
				</h1>
				<p className="mt-3 max-w-2xl text-slate-300">
					Define a basket once. A keeper buys every leg in one atomic Solana transaction each period, after checking the Pyth reference price for staleness and
					confidence, the market session, and the venue for divergence and depth. If anything fails, the buy is deferred with a reason written on chain.
				</p>
				<div className="mt-5 flex flex-wrap gap-3">
					{w.publicKey ? (
						<Link href="/build" className="btn-primary">
							Build a basket
						</Link>
					) : (
						<button className="btn-primary" onClick={w.create} disabled={!!w.busy}>
							{w.busy ?? "Try with a demo wallet"}
						</button>
					)}
					<a className="btn-ghost" href="https://github.com/rfkala/bozBasket" target="_blank" rel="noreferrer">
						How it works
					</a>
				</div>
			</section>

			<section>
				<div className="mb-3 flex items-center justify-between">
					<h2 className="text-lg font-semibold">Your plans</h2>
					{w.publicKey && (
						<Link href="/build" className="btn-ghost !py-1 text-xs">
							New plan
						</Link>
					)}
				</div>
				{!w.publicKey ? (
					<p className="card text-slate-400">Create a demo wallet to see your plans. It lives in this browser; the vault is a program account only your key controls.</p>
				) : loading && plans.length === 0 ? (
					<p className="card text-slate-400">Loading…</p>
				) : plans.length === 0 ? (
					<p className="card text-slate-400">No plans yet. Build one: pick a basket, an amount and a cadence, and deposit devnet USDC.</p>
				) : (
					<div className="grid gap-4 sm:grid-cols-2">
						{plans.map((p) => (
							<PlanCard key={p.address.toBase58()} plan={p} />
						))}
					</div>
				)}
			</section>

			<section className="grid gap-4 sm:grid-cols-3">
				{[
					["One transaction", "Every leg of the basket fills atomically. All or nothing, sub-cent fees."],
					["Fair-value guard", "Pyth staleness and confidence, session calendar, venue divergence and depth, checked on chain before any fill."],
					["Deferral, not a blind fill", "Saturday 03:00 does not get filled at whatever the pool says. The plan waits for the next safe window and tells you why."],
				].map(([t, b]) => (
					<div key={t} className="card">
						<h3 className="font-semibold">{t}</h3>
						<p className="mt-1 text-sm text-slate-400">{b}</p>
					</div>
				))}
			</section>
		</div>
	);
}
