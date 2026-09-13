"use client";

import { useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { LoadedPlan } from "@/lib/usePlans";
import { useDemoWallet } from "@/lib/wallet";
import { ata, EXPLORER, keypairWallet, programsFor, USDC_MINT } from "@/lib/solana";
import { fmtUsd } from "@/lib/format";

export function PlanActions({ plan, onDone }: { plan: LoadedPlan; onDone: () => void }) {
	const w = useDemoWallet();
	const [amount, setAmount] = useState(100);
	const [busy, setBusy] = useState<string | null>(null);
	const [msg, setMsg] = useState<{ ok: boolean; text: string; sig?: string } | null>(null);
	const isOwner = !!w.publicKey && w.publicKey.equals(plan.account.owner);
	const a = plan.account;

	async function run(label: string, fn: () => Promise<string>) {
		if (!w.keypair) return;
		setBusy(label);
		setMsg(null);
		try {
			const sig = await fn();
			setMsg({ ok: true, text: `${label} confirmed`, sig });
			await w.refresh();
			onDone();
		} catch (err) {
			setMsg({ ok: false, text: (err as Error).message });
		} finally {
			setBusy(null);
		}
	}

	const programs = () => programsFor(keypairWallet(w.keypair!)).basket;
	const common = () => ({ plan: plan.address, vault: a.vault, ownerUsdc: ata(w.keypair!.publicKey, USDC_MINT), owner: w.keypair!.publicKey, tokenProgram: TOKEN_PROGRAM_ID });

	if (!isOwner) return <p className="card text-sm text-slate-400">Only the plan owner can deposit, withdraw or pause.</p>;

	return (
		<div className="card space-y-3">
			<h3 className="font-semibold">Manage</h3>
			<div className="flex gap-2">
				<input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
				<button className="btn-primary" disabled={!!busy || amount <= 0 || w.usdc < amount} onClick={() => run("Deposit", () => programs().methods.deposit(new anchor.BN(Math.round(amount * 1e6))).accountsPartial(common()).rpc())}>
					Deposit
				</button>
				<button className="btn-ghost" disabled={!!busy || amount <= 0 || plan.vaultUsdc < amount} onClick={() => run("Withdraw", () => programs().methods.withdraw(new anchor.BN(Math.round(amount * 1e6))).accountsPartial(common()).rpc())}>
					Withdraw
				</button>
			</div>
			<p className="text-xs text-slate-500">
				Wallet {fmtUsd(w.usdc)} · Vault {fmtUsd(plan.vaultUsdc)}. Withdrawing below one period pauses the plan.
			</p>
			{a.status !== 2 && (
				<button
					className={a.status === 0 ? "btn-danger w-full" : "btn-primary w-full"}
					disabled={!!busy}
					onClick={() => run(a.status === 0 ? "Pause" : "Resume", () => programs().methods.setPaused(a.status === 0).accountsPartial({ plan: plan.address, owner: w.keypair!.publicKey }).rpc())}
				>
					{a.status === 0 ? "Pause plan" : "Resume plan"}
				</button>
			)}
			{busy && <p className="text-xs text-mint">{busy}…</p>}
			{msg && (
				<p className={`break-words text-xs ${msg.ok ? "text-mint" : "text-rose"}`}>
					{msg.text}
					{msg.sig && (
						<>
							{" "}
							<a className="underline" href={EXPLORER(msg.sig)} target="_blank" rel="noreferrer">
								explorer
							</a>
						</>
					)}
				</p>
			)}
		</div>
	);
}
