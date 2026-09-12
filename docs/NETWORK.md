# Network reachability, day 1 (2026-09-12)

Run `node tools/reachability.mjs` (after `source .env`) to reproduce. This
file records what it found on the dev host, through the VPN, and what each
finding means for the plan.

## Results

| Target | Result | Consequence |
|---|---|---|
| Solana devnet RPC | OK | devnet path is open |
| Pyth Hermes metadata `/v2/price_feeds` | OK, no key | feed ids and `market_hours` per feed are free |
| Pyth Hermes price updates `/v2/updates/price/latest` | **401** | needs an API key since 2026-08-26, see below |
| Pyth push oracle accounts on devnet, US equities | present but **72 days stale** | nobody sponsors equity feeds on devnet |
| Pyth push oracle accounts on devnet, BTC / SOL | fresh (<1 min) | the receiver program itself works on devnet |
| Jupiter `lite-api.jup.ag` quote | OK | the mainnet stretch is not blocked by the network |
| npm, crates.io, GitHub API, GitHub release assets | OK | toolchain installs work |

None of the failures is a geo-block. Every 401/stale result reproduces from
any host.

## Pyth Hermes now needs an API key

The Pyth Core upgrade (2026-08-26) put every Hermes price endpoint behind
`Authorization: Bearer <key>`. Keys come from the Pyth Terminal
(https://terminal.pyth.network); a free trial tier exists, and paid plans
start at $500/month. The public rate limit is 10 requests per 10 seconds per
IP. Third-party Hermes hosts listed in the Pyth docs are Triton (stopped
serving Hermes on 2026-07-30), P2P, extrnode and Liquify.

**Action for the user:** register on the Pyth Terminal, create a key, put it
in `.env` as `PYTH_API_KEY`. The keeper reads it; nothing else does.

## US equity feeds are not sponsored on devnet

The push-oracle accounts for AAPL, NVDA, TSLA and SPY exist on devnet
(shard 0 under `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT`) but were last
written in early July 2026. BTC and SOL on the same program are fresh, so
the receiver works; equities are simply not being posted.

Two ways to get a trustworthy reference price into `execute_basket` on
devnet:

1. **Keeper posts the update itself** (preferred). Fetch the signed update
   from Hermes with the API key, call `post_update` on the Pyth receiver
   (`rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`, live on devnet) in the
   same transaction as `execute_basket`, and pass the fresh price update
   account. Everything the program checks is real Pyth data verified on
   chain. This is exactly the mainnet flow.
2. **Mock price accounts** (fallback if no key). `mock_market` writes
   accounts with the `PriceUpdateV2` layout and the program is told to
   trust that owner on devnet. Cheaper to build, weaker story; the README
   would have to say the reference price is synthetic too.

Decision: build (1). Keep (2) as the day-3 fallback if the key does not
arrive. Either way the stale-feed demo scenario is real on devnet today:
the sponsored equity accounts are already stale.

## Useful side finding

`/v2/price_feeds` returns `market_hours.is_open`, `next_open`, `next_close`
and a `schedule` string per feed. The keeper can use that as the session
calendar source of truth and fall back to the static NYSE holiday list only
when Hermes is unreachable.
