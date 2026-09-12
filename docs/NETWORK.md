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

Decision on day 1 was (1). **Reversed on day 2 (2026-09-13):** the key
arrived, works for crypto, FX and metals, but every US equity feed answers
`403 Not entitled: ... asset type 'equity'`. Equities are not in the trial
tier; Pyth's own upgrade notice puts data plans at $500/month and up. The
mainnet push-oracle equity accounts are not a substitute either: on
2026-09-12 AAPL was 29 days old and SPY 17 days old there, so nobody
sponsors them.

So the demo runs path (2), built so the program never knows the difference:

- `execute_basket` reads a `PriceUpdateV2`-layout account per leg and checks
  `owner == config.reference_program`. On mainnet that is the Pyth receiver;
  on devnet it is `mock_market`, which has a `post_reference` instruction.
- The keeper fills those devnet accounts from a free quote source with the
  source's own timestamp as `publish_time`, so staleness off-hours is real,
  not simulated. The README says this plainly.
- Session calendar comes from the free Hermes metadata endpoint, which
  carries `market_hours` and a `schedule` string with 2026 holidays.
- Switching to real Pyth on mainnet is `init_config` with the receiver as
  `reference_program`, nothing else.

## Useful side finding

`/v2/price_feeds` returns `market_hours.is_open`, `next_open`, `next_close`
and a `schedule` string per feed. The keeper can use that as the session
calendar source of truth and fall back to the static NYSE holiday list only
when Hermes is unreachable.

## Toolchain notes (same day)

`anchor build` passed at 23:28 on an empty `basket_dca` program. What it took
on this Windows host, in order:

1. Solana CLI v2.1.21 via `agave-install-init` (needs no admin until it tries
   a symlink; `active_release` was created as a junction by hand).
2. `anchor-cli 0.30.1` via `cargo install anchor-cli --version 0.30.1`
   **without** `--locked` (the locked `time` crate does not build on rustc
   1.96) and with `C:\msys64\ucrt64\bin` on PATH for `dlltool`/`as`.
3. platform-tools v1.43 downloaded with curl (425 MB, resumable) and
   installed by `tools/install-platform-tools.ps1`, because cargo-build-sbf's
   own installer fails with os error 1314 (symlink privilege) after the
   download and deletes its cache.
4. `Cargo.lock` pinned so every crate compiles on rustc 1.79. Scan for
   offenders with: for each `[[package]]` in the lock, read its `Cargo.toml`
   under `~/.cargo/registry/src/*/` and flag `edition = "2024"` or a
   `rust-version` above 1.79. The list of pins is in `CLAUDE.md`.
