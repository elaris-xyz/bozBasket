import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

export type OffHoursPolicy = "strict" | "guarded";

export type KeeperConfig = {
	rpcUrl: string;
	cluster: "devnet" | "localnet" | "mainnet-beta";
	keeper: Keypair;
	hermesUrl: string;
	pythApiKey: string;
	databaseUrl: string | undefined;
	offHours: OffHoursPolicy;
	pollSeconds: number;
	/** Path to deploy/<cluster>.json written by setup-devnet. */
	deploymentFile: string;
	computeUnitPriceMicroLamports: number;
	/** Do not submit at all when the reference is older than this. */
	skipStaleOlderThanSecs: number;
};

function required(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set (see .env.example)`);
	return v;
}

/** Reads a Solana CLI keypair file (JSON array of 64 bytes). */
export function loadKeypair(file: string): Keypair {
	const resolved = file.startsWith("~") ? path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", file.slice(1)) : file;
	const raw = JSON.parse(fs.readFileSync(resolved, "utf8")) as number[];
	return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function loadConfig(): KeeperConfig {
	const cluster = (process.env.SOLANA_CLUSTER ?? "devnet") as KeeperConfig["cluster"];
	const keeperFile = process.env.KEEPER_KEYPAIR ?? "~/.config/solana/id.json";
	return {
		rpcUrl: process.env.SOLANA_RPC_URL ?? (cluster === "localnet" ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com"),
		cluster,
		keeper: loadKeypair(keeperFile),
		hermesUrl: (process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network").replace(/\/$/, ""),
		pythApiKey: required("PYTH_API_KEY"),
		databaseUrl: process.env.DATABASE_URL || undefined,
		offHours: (process.env.OFF_HOURS_POLICY as OffHoursPolicy) ?? "strict",
		pollSeconds: Number(process.env.KEEPER_POLL_SECONDS ?? 60),
		deploymentFile: process.env.DEPLOYMENT_FILE ?? path.resolve(__dirname, `../../../deploy/${cluster}.json`),
		computeUnitPriceMicroLamports: Number(process.env.CU_PRICE_MICROLAMPORTS ?? 50_000),
		skipStaleOlderThanSecs: Number(process.env.SKIP_STALE_OLDER_THAN_SECS ?? 7 * 86_400),
	};
}

/** Addresses produced by scripts/setup-devnet.ts. */
export type Deployment = {
	cluster: string;
	basketDcaProgram: string;
	mockMarketProgram: string;
	usdcMint: string;
	config: string;
	markets: Record<string, { symbol: string; feedId: string; market: string; stockMint: string; treasury: string; reference: string }>;
};

export function loadDeployment(file: string): Deployment {
	return JSON.parse(fs.readFileSync(file, "utf8")) as Deployment;
}
