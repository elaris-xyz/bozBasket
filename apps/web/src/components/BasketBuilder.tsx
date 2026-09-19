"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CADENCES, DEMO_STOCKS, PRESETS, secondsUntilPythPublishes, type DemoStock } from "@bozbasket/shared";
import { useDemoWallet } from "@/lib/wallet";
import { ata, CONFIG, EXPLORER, keypairWallet, marketBySymbol, planPda, programsFor, USDC_MINT, vaultPda } from "@/lib/solana";
import { fmtUsd } from "@/lib/format";
import { TipBox, TipRow, type TipProps } from "@/components/ChartTip";
import { pythResumeLabel } from "@/lib/deferral";

type Weights = Record<DemoStock["symbol"], number>;
const ZERO: Weights = { mTSLA: 0, mQQQ: 0, mVOO: 0 };

/** Moves one slider and rebalances the others proportionally so the sum
 *  stays at 10_000. */
function rebalance(w: Weights, changed: DemoStock["symbol"], value: number): Weights {
	const others = (Object.keys(w) as DemoStock["symbol"][]).filter((k) => k !== changed);
	const rest = 10_000 - value;
	const otherSum = others.reduce((s, k) => s + w[k], 0);
	const out = { ...w, [changed]: value } as Weights;
	if (otherSum === 0) {
		others.forEach((k, i) => (out[k] = i === 0 ? rest : 0));
	} else {
		let allocated = 0;
		others.forEach((k, i) => {
			const v = i === others.length - 1 ? rest - allocated : Math.round((w[k] * rest) / otherSum);
			out[k] = v;
			allocated += v;
		});
	}
	return out;
}

