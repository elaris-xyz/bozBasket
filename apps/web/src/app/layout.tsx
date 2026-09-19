import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DemoWalletProvider } from "@/lib/wallet";
import { Nav } from "@/components/Nav";
import { KeeperPulse } from "@/components/KeeperPulse";

const description = "Recurring baskets of tokenized US stocks on Solana, bought only when the reference price can be trusted.";

// Absolute URLs for link previews. On Vercel the production domain wins even
// on preview deployments, so a shared preview link still shows the real card.
const siteUrl =
	process.env.NEXT_PUBLIC_SITE_URL ??
	(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3200");

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: { default: "bozBasket", template: "%s · bozBasket" },
	description,
	applicationName: "bozBasket",
	openGraph: { type: "website", siteName: "bozBasket", title: "bozBasket", description, url: "/" },
	twitter: { card: "summary_large_image", title: "bozBasket", description },
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	themeColor: "#0b1020",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark">
			<body className="flex min-h-screen flex-col antialiased">
				<DemoWalletProvider>
					<KeeperPulse />
					<Nav />
					{/* 1152 px: at 1024 a 1440-1920 screen was mostly empty margin. The footer
					    sits at the bottom of a short page rather than mid-screen. */}
					<main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-4 sm:pt-6">{children}</main>
					<footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-slate-500">
						Devnet demo. Stock tokens and fills are synthetic; the program, vaults, schedule, guard and deferrals are real on chain.
					</footer>
				</DemoWalletProvider>
			</body>
		</html>
	);
}
