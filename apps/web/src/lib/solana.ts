// Browser-side chain access: connection, programs, PDAs. Mirrors
// apps/keeper/src/chain.ts but signs with whatever wallet the app holds.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import basketIdl from "@/generated/basket_dca.json";
import marketIdl from "@/generated/mock_market.json";
import deployment from "@/generated/devnet.json";
import type { BasketDca } from "@/generated/basket_dca";
import type { MockMarket } from "@/generated/mock_market";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
export const DEPLOYMENT = deployment;
export const BASKET_PROGRAM = new PublicKey(deployment.basketDcaProgram);
export const MARKET_PROGRAM = new PublicKey(deployment.mockMarketProgram);
export const USDC_MINT = new PublicKey(deployment.usdcMint);
export const CONFIG = new PublicKey(deployment.config);
/** A funded plan anyone can open without a wallet, so the app is worth
 *  looking at before you connect anything. */
export const DEMO_PLAN = process.env.NEXT_PUBLIC_DEMO_PLAN || "5vV866AdEP6kR5NemndnVoopUCK4ygXCuyGUG8L78LZq";

export const EXPLORER = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const EXPLORER_ACCOUNT = (addr: string) => `https://explorer.solana.com/address/${addr}?cluster=devnet`;

let _conn: Connection | null = null;
export function connection(): Connection {
	if (!_conn) _conn = new Connection(RPC_URL, { commitment: "confirmed" });
	return _conn;
}

/** Minimal Anchor wallet around a local keypair (the demo burner). */
export function keypairWallet(kp: Keypair): anchor.Wallet {
	return {
		publicKey: kp.publicKey,
		payer: kp,
		async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
			if (tx instanceof VersionedTransaction) tx.sign([kp]);
			else tx.partialSign(kp);
			return tx;
		},
		async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
			for (const tx of txs) {
				if (tx instanceof VersionedTransaction) tx.sign([kp]);
				else tx.partialSign(kp);
			}
			return txs;
		},
	} as anchor.Wallet;
}

/** Read-only programs (no signer). */
export function readPrograms() {
	const wallet = keypairWallet(Keypair.generate());
	return programsFor(wallet);
}

export function programsFor(wallet: anchor.Wallet) {
	const provider = new anchor.AnchorProvider(connection(), wallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
	return {
		provider,
		basket: new Program(basketIdl as BasketDca, provider),
		market: new Program(marketIdl as MockMarket, provider),
	};
}

export function planPda(owner: PublicKey, planId: number) {
	const id = Buffer.alloc(2);
	id.writeUInt16LE(planId);
	return PublicKey.findProgramAddressSync([Buffer.from("plan"), owner.toBuffer(), id], BASKET_PROGRAM)[0];
}

export const vaultPda = (plan: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("vault"), plan.toBuffer()], BASKET_PROGRAM)[0];

export const ata = (owner: PublicKey, mint: PublicKey) => getAssociatedTokenAddressSync(mint, owner, false);

export type PlanAccount = Awaited<ReturnType<Program<BasketDca>["account"]["plan"]["fetch"]>>;

export const marketBySymbol = (symbol: string) => {
	const m = (deployment.markets as Record<string, { symbol: string; feedId: string; market: string; stockMint: string; treasury: string; reference: string }>)[symbol];
	if (!m) throw new Error(`no market ${symbol}`);
	return m;
};

export const symbolByMint = (mint: string) =>
	Object.values(deployment.markets).find((m) => m.stockMint === mint)?.symbol ?? mint.slice(0, 6);
