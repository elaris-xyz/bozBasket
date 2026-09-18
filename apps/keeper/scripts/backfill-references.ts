// Fills reference_prices back to the first ledger row, one moment an hour,
// from Hermes history. The keeper records every quarter hour from the day it
// learned to (src/references.ts); this covers the time before. Idempotent:
// moments already stored are skipped, and the primary key drops repeats.
//
//   source tools/env.sh
//   pnpm --filter keeper exec tsx scripts/backfill-references.ts [--from <unix ts>]
//
// Serial and paced on purpose: the Pyth key is rate-limited (429, retry-after
// 10 s, at six parallel requests) and the running keepers need it.

import { Pool } from "pg";
import { loadConfig, loadDeployment } from "../src/config";
import { PgLedger } from "../src/ledger";
import type { ReferenceRow } from "../src/references";

const STEP = 3600;
const PACE_MS = 1200;
/** Hermes answers "the first update at or after" a moment. One from further
 *  on than this is the next session, not the moment asked about. */
const MAX_LATE_SECS = 3600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
	const cfg = loadConfig();
	if (!cfg.databaseUrl) throw new Error("DATABASE_URL is not set");
	const feeds = Object.values(loadDeployment(cfg.deploymentFile).markets).map((m) => m.feedId.replace(/^0x/i, "").toLowerCase());
	const ledger = new PgLedger(cfg.databaseUrl);
	await ledger.migrate();
	const pool = new Pool({ connectionString: cfg.databaseUrl, max: 1 });

	const fromArg = process.argv.indexOf("--from");
	const first = fromArg > 0 ? Number(process.argv[fromArg + 1]) : Number((await pool.query(`SELECT min(ts) AS t FROM executions`)).rows[0].t);
	const from = Math.floor(first / STEP) * STEP;
	const to = Math.floor(Date.now() / 1000) - 600;
	const have = new Set((await pool.query(`SELECT DISTINCT ts FROM reference_prices WHERE ts BETWEEN $1 AND $2`, [from, to])).rows.map((r) => Number(r.ts)));
	const todo: number[] = [];
	for (let t = from; t <= to; t += STEP) if (!have.has(t)) todo.push(t);
	console.log(`${todo.length} hourly moments to fetch from ${new Date(from * 1000).toISOString()}, ${have.size} already stored`);

	const params = new URLSearchParams();
	for (const f of feeds) params.append("ids[]", f);
	params.set("parsed", "true");
	let silent = 0;
	for (const [i, ts] of todo.entries()) {
		let rows: ReferenceRow[] | null = null;
		for (let attempt = 1; rows === null; attempt++) {
			try {
				const res = await fetch(`${cfg.hermesUrl}/v2/updates/price/${ts}?${params}`, { headers: { authorization: `Bearer ${cfg.pythApiKey}` }, signal: AbortSignal.timeout(30_000) });
				if (res.status === 429) {
					await sleep((Number(res.headers.get("retry-after")) || 10) * 1000 + 1000);
					continue;
				}
				if (res.status === 404) {
					rows = feeds.map((feedId) => ({ ts, feedId, price: null, publishTime: null }));
					silent++;
				} else if (res.ok) {
					const json = (await res.json()) as { parsed: { id: string; price: { price: string; expo: number; publish_time: number } }[] };
					rows = feeds.map((feedId) => {
						const p = json.parsed.find((x) => x.id.replace(/^0x/i, "").toLowerCase() === feedId);
						return p && p.price.publish_time - ts <= MAX_LATE_SECS
							? { ts, feedId, price: Number(p.price.price) * 10 ** p.price.expo, publishTime: p.price.publish_time }
							: { ts, feedId, price: null, publishTime: null };
					});
				} else {
					throw new Error(`Hermes ${res.status}`);
				}
			} catch (err) {
				// Name the host, never the URL: the Hermes URL can carry a key.
				if (attempt >= 5) throw new Error(`hermes at ${ts}: ${(err as Error).message}`);
				await sleep(5000 * attempt);
			}
		}
		await ledger.recordReferences(rows);
		if ((i + 1) % 24 === 0 || i === todo.length - 1) console.log(`  ${i + 1}/${todo.length} (${new Date(ts * 1000).toISOString()}), ${silent} with no price published`);
		await sleep(PACE_MS);
	}
	await pool.end();
	await ledger.close();
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
