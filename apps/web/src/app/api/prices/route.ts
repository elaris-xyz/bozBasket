// Latest reference prices for the demo stocks, from Hermes with the server's
// API key (the browser never sees the key). Also reports market hours.

import { NextResponse } from "next/server";
import { DEMO_STOCKS } from "@bozbasket/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PriceRow = {
	symbol: string;
	ticker: string;
	feedId: string;
	price: number;
	confBps: number;
	publishTime: number;
	expo: number;
};

let cache: { at: number; body: unknown } | null = null;

export async function GET() {
	if (cache && Date.now() - cache.at < 10_000) return NextResponse.json(cache.body);
	const base = (process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network").replace(/\/$/, "");
	const key = process.env.PYTH_API_KEY;
	if (!key) return NextResponse.json({ error: "PYTH_API_KEY not set", rows: [] }, { status: 200 });
	const params = new URLSearchParams();
	for (const s of DEMO_STOCKS) params.append("ids[]", s.feedId);
	params.set("parsed", "true");
	try {
		const [latest, meta] = await Promise.all([
			fetch(`${base}/v2/updates/price/latest?${params}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }),
			fetch(`${base}/v2/price_feeds?asset_type=equity`, { signal: AbortSignal.timeout(20_000) }).catch(() => null),
		]);
		if (!latest.ok) return NextResponse.json({ error: `Hermes ${latest.status}`, rows: [] });
		const json = (await latest.json()) as { parsed: { id: string; price: { price: string; conf: string; expo: number; publish_time: number } }[] };
		const rows: PriceRow[] = json.parsed.map((p) => {
			const s = DEMO_STOCKS.find((d) => d.feedId === p.id)!;
			const price = Number(p.price.price) * 10 ** p.price.expo;
			return { symbol: s.symbol, ticker: s.ticker, feedId: p.id, price, confBps: (Number(p.price.conf) * 10_000) / Number(p.price.price), publishTime: p.price.publish_time, expo: p.price.expo };
		});
		let marketHours: { isOpen: boolean; nextOpen: number; nextClose: number } | null = null;
		if (meta?.ok) {
			const all = (await meta.json()) as { id: string; market_hours: { is_open: boolean; next_open: number; next_close: number } }[];
			const f = all.find((x) => x.id === DEMO_STOCKS[0].feedId);
			if (f) marketHours = { isOpen: f.market_hours.is_open, nextOpen: f.market_hours.next_open, nextClose: f.market_hours.next_close };
		}
		const body = { rows, marketHours, fetchedAt: Math.floor(Date.now() / 1000) };
		cache = { at: Date.now(), body };
		return NextResponse.json(body);
	} catch (err) {
		return NextResponse.json({ error: (err as Error).message, rows: [] });
	}
}
