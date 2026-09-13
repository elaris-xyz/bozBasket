"use client";

import { useEffect, useState } from "react";
import type { KeeperStatus as Status } from "@/app/api/status/route";
import { fmtDuration } from "@/lib/format";

/** Honest liveness. A deferral and a dead keeper look identical on a plan
 *  page otherwise, and telling a user "nothing happened" without saying why
 *  is the thing this whole product is against. */
export function KeeperStatus({ compact = false }: { compact?: boolean }) {
	const [s, setS] = useState<Status | null>(null);

	useEffect(() => {
		const load = () =>
			fetch("/api/status")
				.then((r) => r.json())
				.then(setS)
				.catch(() => undefined);
		load();
		const t = setInterval(load, 20_000);
		return () => clearInterval(t);
	}, []);

	if (!s) return null;

	const [cls, text] = !s.known
		? ["bg-white/10 text-slate-400", "Keeper status unknown"]
		: s.alive
			? ["bg-mint/15 text-mint", `Keeper live · last pass ${fmtDuration(s.ageSecs ?? 0)} ago`]
			: ["bg-rose/15 text-rose", `Keeper last ran ${fmtDuration(s.ageSecs ?? 0)} ago · plans will not execute`];

	if (compact) return <span className={`pill ${cls}`}>{text}</span>;

	return (
		<div className={`rounded-xl px-4 py-2 text-sm ${cls}`}>
			<span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: "currentColor" }} />
			{text}
			{s.known && s.activePlans !== null && (
				<span className="ml-2 opacity-70">
					· {s.activePlans} active plan{s.activePlans === 1 ? "" : "s"}
					{s.duePlans ? `, ${s.duePlans} due` : ""}
					{s.note ? ` · ${s.note}` : ""}
				</span>
			)}
		</div>
	);
}
