// The stocks the devnet demo can trade (the three US equity feeds the Pyth
// trial key is entitled to) and the curated baskets shown in the builder.
// Weights are basis points and sum to 10_000.

export type DemoStock = {
	/** Mock market symbol on devnet (PDA seed) and UI label. */
	symbol: "mTSLA" | "mQQQ" | "mVOO";
	name: string;
	/** Real-world ticker this mirrors. */
	ticker: "TSLA" | "QQQ" | "VOO";
	feedId: string;
	color: string;
};

export const DEMO_STOCKS: DemoStock[] = [
	{ symbol: "mTSLA", name: "Tesla", ticker: "TSLA", feedId: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1", color: "#3987E5" },
	{ symbol: "mQQQ", name: "Nasdaq 100 ETF", ticker: "QQQ", feedId: "9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d", color: "#D95926" },
	{ symbol: "mVOO", name: "S&P 500 ETF", ticker: "VOO", feedId: "236b30dd09a9c00dfeec156c7b1efd646c0f01825a1758e3e4a0679e3bdff179", color: "#199E70" },
];

export type BasketPreset = {
	id: string;
	name: string;
	blurb: string;
	weights: Partial<Record<DemoStock["symbol"], number>>;
};

export const PRESETS: BasketPreset[] = [
	{ id: "index-core", name: "Index Core", blurb: "Broad market, low drama.", weights: { mVOO: 6000, mQQQ: 4000 } },
	{ id: "growth-tilt", name: "Growth Tilt", blurb: "Indexes with a Tesla kicker.", weights: { mQQQ: 4000, mVOO: 3000, mTSLA: 3000 } },
	{ id: "tech-heavy", name: "Tech Heavy", blurb: "Nasdaq first, Tesla second.", weights: { mQQQ: 5000, mTSLA: 3000, mVOO: 2000 } },
];

export const CADENCES = [
	{ id: "daily", label: "Daily", seconds: 86_400 },
	{ id: "weekly", label: "Weekly", seconds: 7 * 86_400 },
	{ id: "monthly", label: "Monthly", seconds: 30 * 86_400 },
] as const;
