// One-time devnet setup after `anchor deploy`: mock USDC mint, config, the
// three mock markets (mTSLA, mQQQ, mVOO) seeded with the current Hermes
// price. Idempotent: reruns skip what exists. Writes deploy/<cluster>.json.
//
//   source tools/env.sh && pnpm --filter keeper setup:devnet

import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { loadConfig, type Deployment } from "../src/config";
import { connect, configPda, marketPdas } from "../src/chain";
import { HermesClient } from "../src/hermes";

const PYTH_RECEIVER = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

const STOCKS = [
	{ symbol: "mTSLA", feedId: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1" },
	{ symbol: "mQQQ", feedId: "9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d" },
	{ symbol: "mVOO", feedId: "236b30dd09a9c00dfeec156c7b1efd646c0f01825a1758e3e4a0679e3bdff179" },
];

const THRESHOLDS = {
	maxStalenessSecs: 120, // Hermes update to landed tx takes a few seconds; 2 min is generous during session
	maxConfBps: 50,
	maxDivergenceBps: 150,
	minLiquidityUsdc: new anchor.BN(500_000_000), // $500 per leg
};
const SPREAD_BPS = 20;
const LIQUIDITY = new anchor.BN(50_000_000_000); // $50k per market

async function main() {
	const cfg = loadConfig();
	const chain = connect(cfg.rpcUrl, cfg.keeper);
	const admin = chain.wallet.publicKey;
	const file = cfg.deploymentFile;
	const existing: Partial<Deployment> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
	console.log(`admin/keeper ${admin.toBase58()} on ${cfg.cluster}`);

	// Mock USDC (6 decimals, mint authority = keeper, so the demo faucet works).
	let usdcMint: PublicKey;
	if (existing.usdcMint) {
		usdcMint = new PublicKey(existing.usdcMint);
		console.log("usdc mint exists", usdcMint.toBase58());
	} else {
		usdcMint = await createMint(chain.connection, cfg.keeper, admin, null, 6);
		console.log("created mock USDC mint", usdcMint.toBase58());
	}

	const config = configPda(chain.basket.programId);
	const params = {
		keeper: admin,
		...THRESHOLDS,
		fillProgram: chain.market.programId,
		referenceProgram: cfg.cluster === "localnet" ? chain.market.programId : PYTH_RECEIVER,
	};
	if (await chain.connection.getAccountInfo(config)) {
		await chain.basket.methods.updateConfig(params).accountsPartial({ config, admin }).rpc();
		console.log("config updated", config.toBase58());
	} else {
		await chain.basket.methods
			.initConfig(params)
			.accountsPartial({ config, usdcMint, admin, systemProgram: SystemProgram.programId })
			.rpc();
		console.log("config created", config.toBase58());
	}

	const hermes = new HermesClient(cfg.hermesUrl, cfg.pythApiKey);
	const latest = await hermes.latest(STOCKS.map((s) => s.feedId));
	const priceByFeed = new Map(latest.parsed.map((p) => [p.feedId, p]));

	const markets: Deployment["markets"] = {};
	for (const s of STOCKS) {
		const pdas = marketPdas(chain.market.programId, s.symbol);
		if (!(await chain.connection.getAccountInfo(pdas.market))) {
			await chain.market.methods
				.initMarket(s.symbol, Array.from(Buffer.from(s.feedId, "hex")), SPREAD_BPS, LIQUIDITY)
				.accountsPartial({ market: pdas.market, stockMint: pdas.stockMint, usdcMint, admin, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY })
				.rpc();
			console.log(`market ${s.symbol} created`, pdas.market.toBase58());
		}
		if (!(await chain.connection.getAccountInfo(pdas.reference))) {
			await chain.market.methods
				.initMarketAccounts()
				.accountsPartial({ market: pdas.market, usdcMint, treasury: pdas.treasury, reference: pdas.reference, admin, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY })
				.rpc();
			console.log(`market ${s.symbol} accounts created`);
		}
		const px = priceByFeed.get(s.feedId);
		if (px) {
			await chain.market.methods
				.postReference(new anchor.BN(px.price.toString()), new anchor.BN(px.conf.toString()), px.expo, new anchor.BN(px.publishTime))
				.accountsPartial({ market: pdas.market, reference: pdas.reference, admin })
				.rpc();
			console.log(`market ${s.symbol} reference ${Number(px.price) / 1e8} @ ${new Date(px.publishTime * 1000).toISOString()}`);
		}
		markets[s.symbol] = {
			symbol: s.symbol,
			feedId: s.feedId,
			market: pdas.market.toBase58(),
			stockMint: pdas.stockMint.toBase58(),
			treasury: pdas.treasury.toBase58(),
			reference: pdas.reference.toBase58(),
		};
	}

	const deployment: Deployment = {
		cluster: cfg.cluster,
		basketDcaProgram: chain.basket.programId.toBase58(),
		mockMarketProgram: chain.market.programId.toBase58(),
		usdcMint: usdcMint.toBase58(),
		config: config.toBase58(),
		markets,
	};
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(deployment, null, 2) + "\n");
	console.log("wrote", file);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
