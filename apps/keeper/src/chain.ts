// Program handles, PDAs and account loading shared by the keeper loop and the
// setup script.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import basketIdl from "../../../target/idl/basket_dca.json";
import marketIdl from "../../../target/idl/mock_market.json";
import type { BasketDca } from "../../../target/types/basket_dca";
import type { MockMarket } from "../../../target/types/mock_market";

export type Chain = {
	connection: Connection;
	provider: anchor.AnchorProvider;
	wallet: anchor.Wallet;
	basket: Program<BasketDca>;
	market: Program<MockMarket>;
};

export function connect(rpcUrl: string, keeper: Keypair): Chain {
	const connection = new Connection(rpcUrl, { commitment: "confirmed" });
	const wallet = new anchor.Wallet(keeper);
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
