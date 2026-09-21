# Submission form — copy-ready text

For the Stocklana form at hackathons.solana.com. Written 2026-09-21. Only the
form's Links step has been seen; the other fields are the usual ones, so copy
whichever the form asks for. Every number below is from the repository or the
live site on that date, and each block shows its length so a field with a
limit can take the shorter version.

---

## Project name

bozBasket

## Tagline

Long (92 characters)

```
Recurring baskets of tokenized US stocks that refuse to buy when the price can't be trusted.
```

Short (59 characters)

```
Stock-basket DCA on Solana that won't buy on a stale price.
```

## Short description (293 characters)

```
bozBasket buys a basket of tokenized US stocks on a schedule, in one atomic Solana transaction, but only after the program checks Pyth's reference price and the venue. On weekends, when no US equity price is published, it defers the buy and writes the reason on chain instead of filling blind.
```

## Description (2,286 characters)

If the field stops at 2,000 characters, drop the TRY IT paragraph; the rest
is 1,947 characters and stands on its own.

```
THE PROBLEM
Tokenized stocks trade 24/7. A trustworthy price does not: from Friday 20:00 to Sunday 20:00 ET no US equity price is published, and the last one ages for 48 hours while the tokens keep trading. Recurring-buy tools fire on a timer anyway. Over eight weekends of real xStock pool trades, a blind weekend buy landed a median 0.45-0.53% from the next price Pyth published, three to four times the weekday gap, and anywhere from -1.96% to +1.92%.

WHAT IT DOES
Define a basket once (say TSLA 50% / QQQ 30% / VOO 20%, $100 weekly) and deposit USDC into a vault only your key can withdraw from. Each period a keeper triggers the buy, and the program buys every leg in one transaction, all or nothing. Before it does, for every leg, it checks the Pyth price's age and confidence band, how far the venue has drifted from it, and whether the venue has the depth. If anything fails, the buy is deferred: the reason is written into the plan account and emitted as an event, the transaction succeeds, and nothing moves. The plan page says when it will try again.

MEASURED, NOT ASSUMED
Every five minutes the keeper asks Jupiter what $100 buys in real xStocks on mainnet and runs the same guard over it, read-only. Its first weekend (18-20 September): 496 checks per stock while Pyth was silent for 48 hours, 495 deferred. The pools sat 22-31 bps from Pyth's reopen price, eight to nine times their weekday gap. It was a calm weekend, a Saturday buy would have come in slightly cheaper, and the site says so. The guard does not earn a premium; it removes the gamble.

TRY IT
No extension needed: "Try with a demo wallet" creates a burner key and funds it on devnet. The demo controls change real on-chain state (venue divergence, depth, thresholds), so you can watch the program refuse a buy and then fill it. A public Guard API gives any wallet or recurring-buy tool the same verdict before its own swap.

WHAT IS REAL
Devnet has no xStocks and no Jupiter liquidity, so on devnet the stock tokens and the fills come from a mock market program that fills at the reference price, and every page says so. The program, the vaults, the schedule, the Pyth prices (real signed updates), the guard and every deferral are real on chain. The mainnet check and the backtests use real market data.
```

## How it uses Pyth (1,469 characters)

For the Pyth bounty field, or a "how do you use sponsor technology" field.

```
Pyth is the gate, not a price display: no trustworthy Pyth price, no buy.

- Feeds: Equity.US.TSLA/USD, Equity.US.QQQ/USD and Equity.US.VOO/USD.
- Nobody keeps US equity price accounts fresh on Solana, so the keeper pulls signed updates from Hermes and posts them through the Pyth Solana Receiver. The program then reads the PriceUpdateV2 account and requires that the receiver owns it, that its feed id matches the leg, and that its verification level is Full. It defers if the publish time is older than the on-chain limit (120 s) or the confidence band is wider than 50 bps, and it measures the venue's divergence from the Pyth price, deferring above 150 bps.
- Staleness is judged by Pyth's publish time, never by a calendar. A real plan filled at 04:50 ET on a Monday, hours before the exchange opened, because Pyth was publishing; it deferred at 19:00 ET the Sunday before because the newest price was 47 hours old.
- The same rules run off chain in one shared module, used by the plan page, the keeper and the public Guard API, so the number a user sees is the number the program acts on.
- On mainnet, every five minutes, real xStock quotes from Jupiter are compared with Pyth. Eight weekends of pool candles are measured against Hermes' historical prices, each weekend hour against the first price Pyth published after the pause.
- Next, with a wider entitlement: Pyth's own xStock feeds and redemption rates, to compare a token with its stock from Pyth alone.
```

