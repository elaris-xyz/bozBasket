// The guard panel's data: for one plan, what `execute_basket` would decide
// right now. Computed with the same shared code the keeper uses, from the
// same inputs the program reads: on-chain thresholds, the Pyth reference,
// and each mock market's quote and depth.

import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { basketVerdict, checkLeg, DEMO_STOCKS, legAmounts, sessionAt, secondsUntilOpen, secondsUntilPythPublishes, type LegVerdict } from "@bozbasket/shared";
import { connection, readPrograms, CONFIG } from "@/lib/solana";
import { hermesLatest, MARKETS } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type GuardResponse = {
	now: number;
	session: { open: boolean; label: string; secondsUntilOpen: number | null };
	/** Seconds until Pyth is expected to publish US equity prices again; 0 while it is. */
	pythResumesInSecs: number;
	thresholds: { maxStalenessSecs: number; maxConfBps: number; maxDivergenceBps: number; minLiquidityUsdc: number };
	referenceMode: "pyth" | "mock";
	vaultUsdc: number;
	amountPerPeriod: number;
	legs: (LegVerdict & { symbol: string; ticker: string; spreadBps: number; overridden: boolean })[];
	verdict: { reason: number; legIndex: number | null };
};

export async function GET(req: Request) {
	const planArg = new URL(req.url).searchParams.get("plan");
	if (!planArg) return NextResponse.json({ error: "plan required" }, { status: 400 });
	try {
		const { basket, market } = readPrograms();
		const planPk = new PublicKey(planArg);
		const [plan, config] = await Promise.all([basket.account.plan.fetch(planPk), basket.account.config.fetch(CONFIG)]);
		const legs = plan.legs.slice(0, plan.legCount);
		const feedIds = legs.map((l) => Buffer.from(l.pythFeedId).toString("hex"));

		const marketInfos = legs.map((l) => {
			const m = MARKETS.find((x) => x.stockMint === l.mint.toBase58());
			if (!m) throw new Error(`no market for mint ${l.mint.toBase58()}`);
			return m;
		});
		const [refs, marketAccounts, vault] = await Promise.all([
			hermesLatest(feedIds),
			Promise.all(marketInfos.map((m) => market.account.market.fetch(new PublicKey(m.market)))),
			getAccount(connection(), plan.vault).catch(() => null),
		]);
		const byFeed = new Map(refs.map((r) => [r.feedId, r]));

		const now = Math.floor(Date.now() / 1000);
		const referenceMode = config.referenceProgram.equals(market.programId) ? "mock" : "pyth";
		// What publish time will the *program* see? In pyth mode the keeper
		// posts the Hermes update verbatim, so Hermes's own timestamp is it —
		// which is why US equities read as stale all weekend. In mock mode the
		// keeper restamps the reference with the current time in the same
		// transaction, so the age the program sees is only the few seconds
		// between building the transaction and it landing.
		const MOCK_REFRESH_LAG_SECS = 5;
		const publishTimeFor = (p: { publishTime: number }) => (referenceMode === "mock" ? now - MOCK_REFRESH_LAG_SECS : p.publishTime);
		const thresholds = {
			maxStalenessSecs: config.maxStalenessSecs,
			maxConfBps: config.maxConfBps,
			maxDivergenceBps: config.maxDivergenceBps,
			minLiquidityUsdc: BigInt(config.minLiquidityUsdc.toString()),
		};
		const amounts = legAmounts(BigInt(plan.amountPerPeriod.toString()), legs.map((l) => l.weightBps));

		const rows = legs.map((l, i) => {
			const ref0 = byFeed.get(feedIds[i]);
			if (!ref0) throw new Error(`Hermes returned no price for ${feedIds[i]}`);
			const ref = { ...ref0, publishTime: publishTimeFor(ref0) };
			const m = marketAccounts[i];
			const override = BigInt(m.priceOverride.toString());
			const base = override > 0n ? override : ref.price;
			const venue = { price: (base * BigInt(10_000 + m.spreadBps)) / 10_000n, expo: ref.expo, liquidityUsdc: BigInt(m.liquidityUsdc.toString()) };
			const stock = DEMO_STOCKS.find((s) => s.symbol === marketInfos[i].symbol);
			return {
				...checkLeg(now, ref, venue, amounts[i], thresholds),
				symbol: marketInfos[i].symbol,
				ticker: stock?.ticker ?? marketInfos[i].symbol,
				spreadBps: m.spreadBps,
				overridden: override > 0n,
			};
		});

		const vaultUsdc = vault ? Number(vault.amount) / 1e6 : 0;
		const amountPerPeriod = plan.amountPerPeriod.toNumber() / 1e6;
		const session = sessionAt(new Date(now * 1000));
		const body: GuardResponse = {
			now,
			session: { open: session.open, label: session.label, secondsUntilOpen: session.open ? null : secondsUntilOpen(new Date(now * 1000)) },
			pythResumesInSecs: secondsUntilPythPublishes(new Date(now * 1000)),
			thresholds: { ...thresholds, minLiquidityUsdc: Number(thresholds.minLiquidityUsdc) / 1e6 },
			referenceMode,
			vaultUsdc,
			amountPerPeriod,
			legs: rows,
			verdict: basketVerdict(rows, vaultUsdc, amountPerPeriod),
		};
		return NextResponse.json(body);
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 500 });
	}
}
