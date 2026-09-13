// One keeper pass over one plan: session check, Hermes fetch, off-chain guard
// preview, then the transactions: post Pyth updates to the receiver, sync the
// mock venue quote, make sure the owner's stock ATAs exist, execute_basket,
// close the update accounts. Events from the landed transaction go to the
// ledger.

import * as anchor from "@coral-xyz/anchor";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { Chain, LoadedPlan } from "./chain";
import { configPda, feedHex, ownerStockAta } from "./chain";
import type { Deployment, KeeperConfig } from "./config";
import type { HermesClient, ParsedPrice } from "./hermes";
import { checkLeg, DEFAULT_MARKET, DEFAULT_THRESHOLDS, legAmounts, REASON, secondsUntilOpen, sessionAt, type LegVerdict } from "@bozbasket/shared";
import type { Ledger } from "./ledger";

export const PYTH_RECEIVER = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

/** What the user would have overpaid, versus the reference price, had this
 *  leg filled at the venue's quote. Only divergence gives a number you can
 *  defend: for thin liquidity the slippage is unknowable, and for a stale or
 *  uncertain price the cost only becomes visible once the market reopens,
 *  which the history API works out afterwards by pairing it with the next
 *  execution. */
function avoidedByDeferring(reason: number, leg: LegVerdict | undefined): number | null {
	if (!leg || leg.venuePrice === null || reason !== REASON.DIVERGENCE) return null;
	const overpay = leg.venuePrice - leg.referencePrice;
	if (overpay <= 0) return null;
	return (leg.legUsdc * overpay) / leg.referencePrice;
}

type EventLeg = { mint: PublicKey; usdcIn: anchor.BN; units: anchor.BN; referencePrice: anchor.BN; venuePrice: anchor.BN; exponent: number };

/** Anchor's `BN.toJSON()` is a *hex* string, so storing an event's legs
 *  verbatim puts "0215a1" in the ledger and every reader has to know that.
 *  The ledger holds decimal strings instead. */
function normalizeLeg(l: EventLeg) {
	return {
		mint: l.mint.toBase58(),
		usdcIn: l.usdcIn.toString(10),
		units: l.units.toString(10),
		referencePrice: l.referencePrice.toString(10),
		venuePrice: l.venuePrice.toString(10),
		exponent: l.exponent,
	};
}

export type PassResult =
	| { kind: "skipped"; reason: number; detail: string }
	| { kind: "executed" | "deferred"; signature: string; reason: number; detail: string }
	| { kind: "error"; detail: string };

export class Executor {
	private receiver: PythSolanaReceiver;
	private marketByMint: Map<string, Deployment["markets"][string]>;

	constructor(
		private chain: Chain,
		private cfg: KeeperConfig,
		private deployment: Deployment,
		private hermes: HermesClient,
		private ledger: Ledger,
	) {
		this.receiver = new PythSolanaReceiver({ connection: chain.connection, wallet: chain.wallet });
		this.marketByMint = new Map(Object.values(deployment.markets).map((m) => [m.stockMint, m]));
	}

