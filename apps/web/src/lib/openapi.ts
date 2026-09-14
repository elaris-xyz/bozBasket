// OpenAPI 3.1 description of the Guard API, served at /api/v1/openapi.json so a
// client can be generated from it. Built from the constants the routes use, so
// the documented defaults cannot drift from the real ones.

import { DEFAULT_THRESHOLDS, MAINNET_XSTOCKS, REASON, reasonLabel } from "@bozbasket/shared";
import { API_VERSION, HISTORY_LIMIT_DEFAULT, HISTORY_LIMIT_MAX, USDC_DEFAULT, USDC_MAX } from "./guardApi";

/** Public origin for the examples in the docs. */
export const PUBLIC_SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://boz-basket-web.vercel.app").replace(/\/$/, "");

const nullable = (type: string) => ({ type: [type, "null"] });
const json = (schema: string) => ({ "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } });
const errorResponse = (description: string) => ({ description, content: json("Error") });
const query = (name: string, description: string, schema: Record<string, unknown>) => ({ name, in: "query", required: false, description, schema });

export function openApiSpec(origin: string) {
	const symbols = MAINNET_XSTOCKS.map((s) => s.symbol).join(", ");
	const reasons = Object.entries(REASON)
		.map(([name, code]) => `${code} ${name} (${reasonLabel(code)})`)
		.join("; ");
	return {
		openapi: "3.1.0",
		info: {
			title: "bozBasket Guard API",
			version: `${API_VERSION}.0.0`,
			summary: "Would a fair-value guard let a buy of this xStock through right now, and why?",
			description:
				"Read-only. For each xStock on Solana mainnet the API takes a live Jupiter quote for the requested size and the latest Pyth price, and runs both through the guard arithmetic bozBasket's keeper uses. Nothing is signed or bought. A quote is not a fill: ask again right before you swap, and treat `unavailable` as `defer`. Identical requests are cached for 15 seconds; each address may send 60 requests a minute.",
			license: { name: "MIT", identifier: "MIT" },
		},
		servers: [{ url: origin }],
		paths: {
			"/api/v1/verdict": {
				get: {
					operationId: "getVerdict",
					summary: "Guard verdict for xStocks, right now",
					parameters: [
						query("symbol", `Comma-separated xStocks or underlying tickers. Supported: ${symbols}. Default: all.`, { type: "string", examples: ["TSLAx", "TSLA,QQQ"] }),
						query("usdc", "Buy size in USDC. The quote, and so the price impact, is for this size.", { type: "number", minimum: 1, maximum: USDC_MAX, default: USDC_DEFAULT }),
						query("maxStalenessSecs", "Oldest acceptable Pyth publish time, in seconds.", { type: "number", minimum: 0, maximum: 604_800, default: DEFAULT_THRESHOLDS.maxStalenessSecs }),
						query("maxConfBps", "Widest acceptable Pyth confidence band, in bps of the price.", { type: "number", minimum: 0, maximum: 10_000, default: DEFAULT_THRESHOLDS.maxConfBps }),
						query("maxDivergenceBps", "Largest acceptable gap between Jupiter's price per share and Pyth, in either direction.", {
							type: "number",
							minimum: 0,
							maximum: 10_000,
							default: DEFAULT_THRESHOLDS.maxDivergenceBps,
						}),
						query("minLiquidityUsd", "Smallest acceptable pool liquidity, in USD.", { type: "number", minimum: 0, maximum: 1_000_000_000, default: DEFAULT_THRESHOLDS.minLiquidityUsdc / 1e6 }),
					],
					responses: {
						"200": { description: "A verdict per requested xStock.", content: json("VerdictResponse") },
						"400": errorResponse("A parameter is out of range, or a symbol is not supported."),
						"429": errorResponse("Too many requests from this address."),
						"502": errorResponse("Pyth or Jupiter could not be reached."),
						"503": errorResponse("This deployment is not configured for the API."),
					},
				},
			},
			"/api/v1/history": {
				get: {
					operationId: "getHistory",
					summary: "Recorded $100 checks, newest first",
					description: "bozBasket's keeper records a $100 check of each xStock every few minutes, with the default limits.",
					parameters: [
						query("symbol", "As for /api/v1/verdict. Default: all.", { type: "string" }),
						query("since", "Unix seconds. Default: 24 hours ago.", { type: "integer", minimum: 0 }),
						query("limit", "Rows to return.", { type: "integer", minimum: 1, maximum: HISTORY_LIMIT_MAX, default: HISTORY_LIMIT_DEFAULT }),
					],
					responses: {
						"200": { description: "Recorded checks.", content: json("HistoryResponse") },
						"400": errorResponse("A parameter is out of range."),
						"429": errorResponse("Too many requests from this address."),
						"502": errorResponse("The history store could not be reached."),
						"503": errorResponse("This deployment has no history store."),
					},
				},
			},
		},
		components: {
			schemas: {
				Verdict: { type: "string", enum: ["buy", "defer", "unavailable"], description: "`unavailable` means a price source did not answer; treat it as `defer`." },
				Reason: {
					type: "object",
					required: ["code", "name", "label"],
					description: `The first failing check, in the program's order. ${reasons}. Codes 3 and 6 describe a session policy and a plan's vault, so this API never returns them.`,
					properties: { code: { type: "integer" }, name: { type: "string" }, label: { type: "string" } },
				},
				VerdictResult: {
					type: "object",
					required: ["symbol", "underlying", "mint", "pythFeedId", "verdict", "reason", "reference", "venue", "gapBps", "error"],
					properties: {
						symbol: { type: "string" },
						underlying: { type: "string" },
						mint: { type: "string" },
						pythFeedId: { type: "string" },
						verdict: { $ref: "#/components/schemas/Verdict" },
						reason: { oneOf: [{ $ref: "#/components/schemas/Reason" }, { type: "null" }] },
						reference: {
							oneOf: [
								{
									type: "object",
									required: ["price", "confBps", "publishTime", "ageSecs"],
									properties: { price: { type: "number" }, confBps: { type: "number" }, publishTime: { type: "integer" }, ageSecs: { type: "integer" } },
								},
								{ type: "null" },
							],
						},
						venue: {
							oneOf: [
								{
									type: "object",
									properties: {
										source: { const: "jupiter" },
										usdcIn: { type: "number" },
										pricePerShare: { type: "number", description: "USDC per share, price impact and the issuer's share multiplier included." },
										shares: { type: "number" },
										priceImpactBps: nullable("number"),
										route: nullable("string"),
										liquidityUsd: nullable("number"),
										shareMultiplier: nullable("number"),
									},
								},
								{ type: "null" },
							],
						},
						gapBps: { ...nullable("number"), description: "Signed: above zero the pool charges more than Pyth." },
						error: nullable("string"),
					},
				},
				VerdictResponse: {
					type: "object",
					required: ["apiVersion", "network", "asOf", "request", "limits", "usSession", "overall", "results"],
					properties: {
						apiVersion: { type: "string" },
						network: { const: "solana-mainnet" },
						asOf: { type: "integer", description: "Unix seconds." },
						request: { type: "object", properties: { symbols: { type: "array", items: { type: "string" } }, usdc: { type: "number" } } },
						limits: {
							type: "object",
							properties: { maxStalenessSecs: { type: "number" }, maxConfBps: { type: "number" }, maxDivergenceBps: { type: "number" }, minLiquidityUsd: { type: "number" } },
						},
						usSession: { type: "object", properties: { open: { type: "boolean" }, label: { type: "string" } }, description: "Informational: the guard judges the price, not the calendar." },
						overall: { $ref: "#/components/schemas/Verdict" },
						results: { type: "array", items: { $ref: "#/components/schemas/VerdictResult" } },
					},
				},
				HistoryItem: {
					type: "object",
					properties: {
						ts: { type: "integer" },
						symbol: { type: "string" },
						verdict: { $ref: "#/components/schemas/Verdict" },
						reasonCode: nullable("integer"),
						gapBps: nullable("number"),
						referencePrice: nullable("number"),
						refAgeSecs: nullable("integer"),
						confBps: nullable("number"),
						pricePerShare: nullable("number"),
						usdcIn: { type: "number" },
						error: nullable("string"),
					},
				},
				HistoryResponse: {
					type: "object",
					properties: {
						apiVersion: { type: "string" },
						network: { const: "solana-mainnet" },
						since: { type: "integer" },
						count: { type: "integer" },
						items: { type: "array", items: { $ref: "#/components/schemas/HistoryItem" } },
					},
				},
				Error: {
					type: "object",
					required: ["error"],
					properties: {
						error: {
							type: "object",
							required: ["code", "message"],
							properties: { code: { type: "string", enum: ["bad_request", "rate_limited", "upstream_unavailable", "not_configured"] }, message: { type: "string" } },
						},
					},
				},
			},
		},
	};
}
