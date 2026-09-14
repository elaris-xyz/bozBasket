"use client";

import { useState } from "react";
import { MAINNET_XSTOCKS } from "@bozbasket/shared";

type Answer = { status: number; ms: number; body: string; overall: string | null };

/** Sends a real request to the Guard API from the browser and shows the raw answer. */
export function ApiTryIt({ site }: { site: string }) {
	const [symbol, setSymbol] = useState("");
	const [usdc, setUsdc] = useState("100");
	const [divergence, setDivergence] = useState("");
	const [busy, setBusy] = useState(false);
	const [answer, setAnswer] = useState<Answer | null>(null);

	const params = new URLSearchParams();
	if (symbol) params.set("symbol", symbol);
	if (usdc.trim() && usdc.trim() !== "100") params.set("usdc", usdc.trim());
	if (divergence.trim()) params.set("maxDivergenceBps", divergence.trim());
	const qs = params.toString();
	const path = `/api/v1/verdict${qs ? `?${qs}` : ""}`;

	async function send() {
		setBusy(true);
		const started = performance.now();
		try {
			const res = await fetch(path, { cache: "no-store" });
			const text = await res.text();
			let body = text;
			let overall: string | null = null;
			try {
				const parsed = JSON.parse(text);
				body = JSON.stringify(parsed, null, 2);
				overall = typeof parsed.overall === "string" ? parsed.overall : null;
			} catch {
				// Not JSON; show it as it came.
			}
			setAnswer({ status: res.status, ms: Math.round(performance.now() - started), body, overall });
		} catch (err) {
			setAnswer({ status: 0, ms: Math.round(performance.now() - started), body: (err as Error).message, overall: null });
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="card">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="font-semibold">Try it</h2>
				<span className="pill bg-white/10 text-slate-300">live · Solana mainnet · read-only</span>
			</div>
			<div className="mt-3 grid gap-3 sm:grid-cols-3">
				<label className="block">
					<span className="label">symbol</span>
					<select className="input mt-1" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
						<option value="">all</option>
						{MAINNET_XSTOCKS.map((s) => (
							<option key={s.symbol} value={s.symbol}>
								{s.symbol}
							</option>
						))}
					</select>
				</label>
				<label className="block">
					<span className="label">usdc</span>
					<input className="input mt-1" type="number" min={1} max={100_000} value={usdc} onChange={(e) => setUsdc(e.target.value)} />
				</label>
				<label className="block">
					<span className="label">maxDivergenceBps</span>
					<input className="input mt-1" type="number" min={0} placeholder="150" value={divergence} onChange={(e) => setDivergence(e.target.value)} />
				</label>
			</div>
			<div className="mt-3 flex flex-wrap items-center gap-3">
				<button className="btn-primary" onClick={send} disabled={busy}>
					{busy ? "Asking…" : "Send request"}
				</button>
				<code className="min-w-0 break-all font-mono text-xs text-slate-400">
					GET {site}
					{path}
				</code>
			</div>
			{answer && (
				<div className="mt-3" aria-live="polite">
					<p className="text-xs text-slate-400">
						<span className={`pill mr-2 ${answer.status === 200 ? "bg-mint/15 text-mint" : "bg-rose/15 text-rose"}`}>{answer.status || "network error"}</span>
						{answer.ms} ms
						{answer.overall && (
							<>
								{" · overall "}
								<span className={answer.overall === "buy" ? "text-mint" : "text-amber"}>{answer.overall}</span>
							</>
						)}
					</p>
					<pre className="mt-2 max-h-96 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed text-slate-200">{answer.body}</pre>
				</div>
			)}
			<p className="mt-3 text-xs text-slate-500">Try usdc 50000 to watch price impact widen the gap, or maxDivergenceBps 1 to see a defer.</p>
		</section>
	);
}