	async run(plan: LoadedPlan, now = Math.floor(Date.now() / 1000)): Promise<PassResult> {
		const p = plan.account;
		const legs = p.legs.slice(0, p.legCount);
		const feedIds = legs.map((l) => feedHex(l.pythFeedId));

		// 1. Session calendar (keeper-only reason code 3).
		const session = sessionAt(new Date(now * 1000));
		if (!session.open && this.cfg.offHours === "strict") {
			const wait = secondsUntilOpen(new Date(now * 1000));
			const detail = `${session.label}; next open in ${Math.round(wait / 60)} min`;
			await this.ledger.record({ plan: plan.pubkey.toBase58(), ts: now, kind: "skipped", reason: REASON.MARKET_CLOSED, detail, signature: null, usdcIn: null, legs: null });
			return { kind: "skipped", reason: REASON.MARKET_CLOSED, detail };
		}

		// 2. Reference prices from Hermes (signed, for the receiver) and the
		//    off-chain guard preview.
		const updates = await this.hermes.latest(feedIds);
		const byFeed = new Map(updates.parsed.map((u) => [u.feedId, u]));
		const config = await this.chain.basket.account.config.fetch(configPda(this.chain.basket.programId));
		const thresholds = {
			maxStalenessSecs: config.maxStalenessSecs,
			maxConfBps: config.maxConfBps,
			maxDivergenceBps: config.maxDivergenceBps,
			minLiquidityUsdc: BigInt(config.minLiquidityUsdc.toString()),
		};
		const amounts = legAmounts(BigInt(p.amountPerPeriod.toString()), legs.map((l) => l.weightBps));

		const markets = legs.map((l) => {
			const m = this.marketByMint.get(l.mint.toBase58());
			if (!m) throw new Error(`no mock market for mint ${l.mint.toBase58()}`);
			return m;
		});
		const marketAccounts = await Promise.all(markets.map((m) => this.chain.market.account.market.fetch(new PublicKey(m.market))));

		// Demo mode: the mock reference is stamped "now", so the guard sees a
		// fresh price on a weekend. Everything else (price, conf, venue, fill)
		// stays real. The program must have been pointed at mock_market with
		// scripts/set-reference.ts, otherwise it rejects the account owner.
		const mock = this.cfg.referenceSource === "mock";
		if (mock && !config.referenceProgram.equals(this.chain.market.programId)) {
			throw new Error("REFERENCE_SOURCE=mock but config.reference_program is not mock_market; run scripts/set-reference.ts mock");
		}
		if (!mock && !config.referenceProgram.equals(PYTH_RECEIVER)) {
			throw new Error("config.reference_program is not the Pyth receiver; run scripts/set-reference.ts pyth (or set REFERENCE_SOURCE=mock)");
		}
		const refPublishTime = (ref: ParsedPrice) => (mock ? now : ref.publishTime);

		const verdicts = legs.map((l, i) => {
			const ref0 = byFeed.get(feedIds[i]);
			if (!ref0) throw new Error(`Hermes returned no update for ${feedIds[i]}`);
			const ref = { ...ref0, publishTime: refPublishTime(ref0) };
			const m = marketAccounts[i];
			const override = BigInt(m.priceOverride.toString());
			const base = override > 0n ? override : ref.price;
			const venue = { price: (base * BigInt(10_000 + m.spreadBps)) / 10_000n, expo: ref.expo, liquidityUsdc: BigInt(m.liquidityUsdc.toString()) };
			return checkLeg(now, ref, venue, amounts[i], thresholds);
		});
		const preview = verdicts.find((v) => v.reason !== REASON.OK);
		console.log(`[plan ${plan.pubkey.toBase58().slice(0, 8)}] guard preview:`, verdicts.map((v) => `${v.feedId.slice(0, 6)} age=${v.ageSecs}s conf=${v.confBps}bps div=${v.divergenceBps ?? "-"}bps -> ${v.reason}`).join(" | "));

		// Stale off-hours prices are exactly the scenario the demo must show
		// on chain, so a failing preview is submitted anyway: the program
		// records the deferral with its reason. A weekend reference is two
		// days old, so the "not worth a fee" cutoff defaults to a week.
		if (preview && preview.reason === REASON.REFERENCE_STALE && preview.ageSecs > this.cfg.skipStaleOlderThanSecs) {
			const detail = `reference ${Math.round(preview.ageSecs / 3600)} h old; not submitting`;
			await this.ledger.record({ plan: plan.pubkey.toBase58(), ts: now, kind: "skipped", reason: REASON.REFERENCE_STALE, detail, signature: null, usdcIn: null, legs: null });
			return { kind: "skipped", reason: REASON.REFERENCE_STALE, detail };
		}

		// 3. Transactions. In pyth mode the receiver SDK wraps everything:
		//    post VAAs, our instructions, close the update accounts.
		const owner = p.owner;
		const builder = this.receiver.newTransactionBuilder({ closeUpdateAccounts: true });
		if (!mock) await builder.addPostPriceUpdates(updates.binary);
		await builder.addPriceConsumerInstructions(async (getPriceUpdateAccount) => {
			const ixs: { instruction: TransactionInstruction; signers: anchor.web3.Signer[] }[] = [];

			// Venue quote follows the reference (unless a demo override is set).
			for (let i = 0; i < legs.length; i++) {
				const ref = byFeed.get(feedIds[i]) as ParsedPrice;
				const ix = await this.chain.market.methods
					.postReference(new anchor.BN(ref.price.toString()), new anchor.BN(ref.conf.toString()), ref.expo, new anchor.BN(refPublishTime(ref)))
					.accountsPartial({ market: new PublicKey(markets[i].market), reference: new PublicKey(markets[i].reference), admin: this.chain.wallet.publicKey })
					.instruction();
				ixs.push({ instruction: ix, signers: [] });
			}

			const remaining = legs.flatMap((l, i) => {
				const m = markets[i];
				const ata = ownerStockAta(owner, new PublicKey(m.stockMint));
				ixs.push({
					instruction: createAssociatedTokenAccountIdempotentInstruction(this.chain.wallet.publicKey, ata, owner, new PublicKey(m.stockMint)),
					signers: [],
				});
				return [
					{ pubkey: mock ? new PublicKey(m.reference) : getPriceUpdateAccount(`0x${feedIds[i]}`), isSigner: false, isWritable: false },
					{ pubkey: new PublicKey(m.market), isSigner: false, isWritable: true },
					{ pubkey: new PublicKey(m.stockMint), isSigner: false, isWritable: true },
					{ pubkey: new PublicKey(m.treasury), isSigner: false, isWritable: true },
					{ pubkey: new PublicKey(m.reference), isSigner: false, isWritable: false },
					{ pubkey: ata, isSigner: false, isWritable: true },
				];
			});

			const execute = await this.chain.basket.methods
				.executeBasket()
				.accountsPartial({
					config: configPda(this.chain.basket.programId),
					plan: plan.pubkey,
					vault: p.vault,
					keeper: this.chain.wallet.publicKey,
					fillProgram: this.chain.market.programId,
					tokenProgram: TOKEN_PROGRAM_ID,
				})
				.remainingAccounts(remaining)
				.instruction();
			ixs.push({ instruction: execute, signers: [] });
			return ixs;
		});

		const txs = await builder.buildVersionedTransactions({
			computeUnitPriceMicroLamports: this.cfg.computeUnitPriceMicroLamports,
			tightComputeBudget: false,
		});
		let signatures: string[];
		try {
			signatures = await this.receiver.provider.sendAll(txs, { skipPreflight: false, maxRetries: 5 });
		} catch (err) {
			const detail = (err as Error).message.slice(0, 300);
			await this.ledger.record({ plan: plan.pubkey.toBase58(), ts: now, kind: "error", reason: 0, detail, signature: null, usdcIn: null, legs: null });
			return { kind: "error", detail };
		}

		// 4. Read the outcome from the transaction that carried execute_basket.
		const parser = new anchor.EventParser(this.chain.basket.programId, this.chain.basket.coder);
		for (const sig of signatures) {
			const tx = await this.chain.connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
			const logs = tx?.meta?.logMessages ?? [];
			for (const ev of parser.parseLogs(logs)) {
				if (ev.name === "executed") {
					const d = ev.data as { usdcIn: anchor.BN; legs: EventLeg[] };
					await this.ledger.record({ plan: plan.pubkey.toBase58(), ts: now, kind: "executed", reason: 0, detail: null, signature: sig, usdcIn: d.usdcIn.toString(), legs: d.legs.map(normalizeLeg) });
					return { kind: "executed", signature: sig, reason: 0, detail: "" };
				}
				if (ev.name === "deferred") {
					const d = ev.data as { reason: number; legIndex: number; detail: anchor.BN };
					const detail = `leg ${d.legIndex}: ${d.detail.toString()}`;
					const leg = verdicts[d.legIndex];
					const m = marketAccounts[d.legIndex];
					// A deferral caused by a demo control is not a saving, and
					// counting it as one would be a lie. Only the market's own
					// behaviour is credited.
					const forced =
						(d.reason === REASON.DIVERGENCE && BigInt(m?.priceOverride.toString() ?? "0") > 0n) ||
						(d.reason === REASON.LOW_LIQUIDITY && Number(m?.liquidityUsdc.toString() ?? 0) < DEFAULT_MARKET.liquidityUsdc) ||
						(d.reason === REASON.REFERENCE_STALE && config.maxStalenessSecs < DEFAULT_THRESHOLDS.maxStalenessSecs) ||
						(d.reason === REASON.CONFIDENCE_TOO_WIDE && config.maxConfBps < DEFAULT_THRESHOLDS.maxConfBps);
					await this.ledger.record({
						plan: plan.pubkey.toBase58(),
						ts: now,
						kind: "deferred",
						reason: d.reason,
						detail,
						signature: sig,
						usdcIn: null,
						legs: verdicts,
						forced,
						avoidedUsdc: forced ? null : avoidedByDeferring(d.reason, leg),
					});
					return { kind: "deferred", signature: sig, reason: d.reason, detail };
				}
			}
		}
		const detail = `no Executed/Deferred event in ${signatures.join(",")}`;
		await this.ledger.record({ plan: plan.pubkey.toBase58(), ts: now, kind: "error", reason: 0, detail, signature: signatures[signatures.length - 1] ?? null, usdcIn: null, legs: null });
		return { kind: "error", detail };
	}
}
