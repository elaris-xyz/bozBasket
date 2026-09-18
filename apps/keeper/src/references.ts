// The Pyth reference price of every deployed feed, one row per feed each
// quarter hour, so the web app can chart a plan's value over time without
// asking Hermes on a page view. The key is rate-limited and the executions
// need it: six parallel history requests drew 429 with a ten-second
// retry-after on 2026-09-18. A row records what Hermes said, publish time
// included, so a weekend reads as the Friday price it is, not as fresh.

import type { HermesClient } from "./hermes";

export const REFERENCE_EVERY_SECS = 900;

/** `price` and `publishTime` are null when Pyth had nothing near `ts`, which
 *  only the history backfill can learn (a 404 for that moment). */
export type ReferenceRow = { ts: number; feedId: string; price: number | null; publishTime: number | null };

/** The quarter hour `now` falls in. Every keeper computes the same one, so
 *  the table's primary key keeps a slot to one row per feed. */
export const referenceSlot = (now: number) => Math.floor(now / REFERENCE_EVERY_SECS) * REFERENCE_EVERY_SECS;

export class ReferenceLog {
	constructor(
		private readonly hermes: HermesClient,
		private readonly feedIds: string[],
	) {}

	async sample(slot: number): Promise<ReferenceRow[]> {
		const { parsed } = await this.hermes.latest(this.feedIds);
		return parsed.map((p) => ({ ts: slot, feedId: p.feedId.replace(/^0x/i, "").toLowerCase(), price: Number(p.price) * 10 ** p.expo, publishTime: p.publishTime }));
	}
}
