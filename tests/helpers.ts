import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import {
	createMint,
	getOrCreateAssociatedTokenAccount,
	mintTo,
	getAccount,
	TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

export const USDC_DECIMALS = 6;

/** Like `AnchorProvider.env()` but pinned to "confirmed" on both the connection
 *  and preflight. With "processed" the slow local validator on this host hands
 *  out blockhashes its simulator has not seen yet ("Blockhash not found"). */
export function makeProvider(): anchor.AnchorProvider {
	const url = process.env.ANCHOR_PROVIDER_URL;
	if (!url) throw new Error("ANCHOR_PROVIDER_URL is not defined");
	const env = anchor.AnchorProvider.env();
	const connection = new Connection(url, "confirmed");
	const provider = new anchor.AnchorProvider(connection, env.wallet, {
		commitment: "confirmed",
		preflightCommitment: "confirmed",
	});
	anchor.setProvider(provider);
	return provider;
}
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

/** Funds `to` from the provider wallet. The local validator's faucet answers
 *  "Internal error" on this Windows host, so a plain transfer is used. */
export async function airdrop(provider: anchor.AnchorProvider, to: PublicKey, sol = 5) {
	await retry(async () => {
		const tx = new anchor.web3.Transaction().add(
			SystemProgram.transfer({ fromPubkey: provider.wallet.publicKey, toPubkey: to, lamports: sol * LAMPORTS_PER_SOL }),
		);
		await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
	});
}

/** The local validator on this host occasionally answers "Blockhash not
 *  found" right after a burst of transactions; retry setup steps a few times. */
export async function retry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
	let last: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			return await fn();
		} catch (err) {
			last = err;
			await new Promise((r) => setTimeout(r, 500 * (i + 1)));
		}
	}
	throw last;
}

export async function createUsdc(provider: anchor.AnchorProvider, payer: Keypair) {
	return retry(() => createMint(provider.connection, payer, payer.publicKey, null, USDC_DECIMALS));
}

export async function fundUsdc(
	provider: anchor.AnchorProvider,
	payer: Keypair,
	mint: PublicKey,
	owner: PublicKey,
	amount: number,
) {
	const ata = await retry(() => getOrCreateAssociatedTokenAccount(provider.connection, payer, mint, owner));
	await retry(() => mintTo(provider.connection, payer, mint, ata.address, payer, Math.round(amount * 1_000_000)));
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
