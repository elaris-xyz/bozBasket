import type { ReactNode } from "react";

// The one tooltip look for every chart. Recharts' default tooltip is black
// text for a white box; given this UI's dark box it read as grey on navy, and
// it named a scatter point "x" and "y" without saying whose it was. Charts
// pass their own `content` built from these, never `contentStyle` alone.

export function TipBox({ children }: { children: ReactNode }) {
	return <div className="rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-xs text-slate-200 shadow-lg shadow-black/40">{children}</div>;
}

/** The heading line, usually the time. */
export const TipTitle = ({ children }: { children: ReactNode }) => <p className="mb-1 text-slate-400">{children}</p>;

/** One series: its colour, its name, its value. */
export function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
	return (
		<p className="flex items-center gap-1.5">
			{color && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
			<span className="text-slate-300">{label}</span>
			<span className="ml-auto pl-3 font-mono text-slate-100">{value}</span>
		</p>
	);
}

/** What recharts hands a custom tooltip. */
export type TipProps<P = Record<string, unknown>> = {
	active?: boolean;
	label?: number | string;
	payload?: { name?: string | number; value?: number | string; color?: string; payload: P }[];
};
