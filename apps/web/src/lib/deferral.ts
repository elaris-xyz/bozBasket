// Readable text for a deferral's on-chain detail. Rows written before the
// keeper stored the guard's per-leg snapshot carry only the `Deferred` event's
// "leg <index>: <detail>", whose unit depends on the reason (execute.rs):
// seconds of age, bps, or USDC base units. Pure, so it is unit tested.

import { REASON } from "@bozbasket/shared";
import { fmtDuration, fmtUsd } from "./format";

export const fmtAge = (secs: number) => (secs >= 7200 ? `${Math.round(secs / 3600)} h` : secs >= 120 ? `${Math.round(secs / 60)} min` : `${secs} s`);

/** Null when the detail is not an event detail, such as a skip's text. */
export function deferralDetail(reason: number, detail: string | null, legTickers: string[]): string | null {
	const m = detail?.match(/^leg (\d+): (-?\d+)$/);
	if (!m) return null;
	const index = Number(m[1]);
	const n = Number(m[2]);
	const t = legTickers[index] ?? `leg ${index}`;
	switch (reason) {
		case REASON.REFERENCE_STALE:
			return `${t} price ${fmtAge(n)} old`;
		case REASON.CONFIDENCE_TOO_WIDE:
			return `${t} confidence ${n} bps`;
		case REASON.DIVERGENCE:
			return `${t} venue ${n} bps from reference`;
		case REASON.LOW_LIQUIDITY:
			return `${t} venue depth ${fmtUsd(n / 1e6, 0)}`;
		case REASON.INSUFFICIENT_BALANCE:
			return `vault holds ${fmtUsd(n / 1e6)}, less than one period`;
		default:
			return null;
	}
}

/** "Sunday 20:00 ET, in 1d 4h": when Pyth is expected to publish US equity
 *  prices again, `inSecs` from `secondsUntilPythPublishes`. */
export function pythResumeLabel(nowSecs: number, inSecs: number): string {
	const at = new Date((nowSecs + inSecs) * 1000).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
	return `${at} ET, in ${fmtDuration(inSecs)}`;
}

/** When the keeper tries a deferred buy again, and what lets it through, for
 *  the reason the program recorded. A deferred plan stays due, so every pass
 *  retries it; only a stale price has a time worth naming. `pythResumesIn` is
 *  0 while Pyth is publishing, `shortfallUsdc` what the vault lacks for one
 *  period. */
export function retryNote(reason: number, nowSecs: number, pythResumesIn: number, shortfallUsdc: number): string {
	const nextPass = "The keeper tries again on its next pass, within a few minutes";
	switch (reason) {
		case REASON.REFERENCE_STALE:
			return pythResumesIn > 0
				? `Pyth publishes no US equity prices until ${pythResumeLabel(nowSecs, pythResumesIn)}. The keeper keeps trying and buys on the first fresh price.`
				: `${nextPass}, and buys once the reference price is fresh.`;
		case REASON.CONFIDENCE_TOO_WIDE:
			return `${nextPass}, and buys once Pyth's confidence band is back inside the limit.`;
		case REASON.DIVERGENCE:
			return `${nextPass}, and buys once the venue quotes close enough to the reference price.`;
		case REASON.LOW_LIQUIDITY:
			return `${nextPass}, and buys once the venue has the depth for every leg.`;
		case REASON.INSUFFICIENT_BALANCE:
			// The reason stays on chain until the next attempt, so a deposit made
			// since then already covers it.
			return shortfallUsdc > 0 ? `Nothing changes that on its own: deposit at least ${fmtUsd(shortfallUsdc)} and the next pass buys.` : `${nextPass}, and buys now that the vault covers a period.`;
		default:
			return `${nextPass}.`;
	}
}
