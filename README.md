# bozBasket

**A recurring-buy robo-investor for tokenized US stocks on Solana that refuses
to buy when the reference price cannot be trusted.**

Define a basket once — say TSLA 50% / QQQ 30% / VOO 20%, $100 weekly — deposit
USDC into a vault only you control, and a keeper buys the whole basket in one
atomic transaction every period. Before each buy the program checks the Pyth
reference price, the market session and the venue. If anything is off, the buy
is **deferred with a reason code written on chain** instead of filled blind.

- Repository: https://github.com/elaris-xyz/bozBasket
- Live demo: https://boz-basket-web.vercel.app
- Video: _add the video link_
- Devnet program: [`4Tv5nEbh6b6EGNhep7rpeLy7NXpiz8AkRmVi36iwxVuR`](https://explorer.solana.com/address/4Tv5nEbh6b6EGNhep7rpeLy7NXpiz8AkRmVi36iwxVuR?cluster=devnet)

---

## The problem

Tokenized stocks trade 24/7. The underlying market is open about 32 hours a
week. The other 136 hours the reference price is stale *by design*, on-chain
liquidity is thinner, and spreads widen.

Existing recurring-buy tools fire on a timer. A Saturday 03:00 order fills at
whatever the pool says, with no check that the price means anything. And
buying a basket of N stocks means N orders, N fees, and drift between the legs
while they execute.

bozBasket is the boring habit — buy the same basket every week — made safe on
a market that never closes.

## The guard

`execute_basket` is keeper-signed but keeper-untrusting: the program recomputes
everything from the accounts in the transaction and decides for itself.

| Check | Fails when | Reason |
|---|---|---|
| Publish time | the reference is older than `max_staleness_secs` | `1 REFERENCE_STALE` |
| Confidence | `conf / price` exceeds `max_conf_bps` | `2 CONFIDENCE_TOO_WIDE` |
| Session | US equities are closed and the keeper holds off | `3 MARKET_CLOSED` |
| Venue price | it differs from the reference by more than `max_divergence_bps` | `4 DIVERGENCE` |
| Venue depth | it is below the leg size or `min_liquidity_usdc` | `5 LOW_LIQUIDITY` |
| Vault | it cannot cover one period | `6 INSUFFICIENT_BALANCE` |

A deferral is a **successful transaction**: the reason lands in `Plan.last_reason`,
`deferrals` increments, a `Deferred` event is emitted, and the instruction
returns `Ok`. The user can see why they were not filled, on chain, forever.
If every check passes, all legs fill by CPI in that same transaction, or none
of them do.

Codes 1, 2, 4, 5 and 6 are enforced by the program from data in the
transaction. Code 3 is the keeper's: it simply does not submit outside the
session, because paying a fee to record "the market is closed" — something any
calendar knows — would be theatre.

Every code has been reproduced end to end on devnet; the transactions are
listed in [`docs/DEMO.md`](docs/DEMO.md).

## Architecture

```
 Browser (Next.js, demo burner wallet or any Solana wallet)
   │  create_plan · deposit · withdraw · pause         (the user signs)
   ▼
 Anchor program: basket_dca
   ├─ Config  (global thresholds, keeper, fill and reference programs)
   ├─ Plan    (PDA per user+id: legs, weights, schedule, counters, reasons)
   ├─ Vault   (USDC token account, authority = the Plan PDA)
   └─ execute_basket   (keeper signs; the program checks the guard)
   ▲                              │ CPI: take USDC, mint/receive stock tokens
   │  Executed / Deferred         ▼
 Keeper (in-app, locked)       Fill venue
   ├─ session calendar            ├─ devnet:  mock_market
   ├─ Pyth Hermes + receiver      └─ mainnet: Jupiter (not built)
   └─ Postgres ledger  ─────────────────────►  read by the web app
```

The chain is the source of truth for plan state, schedule and the last
decision. The keeper holds no authority over user funds: it can only *attempt*
an execution. Postgres is a cache for history; delete it and nothing is lost
that the chain does not already hold.

The guard's arithmetic exists twice on purpose — in Rust for the program, and
once in TypeScript (`packages/shared/src/guard.ts`) shared by the keeper and
the web app's guard panel, so the user sees the same numbers the program will
use. `scripts/scenarios.ts` checks the two against each other on devnet.

## What is real and what is synthetic

Devnet has no xStocks and no Jupiter liquidity, so parts of the demo are
necessarily mocked. Being precise about which parts:

**Real, on chain, no shortcuts**
- The `basket_dca` program: plan accounts, vault PDAs, the schedule, every
  guard check, the atomic multi-leg CPI, the reason codes and counters.
- Non-custodial vaults. The vault's authority is the plan PDA; only the owner
  can withdraw, at any time, including while the plan is active.
- Pyth price updates, signed by Pyth and verified on chain by the official
  receiver program, in the same transaction as the execution.
- The session calendar, derived from Pyth's own published market hours.

**Synthetic on devnet, and clearly labelled in the UI**
- `mAAPL`-style stock tokens and their fills. `mock_market` mints them at the
  reference price plus a configurable spread. There is no counterparty and no
  real share behind the token.
- Mock USDC, minted by a faucet so judges do not have to source devnet tokens.
- An optional *mock reference* mode. With the real Pyth receiver, US equity
  prices are stale from Friday 16:00 ET to Monday 09:30 ET, so a weekend demo
  can only ever show deferrals. `scripts/set-reference.ts mock` points the
  program at a reference account the keeper restamps, so a fill can be shown
  at any hour. The guard panel states which mode is live, and the program
  enforces the account's owner either way.
- Two demo controls tighten a `Config` ceiling rather than corrupting a feed,
  because nobody can make Pyth publish a bad price on demand. The other two
  change the venue's real quote and depth. `docs/DEMO.md` spells out which is
  which.

**Not built**
- Mainnet execution through Jupiter. The program is structured for it — the
  fill venue and the reference program are both `Config` fields — but it is
  not implemented, so it is not claimed.

## Why Solana

- **Atomicity is the product.** A basket of four legs is one transaction that
  either completes or reverts. On a chain where each leg is its own
  transaction, a guard can pass for leg one and fail for leg four, leaving the
  user half-invested at prices they never agreed to.
- **Fees make small baskets viable.** Splitting $100 four ways costs a
  fraction of a cent. At Ethereum gas, the fees would exceed the legs.
- **Pyth is native**, with pull updates verified on chain in the same
  transaction that consumes them — which is exactly what a fair-value guard
  needs. It is also why staleness is *visible* rather than hidden: the
  publish time travels with the price.
- The tokenized stocks already live here.

## Is it running?

The keeper runs wherever it is asked to, and every copy takes the same
Postgres lock, so there is never more than one pass at a time or more than one
scheduled pass a minute:

- **Inside the web app.** Any open page asks for a pass about once a minute,
  and "make the plan due" in the demo controls starts one at once. The pass
  runs in a serverless function after the response has been sent.
- **An external scheduler** calling `/api/keeper/tick` every five minutes covers
  the hours nobody has the app open. The endpoint is public on purpose: the lock
  bounds it, and a pass can only attempt executions the program guards.
- **A scheduled GitHub Action**, whose runs are public logs in this
  repository. GitHub fires it irregularly, so it is a backstop, not the clock.

The app reports when the keeper last ran, in red when it is late, so a plan
that did not fill is visibly either deferred with a reason or waiting on a
keeper.

## Quickstart

Requires Node 20+, pnpm 9, Rust, the Solana CLI and Anchor 0.30.1.

```bash
git clone https://github.com/elaris-xyz/bozBasket.git && cd bozBasket
pnpm install
cp .env.example .env        # fill in PYTH_API_KEY and SOLANA_RPC_URL at least
```

Run the web app against the already-deployed devnet programs:

```bash
pnpm --filter web dev       # http://localhost:3200
```

Click **Try with a demo wallet**: it generates a burner keypair in your
browser, funds it with SOL and mock USDC, and you can build a basket
immediately. No extension required.

Run the keeper against your own plan:

```bash
source tools/env.sh
pnpm --filter keeper start
# or one pass:  pnpm --filter keeper once
```

Build and test the programs:

```bash
anchor build
node tools/sync-idl.mjs         # refresh the committed interface in idl/
cargo test --workspace          # 9 pure-Rust tests
tools/test-local.sh             # 30 Anchor tests on a local validator
pnpm --filter keeper test       # 11 guard and calendar tests
```

Deploy your own copy:

```bash
anchor deploy --provider.cluster devnet
pnpm --filter keeper setup:devnet     # config, mock USDC, three markets
pnpm --filter keeper exec tsx scripts/setup-faucet.ts
```

`tools/env.sh` (and `tools/env.ps1`) put the toolchain on `PATH` and load
`.env`. On Windows see `CLAUDE.md` for the toolchain notes; the build needs a
MinGW `dlltool`, and the pinned `Cargo.lock` exists because platform-tools
ships rustc 1.79.

## Deployed on devnet

| What | Address |
|---|---|
| `basket_dca` program | `4Tv5nEbh6b6EGNhep7rpeLy7NXpiz8AkRmVi36iwxVuR` |
| `mock_market` program | `A6pvN8KEYn5EXcgsRbzZUqBNjA5hFqFn6Ks2Li7SPMxS` |
| Config PDA | `FBsvtKfyPYihMUdneeedkHSzPqxoKpnC7bRYkrBrzR3a` |
| Mock USDC mint | `2X3txP6u2uNppAT4DzT6K7NuXTvKArFDPtQAs8tWU7Vt` |
| mTSLA / mQQQ / mVOO mints | see [`deploy/devnet.json`](deploy/devnet.json) |

Pyth feeds: `Equity.US.TSLA/USD`, `Equity.US.QQQ/USD`, `Equity.US.VOO/USD`.
These three are what the Pyth API key in use is entitled to; the feed ids are
identical on devnet and mainnet.

## Program reference

`basket_dca`

| Instruction | Signer | Effect |
|---|---|---|
| `init_config` / `update_config` | admin | global thresholds, keeper, fill and reference programs |
| `create_plan` | user | validates weights sum to 10 000, creates the Plan and its vault |
| `deposit` / `withdraw` | user | move USDC; a withdrawal below one period pauses the plan |
| `set_paused` | user | pause or resume |
| `execute_basket` | keeper | the guard, then all legs or none |
| `nudge_plan` | admin | demo control: make a plan due now |

`Plan` holds up to 8 legs (the demo uses 3; 4 is the practical transaction-size
limit), each with a mint, a weight in basis points, a Pyth feed id and the
cumulative units bought, which is what makes average cost exact.

## Limitations

- Devnet only, with the mocks described above.
- The keeper is a single process. It holds no user funds and cannot move them,
  so the worst it can do by failing is not execute; another instance can take
  over from chain state alone.
- This is a self-custody tool. It does not address eligibility or compliance
  for tokenized securities, which are issuer and jurisdiction specific.
- Not audited. Nothing here should hold real money.

## Repository layout

```
programs/basket_dca     the product: plan lifecycle and the guard
programs/mock_market    devnet fill venue and reference relay (synthetic)
apps/keeper             the once-a-minute executor, plus operational scripts
apps/web                Next.js app: builder, plan page, guard panel, demo controls
packages/shared         guard arithmetic, session calendar, presets, reason codes
tests                   Anchor integration tests
docs/DEMO.md            demo script and the transaction for every reason code
docs/NETWORK.md         what the network and Pyth actually allow, measured
```

## License

MIT. See [LICENSE](LICENSE).
