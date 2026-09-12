// Day-1 network check: can this host reach the services the plan depends on?
//
//   node tools/reachability.mjs
//
// Reads PYTH_API_KEY, PYTH_HERMES_URL and SOLANA_RPC_URL from the environment
// (source .env first). Exit code is 0 when every "required" target answers,
// 1 otherwise. Optional targets are reported but never fail the run.
//
// Findings from 2026-09-12 that shaped this script:
//   - hermes.pyth.network answers 401 without a key. Since the Pyth Core
//     upgrade (2026-08-26) every price endpoint needs
//     `Authorization: Bearer <key>` from https://terminal.pyth.network (free
//     trial tier). The metadata endpoint /v2/price_feeds is still open.
//   - The Pyth push oracle on devnet keeps BTC and SOL fresh but has not
//     posted US equity prices since early July 2026. The keeper must post its
//     own updates (needs Hermes) or the demo must mock the price accounts.

const TIMEOUT_MS = 10_000;
const HERMES = (process.env.PYTH_HERMES_URL || "https://hermes.pyth.network").replace(/\/$/, "");
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PYTH_KEY = process.env.PYTH_API_KEY || "";

// Feed ids are identical on devnet and mainnet.
const AAPL_FEED = "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688";

// Pyth push-oracle price accounts on devnet, shard 0:
// PDA([u16le(0), feed_id], pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT).
const DEVNET_PRICE_ACCOUNTS = {
	AAPL: "DJ2FyTgUAkEtXW3U5P9PF19meFTRtW4ZWKKFgACfVbUy",
	NVDA: "2w1Tg1XTZbUib7srfRoStJ4v5JXVsK7roQEGMsMaGZFC",
	TSLA: "E8WFH8brgP58arcuW2wwsPHiomYrSvrgWTsRLZLAEZUQ",
	SPY: "9owhtgrdLiUMAH9JKxYFt5pUY4Luy4EzzLhdcWPVuDyy",
	BTC: "4cSM2e6rvbGQUFiJbqytoVMi5GgghSMr8LwVrT9VPSPo",
};

const rpc = (method, params) => ({
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
});

// PriceUpdateV2: disc 8 | write_authority 32 | verification_level (1 or 2 bytes)
// | feed_id 32 | price i64 | conf u64 | exponent i32 | publish_time i64 | ...
function decodePublishAge(base64) {
	const d = Buffer.from(base64, "base64");
	let o = 40;
	const level = d[o++];
	if (level === 0) o++;
	o += 32 + 8 + 8 + 4;
	const publishTime = Number(d.readBigInt64LE(o));
	return Math.floor(Date.now() / 1000) - publishTime;
}

const targets = [
	{
		name: "Pyth Hermes metadata (no key needed)",
		url: `${HERMES}/v2/price_feeds?asset_type=equity`,
		required: true,
		check: (body) => Array.isArray(body) && body.length > 100,
	},
	{
		name: PYTH_KEY ? "Pyth Hermes latest AAPL price (with key)" : "Pyth Hermes latest AAPL price (no PYTH_API_KEY set)",
		url: `${HERMES}/v2/updates/price/latest?ids[]=${AAPL_FEED}`,
		init: PYTH_KEY ? { headers: { authorization: `Bearer ${PYTH_KEY}` } } : undefined,
		required: false,
		check: (body) => Array.isArray(body?.parsed) && body.parsed.length > 0,
		hint: "401 means the key is missing or wrong. Get one at https://terminal.pyth.network and set PYTH_API_KEY.",
	},
	{
		name: "Solana devnet RPC (getHealth)",
		url: RPC,
		init: rpc("getHealth", []),
		required: true,
		check: (body) => body?.result === "ok",
	},
	{
		name: "Pyth push oracle on devnet: AAPL publish age",
		url: RPC,
		init: rpc("getAccountInfo", [DEVNET_PRICE_ACCOUNTS.AAPL, { encoding: "base64" }]),
		required: false,
		check: (body, r) => {
			const data = body?.result?.value?.data?.[0];
			if (!data) return false;
			const age = decodePublishAge(data);
			r.note = `publish age ${Math.round(age / 3600)} h`;
			return age < 24 * 3600;
		},
		hint: "stale: nobody sponsors equity feeds on devnet; the keeper must post updates itself.",
	},
	{
		name: "Pyth push oracle on devnet: BTC publish age (control)",
		url: RPC,
		init: rpc("getAccountInfo", [DEVNET_PRICE_ACCOUNTS.BTC, { encoding: "base64" }]),
		required: false,
		check: (body, r) => {
			const data = body?.result?.value?.data?.[0];
			if (!data) return false;
			const age = decodePublishAge(data);
			r.note = `publish age ${age} s`;
			return age < 600;
		},
	},
	{
		name: "Jupiter quote API (mainnet, stretch only)",
		url: "https://lite-api.jup.ag/swap/v1/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=So11111111111111111111111111111111111111112&amount=1000000",
		required: false,
		check: (body) => typeof body?.outAmount === "string",
	},
	{
		name: "npm registry",
		url: "https://registry.npmjs.org/@pythnetwork%2Fhermes-client/latest",
		required: true,
		check: (body) => typeof body?.version === "string",
	},
	{
		name: "crates.io",
		url: "https://crates.io/api/v1/crates/anchor-lang/0.30.1",
		required: true,
		check: (body) => body?.version?.num === "0.30.1",
	},
	{
		name: "GitHub API",
		url: "https://api.github.com/repos/coral-xyz/anchor/releases/latest",
		required: true,
		check: (body) => typeof body?.tag_name === "string",
	},
];

async function probe(t) {
	const started = Date.now();
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	const r = { ...t, ok: false, status: "error", ms: 0, detail: "", note: "" };
	try {
		const res = await fetch(t.url, {
			...t.init,
			signal: ctrl.signal,
			headers: { "user-agent": "bozBasket-reachability", ...(t.init?.headers ?? {}) },
		});
		r.status = res.status;
		let body = null;
		try {
			body = await res.json();
		} catch {
			/* non-JSON body */
		}
		r.ok = res.ok && t.check(body, r);
		if (!r.ok) r.detail = t.hint || JSON.stringify(body)?.slice(0, 100) || "";
	} catch (err) {
		r.status = err.name === "AbortError" ? "timeout" : "error";
		r.detail = err.cause?.code || err.message;
	} finally {
		r.ms = Date.now() - started;
		clearTimeout(timer);
	}
	return r;
}

const results = await Promise.all(targets.map(probe));
let failedRequired = false;
for (const r of results) {
	const mark = r.ok ? "OK  " : r.required ? "FAIL" : "warn";
	if (!r.ok && r.required) failedRequired = true;
	const extra = [r.note, r.ok ? "" : r.detail].filter(Boolean).join("; ");
	console.log(`${mark}  ${String(r.status).padEnd(7)} ${String(r.ms).padStart(5)}ms  ${r.name}${extra ? "  -> " + extra : ""}`);
}
console.log(
	failedRequired
		? "\nA required target is unreachable. Turn the VPN on and rerun."
		: "\nAll required targets reachable. Check the warn lines before relying on Pyth.",
);
process.exit(failedRequired ? 1 : 0);
