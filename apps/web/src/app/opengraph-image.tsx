import { ImageResponse } from "next/og";

export const alt = "bozBasket: recurring baskets of tokenized US stocks, bought only when the price can be trusted";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// No custom fonts and no emoji. Both are fetched over the network while the
// image renders, and on the build host a stalled fetch fails every route.
export default function OpengraphImage() {
	return new ImageResponse(
		(
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					padding: 72,
					background: "linear-gradient(135deg, #0f2a24 0%, #0b1020 45%, #0b1020 70%, #10213a 100%)",
					color: "#e2e8f0",
					fontFamily: "sans-serif",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<div style={{ display: "flex", alignItems: "center" }}>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 64,
								height: 64,
								borderRadius: 18,
								background: "#10b981",
								color: "#0b1020",
								fontSize: 44,
								fontWeight: 800,
							}}
						>
							b
						</div>
						<div style={{ display: "flex", marginLeft: 20, fontSize: 40, fontWeight: 800 }}>
							<span style={{ color: "#ffffff" }}>boz</span>
							<span style={{ color: "#10b981" }}>Basket</span>
						</div>
					</div>
					<div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, border: "2px solid #10b981", color: "#10b981", fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>
						SOLANA DEVNET
					</div>
				</div>

				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", fontSize: 54, fontWeight: 800, lineHeight: 1.1, color: "#ffffff" }}>Buy US stocks on a schedule.</div>
					<div style={{ display: "flex", fontSize: 54, fontWeight: 800, lineHeight: 1.1, color: "#10b981" }}>Only when the price can be trusted.</div>
					<div style={{ display: "flex", marginTop: 28, fontSize: 30, color: "#94a3b8", maxWidth: 1000 }}>Stale or unfair prices defer the buy, with the reason written on chain.</div>
				</div>

				<div style={{ display: "flex", alignItems: "center", fontSize: 24, color: "#64748b" }}>
					<div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: "#10b981", marginRight: 12 }} />
					Pyth reference prices · one atomic transaction per basket
				</div>
			</div>
		),
		size,
	);
}
