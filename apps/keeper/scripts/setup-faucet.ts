// Creates the dedicated faucet identity and hands it the mock USDC mint
// authority.
//
//   pnpm --filter keeper exec tsx scripts/setup-faucet.ts
//
// Why this exists: the deployed web app runs an open faucet endpoint. If that
// endpoint signed with the keeper keypair, a public URL would be wired to the
// programs' upgrade authority and the config admin. It signs with this key
// instead, which owns nothing but a little SOL and the right to mint play
// USDC. Put its secret in the web app's FAUCET_SECRET_KEY.

import fs from "node:fs";
import path from "node:path";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { AuthorityType, createSetAuthorityInstruction, getMint } from "@solana/spl-token";
import { loadConfig, loadDeployment } from "../src/config";
import { connect } from "../src/chain";

const FUND_SOL = Number(process.env.FAUCET_FUND_SOL ?? 2);

async function main() {
	const cfg = loadConfig();
	const dep = loadDeployment(cfg.deploymentFile);
	const chain = connect(cfg.rpcUrl, cfg.keeper);
	const file = path.join(path.dirname(cfg.deploymentFile), "faucet.keypair.json");

	let faucet: Keypair;
	if (fs.existsSync(file)) {
		faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
		console.log("faucet key exists", faucet.publicKey.toBase58());
	} else {
		faucet = Keypair.generate();
		fs.writeFileSync(file, JSON.stringify(Array.from(faucet.secretKey)));
		console.log("created faucet key", faucet.publicKey.toBase58(), "->", file);
	}

	const balance = await chain.connection.getBalance(faucet.publicKey);
	if (balance < FUND_SOL * LAMPORTS_PER_SOL) {
		const top = Math.round(FUND_SOL * LAMPORTS_PER_SOL - balance);
		await chain.provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({ fromPubkey: chain.wallet.publicKey, toPubkey: faucet.publicKey, lamports: top })));
		console.log(`funded faucet with ${(top / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
	}

	const mint = new PublicKey(dep.usdcMint);
	const info = await getMint(chain.connection, mint);
	if (info.mintAuthority?.equals(faucet.publicKey)) {
		console.log("mint authority already belongs to the faucet");
	} else if (info.mintAuthority?.equals(chain.wallet.publicKey)) {
		await chain.provider.sendAndConfirm(new Transaction().add(createSetAuthorityInstruction(mint, chain.wallet.publicKey, AuthorityType.MintTokens, faucet.publicKey)));
		console.log("moved the mock USDC mint authority to the faucet");
	} else {
		throw new Error(`mint authority is ${info.mintAuthority?.toBase58() ?? "none"}; cannot transfer`);
	}

	console.log("\nSet this in the web app (Vercel project settings, or .env):");
	console.log(`FAUCET_SECRET_KEY=${JSON.stringify(Array.from(faucet.secretKey))}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
