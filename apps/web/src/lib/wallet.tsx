"use client";

// Demo wallet: a burner keypair in localStorage, funded by /api/faucet.
// Judges get from zero to a funded wallet in one click and never install a
// browser extension. Nothing here is custodial: the key lives only in this
// browser and the vault is a PDA the key controls.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { ata, connection, USDC_MINT } from "./solana";

const STORAGE_KEY = "bozbasket.demoWallet";

type WalletState = {
	keypair: Keypair | null;
	publicKey: PublicKey | null;
	sol: number;
	usdc: number;
	busy: string | null;
	create: () => Promise<void>;
	fund: () => Promise<void>;
	forget: () => void;
	refresh: () => Promise<void>;
};

const Ctx = createContext<WalletState | null>(null);

export function DemoWalletProvider({ children }: { children: ReactNode }) {
	const [keypair, setKeypair] = useState<Keypair | null>(null);
	const [sol, setSol] = useState(0);
	const [usdc, setUsdc] = useState(0);
	const [busy, setBusy] = useState<string | null>(null);

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (raw) setKeypair(Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw))));
		} catch {
			/* ignore a corrupt entry */
		}
	}, []);

	const readBalances = useCallback(async (pk: PublicKey) => {
		const conn = connection();
		const [lamports, usdcAcc] = await Promise.all([conn.getBalance(pk), getAccount(conn, ata(pk, USDC_MINT)).catch(() => null)]);
		setSol(lamports / 1e9);
		setUsdc(usdcAcc ? Number(usdcAcc.amount) / 1e6 : 0);
	}, []);

	const refresh = useCallback(async () => {
		if (keypair) await readBalances(keypair.publicKey);
	}, [keypair, readBalances]);

	useEffect(() => {
		refresh();
		const t = setInterval(refresh, 15_000);
		return () => clearInterval(t);
	}, [refresh]);

	const fundKey = useCallback(async (pk: PublicKey) => {
		const res = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: pk.toBase58() }) });
		const body = await res.json();
		if (!res.ok) throw new Error(body.error ?? "faucet failed");
	}, []);

	const create = useCallback(async () => {
		setBusy("Creating your demo wallet");
		try {
			const kp = Keypair.generate();
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(kp.secretKey)));
			setKeypair(kp);
			setBusy("Airdropping SOL and 10,000 devnet USDC");
			await fundKey(kp.publicKey);
			// The balance read when the key appeared ran before the faucet paid,
			// and the next poll is 15 s away: without this the builder stayed
			// disabled, saying the wallet held $0.00.
			await readBalances(kp.publicKey).catch(() => undefined);
		} finally {
			setBusy(null);
		}
	}, [fundKey, readBalances]);

	const fund = useCallback(async () => {
		if (!keypair) return;
		setBusy("Topping up");
		try {
			await fundKey(keypair.publicKey);
			await refresh();
		} finally {
			setBusy(null);
		}
	}, [keypair, fundKey, refresh]);

	const forget = useCallback(() => {
		window.localStorage.removeItem(STORAGE_KEY);
		setKeypair(null);
		setSol(0);
		setUsdc(0);
	}, []);

	useEffect(() => {
		if (keypair) refresh();
	}, [keypair, refresh]);

	const value = useMemo<WalletState>(
		() => ({ keypair, publicKey: keypair?.publicKey ?? null, sol, usdc, busy, create, fund, forget, refresh }),
		[keypair, sol, usdc, busy, create, fund, forget, refresh],
	);
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemoWallet(): WalletState {
	const v = useContext(Ctx);
	if (!v) throw new Error("useDemoWallet outside DemoWalletProvider");
	return v;
}
