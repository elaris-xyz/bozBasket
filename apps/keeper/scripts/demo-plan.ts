// Creates a demo user with a funded plan on the configured cluster, so the
// keeper has something to execute. Idempotent per plan id.
//
//   pnpm --filter keeper exec tsx scripts/demo-plan.ts [planId=1] [amountUsdc=100] [periodSeconds=604800]
//
// The demo user's keypair is written to deploy/demo-user.keypair.json
// (gitignored via *.keypair.json) and reused on later runs.

import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { loadConfig, loadDeployment } from "../src/config";
import { connect, configPda, planPda, vaultPda } from "../src/chain";

const WEIGHTS: Record<string, number> = { mTSLA: 5000, mQQQ: 3000, mVOO: 2000 };

async function main() {
	const [planIdArg = "1", amountArg = "100", periodArg = "604800"] = process.argv.slice(2);
	const planId = Number(planIdArg);
	const cfg = loadConfig();
	const dep = loadDeployment(cfg.deploymentFile);
	const chain = connect(cfg.rpcUrl, cfg.keeper);

	const userFile = path.join(path.dirname(cfg.deploymentFile), "demo-user.keypair.json");
	let user: Keypair;
	if (fs.existsSync(userFile)) {
		user = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(userFile, "utf8"))));
	} else {
		user = Keypair.generate();
		fs.writeFileSync(userFile, JSON.stringify(Array.from(user.secretKey)));
	}
	console.log("demo user", user.publicKey.toBase58());

	// SOL for rent and fees, from the keeper (devnet faucet is unreliable).
	const bal = await chain.connection.getBalance(user.publicKey);
	if (bal < 0.05 * LAMPORTS_PER_SOL) {
		const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: chain.wallet.publicKey, toPubkey: user.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL }));
		await chain.provider.sendAndConfirm(tx);
		console.log("sent 0.1 SOL to demo user");
	}

	// Mock USDC.
	const usdcMint = new PublicKey(dep.usdcMint);
	const userUsdc = await getOrCreateAssociatedTokenAccount(chain.connection, cfg.keeper, usdcMint, user.publicKey);
	if (Number(userUsdc.amount) < 1_000_000_000) {
		await mintTo(chain.connection, cfg.keeper, usdcMint, userUsdc.address, cfg.keeper, 10_000_000_000);
		console.log("minted 10000 mock USDC to demo user");
	}

	const plan = planPda(chain.basket.programId, user.publicKey, planId);
	const vault = vaultPda(chain.basket.programId, plan);
	const config = configPda(chain.basket.programId);
	if (!(await chain.connection.getAccountInfo(plan))) {
		const legs = Object.entries(WEIGHTS).map(([symbol, weightBps]) => {
			const m = dep.markets[symbol];
			if (!m) throw new Error(`market ${symbol} missing from deployment`);
			return { mint: new PublicKey(m.stockMint), weightBps, pythFeedId: Array.from(Buffer.from(m.feedId, "hex")) };
		});
		await chain.basket.methods
			.createPlan(planId, new anchor.BN(Number(amountArg) * 1_000_000), new anchor.BN(Number(periodArg)), new anchor.BN(0), new anchor.BN(0), legs)
			.accountsPartial({ config, usdcMint, plan, vault, owner: user.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY })
			.signers([user])
			.rpc();
		console.log("plan created", plan.toBase58());
	} else {
		console.log("plan exists", plan.toBase58());
	}

	const vaultInfo = await chain.connection.getTokenAccountBalance(vault).catch(() => null);
	const vaultAmount = Number(vaultInfo?.value.amount ?? 0);
	if (vaultAmount < Number(amountArg) * 1_000_000 * 3) {
		await chain.basket.methods
			.deposit(new anchor.BN(Number(amountArg) * 1_000_000 * 5))
			.accountsPartial({ plan, vault, ownerUsdc: userUsdc.address, owner: user.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
			.signers([user])
			.rpc();
		console.log(`deposited ${Number(amountArg) * 5} USDC into the vault`);
	}

	const p = await chain.basket.account.plan.fetch(plan);
	console.log(`plan ${plan.toBase58()}: ${p.legCount} legs, ${p.amountPerPeriod.toNumber() / 1e6} USDC every ${p.periodSeconds.toNumber()} s, next ${new Date(p.nextExecution.toNumber() * 1000).toISOString()}, status ${p.status}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
