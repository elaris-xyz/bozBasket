/** Why VOO is absent where the real market is measured. It is in every devnet
 *  basket, but on Solana mainnet VOOx has no pool: Jupiter finds no route and
 *  GeckoTerminal lists none (measured 2026-09-20). The reason used to sit only
 *  under "How this is measured", folded, until a reader asked where VOO went. */
export function NoVooNote({ missing }: { missing: string }) {
	return (
		<p className="mt-2 text-xs text-slate-500">
			<span className="text-slate-400">No VOOx here:</span> the token exists on Solana, but no pool holds it, so Jupiter finds no route and there is {missing}. VOO is
			still in every devnet basket, priced by Pyth.
		</p>
	);
}
