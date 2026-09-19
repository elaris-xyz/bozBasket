import type { Metadata } from "next";
import { DEFAULT_THRESHOLDS, MAINNET_XSTOCKS, REASON, reasonLabel } from "@bozbasket/shared";
import { ApiTryIt } from "@/components/ApiTryIt";
import { HISTORY_LIMIT_DEFAULT, HISTORY_LIMIT_MAX, USDC_DEFAULT, USDC_MAX } from "@/lib/guardApi";
import { PUBLIC_SITE } from "@/lib/openapi";

export const metadata: Metadata = {
	// The layout's template appends " · bozBasket".
	title: "Guard API",
	description: "Ask whether a buy of an xStock on Solana mainnet would pass a fair-value guard right now, and why.",
};

function Code({ children }: { children: string }) {
	return <pre className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed text-slate-200">{children}</pre>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
	return (
		<>
			{/* Phones: one block per row. The table needs 520 px and scrolled
			    sideways with no sign that it did, so the last column looked cut. */}
			<dl className="mt-3 divide-y divide-white/5 text-sm sm:hidden">
				{rows.map((r) => (
					<div key={r[0]} className="py-2">
						<dt className="font-mono text-xs text-slate-200">{r[0]}</dt>
						{r.slice(1).map((cell, i) =>
							cell ? (
								<dd key={i} className="mt-0.5 text-slate-400">
									{head.length > 2 && i < head.length - 2 ? <span className="text-xs uppercase tracking-wide text-slate-500">{head[i + 1]} </span> : null}
									{cell}
								</dd>
							) : null,
						)}
					</div>
				))}
			</dl>
			<div className="mt-3 hidden overflow-x-auto sm:block">
			<table className="w-full min-w-[520px] text-left text-sm">
				<thead>
					<tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
						{head.map((h) => (
							<th key={h} className="py-2 pr-4 font-medium">
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="divide-y divide-white/5">
					{rows.map((r) => (
						<tr key={r[0]}>
							{r.map((cell, i) => (
								<td key={i} className={`py-2 pr-4 align-top ${i === 0 ? "whitespace-nowrap font-mono text-xs text-slate-200" : "text-slate-400"}`}>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
		</>
	);
}

const VERDICT_PARAMS = [
	["symbol", "all", `Comma-separated xStocks or their tickers: ${MAINNET_XSTOCKS.map((s) => `${s.symbol} (${s.ticker})`).join(", ")}.`],
	["usdc", String(USDC_DEFAULT), `Buy size in USDC, up to ${USDC_MAX.toLocaleString("en-US")}. The Jupiter quote, and so the price impact, is for this size.`],
	["maxStalenessSecs", String(DEFAULT_THRESHOLDS.maxStalenessSecs), "Oldest acceptable Pyth publish time, in seconds."],
	["maxConfBps", String(DEFAULT_THRESHOLDS.maxConfBps), "Widest acceptable Pyth confidence band, in bps of the price."],
	["maxDivergenceBps", String(DEFAULT_THRESHOLDS.maxDivergenceBps), "Largest acceptable gap between Jupiter's price per share and Pyth, in either direction."],
	["minLiquidityUsd", String(DEFAULT_THRESHOLDS.minLiquidityUsdc / 1e6), "Smallest acceptable pool liquidity, in USD, as Jupiter reports it."],
];

const VERDICT_FIELDS = [
	["overall", "buy when every requested xStock passes, defer when any fails, unavailable when a price source did not answer. Treat unavailable as defer."],
	["results[].verdict", "The same, per xStock."],
	["results[].reason", "Code, name and label of the first failing check, in the program's order: staleness, confidence, gap, depth. Null when unavailable."],
	["results[].reference", "The Pyth price, its confidence in bps, its publish time and its age in seconds."],
	["results[].venue", "What Jupiter quotes for your size: price per share with the issuer's share multiplier applied, shares, price impact, route and pool liquidity."],
	["results[].gapBps", "Signed: above zero the pool charges more than Pyth."],
	["usSession", "Whether the US regular session is open. Informational: the guard judges the price, not the calendar."],
];

const HISTORY_PARAMS = [
	["symbol", "all", "As above."],
	["since", "24 h ago", "Unix seconds."],
	["limit", String(HISTORY_LIMIT_DEFAULT), `Rows to return, up to ${HISTORY_LIMIT_MAX}.`],
];

const API_REASONS = new Set<number>([REASON.OK, REASON.REFERENCE_STALE, REASON.CONFIDENCE_TOO_WIDE, REASON.DIVERGENCE, REASON.LOW_LIQUIDITY]);

const INTEGRATE = `const url = "${PUBLIC_SITE}/api/v1/verdict?symbol=TSLAx&usdc=500";
const { overall, results } = await fetch(url).then((r) => r.json());

if (overall !== "buy") {
  // A stale price, a wide confidence band, a pool off fair value or no depth:
  // wait, and tell the user why.
  return defer(results.map((r) => r.reason?.label ?? r.error));
}
await swap(); // your own Jupiter swap, right away`;

export default function DevelopersPage() {
	return (
		<div className="space-y-5">
			<div>
				<p className="label">Guard API v1</p>
				<h1 className="mt-1 text-2xl font-bold">Should this xStock buy go through right now?</h1>
				<p className="mt-2 max-w-3xl text-slate-400">
					The guard behind bozBasket, as one HTTP call any app can make before buying a tokenized stock on Solana mainnet. It takes a live Jupiter quote for your size
					and the latest Pyth price, runs both through the same checks the keeper uses, and tells you whether to buy or wait, and why. Free, read-only, no key, open to
					browsers.
				</p>
			</div>

			<ApiTryIt site={PUBLIC_SITE} />

			<section className="card">
				<h2 className="font-semibold">
					<span className="pill mr-2 bg-mint/15 font-mono text-mint">GET</span>
					<span className="font-mono">/api/v1/verdict</span>
				</h2>
				<p className="mt-2 text-sm text-slate-400">Every parameter is optional.</p>
				<Table head={["Parameter", "Default", "Meaning"]} rows={VERDICT_PARAMS} />
				<Code>{`curl "${PUBLIC_SITE}/api/v1/verdict?symbol=TSLAx&usdc=500"`}</Code>
				<h3 className="mt-5 text-sm font-semibold">What comes back</h3>
				<Table head={["Field", "Meaning"]} rows={VERDICT_FIELDS} />
			</section>

			<section className="card">
				<h2 className="font-semibold">Use it before a swap</h2>
				<Code>{INTEGRATE}</Code>
				<p className="mt-2 text-xs text-slate-500">A quote is not a fill. Ask right before you send the swap, not minutes earlier.</p>
			</section>

			<section className="card">
				<h2 className="font-semibold">
					<span className="pill mr-2 bg-mint/15 font-mono text-mint">GET</span>
					<span className="font-mono">/api/v1/history</span>
				</h2>
				<p className="mt-2 text-sm text-slate-400">
					The $100 checks bozBasket&apos;s keeper records every few minutes with the default limits, newest first. This is the data behind the chart on the home page.
				</p>
				<Table head={["Parameter", "Default", "Meaning"]} rows={HISTORY_PARAMS} />
				<Code>{`curl "${PUBLIC_SITE}/api/v1/history?symbol=QQQx&limit=12"`}</Code>
			</section>

			<section className="card">
				<h2 className="font-semibold">Reason codes</h2>
				<p className="mt-2 text-sm text-slate-400">The same codes the on-chain program writes when it defers a basket.</p>
				<Table
					head={["Code", "Name", "Meaning", "From this API"]}
					rows={Object.entries(REASON).map(([name, code]) => [String(code), name, reasonLabel(code), API_REASONS.has(code) ? "yes" : "no: a plan's session policy or vault"])}
				/>
			</section>

			<section className="card text-sm text-slate-400">
				<h2 className="font-semibold text-slate-100">Fine print</h2>
				<ul className="mt-2 list-disc space-y-1 pl-5">
					<li>Read-only: nothing is signed and nothing is bought.</li>
					<li>Identical requests are cached for 15 seconds, and each address may send 60 requests a minute.</li>
					<li>
						The arithmetic is <code className="font-mono text-xs">checkLeg</code> in <code className="font-mono text-xs">packages/shared</code>, the off-chain twin of the
						program&apos;s guard, which the keeper and the guard panel also use.
					</li>
					<li>Covered: {MAINNET_XSTOCKS.map((s) => s.symbol).join(" and ")}. VOOx is left out: no pool holds it on Solana, so Jupiter finds no route.</li>
					<li>This runs on a free tier for a hackathon, with no uptime promise. Treat an error or unavailable as defer.</li>
				</ul>
				<p className="mt-3">
					Machine-readable description:{" "}
					<a className="font-mono text-xs underline" href="/api/v1/openapi.json">
						/api/v1/openapi.json
					</a>{" "}
					(OpenAPI 3.1).
				</p>
			</section>
		</div>
	);
}
