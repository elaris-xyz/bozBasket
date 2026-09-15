// Weekend backtest on real data. For TSLAx and QQQx on Solana mainnet:
//   - hourly pool candles from GeckoTerminal (the deepest USDC pool of each),
//   - the last Pyth price before each weekend and the first one after it,
//     from Hermes' historical endpoint,
//   - a weekday baseline: the same pool-to-Pyth gap while Pyth is fresh.
// Writes deploy/weekend-backtest.json. Read-only; run with the dev env loaded:
//   pnpm exec tsx scripts/backtest-weekends.ts [--weeks 8]
//
// Hermes keeps about eight weeks of history: on 2026-09-15 it had nothing for
// the weekends of June 26 to July 17. Pyth lookups are cached in the OS temp
// directory, so a rerun after a dropped connection does not start over.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEFAULT_THRESHOLDS, MAINNET_XSTOCKS } from "@bozbasket/shared";
import { analyzeWeekend, bps, nyDate, nyTime, summarizeBacktest, weekendWindows, type Candle, type PricePoint, type WeekendResult } from "../src/backtest";
import { effectiveMultiplier, mainnetRpcFor, type ScaledUiAmountConfig } from "../src/shadow";

const POOLS: Record<string, { address: string; name: string }> = {
	TSLAx: { address: "8aDaBQkTrS6HVMjyc6EZebgdiaXhLYGriDWKWWp1NpFF", name: "TSLAx / USDC, Raydium CLMM" },
	QQQx: { address: "GMjGLWzvK75LPetrgAmdeXnvxc4fUuQPwJxeQqTDU1aG", name: "QQQx / USDC, Raydium CLMM" },
};
const HERMES = (process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network").replace(/\/$/, "");
const KEY = process.env.PYTH_API_KEY;
const weeksArg = process.argv.indexOf("--weeks");
const WEEKS = weeksArg > 0 ? Number(process.argv[weeksArg + 1]) : 8;
/** A reopen later than this after Sunday 20:00 ET is a gap in the history, not a holiday. */
const MAX_REOPEN_DELAY_SECS = 30 * 3600;
const CACHE_FILE = path.join(os.tmpdir(), "bozbasket-backtest-pyth.json");
const pythCache: Record<string, Record<string, PricePoint> | null> = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

// The dev host reaches these APIs through a VPN whose connections drop for a few
// seconds at a time, so connection failures back off for over a minute in all.
async function getJson(url: string, init: RequestInit = {}, tries = 6): Promise<{ status: number; body: unknown }> {
	for (let i = 1; ; i++) {
		try {
			const res = await fetch(url, { ...init, signal: AbortSignal.timeout(40_000) });
			if (res.status === 429 && i < tries) {
				await sleep(15_000 * i);
				continue;
			}
			return { status: res.status, body: await res.json().catch(() => null) };
		} catch (err) {
			// Name the host, never the URL: Hermes and the RPC carry keys.
			if (i >= tries) throw new Error(`${new URL(url).hostname}: ${(err as Error).message}`);
			await sleep(5_000 * i);
		}
	}
}

/** Hourly candles from `fromTs` to now, paging back 1000 at a time. */
async function candles(pool: string, fromTs: number): Promise<Candle[]> {
	const out = new Map<number, Candle>();
	let before: number | null = null;
	for (let page = 0; page < 6; page++) {
		const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/hour?limit=1000&currency=usd&token=base${before ? `&before_timestamp=${before}` : ""}`;
		const { status, body } = await getJson(url, { headers: { accept: "application/json" } });
		if (status !== 200) throw new Error(`GeckoTerminal ${status}`);
		const list = (body as { data: { attributes: { ohlcv_list: number[][] } } }).data.attributes.ohlcv_list;
		for (const [ts, , , , close, volume] of list) out.set(ts, { ts, close, volumeUsd: volume });
		if (list.length === 0) break;
		before = Math.min(...list.map((c) => c[0]));
		if (before <= fromTs) break;
		await sleep(2_500); // GeckoTerminal allows 30 calls a minute
	}
	return [...out.values()].filter((c) => c.ts >= fromTs).sort((a, b) => a.ts - b.ts);
}

/** Pyth prices for both feeds from Hermes' historical endpoint, or null where it
 *  has none. It returns the first update published at or after `ts`, and 404
 *  when none follows closely: asked for Sunday 19:59 ET it answered with the
 *  20:00 price, asked for Saturday noon it had nothing. */
async function pythAt(ts: number): Promise<Record<string, PricePoint> | null> {
	if (String(ts) in pythCache) return pythCache[String(ts)];
	const got = await fetchPyth(ts);
	pythCache[String(ts)] = got;
	fs.writeFileSync(CACHE_FILE, JSON.stringify(pythCache));
	return got;
}

async function fetchPyth(ts: number): Promise<Record<string, PricePoint> | null> {
	const ids = MAINNET_XSTOCKS.map((s) => `ids[]=${s.feedId}`).join("&");
	const { status, body } = await getJson(`${HERMES}/v2/updates/price/${ts}?${ids}&parsed=true`, { headers: { authorization: `Bearer ${KEY}` } });
	await sleep(300);
	if (status === 404) return null;
	if (status !== 200) throw new Error(`Hermes ${status} at ${ts}`);
	const parsed = (body as { parsed: { id: string; price: { price: string; expo: number; publish_time: number } }[] }).parsed;
	const out: Record<string, PricePoint> = {};
	for (const s of MAINNET_XSTOCKS) {
		const p = parsed.find((x) => x.id.replace(/^0x/, "").toLowerCase() === s.feedId);
		if (p) out[s.symbol] = { ts: p.price.publish_time, price: Number(p.price.price) * 10 ** p.price.expo };
	}
	return Object.keys(out).length === MAINNET_XSTOCKS.length ? out : null;
}

/** The first time stepping from `ts` by `stepSecs` at which Hermes has prices. */
async function firstPyth(ts: number, stepSecs: number, maxSteps: number) {
	for (let i = 0; i <= maxSteps; i++) {
		const got = await pythAt(ts + i * stepSecs);
		if (got) return got;
	}
	return null;
}

async function multiplierFn(mint: string): Promise<{ at: (ts: number) => number; config: ScaledUiAmountConfig | null }> {
	const rpc = process.env.MAINNET_RPC_URL || mainnetRpcFor(process.env.SOLANA_RPC_URL ?? "");
	const connection = new Connection(rpc, "confirmed");
	let info: Awaited<ReturnType<Connection["getParsedAccountInfo"]>> | null = null;
	for (let i = 1; !info; i++) {
		try {
			info = await connection.getParsedAccountInfo(new PublicKey(mint));
		} catch (err) {
			if (i >= 5) throw new Error(`mainnet RPC: ${(err as Error).message}`);
			await sleep(5_000 * i);
		}
	}
	const data = info.value?.data;
	const ext = data && "parsed" in data ? ((data.parsed?.info?.extensions ?? []) as { extension: string; state: ScaledUiAmountConfig }[]) : [];
	const config = ext.find((e) => e.extension === "scaledUiAmountConfig")?.state ?? null;
	return { at: (ts) => (config ? effectiveMultiplier(config, ts) : 1), config };
}

(async () => {
	if (!KEY) throw new Error("PYTH_API_KEY is not set");
	const now = Math.floor(Date.now() / 1000);
	const fromTs = now - WEEKS * 7 * 86_400;
	const windows = weekendWindows(fromTs, now);
	console.log(`${windows.length} weekends from ${windows[0]?.friday} to ${windows.at(-1)?.friday}`);

	const report: Record<string, unknown> = {};
	const pythByWeekend = new Map<string, { close: Record<string, PricePoint>; reopen: Record<string, PricePoint> } | null>();
	for (const w of windows) {
		// The price from Friday 19:59 ET, stepping back an hour at a time over a
		// holiday; the first price from Sunday 20:00 ET, stepping forward.
		const close = await firstPyth(w.closeTs - 60, -3600, 72);
		const reopen = await firstPyth(w.reopenTs, 3600, 60);
		const usable = !!close && !!reopen && reopen.TSLAx.ts - w.reopenTs <= MAX_REOPEN_DELAY_SECS;
		pythByWeekend.set(w.friday, usable ? { close: close!, reopen: reopen! } : null);
		console.log(`  ${w.friday}: Pyth close ${close ? new Date(close.TSLAx.ts * 1000).toISOString() : "none"}, reopen ${reopen ? new Date(reopen.TSLAx.ts * 1000).toISOString() : "none"}${usable ? "" : " (left out)"}`);
	}

	// Weekday baseline times: Tuesday to Thursday, 11:00 and 21:00 ET.
	const baselineTimes: number[] = [];
	for (const w of windows) {
		const fri = nyDate(w.closeTs - 3600);
		for (const back of [3, 2, 1]) for (const hour of [11, 21]) baselineTimes.push(nyTime(fri.year, fri.month, fri.day - back, hour));
	}
	const baselinePyth = new Map<number, Record<string, PricePoint> | null>();
	for (const t of baselineTimes) baselinePyth.set(t, t + 3600 <= now ? await pythAt(t + 3599) : null);

	for (const stock of MAINNET_XSTOCKS) {
		const pool = POOLS[stock.symbol];
		const mult = await multiplierFn(stock.mint);
		const hourly = await candles(pool.address, fromTs - 86_400);
		console.log(`${stock.symbol}: ${hourly.length} hourly candles from ${new Date(hourly[0].ts * 1000).toISOString().slice(0, 10)}; multiplier now ${mult.at(now)}`);

		const results: WeekendResult[] = [];
		for (const w of windows) {
			const p = pythByWeekend.get(w.friday);
			if (!p) continue;
			results.push(analyzeWeekend(w, p.close[stock.symbol], p.reopen[stock.symbol], hourly, mult.at, DEFAULT_THRESHOLDS.maxDivergenceBps));
		}
		const baseline: number[] = [];
		for (const t of baselineTimes) {
			const pyth = baselinePyth.get(t)?.[stock.symbol];
			const candle = hourly.find((c) => c.ts === t && c.volumeUsd > 0);
			if (pyth && candle) baseline.push(bps(candle.close / mult.at(candle.ts), pyth.price));
		}
		const summary = summarizeBacktest(results, baseline);
		report[stock.symbol] = {
			pool: { ...pool, source: "GeckoTerminal hourly OHLCV, close per raw token, divided by the share multiplier" },
			mint: stock.mint,
			multiplier: mult.config,
			summary: {
				...summary,
				medianAbsPremiumBps: round1(summary.medianAbsPremiumBps),
				p90AbsPremiumBps: round1(summary.p90AbsPremiumBps),
				worst: summary.worst && { ...summary.worst, bps: round1(summary.worst.bps) },
				shareBeyondLimit: summary.shareBeyondLimit === null ? null : Math.round(summary.shareBeyondLimit * 1000) / 1000,
				timerMeanPremiumBps: round1(summary.timerMeanPremiumBps),
				baselineMedianAbsGapBps: round1(summary.baselineMedianAbsGapBps),
			},
			weekends: results.map((r) => ({
				friday: r.friday,
				close: r.close,
				reopen: r.reopen,
				tradedHours: r.tradedHours,
				volumeUsd: Math.round(r.volumeUsd),
				medianPremiumBps: round1(r.medianPremiumBps),
				maxPremiumBps: round1(r.maxPremiumBps),
				minPremiumBps: round1(r.minPremiumBps),
				hoursBeyondLimit: r.hoursBeyondLimit,
				timerPremiumBps: round1(r.timerPremiumBps),
				reopenMoveBps: round1(r.reopenMoveBps),
				premiums: r.premiums.map((x) => [x.ts, round1(x.bps)]),
			})),
		};
		const s = summary;
		console.log(
			`  weekends ${s.weekends}, traded hours ${s.tradedHours}; |premium| median ${round1(s.medianAbsPremiumBps)} bps, p90 ${round1(s.p90AbsPremiumBps)}; worst +${round1(s.worst?.bps ?? null)} bps at ${s.worst ? new Date(s.worst.ts * 1000).toISOString() : "-"}; beyond ${DEFAULT_THRESHOLDS.maxDivergenceBps} bps ${s.shareBeyondLimit === null ? "-" : (s.shareBeyondLimit * 100).toFixed(1)}% of hours`,
		);
		console.log(`  Saturday-noon timer: mean ${round1(s.timerMeanPremiumBps)} bps, overpaid ${s.timerOverpaidWeekends} of ${s.timerWeekends}; weekday baseline |gap| median ${round1(s.baselineMedianAbsGapBps)} bps over ${s.baselineSamples} samples`);
	}

	const file = path.resolve(__dirname, "../../../deploy/weekend-backtest.json");
	const out = {
		generatedAt: new Date().toISOString(),
		method:
			"For each weekend, every hour in which the pool traded between Pyth's last price on Friday and its first price back is priced per share and compared with that first price back. Positive means a blind buy in that hour paid more. The Saturday 12:00 ET timer is a weekly recurring buy scheduled then. The weekday baseline is the same gap on Tuesday to Thursday at 11:00 and 21:00 ET, while Pyth publishes.",
		divergenceLimitBps: DEFAULT_THRESHOLDS.maxDivergenceBps,
		weeks: WEEKS,
		symbols: report,
	};
	fs.writeFileSync(file, JSON.stringify(out, null, "\t") + "\n");
	console.log(`wrote ${path.relative(process.cwd(), file)}`);
})().catch((err) => {
	console.error("backtest failed:", String((err as Error).message).replace(/(api[-_]?key=)[^&\s"']+/gi, "$1***"));
	process.exit(1);
});
