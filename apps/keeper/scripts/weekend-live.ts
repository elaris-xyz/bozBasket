// Measures the latest weekend from the live mainnet check, the way the
// eight-weekend backtest measures history, so the numbers can join its table.
// While the pause lasts it reports what it can (checks, age, verdicts, the
// pool against the frozen price); once Pyth is back it measures every traded
// hour against Pyth's first price back and writes deploy/weekend-live-<friday>.json.
//
//   source tools/env.sh
//   pnpm --filter keeper exec tsx scripts/weekend-live.ts [--friday YYYY-MM-DD]

import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { loadConfig } from "../src/config";
import { percentile, weekendWindows } from "../src/backtest";
import { againstFrozen, liveWeekend, type ShadowCheck } from "../src/weekendLive";

const SYMBOLS = ["TSLAx", "QQQx"];
const fmt = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? "–" : n.toFixed(digits));
const hours = (secs: number | null) => (secs === null ? "–" : `${(secs / 3600).toFixed(1)} h`);

async function main() {
	const cfg = loadConfig();
	if (!cfg.databaseUrl) throw new Error("DATABASE_URL is not set");
	const now = Math.floor(Date.now() / 1000);
	const arg = process.argv.indexOf("--friday");
	const windows = weekendWindows(now - 21 * 86_400, now + 3 * 86_400).filter((x) => x.closeTs <= now);
	const w = arg > 0 ? windows.find((x) => x.friday === process.argv[arg + 1]) : windows[windows.length - 1];
	if (!w) throw new Error("no weekend window found");

	const pool = new Pool({ connectionString: cfg.databaseUrl, max: 1 });
	const r = await pool.query(
		`SELECT ts, symbol, venue_price, ref_price, ref_age_secs, divergence_bps, reason FROM mainnet_shadow WHERE ts BETWEEN $1 AND $2 ORDER BY ts`,
		[w.closeTs - 6 * 86_400, w.reopenTs + 6 * 3600],
	);
	await pool.end();
	const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
	const checks: ShadowCheck[] = r.rows.map((x) => ({ ts: Number(x.ts), symbol: x.symbol, venuePrice: num(x.venue_price), refPrice: num(x.ref_price), refAgeSecs: num(x.ref_age_secs), divergenceBps: num(x.divergence_bps), reason: num(x.reason) }));

	const done = now >= w.reopenTs;
	console.log(`Weekend of Friday ${w.friday}: Pyth silent ${new Date(w.closeTs * 1000).toISOString()} to ${new Date(w.reopenTs * 1000).toISOString()}${done ? "" : " (still paused)"}`);
	const out = [];
	for (const symbol of SYMBOLS) {
		const lw = liveWeekend(checks, w, symbol);
		out.push(lw);
		console.log(`\n${symbol}: ${lw.checks} checks in the pause, Pyth price up to ${hours(lw.maxRefAgeSecs)} old, the guard would defer ${lw.wouldDefer} of them ${JSON.stringify(lw.byReason)}`);
		console.log(`  weekdays before: median |pool − Pyth| ${fmt(lw.weekdayMedianAbsGapBps, 1)} bps over ${lw.weekdayChecks} fresh checks`);
		if (lw.result) {
			const abs = lw.result.premiums.map((p) => Math.abs(p.bps));
			console.log(`  against Pyth's first price back (${fmt(lw.reopen?.price, 2)}): ${lw.result.tradedHours} traded hours, median ${fmt(lw.result.medianPremiumBps, 1)} bps, |median| ${fmt(percentile(abs, 50), 1)} bps, p90 |premium| ${fmt(percentile(abs, 90), 1)} bps, worst +${fmt(lw.result.maxPremiumBps, 1)} / ${fmt(lw.result.minPremiumBps, 1)} bps, ${lw.result.hoursBeyondLimit} hours beyond 150 bps`);
			console.log(`  Friday's frozen price against the reopen: ${fmt(lw.result.reopenMoveBps, 1)} bps; a Saturday 12:00 ET buy: ${fmt(lw.result.timerPremiumBps, 1)} bps`);
		} else {
			const vsFrozen = againstFrozen(lw, checks, w).map(Math.abs);
			console.log(`  so far, against the frozen price ${fmt(lw.frozen?.price, 2)}: median |gap| ${fmt(percentile(vsFrozen, 50), 1)} bps, max |gap| ${fmt(vsFrozen.length ? Math.max(...vsFrozen) : null, 1)} bps`);
		}
	}
	if (done && out.every((x) => x.result)) {
		const file = path.join(path.dirname(cfg.deploymentFile), `weekend-live-${w.friday}.json`);
		fs.writeFileSync(file, JSON.stringify({ window: w, measuredAt: new Date().toISOString(), symbols: out.map(({ result, ...rest }) => ({ ...rest, result: result && { ...result, premiums: result.premiums } })) }, null, 2) + "\n");
		console.log(`\nwrote ${file}`);
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
