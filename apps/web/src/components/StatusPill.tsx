export function StatusPill({ status }: { status: number }) {
	const map: Record<number, [string, string]> = {
		0: ["Active", "bg-mint/15 text-mint"],
		1: ["Paused", "bg-amber/15 text-amber"],
		2: ["Ended", "bg-white/10 text-slate-400"],
	};
	const [label, cls] = map[status] ?? ["Unknown", "bg-white/10 text-slate-400"];
	return <span className={`pill ${cls}`}>{label}</span>;
}
