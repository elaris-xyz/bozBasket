"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CADENCES } from "@bozbasket/shared";
import type { LoadedPlan } from "@/lib/usePlans";
import { useDemoWallet } from "@/lib/wallet";
import { ata, EXPLORER, keypairWallet, programsFor, USDC_MINT } from "@/lib/solana";
import { cadenceLabel, fmtUsd } from "@/lib/format";

export function PlanActions({ plan, onDone }: { plan: LoadedPlan; onDone: () => void }) {
	const w = useDemoWallet();
	const a = plan.account;
	const [amount, setAmount] = useState(100);
	const [busy, setBusy] = useState<string | null>(null);
	const [msg, setMsg] = useState<{ ok: boolean; text: string; sig?: string } | null>(null);
	const isOwner = !!w.publicKey && w.publicKey.equals(a.owner);

	// Editing: amount and cadence only. Weights are fixed for the life of a plan.
	const currentAmount = a.amountPerPeriod.toNumber() / 1e6;
	const currentPeriod = a.periodSeconds.toNumber();
	const [editAmount, setEditAmount] = useState(currentAmount);
	const [editPeriod, setEditPeriod] = useState(currentPeriod);
	useEffect(() => {
		setEditAmount(currentAmount);
		setEditPeriod(currentPeriod);
	}, [currentAmount, currentPeriod]);
	const cadenceOptions: { id: string; label: string; seconds: number }[] = [...CADENCES];
	if (!CADENCES.some((c) => c.seconds === currentPeriod)) cadenceOptions.push({ id: "current", label: cadenceLabel(currentPeriod), seconds: currentPeriod });
	const edited = Math.round(editAmount * 1e6) !== a.amountPerPeriod.toNumber() || editPeriod !== currentPeriod;

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

	// A visitor gets the invitation in the page header instead: as a card it was
	// a short box beside a tall one, with the gap below it.
	if (!isOwner) return null;

	return (
		<div className="card space-y-3">
			<h3 className="font-semibold">Manage</h3>
			<div className="flex gap-2">
				<input className="input" type="number" min={1} value={amount} aria-label="USDC amount" onChange={(e) => setAmount(Number(e.target.value))} />
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

			{a.status !== 2 && (
				<div className="space-y-2 border-t border-white/5 pt-3">
					<p className="label">Edit plan</p>
					<div className="flex gap-2">
						<input className="input" type="number" min={1} step={1} value={editAmount} aria-label="USDC per period" onChange={(e) => setEditAmount(Number(e.target.value))} />
						<select className="input" value={editPeriod} aria-label="Cadence" onChange={(e) => setEditPeriod(Number(e.target.value))}>
							{cadenceOptions.map((c) => (
								<option key={c.seconds} value={c.seconds}>
									{c.label}
								</option>
							))}
						</select>
					</div>
					<button
						className="btn-ghost w-full"
						disabled={!!busy || !edited || !(editAmount > 0)}
						onClick={() =>
							run("Update plan", () =>
								programs()
									.methods.updatePlan(new anchor.BN(Math.round(editAmount * 1e6)), new anchor.BN(editPeriod), a.endTs)
									.accountsPartial({ plan: plan.address, owner: w.keypair!.publicKey })
									.rpc(),
							)
						}
					>
						Save changes
					</button>
					<p className="text-xs text-slate-500">
						Amount and cadence apply from the next buy. The weights stay fixed for the life of a plan so its cost basis stays exact;{" "}
						<Link href="/build" className="underline">
							start a new plan
						</Link>{" "}
						to change the basket itself.
					</p>
				</div>
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
