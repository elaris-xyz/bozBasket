import type { Metadata } from "next";
import "./globals.css";
import { DemoWalletProvider } from "@/lib/wallet";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
	title: { default: "bozBasket", template: "%s · bozBasket" },
	description: "Recurring baskets of tokenized US stocks on Solana, bought only when the reference price can be trusted.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark">
			<body className="min-h-screen antialiased">
				<DemoWalletProvider>
					<Nav />
					<main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6">{children}</main>
					<footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-slate-500">
						Devnet demo. Stock tokens and fills are synthetic; the program, vaults, schedule, guard and deferrals are real on chain.
					</footer>
				</DemoWalletProvider>
			</body>
		</html>
	);
}
