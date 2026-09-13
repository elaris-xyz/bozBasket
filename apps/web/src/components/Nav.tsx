"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDemoWallet } from "@/lib/wallet";
import { fmtUsd, short } from "@/lib/format";

export function Nav() {
	const path = usePathname();
	const w = useDemoWallet();
	const link = (href: string, label: string) => (
		<Link href={href} className={`rounded-lg px-3 py-1.5 text-sm ${path === href || (href !== "/" && path.startsWith(href)) ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}>
			{label}
		</Link>
	);
	return (
		<header className="sticky top-0 z-20 border-b border-white/5 bg-ink-900/80 backdrop-blur">
			<div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
				<div className="flex items-center gap-4">
					<Link href="/" className="text-lg font-bold tracking-tight">
						boz<span className="text-mint">Basket</span>
					</Link>
					<nav className="hidden items-center gap-1 sm:flex">
						{link("/", "Plans")}
						{link("/build", "Build a basket")}
						{link("/demo", "Demo controls")}
					</nav>
				</div>
				<div className="flex items-center gap-2">
					{w.publicKey ? (
						<>
							<span className="pill bg-white/5 text-slate-300" title="devnet USDC">
								{fmtUsd(w.usdc, 0)} USDC
							</span>
							<span className="pill bg-white/5 text-slate-400">{w.sol.toFixed(2)} SOL</span>
							<span className="hidden font-mono text-xs text-slate-500 md:inline" title={w.publicKey.toBase58()}>
								{short(w.publicKey.toBase58())}
							</span>
							<button className="btn-ghost !px-2 !py-1 text-xs" onClick={w.fund} disabled={!!w.busy}>
								Top up
							</button>
						</>
					) : (
						<button className="btn-primary" onClick={w.create} disabled={!!w.busy}>
							{w.busy ?? "Try with a demo wallet"}
						</button>
					)}
				</div>
			</div>
			{w.busy && <div className="border-t border-white/5 bg-mint/10 px-4 py-1 text-center text-xs text-mint">{w.busy}…</div>}
		</header>
	);
}
