// Live proof for the landing page: is the US market open, and how old and how
// certain is each reference price, right now. Plan-independent and cached, so
// the most-visited page does not hit Hermes and the RPC on every view.
//
// Publish times are Pyth's own, never restamped. This panel describes the real
// market, whichever reference mode the devnet program happens to be in.

import { NextResponse } from "next/server";
import { checkLeg, DEFAULT_THRESHOLDS, DEMO_STOCKS, REASON, secondsUntilOpen, secondsUntilPythPublishes, sessionAt } from "@bozbasket/shared";
import { CONFIG, readPrograms } from "@/lib/solana";
import { hermesLatest } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ProofFeed = { ticker: string; name: string; color: string; price: number; confBps: number; ageSecs: number; reason: number };

export type ProofResponse = {
	now: number;
	session: { open: boolean; label: string; secondsUntilOpen: number | null };
	/** Seconds until Pyth is expected to publish US equity prices again; 0 while it is. */
	pythResumesInSecs: number;
	thresholds: { maxStalenessSecs: number; maxConfBps: number };
	feeds: ProofFeed[];
	/** The first failing check across the feeds, as the guard would report it; 0 when all pass. */
	verdict: number;
	/** The on-chain limits are stricter than the defaults, which means a demo control is active. */
	tightened: boolean;
};

const BODY_TTL_MS = 15_000;
const CONFIG_TTL_MS = 60_000;

type Thresholds = { maxStalenessSecs: number; maxConfBps: number; maxDivergenceBps: number; minLiquidityUsdc: bigint };
let bodyCache: { at: number; body: ProofResponse } | null = null;
let configCache: { at: number; value: Thresholds } | null = null;

async function thresholds(): Promise<Thresholds> {
	if (configCache && Date.now() - configCache.at < CONFIG_TTL_MS) return configCache.value;
	const c = await readPrograms().basket.account.config.fetch(CONFIG);
	const value: Thresholds = {
		maxStalenessSecs: c.maxStalenessSecs,
		maxConfBps: c.maxConfBps,
		maxDivergenceBps: c.maxDivergenceBps,
		minLiquidityUsdc: BigInt(c.minLiquidityUsdc.toString()),
	};
	configCache = { at: Date.now(), value };
	return value;
}

export async function GET() {
	if (bodyCache && Date.now() - bodyCache.at < BODY_TTL_MS) return NextResponse.json(bodyCache.body);
	try {
		const [t, refs] = await Promise.all([thresholds(), hermesLatest(DEMO_STOCKS.map((s) => s.feedId))]);
		const now = Math.floor(Date.now() / 1000);
		const feeds: ProofFeed[] = DEMO_STOCKS.flatMap((s) => {
			const ref = refs.find((r) => r.feedId.toLowerCase() === s.feedId.toLowerCase());
			if (!ref) return [];
			// No venue: this panel is about the reference price itself.
			const v = checkLeg(now, ref, null, 0n, t);
			return [{ ticker: s.ticker, name: s.name, color: s.color, price: v.referencePrice, confBps: v.confBps, ageSecs: v.ageSecs, reason: v.reason }];
		});
		const session = sessionAt(new Date(now * 1000));
		const body: ProofResponse = {
			now,
			session: { open: session.open, label: session.label, secondsUntilOpen: session.open ? null : secondsUntilOpen(new Date(now * 1000)) },
			pythResumesInSecs: secondsUntilPythPublishes(new Date(now * 1000)),
			thresholds: { maxStalenessSecs: t.maxStalenessSecs, maxConfBps: t.maxConfBps },
			feeds,
			verdict: feeds.find((f) => f.reason !== REASON.OK)?.reason ?? REASON.OK,
			tightened: t.maxStalenessSecs < DEFAULT_THRESHOLDS.maxStalenessSecs || t.maxConfBps < DEFAULT_THRESHOLDS.maxConfBps,
		};
		bodyCache = { at: Date.now(), body };
		return NextResponse.json(body);
	} catch (err) {
		// A slightly old answer beats an empty panel on the landing page.
		if (bodyCache) return NextResponse.json(bodyCache.body);
		return NextResponse.json({ error: (err as Error).message }, { status: 200 });
	}
}
