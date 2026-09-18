// Finds a plan's executions and deferrals that are on chain but not in the
// ledger, and with --apply writes them. The chain is the source of truth and
// the ledger its index; they drift when something executes without recording,
// as scripts/scenarios.ts does by design (it keeps a log-only ledger), or when
// Postgres was unreachable (2026-09-13). The plan page charts from the ledger
// and values from the chain, so a gap shows up as money that appears from
// nowhere at the end of the chart.
//
//   source tools/env.sh
//   pnpm --filter keeper exec tsx scripts/recover-ledger.ts <plan> [--demo] [--apply]
//
// Recovered rows are marked in `detail`. Recovered deferrals are `forced`:
// what caused them can no longer be read, and a forced row is never credited
// as a saving. Their guard snapshot is gone, so `legs` stays null. `--demo`
// marks recovered executions `forced` too, for fills that were demo tests on
// the mock reference (the scenario sweeps), which the scorecard must never
// score against a stale price. Leave it off for fills the keeper made while
// Postgres was down: those were real scheduled buys.

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, type ConfirmedSignatureInfo } from "@solana/web3.js";
import { Pool } from "pg";
import { loadConfig } from "../src/config";
import { connect } from "../src/chain";
import { normalizeLeg, type EventLeg } from "../src/executor";
import { PgLedger, type LedgerRow } from "../src/ledger";

const RECOVERED = "recovered from chain: not recorded by the keeper";

async function main() {
	const planArg = process.argv[2];
	if (!planArg || planArg.startsWith("--")) throw new Error("usage: recover-ledger.ts <plan> [--apply]");
	const apply = process.argv.includes("--apply");
	const demo = process.argv.includes("--demo");
	const cfg = loadConfig();
	if (!cfg.databaseUrl) throw new Error("DATABASE_URL is not set");
	const chain = connect(cfg.rpcUrl, cfg.keeper);
	const plan = new PublicKey(planArg);
	const pool = new Pool({ connectionString: cfg.databaseUrl, max: 1 });
	const known = new Set((await pool.query(`SELECT signature FROM executions WHERE plan = $1 AND signature IS NOT NULL`, [plan.toBase58()])).rows.map((r) => r.signature as string));

	const sigs: ConfirmedSignatureInfo[] = [];
	for (let before: string | undefined; ; ) {
		const page = await chain.connection.getSignaturesForAddress(plan, { before, limit: 1000 }, "confirmed");
		sigs.push(...page);
		if (page.length < 1000) break;
		before = page[page.length - 1].signature;
	}
	const unknown = sigs.filter((s) => !s.err && !known.has(s.signature)).reverse();
	console.log(`${sigs.length} transactions touch the plan, ${known.size} are in the ledger, ${unknown.length} to inspect`);

	const parser = new anchor.EventParser(chain.basket.programId, chain.basket.coder);
	const rows: LedgerRow[] = [];
	for (const s of unknown) {
		const tx = await chain.connection.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
		if (!tx) continue;
		for (const ev of parser.parseLogs(tx.meta?.logMessages ?? [])) {
			if (ev.name === "executed") {
				const d = ev.data as { plan: PublicKey; ts: anchor.BN; usdcIn: anchor.BN; legs: EventLeg[] };
				if (!d.plan.equals(plan)) continue;
				rows.push({ plan: plan.toBase58(), ts: d.ts.toNumber(), kind: "executed", reason: 0, detail: RECOVERED, signature: s.signature, usdcIn: d.usdcIn.toString(), legs: d.legs.map(normalizeLeg), forced: demo });
			} else if (ev.name === "deferred") {
				const d = ev.data as { plan: PublicKey; ts: anchor.BN; reason: number; legIndex: number; detail: anchor.BN };
				if (!d.plan.equals(plan)) continue;
				rows.push({ plan: plan.toBase58(), ts: d.ts.toNumber(), kind: "deferred", reason: d.reason, detail: `leg ${d.legIndex}: ${d.detail.toString()}`, signature: s.signature, usdcIn: null, legs: null, forced: true, avoidedUsdc: null });
			}
		}
	}

	for (const r of rows) console.log(`  ${new Date(r.ts * 1000).toISOString()} ${r.kind.padEnd(8)} ${r.kind === "executed" ? `$${Number(r.usdcIn) / 1e6}` : `reason ${r.reason} ${r.detail}`} ${r.signature?.slice(0, 12)}…`);
	const usdc = rows.reduce((n, r) => n + (r.usdcIn ? Number(r.usdcIn) / 1e6 : 0), 0);
	console.log(`${rows.filter((r) => r.kind === "executed").length} executions ($${usdc}) and ${rows.filter((r) => r.kind === "deferred").length} deferrals missing from the ledger`);

	if (apply && rows.length) {
		const ledger = new PgLedger(cfg.databaseUrl);
		for (const r of rows) await ledger.record(r);
		await ledger.close();
		console.log("written");
	} else if (rows.length) {
		console.log("dry run: nothing written. Rerun with --apply to record them.");
	}
	await pool.end();
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
