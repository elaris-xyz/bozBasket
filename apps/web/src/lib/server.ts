import "server-only";

// Server-side chain access. The keeper keypair is the program admin and the
// mock USDC mint authority, so it signs the faucet and the demo controls.
// It never reaches the browser.

import { Keypair, PublicKey } from "@solana/web3.js";
import { keypairWallet, programsFor, DEPLOYMENT } from "./solana";

export function keeperKeypair(): Keypair {
	const raw = process.env.KEEPER_SECRET_KEY;
	if (!raw) throw new Error("KEEPER_SECRET_KEY is not set");
	return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export function adminPrograms() {
	const kp = keeperKeypair();
	return { kp, ...programsFor(keypairWallet(kp)) };
}

export type MarketInfo = { symbol: string; feedId: string; market: string; stockMint: string; treasury: string; reference: string };

export const MARKETS = Object.values(DEPLOYMENT.markets) as MarketInfo[];

export function marketPks(m: MarketInfo) {
	return { market: new PublicKey(m.market), stockMint: new PublicKey(m.stockMint), treasury: new PublicKey(m.treasury), reference: new PublicKey(m.reference) };
}

/** Latest Hermes prices for the given feeds, server-side (holds the API key). */
export async function hermesLatest(feedIds: string[]) {
	const base = (process.env.PYTH_HERMES_URL ?? "https://hermes.pyth.network").replace(/\/$/, "");
	const key = process.env.PYTH_API_KEY;
	if (!key) throw new Error("PYTH_API_KEY is not set");
	const params = new URLSearchParams();
	for (const id of feedIds) params.append("ids[]", id.replace(/^0x/, ""));
	params.set("parsed", "true");
	const res = await fetch(`${base}/v2/updates/price/latest?${params}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
	if (!res.ok) throw new Error(`Hermes ${res.status}: ${(await res.text()).slice(0, 120)}`);
	const json = (await res.json()) as { parsed: { id: string; price: { price: string; conf: string; expo: number; publish_time: number } }[] };
	return json.parsed.map((p) => ({ feedId: p.id, price: BigInt(p.price.price), conf: BigInt(p.price.conf), expo: p.price.expo, publishTime: p.price.publish_time }));
}
