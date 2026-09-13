"use client";

import { useEffect, useState } from "react";
import type { HistoryRow } from "@/app/api/history/route";
import { EXPLORER, symbolByMint } from "@/lib/solana";
import { fmtTs, fmtUsd, reasonLabel, short } from "@/lib/format";

const KIND: Record<HistoryRow["kind"], string> = {
	executed: "bg-mint/15 text-mint",
	deferred: "bg-amber/15 text-amber",
	skipped: "bg-white/10 text-slate-300",
	error: "bg-rose/15 text-rose",
};

export function History({ plan, refreshKey }: { plan: string; refreshKey: number }) {
	const [rows, setRows] = useState<HistoryRow[] | null>(null);
	const [note, setNote] = useState<string | null>(null);
	useEffect(() => {
		fetch(`/api/history?plan=${plan}`)
			.then((r) => r.json())
			.then((b) => {
				setRows(b.rows ?? []);
				setNote(b.note ?? b.error ?? null);
			})
			.catch((e) => setNote(String(e)));
	}, [plan, refreshKey]);

	return (
		<div className="card">
			<h3 className="font-semibold">History</h3>
			<p className="text-xs text-slate-500">Every keeper pass: executions, deferrals with their reason, and off-hours skips.</p>
			{note && <p className="mt-2 text-xs text-amber">{note}</p>}
			{rows === null ? (
				<p className="mt-3 text-sm text-slate-400">Loading…</p>
			) : rows.length === 0 ? (
				<p className="mt-3 text-sm text-slate-400">No keeper activity yet.</p>
			) : (
				<ul className="mt-3 divide-y divide-white/5">
					{rows.map((r) => (
						<li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
							<div>
								<span className={`pill mr-2 ${KIND[r.kind]}`}>{r.kind}</span>
								<span className="text-slate-300">{r.kind === "executed" ? `Bought ${fmtUsd(r.usdcIn ?? 0)} across ${r.legs?.length ?? 0} legs` : reasonLabel(r.reason) ?? r.detail}</span>
								{r.kind !== "executed" && r.detail && <span className="ml-2 text-xs text-slate-500">{r.detail}</span>}
								{r.kind === "executed" && r.legs && (
									<p className="mt-0.5 text-xs text-slate-500">
										{r.legs.map((l) => `${symbolByMint(l.mint).replace(/^m/, "")} ${(Number(l.units) / 1e6).toFixed(4)} @ ${(Number(l.venuePrice) * 10 ** l.exponent).toFixed(2)}`).join(" · ")}
									</p>
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
					))}
				</ul>
			)}
		</div>
	);
}
