export const fmtUsd = (n: number, digits = 2) =>
	n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtUnits = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

export const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export const short = (s: string, n = 4) => `${s.slice(0, n)}…${s.slice(-n)}`;

export const fmtTs = (ts: number) =>
	new Date(ts * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

export function fmtDuration(secs: number): string {
	if (secs <= 0) return "now";
	const d = Math.floor(secs / 86400);
	const h = Math.floor((secs % 86400) / 3600);
	const m = Math.floor((secs % 3600) / 60);
	const s = secs % 60;
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
	return `${m}m ${String(s).padStart(2, "0")}s`;
}

export const cadenceLabel = (seconds: number) =>
	seconds === 86_400 ? "daily" : seconds === 7 * 86_400 ? "weekly" : seconds === 30 * 86_400 ? "monthly" : `every ${Math.round(seconds / 3600)} h`;

export { reasonLabel } from "@bozbasket/shared";

/** Pyth price with exponent → number. */
export const pythToNumber = (price: bigint | number | string, expo: number) => Number(price) * 10 ** expo;
