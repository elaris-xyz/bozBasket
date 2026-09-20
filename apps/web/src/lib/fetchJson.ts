/** A fetch that never hands a component an HTML error page as if it were data.
 *
 *  On 2026-09-20 Vercel's bot challenge was answering a share of requests with
 *  403 text/html; `r.json()` threw, and the plan page printed
 *  `SyntaxError: Unexpected token '<'` where the guard should be. A reader does
 *  not need the parser's opinion — they need to know it is the network and that
 *  the panel is still trying. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const r = await fetch(url, init);
	if (!(r.headers.get("content-type") ?? "").includes("json")) {
		throw new Error(r.status === 403 ? "The network blocked this request." : `The server answered ${r.status}.`);
	}
	return (await r.json()) as T;
}
