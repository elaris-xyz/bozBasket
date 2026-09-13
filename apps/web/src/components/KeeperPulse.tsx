"use client";

import { useEffect } from "react";

/** While someone has the app open and visible, ask the server for a keeper
 *  pass about once a minute. The server runs at most one pass a minute across
 *  all visitors, so many open tabs cost no more than one. It is why a judge
 *  watching a plan sees it execute without waiting on a scheduled job. */
export function KeeperPulse() {
	useEffect(() => {
		const tick = () => {
			if (document.visibilityState !== "visible") return;
			fetch("/api/keeper/tick", { method: "POST", headers: { "x-keeper-trigger": "visitor" }, keepalive: true }).catch(() => undefined);
		};
		tick();
		const timer = setInterval(tick, 60_000);
		document.addEventListener("visibilitychange", tick);
		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", tick);
		};
	}, []);
	return null;
}
