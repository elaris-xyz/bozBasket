// Coarse per-instance request limiter. Serverless means several instances and
// so several buckets: a speed bump against a loop, not a quota.

export function makeLimiter(windowMs: number, max: number) {
	const hits = new Map<string, number[]>();
	return (req: Request): boolean => {
		const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
		const now = Date.now();
		const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
		recent.push(now);
		hits.set(ip, recent);
		if (hits.size > 1000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
		return recent.length > max;
	};
}
