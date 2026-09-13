"use client";

import { useEffect, useState } from "react";
import { fmtDuration } from "@/lib/format";

/** Time until a unix timestamp; "due" once passed. */
export function Countdown({ ts }: { ts: number }) {
	const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
	useEffect(() => {
		const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
		return () => clearInterval(t);
	}, []);
	const left = ts - now;
	if (left <= 0) return <span className="text-mint">due, awaiting keeper</span>;
	return <span className="font-mono">{fmtDuration(left)}</span>;
}
