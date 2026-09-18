// Funds a demo wallet: a little SOL for fees and rent, plus mock devnet USDC.
//
// This endpoint is public, so it signs with FAUCET_SECRET_KEY, an identity
// that owns nothing but its own SOL and the mock USDC mint authority. It must
// not be the keeper/admin key, which is the programs' upgrade authority.
// See apps/keeper/scripts/setup-faucet.ts.

import { NextResponse } from "next/server";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import deployment from "@/generated/devnet.json";

export const runtime = "nodejs";

/** Creating and funding a plan measured 0.0058 SOL (rent on the plan, its
 *  vault and the token accounts, plus fees) on 2026-09-18, so this covers
 *  three plans. It was 0.04, seven plans' worth, which spent the faucet on
 *  roughly 39 visitors; at 0.02 the same SOL serves about twice as many. */
const DRIP_SOL = 0.02;
/** A wallet already holding this much USDC gets nothing more. */
const USDC_CEILING = 5_000;
const USDC_GRANT = 10_000;
/** Stop handing out SOL below this, so one loop cannot empty the faucet. */
const FAUCET_FLOOR_SOL = 0.2;

function faucetKeypair(): Keypair {
	const raw = process.env.FAUCET_SECRET_KEY ?? process.env.KEEPER_SECRET_KEY;
	if (!raw) throw new Error("FAUCET_SECRET_KEY is not set");
	return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export async function POST(req: Request) {
	try {
		const { wallet } = (await req.json()) as { wallet?: string };
		if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });
		let to: PublicKey;
		try {
			to = new PublicKey(wallet);
		} catch {
			return NextResponse.json({ error: "not a valid address" }, { status: 400 });
		}

		const conn = new Connection(process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com", "confirmed");
		const payer = faucetKeypair();
		const mint = new PublicKey(deployment.usdcMint);
		const ata = getAssociatedTokenAddressSync(mint, to, false);

		const [lamports, usdcAcc, faucetLamports] = await Promise.all([
			conn.getBalance(to),
			getAccount(conn, ata).catch(() => null),
			conn.getBalance(payer.publicKey),
		]);
		const usdc = usdcAcc ? Number(usdcAcc.amount) / 1e6 : 0;

		const tx = new Transaction();
		const wantsSol = lamports < (DRIP_SOL / 2) * LAMPORTS_PER_SOL;
		if (wantsSol && faucetLamports < (FAUCET_FLOOR_SOL + DRIP_SOL) * LAMPORTS_PER_SOL) {
			return NextResponse.json({ error: "faucet is empty; ask the team to top it up" }, { status: 503 });
		}
		if (wantsSol) tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: to, lamports: Math.round(DRIP_SOL * LAMPORTS_PER_SOL) }));
		if (usdc < USDC_CEILING) {
			tx.add(createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, to, mint));
			tx.add(createMintToInstruction(mint, ata, payer.publicKey, USDC_GRANT * 1_000_000));
		}
		if (tx.instructions.length === 0) return NextResponse.json({ ok: true, skipped: true });

		const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
		tx.recentBlockhash = blockhash;
		tx.feePayer = payer.publicKey;
		tx.sign(payer);
		const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
		await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
		return NextResponse.json({ ok: true, signature: sig });
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 500 });
	}
}
