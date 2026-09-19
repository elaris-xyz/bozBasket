import { fmtDuration } from "@/lib/format";

/** The one countdown that matters to the guard. While Pyth is paused (Friday
 *  20:00 to Sunday 20:00 ET) that is when it publishes again, not when the
 *  regular session opens: showing the session put "opens in 2d 2h" on the
 *  same card as "Pyth publishes again in 1d 13h". */
export function SessionPill({ open, label, secondsUntilOpen, pythResumesIn }: { open: boolean; label?: string; secondsUntilOpen: number | null; pythResumesIn: number }) {
	if (pythResumesIn > 0) return <span className="pill bg-amber/15 text-amber">Pyth paused · back in {fmtDuration(pythResumesIn)}</span>;
	return (
		<span className={`pill ${open ? "bg-mint/15 text-mint" : "bg-white/10 text-slate-300"}`}>
			US session {open ? "open" : label ? `closed · ${label}` : "closed"}
			{secondsUntilOpen !== null && ` · opens in ${fmtDuration(secondsUntilOpen)}`}
		</span>
	);
}
