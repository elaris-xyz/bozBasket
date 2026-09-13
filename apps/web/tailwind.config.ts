import type { Config } from "tailwindcss";

const config: Config = {
	content: ["./src/**/*.{ts,tsx}"],
	darkMode: "class",
	theme: {
		extend: {
			colors: {
				ink: { 900: "#0B1020", 800: "#0F1629", 700: "#141d35", 600: "#1c2745" },
				mint: "#10B981",
				sky: "#3B82F6",
				amber: "#F59E0B",
				rose: "#EF4444",
			},
			borderRadius: { card: "18px" },
		},
	},
	plugins: [],
};

export default config;
