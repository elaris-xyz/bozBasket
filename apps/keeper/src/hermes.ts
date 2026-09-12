// Thin Hermes client. The official @pythnetwork/hermes-client works too, but
// this is 40 lines, sends the Authorization header the way the Pyth Core
// upgrade requires, and returns exactly what the receiver and the guard need.

export type ParsedPrice = {
	feedId: string; // hex, no 0x
	price: bigint;
	conf: bigint;
	expo: number;
	publishTime: number;
};

export type LatestUpdates = {
	/** base64 VAA blobs, one per feed, ready for the Pyth receiver. */
	binary: string[];
	parsed: ParsedPrice[];
};

export class HermesClient {
	constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

	async latest(feedIds: string[]): Promise<LatestUpdates> {
		const params = new URLSearchParams();
		for (const id of feedIds) params.append("ids[]", id.replace(/^0x/, ""));
		params.set("encoding", "base64");
		params.set("parsed", "true");
		const res = await fetch(`${this.baseUrl}/v2/updates/price/latest?${params}`, {
			headers: { authorization: `Bearer ${this.apiKey}` },
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new Error(`Hermes ${res.status}: ${body.slice(0, 200)}`);
		}
		const json = (await res.json()) as {
			binary: { data: string[] };
			parsed: { id: string; price: { price: string; conf: string; expo: number; publish_time: number } }[];
		};
		return {
			binary: json.binary.data,
			parsed: json.parsed.map((p) => ({
				feedId: p.id,
				price: BigInt(p.price.price),
				conf: BigInt(p.price.conf),
				expo: p.price.expo,
				publishTime: p.price.publish_time,
			})),
		};
	}

	/** Free endpoint (no key): schedule + is_open per equity feed. */
	async marketHours(feedIds: string[]): Promise<Record<string, { isOpen: boolean; nextOpen: number; nextClose: number; schedule: string }>> {
		const res = await fetch(`${this.baseUrl}/v2/price_feeds?asset_type=equity`, { signal: AbortSignal.timeout(20_000) });
		if (!res.ok) throw new Error(`Hermes metadata ${res.status}`);
		const all = (await res.json()) as { id: string; market_hours: { is_open: boolean; next_open: number; next_close: number }; attributes: { schedule: string } }[];
		const want = new Set(feedIds.map((f) => f.replace(/^0x/, "")));
		const out: Record<string, { isOpen: boolean; nextOpen: number; nextClose: number; schedule: string }> = {};
		for (const f of all) {
			if (want.has(f.id)) out[f.id] = { isOpen: f.market_hours.is_open, nextOpen: f.market_hours.next_open, nextClose: f.market_hours.next_close, schedule: f.attributes.schedule };
		}
		return out;
	}
}
