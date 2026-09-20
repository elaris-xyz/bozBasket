"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { connection, readPrograms, type PlanAccount } from "./solana";

export type LoadedPlan = { address: PublicKey; account: PlanAccount; vaultUsdc: number };

export function usePlans(owner: PublicKey | null) {
	const [plans, setPlans] = useState<LoadedPlan[]>([]);
	const [loading, setLoading] = useState(false);
	const reload = useCallback(async () => {
		if (!owner) {
			setPlans([]);
			return;
		}
		setLoading(true);
		try {
			const { basket } = readPrograms();
			const all = await basket.account.plan.all([{ memcmp: { offset: 8, bytes: owner.toBase58() } }]);
			const withVault = await Promise.all(
				all.map(async (p) => {
					const v = await getAccount(connection(), p.account.vault).catch(() => null);
					return { address: p.publicKey, account: p.account, vaultUsdc: v ? Number(v.amount) / 1e6 : 0 };
				}),
			);
			withVault.sort((a, b) => a.account.planId - b.account.planId);
			setPlans(withVault);
		} finally {
			setLoading(false);
		}
	}, [owner]);
	useEffect(() => {
		reload();
	}, [reload]);
	return { plans, loading, reload };
}

export function usePlan(address: string) {
	const [plan, setPlan] = useState<LoadedPlan | null>(null);
	const [error, setError] = useState<string | null>(null);
	const reload = useCallback(async () => {
		try {
			const pk = new PublicKey(address);
			const { basket } = readPrograms();
			const account = await basket.account.plan.fetch(pk);
			const v = await getAccount(connection(), account.vault).catch(() => null);
			setPlan({ address: pk, account, vaultUsdc: v ? Number(v.amount) / 1e6 : 0 });
			setError(null);
		} catch (err) {
			setError((err as Error).message);
		}
	}, [address]);
	useEffect(() => {
		reload();
		const t = setInterval(reload, 20_000);
		return () => clearInterval(t);
	}, [reload]);
	return { plan, error, reload };
}

export type Prices = { rows: { symbol: string; ticker: string; price: number; confBps: number; publishTime: number }[]; marketHours: { isOpen: boolean; nextOpen: number; nextClose: number } | null; fetchedAt: number };

export function usePrices() {
	const [prices, setPrices] = useState<Prices | null>(null);
	useEffect(() => {
		let alive = true;
		const load = () =>
			fetchJson<Prices>("/api/prices")
				.then((b) => alive && b.rows && setPrices(b))
				.catch(() => undefined);
		load();
		const t = setInterval(load, 30_000);
		return () => {
			alive = false;
			clearInterval(t);
		};
	}, []);
	return prices;
}
