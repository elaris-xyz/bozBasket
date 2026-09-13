// Funds a demo wallet: 0.05 SOL for fees/rent and 10,000 mock devnet USDC.
// The keeper keypair holds the mock USDC mint authority. Rate-limited per
// wallet by balance: a wallet already holding 5,000+ USDC gets nothing.

import { NextResponse } from "next/server";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import deployment from "@/generated/devnet.json";

export const runtime = "nodejs";

function keeper(): Keypair {
	const raw = process.env.KEEPER_SECRET_KEY;
	if (!raw) throw new Error("KEEPER_SECRET_KEY is not set");
	return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export async function POST(req: Request) {
	try {
		const { wallet } = (await req.json()) as { wallet?: string };
		if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });
		const to = new PublicKey(wallet);
		const conn = new Connection(process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com", "confirmed");
		const kp = keeper();
		const mint = new PublicKey(deployment.usdcMint);
		const ata = getAssociatedTokenAddressSync(mint, to, false);

		const [lamports, usdcAcc] = await Promise.all([conn.getBalance(to), getAccount(conn, ata).catch(() => null)]);
		const usdc = usdcAcc ? Number(usdcAcc.amount) / 1e6 : 0;
		const tx = new Transaction();
		if (lamports < 0.03 * LAMPORTS_PER_SOL) {
			tx.add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: to, lamports: 0.05 * LAMPORTS_PER_SOL }));
		}
		if (usdc < 5_000) {
			tx.add(createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, ata, to, mint));
			tx.add(createMintToInstruction(mint, ata, kp.publicKey, 10_000_000_000));
		}
		if (tx.instructions.length === 0) return NextResponse.json({ ok: true, skipped: true });
		const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
		tx.recentBlockhash = blockhash;
		tx.feePayer = kp.publicKey;
		tx.sign(kp);
		const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
		await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
		return NextResponse.json({ ok: true, signature: sig });
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 500 });
	}
}
