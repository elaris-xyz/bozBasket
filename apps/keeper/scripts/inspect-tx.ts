// Prints the program calls, bozBasket events and plan state behind a signature.
//
//   pnpm --filter keeper exec tsx scripts/inspect-tx.ts <signature> [plan]

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "../src/config";
import { connect } from "../src/chain";

async function main() {
	const [sig, planArg] = process.argv.slice(2);
	if (!sig) throw new Error("usage: inspect-tx.ts <signature> [plan]");
	const cfg = loadConfig();
	const chain = connect(cfg.rpcUrl, cfg.keeper);
	const tx = await chain.connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
	if (!tx) throw new Error("transaction not found");
	const logs = tx.meta?.logMessages ?? [];
	console.log(`slot ${tx.slot}  err ${JSON.stringify(tx.meta?.err)}  fee ${tx.meta?.fee} lamports  cu ${tx.meta?.computeUnitsConsumed}`);
	console.log(logs.filter((l) => /invoke \[[12]\]|Instruction:/.test(l)).map((l) => l.replace(/^Program /, "  ")).join("\n"));
	const parser = new anchor.EventParser(chain.basket.programId, chain.basket.coder);
	for (const ev of parser.parseLogs(logs)) {
		console.log(`event ${ev.name}:`, JSON.stringify(ev.data, (_k, v) => (typeof v === "object" && v !== null && "toBase58" in v ? (v as PublicKey).toBase58() : v?.toString?.() ?? v), 1).replace(/\n\s*/g, " "));
	}
	if (planArg) {
		const p = await chain.basket.account.plan.fetch(new PublicKey(planArg));
		console.log(`plan: executions ${p.executions}, deferrals ${p.deferrals}, last_reason ${p.lastReason}, invested ${p.totalInvested.toNumber() / 1e6} USDC, next ${new Date(p.nextExecution.toNumber() * 1000).toISOString()}`);
		p.legs.slice(0, p.legCount).forEach((l, i) => console.log(`  leg ${i} ${l.mint.toBase58().slice(0, 8)} weight ${l.weightBps} units ${l.unitsBought.toNumber() / 1e6}`));
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
