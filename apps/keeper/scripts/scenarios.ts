// Walks every guard outcome end to end on devnet and checks that the three
// layers agree: the demo control changes real state, the guard panel predicts
// a verdict, and the program records that same verdict on chain.
//
//   source tools/env.sh
//   pnpm --filter web start                       # the demo API must be up
//   pnpm --filter keeper exec tsx scripts/scenarios.ts <plan>
//
// Runs in mock reference mode so each cause can be isolated (with the real
// Pyth receiver every weekend attempt is stale before anything else is
// reached). Restores the config and every market before exiting.

import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { REASON, reasonLabel } from "@bozbasket/shared";
import { loadConfig, loadDeployment } from "../src/config";
import { chainNow, configPda, connect } from "../src/chain";
import { HermesClient } from "../src/hermes";
import { LogLedger } from "../src/ledger";
import { Executor, PYTH_RECEIVER } from "../src/executor";

const WEB = process.env.WEB_URL ?? "http://localhost:3200";

type Outcome = { name: string; expected: number; predicted: number | string; actual: number | string; signature: string; ok: boolean };

async function demo(action: string, body: Record<string, unknown> = {}) {
	const res = await fetch(`${WEB}/api/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }), signal: AbortSignal.timeout(120_000) });
	const json = (await res.json()) as { ok?: boolean; detail?: string; error?: string; signature?: string };
	if (!res.ok) throw new Error(`demo ${action}: ${json.error}`);
	return json;
}

async function predict(plan: string): Promise<number | string> {
	for (let i = 0; i < 3; i++) {
		try {
			const res = await fetch(`${WEB}/api/guard?plan=${plan}`, { signal: AbortSignal.timeout(60_000) });
			const json = (await res.json()) as { verdict?: { reason: number }; error?: string };
			if (json.verdict) return json.verdict.reason;
			if (i === 2) return json.error ?? "no verdict";
		} catch (err) {
			if (i === 2) return (err as Error).message;
		}
	}
	return "unreachable";
}

async function main() {
	const planArg = process.argv[2];
	if (!planArg) throw new Error("usage: scenarios.ts <plan>");
	const plan = new PublicKey(planArg);
	const cfg = { ...loadConfig(), referenceSource: "mock" as const, offHours: "guarded" as const };
	const dep = loadDeployment(cfg.deploymentFile);
	const chain = connect(cfg.rpcUrl, cfg.keeper);
	const executor = new Executor(chain, cfg, dep, new HermesClient(cfg.hermesUrl, cfg.pythApiKey), new LogLedger());
	const config = configPda(chain.basket.programId);

	const setReference = async (mode: "pyth" | "mock") => {
		const c = await chain.basket.account.config.fetch(config);
		await chain.basket.methods
			.updateConfig({
				keeper: c.keeper,
				maxStalenessSecs: c.maxStalenessSecs,
				maxConfBps: c.maxConfBps,
				maxDivergenceBps: c.maxDivergenceBps,
				minLiquidityUsdc: c.minLiquidityUsdc,
				fillProgram: c.fillProgram,
				referenceProgram: mode === "pyth" ? PYTH_RECEIVER : chain.market.programId,
			})
			.accountsPartial({ config, admin: chain.wallet.publicKey })
			.rpc();
	};

	// The plan owner signs deposits and withdrawals.
	const ownerFile = path.join(path.dirname(cfg.deploymentFile), "demo-user.keypair.json");
	const owner = fs.existsSync(ownerFile) ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(ownerFile, "utf8")))) : null;
	const ownerChain = owner ? connect(cfg.rpcUrl, owner) : null;
	const vaultMove = async (kind: "withdraw" | "deposit", usdc: number) => {
		if (!ownerChain || !owner) throw new Error(`${ownerFile} missing; cannot move the vault`);
		const p = await chain.basket.account.plan.fetch(plan);
		const accounts = { plan, vault: p.vault, ownerUsdc: getAssociatedTokenAddressSync(new PublicKey(dep.usdcMint), owner.publicKey, false), owner: owner.publicKey, tokenProgram: TOKEN_PROGRAM_ID };
		const amount = new anchor.BN(Math.round(usdc * 1e6));
		await (kind === "withdraw" ? ownerChain.basket.methods.withdraw(amount) : ownerChain.basket.methods.deposit(amount)).accountsPartial(accounts).rpc();
	};
	const resume = async () => {
		if (!ownerChain || !owner) return;
		const p = await chain.basket.account.plan.fetch(plan);
		if (p.status === 1) await ownerChain.basket.methods.setPaused(false).accountsPartial({ plan, owner: owner.publicKey }).signers([owner]).rpc();
	};

	const run = async (name: string, expected: number, setup: () => Promise<void>, teardown: () => Promise<void>): Promise<Outcome> => {
		await setup();
		await resume();
		await demo("nudge", { plan: plan.toBase58() });
		const predicted = await predict(plan.toBase58());
		const loaded = { pubkey: plan, account: await chain.basket.account.plan.fetch(plan) };
		const result = await executor.run(loaded, await chainNow(chain.connection));
		const actual = result.kind === "executed" ? REASON.OK : "reason" in result ? result.reason : result.kind;
		const signature = "signature" in result ? result.signature : "";
		await teardown();
		const outcome = { name, expected, predicted, actual, signature, ok: actual === expected && predicted === expected };
		console.log(`${outcome.ok ? "PASS" : "FAIL"}  ${name.padEnd(22)} expected ${reasonLabel(expected)} · panel ${predicted} · chain ${actual} ${signature.slice(0, 16)}`);
		return outcome;
	};

	console.log(`plan ${plan.toBase58()} on ${cfg.cluster}; switching to mock reference mode`);
	await setReference("mock");
	await demo("restore");

	const results: Outcome[] = [];
	results.push(await run("baseline execute", REASON.OK, async () => undefined, async () => undefined));
	results.push(await run("divergence", REASON.DIVERGENCE, async () => void (await demo("divergence", { symbol: "mTSLA" })), async () => void (await demo("restore"))));
	results.push(await run("low liquidity", REASON.LOW_LIQUIDITY, async () => void (await demo("liquidity", { symbol: "mQQQ" })), async () => void (await demo("restore"))));
	results.push(await run("confidence too wide", REASON.CONFIDENCE_TOO_WIDE, async () => void (await demo("confidence")), async () => void (await demo("restore"))));
	results.push(await run("reference stale", REASON.REFERENCE_STALE, async () => void (await demo("staleness")), async () => void (await demo("restore"))));
	results.push(
		await run(
			"insufficient balance",
			REASON.INSUFFICIENT_BALANCE,
			async () => {
				const p = await chain.basket.account.plan.fetch(plan);
				const vault = await chain.connection.getTokenAccountBalance(p.vault);
				const keep = p.amountPerPeriod.toNumber() / 1e6 - 1;
				await vaultMove("withdraw", Number(vault.value.amount) / 1e6 - keep);
			},
			async () => vaultMove("deposit", 300),
		),
	);

	await demo("restore");
	await setReference("pyth");
	await resume();
	console.log("\nrestored: thresholds, markets, and the real Pyth receiver as reference_program");

	const failed = results.filter((r) => !r.ok);
	console.log(`\n${results.length - failed.length}/${results.length} scenarios matched on both the panel and the chain`);
	const out = path.join(path.dirname(cfg.deploymentFile), "scenarios.json");
	fs.writeFileSync(out, JSON.stringify({ plan: plan.toBase58(), ranAt: new Date().toISOString(), results }, null, 2) + "\n");
	console.log("wrote", out);
	if (failed.length) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
