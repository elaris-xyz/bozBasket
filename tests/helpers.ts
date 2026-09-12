import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
	createMint,
	getOrCreateAssociatedTokenAccount,
	mintTo,
	getAccount,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

export const USDC_DECIMALS = 6;
export const usdc = (n: number) => new anchor.BN(Math.round(n * 1_000_000));

/** Pyth-style price with exponent -8. */
export const px = (usd: number) => new anchor.BN(Math.round(usd * 1e8));

export function feedId(hex: string): number[] {
	return Array.from(Buffer.from(hex, "hex"));
}

export const FEEDS = {
	AAPL: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
	NVDA: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
	TSLA: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
};

export async function airdrop(provider: anchor.AnchorProvider, to: PublicKey, sol = 5) {
	const sig = await provider.connection.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
	await provider.connection.confirmTransaction(sig, "confirmed");
}

export async function createUsdc(provider: anchor.AnchorProvider, payer: Keypair) {
	return createMint(provider.connection, payer, payer.publicKey, null, USDC_DECIMALS);
}

export async function fundUsdc(
	provider: anchor.AnchorProvider,
	payer: Keypair,
	mint: PublicKey,
	owner: PublicKey,
	amount: number,
) {
	const ata = await getOrCreateAssociatedTokenAccount(provider.connection, payer, mint, owner);
	await mintTo(provider.connection, payer, mint, ata.address, payer, Math.round(amount * 1_000_000));
	return ata.address;
}

export async function tokenBalance(provider: anchor.AnchorProvider, account: PublicKey) {
	return Number((await getAccount(provider.connection, account)).amount);
}

export function configPda(program: PublicKey) {
	return PublicKey.findProgramAddressSync([Buffer.from("config")], program)[0];
}

export function planPda(program: PublicKey, owner: PublicKey, planId: number) {
	const id = Buffer.alloc(2);
	id.writeUInt16LE(planId);
	return PublicKey.findProgramAddressSync([Buffer.from("plan"), owner.toBuffer(), id], program)[0];
}

export function vaultPda(program: PublicKey, plan: PublicKey) {
	return PublicKey.findProgramAddressSync([Buffer.from("vault"), plan.toBuffer()], program)[0];
}

export function marketPdas(program: PublicKey, symbol: string) {
	const s = Buffer.from(symbol);
	const pda = (seed: string) => PublicKey.findProgramAddressSync([Buffer.from(seed), s], program)[0];
	return { market: pda("market"), stockMint: pda("stock"), treasury: pda("treasury"), reference: pda("reference") };
}

/** Asserts that a promise rejects with an Anchor error carrying `code`. */
export async function expectAnchorError(p: Promise<unknown>, code: string) {
	try {
		await p;
	} catch (err: any) {
		const got = err?.error?.errorCode?.code ?? err?.errorCode?.code ?? String(err);
		expect(got, `expected ${code}, got ${got}`).to.equal(code);
		return;
	}
	expect.fail(`expected ${code} but the transaction succeeded`);
}

export { SystemProgram, TOKEN_PROGRAM_ID };
