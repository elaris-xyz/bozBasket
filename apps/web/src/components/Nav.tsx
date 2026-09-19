"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDemoWallet } from "@/lib/wallet";
import { fmtUsd, short } from "@/lib/format";
import { Ticker } from "@/components/Ticker";

const LINKS: [string, string][] = [
	["/", "Plans"],
	["/build", "Build a basket"],
	["/demo", "Demo controls"],
	["/developers", "API"],
];

export function Nav() {
	const path = usePathname();
	const w = useDemoWallet();
	const link = ([href, label]: [string, string]) => (
		<Link
			key={href}
			href={href}
			className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${path === href || (href !== "/" && path.startsWith(href)) ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
		>
			{label}
		</Link>
	);
	return (
		<header className="sticky top-0 z-20 border-b border-white/5 bg-ink-900/85 backdrop-blur">
			<div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
				<div className="flex min-w-0 items-center gap-4">
					<Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
						boz<span className="text-mint">Basket</span>
					</Link>
					<nav className="hidden items-center gap-1 sm:flex">{LINKS.map(link)}</nav>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{w.publicKey ? (
						<>
							<span className="pill bg-white/5 text-slate-300" title="devnet USDC">
								{fmtUsd(w.usdc, 0)}
								<span className="hidden sm:inline"> USDC</span>
							</span>
							<span className="pill hidden bg-white/5 text-slate-400 sm:inline-flex">{w.sol.toFixed(2)} SOL</span>
							<span className="hidden font-mono text-xs text-slate-500 md:inline" title={w.publicKey.toBase58()}>
								{short(w.publicKey.toBase58())}
							</span>
							<button className="btn-ghost !px-2 !py-1 text-xs" onClick={w.fund} disabled={!!w.busy}>
								Top up
							</button>
						</>
					) : (
						<button className="btn-primary !px-3 sm:!px-4" onClick={w.create} disabled={!!w.busy}>
							{w.busy ?? (
								<>
									<span className="sm:hidden">Demo wallet</span>
									<span className="hidden sm:inline">Try with a demo wallet</span>
								</>
							)}
						</button>
					)}
				</div>
			</div>
			{/* Phones: the section links get their own scrollable row. */}
			<nav className="flex gap-1 overflow-x-auto border-t border-white/5 px-2 py-1.5 sm:hidden" aria-label="Sections">
				{LINKS.map(link)}
			</nav>
			{w.busy && <div className="border-t border-white/5 bg-mint/10 px-4 py-1 text-center text-xs text-mint">{w.busy}…</div>}
					<Ticker />
		</header>
	);
}
