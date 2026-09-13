// Program handles, PDAs and account loading shared by the keeper loop and the
// setup script.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
// idl/ is committed; target/ is not, so a fresh checkout (CI, a worker host)
// still has the program interface. Refresh it with tools/sync-idl.mjs.
import basketIdl from "../../../idl/basket_dca.json";
import marketIdl from "../../../idl/mock_market.json";
import type { BasketDca } from "../../../idl/basket_dca";
import type { MockMarket } from "../../../idl/mock_market";

export type Chain = {
	connection: Connection;
	provider: anchor.AnchorProvider;
	wallet: anchor.Wallet;
	basket: Program<BasketDca>;
	market: Program<MockMarket>;
};

/** A signer with Anchor's `Wallet` interface, built by hand.
 *
 *  Anchor's own `Wallet` class exists only in its Node build. Bundled into
 *  the web app, webpack resolves the browser build and `new anchor.Wallet`
 *  throws "Wallet is not a constructor". The transaction kind is told apart
 *  by shape, as Anchor's class does, never by `instanceof`: the Pyth SDK
 *  builds its transactions with a different copy of web3.js, and an
 *  `instanceof` check against ours would call `partialSign` on a versioned
 *  transaction that has no such method. */
export function keypairWallet(kp: Keypair): anchor.Wallet {
	const sign = <T extends Transaction | VersionedTransaction>(tx: T): T => {
		if ("version" in tx) (tx as VersionedTransaction).sign([kp]);
		else (tx as Transaction).partialSign(kp);
		return tx;
	};
	return {
		publicKey: kp.publicKey,
		payer: kp,
		async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
			return sign(tx);
		},
		async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
			return txs.map(sign);
		},
	} as anchor.Wallet;
}

export function connect(rpcUrl: string, keeper: Keypair): Chain {
	const connection = new Connection(rpcUrl, { commitment: "confirmed" });
	const wallet = keypairWallet(keeper);
	const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
	anchor.setProvider(provider);
	return {
		connection,
		provider,
		wallet,
		basket: new Program(basketIdl as BasketDca, provider),
		market: new Program(marketIdl as MockMarket, provider),
	};
}

export const configPda = (program: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("config")], program)[0];

export function planPda(program: PublicKey, owner: PublicKey, planId: number) {
	const id = Buffer.alloc(2);
	id.writeUInt16LE(planId);
	return PublicKey.findProgramAddressSync([Buffer.from("plan"), owner.toBuffer(), id], program)[0];
}

export const vaultPda = (program: PublicKey, plan: PublicKey) =>
	PublicKey.findProgramAddressSync([Buffer.from("vault"), plan.toBuffer()], program)[0];

export function marketPdas(program: PublicKey, symbol: string) {
	const s = Buffer.from(symbol);
	const pda = (seed: string) => PublicKey.findProgramAddressSync([Buffer.from(seed), s], program)[0];
	return { market: pda("market"), stockMint: pda("stock"), treasury: pda("treasury"), reference: pda("reference") };
}

export const ownerStockAta = (owner: PublicKey, stockMint: PublicKey) => getAssociatedTokenAddressSync(stockMint, owner, false);

export type PlanAccount = Awaited<ReturnType<Program<BasketDca>["account"]["plan"]["fetch"]>>;
export type LoadedPlan = { pubkey: PublicKey; account: PlanAccount };

/** Every Active plan. Few plans in the demo, so client-side filtering is fine. */
export async function loadActivePlans(basket: Program<BasketDca>): Promise<LoadedPlan[]> {
	const all = await basket.account.plan.all();
	return all.filter((p) => p.account.status === 0).map((p) => ({ pubkey: p.publicKey, account: p.account }));
}

export const feedHex = (bytes: number[] | Uint8Array) => Buffer.from(bytes).toString("hex");

/** Unix time according to the cluster, not the host: the guard compares
 *  publish_time with the on-chain clock, and this host's clock drifts. */
export async function chainNow(connection: Connection): Promise<number> {
	const slot = await connection.getSlot("confirmed");
	const t = await connection.getBlockTime(slot);
	if (t === null) throw new Error(`no block time for slot ${slot}`);
	return t;
}
