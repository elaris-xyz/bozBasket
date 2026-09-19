import type { Config } from "tailwindcss";

const config: Config = {
	content: ["./src/**/*.{ts,tsx}"],
	darkMode: "class",
	theme: {
		extend: {
			colors: {
				// Graphite, not navy: a terminal surface that lets the data carry
				// the colour. 900 page, 800 card, 700 raised, 600 tracks.
				ink: { 900: "#080A0F", 800: "#0D1117", 700: "#131A24", 600: "#1B2430" },
				// Status only, never a series: gain, information, warning, loss.
				mint: "#10B981",
				sky: "#3B82F6",
				amber: "#F59E0B",
				rose: "#EF4444",
				// The three stocks, from the dataviz reference palette's dark steps
				// (slots 1-3). Validated as a set on #0D1117: lightness band, chroma,
				// CVD separation and contrast all pass under --pairs all.
				series: { tsla: "#3987E5", qqq: "#D95926", voo: "#199E70" },
			},
			fontFamily: {
				sans: ["var(--font-sans)", "system-ui", "sans-serif"],
				mono: ["var(--font-mono)", "ui-monospace", "monospace"],
			},
			borderRadius: { card: "12px" },
		},
	},
	plugins: [],
};

export default config;
