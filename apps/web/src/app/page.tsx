"use client";

import Link from "next/link";
import { useDemoWallet } from "@/lib/wallet";
import { usePlans } from "@/lib/usePlans";
import { PlanCard } from "@/components/PlanCard";
import { KeeperStatus } from "@/components/KeeperStatus";
import { LiveProof } from "@/components/LiveProof";
import { MainnetShadow } from "@/components/MainnetShadow";
import { WeekendBacktest } from "@/components/WeekendBacktest";
import { DEMO_PLAN } from "@/lib/solana";

const PILLARS: [string, string][] = [
	["One transaction", "Every leg of the basket fills atomically. All or nothing, sub-cent fees."],
	["Fair-value guard", "Pyth staleness and confidence, venue divergence and depth, checked on chain before any fill. The price decides, not the calendar."],
	["Deferral, not a blind fill", "Saturday 03:00 does not get filled at whatever the pool says. The plan waits for the next safe window and tells you why."],
];

function Pillars({ className }: { className: string }) {
	return (
		<ul className={`gap-3 sm:grid-cols-3 ${className}`}>
			{PILLARS.map(([title, body]) => (
				<li key={title} className="rounded-2xl border border-white/10 bg-ink-800/60 p-4">
					<span className="block h-1 w-8 rounded-full bg-mint/70" aria-hidden />
					<h3 className="mt-3 font-semibold">{title}</h3>
					<p className="mt-1 text-sm text-slate-400">{body}</p>
				</li>
			))}
		</ul>
	);
}

/** Eyebrow, title and one line of context above a group of cards. */
function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
	return (
		<div className="mb-3 sm:mb-4">
			<p className="label !text-mint">{eyebrow}</p>
			<h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
			{/* Hidden on a phone, so the live proof stays near the first screen. */}
			<p className="mt-1 hidden max-w-2xl text-sm text-slate-400 sm:block">{sub}</p>
		</div>
	);
}

export default function Home() {
	const w = useDemoWallet();
	const { plans, loading } = usePlans(w.publicKey);
	// A returning visitor sees their plans first; a new one sees the evidence first.
	const hasPlans = plans.length > 0;

	const plansSection = (
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
				<div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading your plans">
					<div className="skeleton h-44" />
					<div className="skeleton hidden h-44 sm:block" />
				</div>
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
	);

	return (
		<div className="space-y-10 sm:space-y-14">
			<div className="space-y-4">
				<section className="card overflow-hidden bg-gradient-to-br from-ink-800 to-ink-700">
					<p className="label">Tokenized stocks trade 24/7. A trustworthy price does not.</p>
					<h1 className="mt-2 text-2xl font-bold leading-tight sm:text-4xl">
						Buy a basket of US stocks on a schedule, <span className="text-mint">only when the price can be trusted.</span>
					</h1>
					{/* Short on a phone, so the live proof below stays on the first screen. */}
					<p className="mt-3 text-slate-300 sm:hidden">One basket, one atomic Solana transaction per period, and no buy when the reference price fails the guard.</p>
					<p className="mt-3 hidden max-w-2xl text-slate-300 sm:block">
						Define a basket once. A keeper buys every leg in one atomic Solana transaction each period, after checking the Pyth reference price for staleness and
						confidence, and the venue for divergence and depth. If anything fails, the buy is deferred with a reason written on chain.
					</p>
					<div className="mt-5 flex flex-wrap gap-2 sm:gap-3">
						{w.publicKey ? (
							<Link href="/build" className="btn-primary">
								Build a basket
							</Link>
						) : (
							<button className="btn-primary" onClick={w.create} disabled={!!w.busy}>
								{w.busy ?? "Try with a demo wallet"}
							</button>
						)}
						<Link className="btn-ghost" href={`/plan/${DEMO_PLAN}`}>
							Watch a live plan
						</Link>
						<a className="btn-ghost" href="https://github.com/elaris-xyz/bozBasket" target="_blank" rel="noreferrer">
							How it works
						</a>
					</div>
					<div className="mt-4">
						<KeeperStatus compact />
					</div>
				</section>
				<Pillars className="hidden sm:grid" />
			</div>

			{hasPlans && plansSection}

			<div>
				<SectionHeading
					eyebrow="Live"
					title="The price, right now"
					sub="Pyth's reference prices, and what the real xStock pools on Solana mainnet charge against them. Both refresh on their own."
				/>
				<div className="space-y-4 sm:space-y-5">
					<LiveProof />
					<MainnetShadow />
				</div>
			</div>

			<div>
				<SectionHeading eyebrow="Measured" title="Weekends, measured" sub="Real pool trades against Pyth history, including the parts that do not flatter the guard." />
				<WeekendBacktest />
			</div>

			{!hasPlans && plansSection}

			<Pillars className="grid sm:hidden" />
		</div>
	);
}