## Why Solana (565 characters)

```
- One transaction buys every leg, all or nothing. The fee on a real three-stock execution was 0.000055 SOL, which is what makes a $100 weekly basket across several stocks worth running.
- The stocks already trade here: xStocks are Solana Token-2022 mints, and the check reads their scaled-UI share multiplier to price them correctly.
- Pyth's receiver verifies signed prices on chain, so the program itself, not a server, decides whether a price can be trusted.
- A refusal is a cheap, successful transaction, so every deferral is recorded on chain with its reason.
```

## Tech stack (575 characters)

```
Anchor 0.30.1 (Rust): the basket_dca program (9 instructions) and a mock_market program, on devnet. A TypeScript keeper that runs as a scheduled Vercel function, or as a long-running worker, through one code path. Next.js and React, reading the chain directly. Pyth hermes-client and pyth-solana-receiver. Jupiter's quote API on mainnet, read-only. Postgres as a ledger cache; the chain is the source of truth. 97 tests (65 web, 32 keeper).

Devnet program IDs:
basket_dca  4Tv5nEbh6b6EGNhep7rpeLy7NXpiz8AkRmVi36iwxVuR
mock_market A6pvN8KEYn5EXcgsRbzZUqBNjA5hFqFn6Ks2Li7SPMxS
```

## Links

| Field | Value |
|---|---|
| GitHub Repository | `https://github.com/elaris-xyz/bozBasket` |
| Demo URL | `https://boz-basket-web.vercel.app` |
| Pitch Video URL | after recording (`docs/VIDEO.md`) |
| Technical Video URL | after recording (`docs/VIDEO-TECHNICAL.md`) |

## Track and bounties

- **Main track.**
- **Pyth Network — Best use of Pyth market data.**
- Not PreStocks, Tessera, Clawpump or Meteora: the app uses none of them, and
  entering those would only dilute the submission.

## Team

To fill in: each member's name, role, and X or GitHub handle.

## Open-source components and prior work (470 characters)

The rules allow open-source components "if you say so".

```
bozBasket is original work written during the hackathon (the repository's history starts on 12 September 2026) and is MIT-licensed. It builds on these open-source components: Anchor and anchor-spl; @solana/web3.js and @solana/spl-token; Pyth's hermes-client and pyth-solana-receiver SDKs; Next.js, React and Recharts; node-postgres; the IBM Plex typefaces (SIL Open Font License). Market data comes from Pyth (Hermes), Jupiter's quote API and GeckoTerminal pool candles.
```

If any code was copied from an earlier project of yours, add one sentence
saying which and from where. The history shows none, but only you know.

## What comes next (789 characters)

For a "roadmap" or "post-hackathon plans" field. Pyth's judges ask whether
the app exists after the hackathon.

```
Each step rests on something already measured:
1. Real buys on mainnet without custody: a Jupiter swap from the user's own wallet whose minimum output is set from the Pyth price and the guard's divergence limit, so Jupiter's program enforces the limit on chain. Simulated on mainnet on 18 September for a $2 USDC-to-TSLAx buy: with the Pyth-derived floor it went through; with a floor 1% above the pool it reverted (slippage exceeded).
2. The token against its underlying from Pyth alone, using Pyth's xStock feeds and redemption rates once the key is entitled to them.
3. More stocks: AAPL, NVDA and SPY feeds exist; today the only limit is the key's entitlement.
4. Holidays in the retry forecast the screen shows. The program already handles them, because it judges Pyth's publish time.
```

## Challenges (412 characters)

For a "challenges" or "what did you learn" field.

```
Nobody keeps US equity Pyth accounts fresh on Solana, on devnet or mainnet, so the keeper posts signed updates itself and the program never depends on a sponsor. xStocks carry a share multiplier in their Token-2022 scaled UI amount: without it QQQx read 44 bps above Pyth, with it 17. And measuring honestly cuts both ways: the first live weekend did not favour the guard, and the site reports it as it came out.
```
