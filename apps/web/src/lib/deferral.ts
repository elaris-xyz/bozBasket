// Readable text for a deferral's on-chain detail. Rows written before the
// keeper stored the guard's per-leg snapshot carry only the `Deferred` event's
// "leg <index>: <detail>", whose unit depends on the reason (execute.rs):
// seconds of age, bps, or USDC base units. Pure, so it is unit tested.

import { REASON } from "@bozbasket/shared";
import { fmtUsd } from "./format";

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
