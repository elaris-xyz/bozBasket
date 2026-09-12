// Pyth price feed ids for the stocks the demo supports. Same id on devnet and
// mainnet. Source: https://hermes.pyth.network/v2/price_feeds?asset_type=equity
// (fetched 2026-09-12). Hex without 0x, as stored on chain in Leg.pyth_feed_id.
export const PYTH_FEEDS = {
	AAPL: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
	NVDA: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
	TSLA: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
	SPY: "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5",
	QQQ: "9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d",
	MSFT: "d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1",
	AMZN: "b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a",
	GOOGL: "5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6",
	META: "78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe",
} as const;

export type StockSymbol = keyof typeof PYTH_FEEDS;

/** US equities regular session as Hermes reports it for every feed above. */
export const US_EQUITY_SCHEDULE =
	"America/New_York;0930-1600,0930-1600,0930-1600,0930-1600,0930-1600,C,C";