export function BasketBuilder() {
	const w = useDemoWallet();
	const router = useRouter();
	const [weights, setWeights] = useState<Weights>({ ...ZERO, ...PRESETS[1].weights } as Weights);
	const [preset, setPreset] = useState<string | null>(PRESETS[1].id);
	const [amount, setAmount] = useState(100);
	const [cadence, setCadence] = useState<(typeof CADENCES)[number]["id"]>("weekly");
	const [deposit, setDeposit] = useState(500);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const total = Object.values(weights).reduce((a, b) => a + b, 0);
	const active = DEMO_STOCKS.filter((s) => weights[s.symbol] > 0);
	// When the first buy can happen: in the browser only, since the server's
	// clock would render different text, and once a minute, since the weekend
	// scan costs a few milliseconds and a slider re-renders on every step.
	const [pythResumesIn, setPythResumesIn] = useState<number | null>(null);
	useEffect(() => {
		const tick = () => setPythResumesIn(secondsUntilPythPublishes(new Date()));
		tick();
		const t = setInterval(tick, 60_000);
		return () => clearInterval(t);
	}, []);
	const cadenceWord = CADENCES.find((c) => c.id === cadence)!.label.toLowerCase();
	const pie = useMemo(() => active.map((s) => ({ name: s.ticker, value: weights[s.symbol] / 100, color: s.color })), [active, weights]);
	const period = CADENCES.find((c) => c.id === cadence)!.seconds;
	const canSubmit = !!w.keypair && total === 10_000 && active.length > 0 && amount > 0 && deposit >= amount && w.usdc >= deposit && !busy;

	async function submit() {
		if (!w.keypair) return;
		setError(null);
		setBusy("Building the transaction");
		try {
			const { basket } = programsFor(keypairWallet(w.keypair));
			const owner = w.keypair.publicKey;
			// Plan id: next free one for this owner.
			const existing = await basket.account.plan.all([{ memcmp: { offset: 8, bytes: owner.toBase58() } }]);
			const planId = existing.reduce((m, p) => Math.max(m, p.account.planId), 0) + 1;
			const plan = planPda(owner, planId);
			const vault = vaultPda(plan);
			const legs = active.map((s) => ({
				mint: new PublicKey(marketBySymbol(s.symbol).stockMint),
				weightBps: weights[s.symbol],
				pythFeedId: Array.from(Buffer.from(s.feedId, "hex")),
			}));
			setBusy("Sign: create plan and deposit");
			const sig = await basket.methods
				.createPlan(planId, new anchor.BN(Math.round(amount * 1e6)), new anchor.BN(period), new anchor.BN(0), new anchor.BN(0), legs)
				.accountsPartial({ config: CONFIG, usdcMint: USDC_MINT, plan, vault, owner, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY })
				.postInstructions([
					await basket.methods
						.deposit(new anchor.BN(Math.round(deposit * 1e6)))
						.accountsPartial({ plan, vault, ownerUsdc: ata(owner, USDC_MINT), owner, tokenProgram: TOKEN_PROGRAM_ID })
						.instruction(),
				])
				.rpc();
			console.log("created plan", plan.toBase58(), EXPLORER(sig));
			await w.refresh();
			router.push(`/plan/${plan.toBase58()}?created=${sig}`);
		} catch (err) {
			setError((err as Error).message);
			setBusy(null);
		}
	}

	return (
		<div className="grid gap-6 lg:grid-cols-[1fr_320px]">
			<div className="space-y-6">
				<section className="card">
					<h2 className="font-semibold">1. Pick a basket</h2>
					<div className="mt-3 grid gap-2 sm:grid-cols-3">
						{PRESETS.map((p) => (
							<button
								key={p.id}
								onClick={() => {
									setPreset(p.id);
									setWeights({ ...ZERO, ...p.weights } as Weights);
								}}
								className={`rounded-xl border p-3 text-left transition ${preset === p.id ? "border-mint bg-mint/10" : "border-white/10 hover:border-white/25"}`}
							>
								<p className="font-semibold">{p.name}</p>
								<p className="text-xs text-slate-400">{p.blurb}</p>
							</button>
						))}
					</div>
					<div className="mt-5 space-y-4">
						{DEMO_STOCKS.map((s) => (
							<div key={s.symbol}>
								<div className="mb-1 flex items-center justify-between text-sm">
									<span>
										<span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
										<span className="font-semibold">{s.ticker}</span> <span className="text-slate-400">{s.name}</span>
									</span>
									<span className="font-mono">{(weights[s.symbol] / 100).toFixed(0)}%</span>
								</div>
								<input
									type="range"
									min={0}
									max={10_000}
									step={100}
									value={weights[s.symbol]}
									onChange={(e) => {
										setPreset(null);
										setWeights(rebalance(weights, s.symbol, Number(e.target.value)));
									}}
								/>
							</div>
						))}
						<p className={`text-xs ${total === 10_000 ? "text-slate-500" : "text-rose"}`}>Weights sum to {total / 100}%. Moving one slider rebalances the rest.</p>
					</div>
				</section>

				<section className="card">
					<h2 className="font-semibold">2. Amount and cadence</h2>
					<div className="mt-3 grid gap-4 sm:grid-cols-3">
						<label className="block">
							<span className="label">USDC per period</span>
							<input className="input mt-1" type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
						</label>
						<label className="block">
							<span className="label">Cadence</span>
							<select className="input mt-1" value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)}>
								{CADENCES.map((c) => (
									<option key={c.id} value={c.id}>
										{c.label}
									</option>
								))}
							</select>
						</label>
						<label className="block">
							<span className="label">Initial deposit</span>
							<input className="input mt-1" type="number" min={amount} step={1} value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} />
						</label>
					</div>
				</section>
			</div>

			{/* Sticky beside a taller form, so the summary and the button stay in
			    reach instead of ending halfway down an empty column. */}
			<aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
				<section className="card">
					<h2 className="font-semibold">Your basket</h2>
					<div className="h-44">
						<ResponsiveContainer>
							<PieChart>
								<Pie data={pie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">
									{pie.map((p) => (
										<Cell key={p.name} fill={p.color} />
									))}
								</Pie>
								<Tooltip
									content={(p) => {
										const d = (p as TipProps<{ name: string; value: number; color: string }>).active ? (p as TipProps<{ name: string; value: number; color: string }>).payload?.[0]?.payload : undefined;
										return d ? (
											<TipBox>
												<TipRow color={d.color} label={d.name} value={`${d.value}%`} />
											</TipBox>
										) : null;
									}}
								/>
							</PieChart>
						</ResponsiveContainer>
					</div>
					<ul className="space-y-1 text-sm">
						{active.map((s) => (
							<li key={s.symbol} className="flex justify-between">
								<span>{s.ticker}</span>
								<span className="font-mono text-slate-300">{fmtUsd((amount * weights[s.symbol]) / 10_000)}</span>
							</li>
						))}
						<li className="flex justify-between border-t border-white/10 pt-1 font-semibold">
							<span>Per period</span>
							<span className="font-mono">{fmtUsd(amount)}</span>
						</li>
					</ul>
					<div className="mt-4 border-t border-white/10 pt-3">
						<h3 className="text-sm font-semibold">When it buys</h3>
						<ul className="mt-2 space-y-1.5 text-xs text-slate-300">
							<li>
								<span className="text-slate-500">First buy · </span>
								{pythResumesIn !== null && pythResumesIn > 0 ? (
									<>
										when Pyth publishes US equity prices again: <span className="text-amber">{pythResumeLabel(Math.floor(Date.now() / 1000), pythResumesIn)}</span>. Until then every attempt is deferred, on
										chain.
									</>
								) : (
									"as soon as the keeper runs, within a few minutes."
								)}
							</li>
							<li>
								<span className="text-slate-500">Then · </span>every {cadenceWord} slot, whenever the reference price passes the guard.
							</li>
							<li>
								<span className="text-slate-500">Weekends · </span>Pyth publishes nothing from Friday 20:00 to Sunday 20:00 ET, so weekend buys wait for it.
							</li>
						</ul>
					</div>
				</section>
				{/* On a phone the header button is a long scroll back up; the wallet is
				    one tap here, and then this same button creates the plan. */}
				{w.keypair ? (
					<button className="btn-primary w-full" disabled={!canSubmit} onClick={submit}>
						{busy ?? "Create plan and deposit"}
					</button>
				) : (
					<button className="btn-primary w-full" disabled={!!w.busy} onClick={() => w.create().catch((e) => setError((e as Error).message))}>
						{w.busy ?? "Create a demo wallet (no extension)"}
					</button>
				)}
				{w.keypair && w.usdc < deposit && <p className="text-xs text-amber">Wallet holds {fmtUsd(w.usdc)} USDC. Top up from the header.</p>}
				{error && <p className="break-words text-xs text-rose">{error}</p>}
				<p className="text-xs text-slate-500">One transaction: creates the plan account and its vault, then moves the deposit. You can withdraw at any time.</p>
			</aside>
		</div>
	);
}
