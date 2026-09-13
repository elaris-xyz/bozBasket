// Demo controls. Every action is a real, admin-signed devnet transaction that
// changes real state the guard reads; none of them fakes a verdict.
//
//   divergence  set_price_override on one market, 5% away from the reference
//   liquidity   set_liquidity on one market, down to $10
//   staleness   update_config: max_staleness_secs -> 0, so any price is "old"
//   confidence  update_config: max_conf_bps -> 0, so any spread is "too wide"
//   restore     clear overrides, refill depth, put the thresholds back
//   nudge       nudge_plan: make a plan due now
//
// `staleness` and `confidence` tighten a threshold rather than corrupting a
// feed: nobody can make Pyth publish a bad price on demand, and the honest
// version of those two scenarios is the weekend, when the real feed is
// genuinely stale. The UI labels them as threshold changes.
//
// Open on the deployed demo on purpose: a judge has to be able to break the
// guard to see it work. Every action is reversible with `restore`, none of
// them can move a user's funds, and since 2026-09-13 the programs' upgrade
// authority is a cold key that never leaves the build machine, so the key
// this route signs with cannot replace program code. Set DEMO_CONTROLS=1.

import { NextResponse } from "next/server";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { DEFAULT_MARKET, DEFAULT_THRESHOLDS } from "@bozbasket/shared";
import { CONFIG } from "@/lib/solana";
import { adminPrograms, hermesLatest, MARKETS, marketPks } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "divergence" | "liquidity" | "staleness" | "confidence" | "restore" | "nudge";

const enabled = () => process.env.DEMO_CONTROLS === "1";

// Coarse per-instance limiter. Serverless means several instances and so
// several buckets; it is a speed bump against a loop, not a security control.
// It does not need to be one: every action here is reversible.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function rateLimited(req: Request): boolean {
	const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
	const now = Date.now();
	const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
	recent.push(now);
	hits.set(ip, recent);
	if (hits.size > 500) for (const [k, v] of hits) if (v.every((t) => now - t > WINDOW_MS)) hits.delete(k);
	return recent.length > MAX_PER_WINDOW;
}

/** The demo page asks whether the controls are live before rendering them. */
export async function GET() {
	return NextResponse.json({ enabled: enabled() });
}

const FORCED_LIQUIDITY_USDC = 10_000_000; // $10, below one leg of a $100 basket
const DIVERGENCE_MULTIPLIER = 105n; // +5%, well past the 150 bps ceiling

export async function POST(req: Request) {
	if (!enabled()) return NextResponse.json({ error: "demo controls are disabled on this deployment" }, { status: 403 });
	if (rateLimited(req)) return NextResponse.json({ error: "too many demo actions; wait a minute" }, { status: 429 });
	try {
		const { action, symbol, plan } = (await req.json()) as { action?: Action; symbol?: string; plan?: string };
		const { kp, basket, market } = adminPrograms();
		const admin = kp.publicKey;

		const configArgs = async (over: Partial<typeof DEFAULT_THRESHOLDS>) => {
			const c = await basket.account.config.fetch(CONFIG);
			const t = { ...DEFAULT_THRESHOLDS, ...over };
			return {
				keeper: c.keeper,
				maxStalenessSecs: t.maxStalenessSecs,
				maxConfBps: t.maxConfBps,
				maxDivergenceBps: t.maxDivergenceBps,
				minLiquidityUsdc: new anchor.BN(t.minLiquidityUsdc),
				fillProgram: c.fillProgram,
				referenceProgram: c.referenceProgram,
			};
		};
		const pickMarket = (s?: string) => {
			const m = MARKETS.find((x) => x.symbol === s) ?? MARKETS[0];
			return { info: m, pks: marketPks(m) };
		};

		switch (action) {
			case "divergence": {
				const { info, pks } = pickMarket(symbol);
				const [ref] = await hermesLatest([info.feedId]);
				const forced = (ref.price * DIVERGENCE_MULTIPLIER) / 100n;
				const sig = await market.methods.setPriceOverride(new anchor.BN(forced.toString())).accountsPartial({ market: pks.market, admin }).rpc();
				return NextResponse.json({ ok: true, signature: sig, detail: `${info.symbol} venue quoting ${(Number(forced) * 10 ** ref.expo).toFixed(2)} against a ${(Number(ref.price) * 10 ** ref.expo).toFixed(2)} reference` });
			}
			case "liquidity": {
				const { info, pks } = pickMarket(symbol);
				const sig = await market.methods.setLiquidity(new anchor.BN(FORCED_LIQUIDITY_USDC)).accountsPartial({ market: pks.market, admin }).rpc();
				return NextResponse.json({ ok: true, signature: sig, detail: `${info.symbol} depth drained to $${FORCED_LIQUIDITY_USDC / 1e6}` });
			}
			case "staleness": {
				const sig = await basket.methods.updateConfig(await configArgs({ maxStalenessSecs: 0 })).accountsPartial({ config: CONFIG, admin }).rpc();
				return NextResponse.json({ ok: true, signature: sig, detail: "max staleness tightened to 0 s" });
			}
			case "confidence": {
				const sig = await basket.methods.updateConfig(await configArgs({ maxConfBps: 0 })).accountsPartial({ config: CONFIG, admin }).rpc();
				return NextResponse.json({ ok: true, signature: sig, detail: "max confidence tightened to 0 bps" });
			}
			case "restore": {
				const sigs: string[] = [];
				for (const m of MARKETS) {
					const pks = marketPks(m);
					sigs.push(await market.methods.setPriceOverride(new anchor.BN(0)).accountsPartial({ market: pks.market, admin }).rpc());
					sigs.push(await market.methods.setLiquidity(new anchor.BN(DEFAULT_MARKET.liquidityUsdc)).accountsPartial({ market: pks.market, admin }).rpc());
				}
				sigs.push(await basket.methods.updateConfig(await configArgs({})).accountsPartial({ config: CONFIG, admin }).rpc());
				return NextResponse.json({ ok: true, signature: sigs[sigs.length - 1], detail: `restored ${MARKETS.length} markets and the thresholds` });
			}
			case "nudge": {
				if (!plan) return NextResponse.json({ error: "plan required" }, { status: 400 });
				const sig = await basket.methods.nudgePlan(new anchor.BN(0)).accountsPartial({ config: CONFIG, plan: new PublicKey(plan), admin }).rpc();
				return NextResponse.json({ ok: true, signature: sig, detail: "plan is due now" });
			}
			default:
				return NextResponse.json({ error: `unknown action ${action}` }, { status: 400 });
		}
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message }, { status: 500 });
	}
}
