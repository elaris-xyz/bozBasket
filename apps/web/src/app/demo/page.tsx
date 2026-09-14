"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DEMO_STOCKS } from "@bozbasket/shared";
import { EXPLORER } from "@/lib/solana";
import { fmtTs } from "@/lib/format";
import { GuardPanel } from "@/components/GuardPanel";
import { usePlans } from "@/lib/usePlans";
import { useDemoWallet } from "@/lib/wallet";

type Result = { ok: boolean; text: string; sig?: string };

const CONTROLS: { action: string; label: string; blurb: string; perMarket?: boolean; danger?: boolean }[] = [
	{ action: "divergence", label: "Force divergence", blurb: "Venue quotes 5% off the reference. Real state, the guard sees it.", perMarket: true },
	{ action: "liquidity", label: "Drain liquidity", blurb: "Venue depth down to $10, below one leg.", perMarket: true },
	{ action: "staleness", label: "Tighten staleness to 0s", blurb: "Threshold change, not a corrupted feed: any price counts as old." },
	{ action: "confidence", label: "Tighten confidence to 0 bps", blurb: "Threshold change: any confidence band counts as too wide." },
	{ action: "restore", label: "Restore everything", blurb: "Clear overrides, refill depth, put thresholds back.", danger: true },
];

export default function DemoPage() {
	const w = useDemoWallet();
	const { plans } = usePlans(w.publicKey);
	const [plan, setPlan] = useState("");
	const [symbol, setSymbol] = useState(DEMO_STOCKS[0].symbol);
	const [busy, setBusy] = useState<string | null>(null);
	const [result, setResult] = useState<Result | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [autoRestore, setAutoRestore] = useState<{ mins: number; lastAt: number | null } | null>(null);
	const selected = plan || plans[0]?.address.toBase58() || "";

	useEffect(() => {
		fetch("/api/demo")
			.then((r) => r.json())
			.then((b) => {
				setEnabled(!!b.enabled);
				if (typeof b.autoRestoreMins === "number") setAutoRestore({ mins: b.autoRestoreMins, lastAt: b.autoRestoredAt ?? null });
			})
			.catch(() => setEnabled(false));
	}, []);

	async function run(action: string, label: string) {
		setBusy(label);
		setResult(null);
		try {
			const res = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, symbol, plan: selected }) });
			const body = await res.json();
			setResult(res.ok ? { ok: true, text: body.detail ?? "done", sig: body.signature } : { ok: false, text: body.error ?? "failed" });
			setRefreshKey((k) => k + 1);
		} catch (err) {
			setResult({ ok: false, text: (err as Error).message });
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="space-y-5">
			<div>
				<h1 className="text-2xl font-bold">Demo controls</h1>
				<p className="text-slate-400">
					Each button sends a real devnet transaction that changes state the guard reads. Nothing here fakes a verdict: the program still decides, and you can watch the
					decision change in the panel below.
				</p>
			</div>

			{enabled === false && (
				<p className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
					Demo controls are switched off on this deployment, so the buttons below will not do anything. Everything else on the site is live. To drive them yourself, clone the
					repository and run it with <code className="rounded bg-black/30 px-1">DEMO_CONTROLS=1</code>.
				</p>
			)}

			{!selected ? (
				<p className="card text-slate-400">
					Create a plan first on <Link className="underline" href="/build">the builder</Link>, or paste a plan address below.
				</p>
			) : null}

			<div className="card space-y-3">
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block">
						<span className="label">Plan</span>
						{plans.length > 0 ? (
							<select className="input mt-1" value={selected} onChange={(e) => setPlan(e.target.value)}>
								{plans.map((p) => (
									<option key={p.address.toBase58()} value={p.address.toBase58()}>
										#{p.account.planId} · {p.address.toBase58().slice(0, 8)}…
									</option>
								))}
							</select>
						) : (
							<input className="input mt-1 font-mono" placeholder="plan address" value={plan} onChange={(e) => setPlan(e.target.value)} />
						)}
					</label>
					<label className="block">
						<span className="label">Market for the per-leg controls</span>
						<select className="input mt-1" value={symbol} onChange={(e) => setSymbol(e.target.value as typeof symbol)}>
							{DEMO_STOCKS.map((s) => (
								<option key={s.symbol} value={s.symbol}>
									{s.ticker}
								</option>
							))}
						</select>
					</label>
				</div>

				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{CONTROLS.map((c) => (
						<button key={c.action} className="btn-ghost h-full flex-col !items-start gap-1 text-left" disabled={!!busy || enabled === false} onClick={() => run(c.action, c.label)}>
							<span className="font-semibold">
								{c.label}
								{c.perMarket && <span className="ml-1 text-xs font-normal text-slate-500">({DEMO_STOCKS.find((s) => s.symbol === symbol)?.ticker})</span>}
							</span>
							<span className="text-xs font-normal text-slate-500">{c.blurb}</span>
						</button>
					))}
					<button className="btn-primary h-full flex-col !items-start gap-1 text-left" disabled={!!busy || !selected || enabled === false} onClick={() => run("nudge", "Make the plan due")}>
						<span className="font-semibold">Make the plan due</span>
						<span className="text-xs font-normal opacity-80">A keeper pass starts at once; the result appears in the plan&apos;s History within about a minute.</span>
					</button>
				</div>

				{autoRestore && enabled && (
					<p className="text-xs text-slate-500">
						Left untouched for {autoRestore.mins} minutes, the demo restores itself, so the next visitor finds it working
						{autoRestore.lastAt ? `. It last did so ${fmtTs(autoRestore.lastAt)}.` : "."}
					</p>
				)}
				{busy && <p className="text-xs text-mint">{busy}…</p>}
				{result && (
					<p className={`break-words text-xs ${result.ok ? "text-mint" : "text-rose"}`}>
						{result.text}
						{result.sig && (
							<>
								{" · "}
								<a className="underline" href={EXPLORER(result.sig)} target="_blank" rel="noreferrer">
									transaction
								</a>
							</>
						)}
					</p>
				)}
			</div>

			{selected && <GuardPanel plan={selected} refreshKey={refreshKey} />}

			<div className="card text-xs text-slate-400">
				<p className="label mb-1">The keeper</p>
				<p>
					The keeper runs inside this app, so there is nothing to start. Open pages ask for a pass about once a minute, a scheduler every five minutes, and{" "}
					<span className="text-slate-200">Make the plan due</span> starts one at once. Every copy shares one lock, so a plan is never attempted twice at the same time.
					Each attempt is a real transaction, and the program alone decides whether it fills or defers.
					{selected && (
						<>
							{" "}
							<Link className="underline" href={`/plan/${selected}`}>
								Open this plan&apos;s History
							</Link>
							.
						</>
					)}
				</p>
			</div>
		</div>
	);
}
