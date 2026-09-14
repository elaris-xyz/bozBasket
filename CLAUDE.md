# bozBasket — working notes

Hackathon entry for **Stocklana** (Solana Foundation, tokenized stocks).
Started 2026-09-12 from a planning session in the WP-news-collector repo;
this file is the handoff. Read it fully before doing anything, then read
`docs/PROPOSAL.md`: the full product and technical proposal (account
model, instructions, guard logic, keeper, screens, demo script, day-by-day
plan, risks, submission checklist). The proposal wins over this file where
they differ.

## The deadline

- Submissions close **Friday 2026-09-18, 16:00 ET**. Judging runs to Oct 2.
- $100,000 pool, one track. Page: https://hackathons.solana.com/hackathons/stocklana
- Submit needs at least one of: GitHub link, live demo, video. Edits allowed
  until close. One submission per team, original work, open-source parts OK
  if declared.
- Judging is one question: "could this be a real app that people will
  actually use?" Judges look for a real user and problem, a working
  end-to-end demo, a reason it belongs on Solana, and execution quality.
  Their own advice: **"Pick one wedge and make it excellent."**

## What we decided to build

**A DCA basket robo-investor for tokenized US stocks on Solana, whose
differentiator is session-aware, fair-value execution.**

User flow: pick or build a basket (e.g. AAPLx 50% / NVDAx 30% / TSLAx 20%),
set amount and cadence (e.g. $100 weekly), deposit USDC into a
non-custodial vault. A keeper executes each period. The whole basket is
bought in **one atomic transaction** (the tangible "why Solana").

The differentiator, and why this is not just Jupiter Recurring (which
already does plain timer-based DCA into any SPL token including xStocks):
before every buy the engine checks Pyth reference price (confidence +
staleness), market session (US equities have no fresh reference price
off-hours), and on-chain price/liquidity divergence. If the reference is
stale, the spread is wide, or liquidity is thin, the buy is **deferred to
the next safe window** and the user sees the reason code. Tokenized stocks
trade 24/7; a trustworthy reference price does not. That is the pitch.

Demo the judge must see in 90 seconds:
1. Create a basket, deposit devnet USDC.
2. Monday: keeper fires, one atomic tx buys three stock tokens, portfolio
   and P&L update.
3. Saturday night: keeper reports "reference price stale / market closed,
   deferring" instead of buying blind.
4. Show the on-chain state and the tx on the explorer.

## Scope for the Anchor program (keep it tiny)

Three instructions: `create_plan`, `deposit`, `execute_basket`. Nothing
else until the demo works end to end. No feature work on the last day; day
6 is video + README only.

## Facts that constrain the design

- Live stock-token issuers on Solana in 2026 are **xStocks** (`AAPLx`,
  `NVDAx`, `TSLAx`, `SPYx`, 1:1 backed, 24/7) and **Ondo** (200+ assets).
  Older names like `bAAPL` are stale; do not use them.
- **Devnet has no xStocks and no Jupiter liquidity.** The devnet demo needs
  mock SPL stock tokens, a faucet, and our own fill mechanism (fill at Pyth
  price, or a tiny own pool). Label it clearly in the README.
- Pyth pull feeds (Hermes) use the same feed IDs on devnet and mainnet.
  **Pyth publishes US equities outside the regular session too** (measured
  2026-09-14: seconds old at Sun 20:26 ET and Mon 02:38 ET, confidence under
  1 bp). Nothing publishes from Friday 20:00 ET to Sunday 20:00 ET, when the
  last price just ages. The feed metadata's `market_hours` still lists regular
  hours only, so the calendar is not the staleness test; the program's
  publish-time check is. This is the core of our guard logic.
- Jupiter Lend already accepts SPYx/QQQx/NVDAx as collateral, and xStocks
  handle dividends by rebasing and splits on-chain. Do not pitch lending or
  issuance as novel.
- **The dev host is in Iran and gets 403 from many APIs.** Day-1 test done,
  see `docs/NETWORK.md` and `tools/reachability.mjs`. Through the VPN
  nothing is geo-blocked, but two things changed on Pyth's side:
  - **Hermes needs an API key since 2026-08-26** (`Authorization: Bearer`,
    free trial at terminal.pyth.network). `PYTH_API_KEY` is in `.env` and
    covers crypto/FX/metals and exactly three US equities: **TSLA, QQQ,
    VOO**. Everything else (AAPL, NVDA, SPY...) is `403 Not entitled`. The
    demo basket is therefore TSLA/QQQ/VOO with real signed Pyth updates.
  - **Nobody sponsors Pyth US equity accounts on devnet or mainnet** (weeks
    stale; BTC/SOL fresh), so the keeper posts the signed Hermes updates to
    the Pyth receiver itself (`post_update`) in the execute transaction.
    `config.reference_program` = receiver `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`
    on both networks. `mock_market.post_reference` writes the same
    `PriceUpdateV2` layout as a fallback for non-entitled symbols. See
    `docs/NETWORK.md`.
- No PHP or WordPress here; that was the previous repo.
- **Toolchain on this Windows host (installed 2026-09-12):** Solana CLI via
  `agave-install` in `~/.local/share/solana`, `anchor-cli 0.30.1` via
  `cargo install` in `~/.cargo/bin`. WSL Ubuntu exists but does not start
  (Virtual Machine Platform is off; enabling it needs admin). bozPicks was
  built somewhere else; do not assume a WSL build works here.
  The host Rust toolchain is `stable-x86_64-pc-windows-gnu` with no MinGW
  installed, so `cargo test`/`cargo install` fail with "dlltool: program
  not found" unless a MinGW dlltool is on PATH.
  The bundled one has no `as.exe` and fails with "CreateProcess"; use the
  MSYS2 binutils in `C:\msys64\ucrt64\bin` instead (already installed).
  `tools/env.ps1` and `tools/env.sh` set this. crates.io is slow from here
  (~15 KB/s on the index); set `CARGO_HTTP_TIMEOUT=900` for installs.
- **platform-tools v1.43 (rustc 1.79) is what `anchor build` compiles with.**
  It was installed with `tools/install-platform-tools.ps1` (junction, no
  admin). `Cargo.lock` is deliberately pinned to versions that rustc 1.79 can
  compile: blake3 1.5.5, indexmap 2.5.0, proc-macro-crate 3.1.0, toml_edit
  0.21.1, rayon 1.10.0, jobserver 0.1.32, unicode-segmentation 1.12.0,
  zeroize_derive 1.4.2, bitflags 2.6.0, semver 1.0.23, serde_json 1.0.128,
  serde_bytes 0.11.15, serde 1.0.210 (no `serde_core`, which breaks on
  Windows verbatim paths with old rustc). **Never run a bare `cargo update`**;
  pin with `cargo update -p <crate>@<ver> --precise <old>` and check with the
  edition-2024 scan described in `docs/NETWORK.md`.

## Reuse from bozPicks (`C:\My_DEVelope\bozPicks`)

Copy selectively, do not fork the monorepo:
- `apps/keeper` — devnet keeper pattern (cron loop, tx building, retries).
- `apps/web` — Next.js + Solana wallet adapter + Postgres ledger.
- `programs/settlement` + `Anchor.toml` — Anchor 0.30.1 skeleton, devnet
  provider config.
- `packages/shared` — shared types.
- **Never copy `treasury.keypair.json`** or any keypair. Add `*.keypair.json`
  to `.gitignore` first.

## Six-day plan

1. Day 1 (Sep 12/13): git init, copy skeleton, network reachability test,
   account model + three instructions designed.
2. Day 2: Anchor program builds and runs on devnet; mock stock mints + faucet.
3. Day 3: keeper executes a basket atomically; ledger records fills.
4. Day 4: web UI: basket builder (sliders, curated presets), deposit,
   portfolio + P&L, DCA history.
5. Day 5: the guard: Pyth confidence/staleness + session calendar + deferral
   with reason codes; a forced "stale feed" scenario for the demo.
6. Day 6 (Sep 17): 2–3 min video, README with architecture and quickstart,
   "Why Solana" section, submit. Register on the site *today*, not day 6.

## Environment (decided 2026-09-12)

- Project name: **bozBasket**. Repo and submission URL use this name.
- Devnet wallets, checked 2026-09-12 (the earlier note here was wrong):
  - `C:/msys64/home/Arash/.config/solana/id.json` -> `6n42WYSHDvz7aWdF3LqWpfepdxMgT7nQp1HNdkYDqmL`,
    12 SOL on devnet. This is what `solana config get` points at, so it is
    the deploy authority and keeper for bozBasket. `Anchor.toml` uses it.
  - `~/.config/solana/id.json` -> `9SiShrw4S3o3ha9HbmQGCKRVFxReFiAoEfvhQu2f3xNc`, 0 SOL. Unused.
  - `EMDRLzn3vREh9wVAk1SjW2HLBmsUhRLTfH2VxLT4PfxE` has 4 SOL but no keypair
    for it exists on this machine or in bozPicks; ask the user before
    relying on it.
  Never copy any keypair into the repo.
- Secrets live in `.env` (gitignored, already written): Neon Postgres
  `DATABASE_URL`, RPC URL, keeper pubkey, `PYTH_API_KEY`. Load it with
  `tools/env.sh` / `tools/env.ps1`, never `source .env`: the Neon URL has
  `&` in it. On 2026-09-13 Neon answered ECONNRESET/timeouts from this host
  (TCP opens, TLS dies); the keeper falls back to a log-only ledger when
  `DATABASE_URL` is unset or the database does not answer, and never lets a
  ledger error block an execution. `.env.example` is the committed
  template. The user rotates the DB password before submission.
- **Devnet RPC:** `api.devnet.solana.com` answers 429 (connection rate
  limit) from the VPN exit IP, and one stuck `solana program deploy` makes it
  worse. `.env` points `SOLANA_RPC_URL` at the Helius devnet endpoint reused
  from bozPicks; pass `-u "$SOLANA_RPC_URL"` to every solana CLI call. Kill
  orphaned `solana.exe` before retrying a deploy.
- **Network: everything external goes through the user's VPN.** Nobody
  will use this from Iran. When Hermes, Jupiter, devnet RPC, npm, or
  GitHub time out or return 403, stop and tell the user to turn the VPN
  on, then retry. Do not build workarounds for a blocked network.

## Checks

```
source tools/env.sh            # or: . tools/env.ps1  (PATH, HOME, .env)
cargo test --workspace         # host unit tests (pure Rust, fast)
anchor build                   # SBF build; watch for "Stack offset exceeded" lines
tools/test-local.sh            # Anchor TS tests on a local validator (add --build to rebuild)
node tools/reachability.mjs    # network check
```

`tools/test-local.sh` exists because plain `anchor test` fails on this host:
the validator needs `--log` (its log symlink needs a privilege we do not
have), the local faucet answers "Internal error" so tests fund users by
transfer from the wallet, the mocha loader is `tsx/cjs` (ts-mocha's bundled
ts-node breaks), and the provider is pinned to "confirmed". `anchor test`
with `cluster = Devnet` in Anchor.toml would deploy to devnet, which is slow
and costs SOL; do not run it bare.

Keeper: `pnpm --filter keeper test` (pure unit tests), `pnpm --filter keeper
once` (one pass), `pnpm --filter keeper setup:devnet` (idempotent devnet
setup, writes `deploy/devnet.json`), `scripts/faucet.ts <wallet>` (mock
USDC). Deploy with `solana program deploy ... --use-rpc --max-len N` per
program; `anchor deploy` over TPU dies with "max retries" on this network.

Rules learned on day 2: box every `Account<_>` in a struct that inits two or
more accounts (4 KiB SBF frame), use `.accountsPartial()` in tests, and keep
the `PriceUpdateV2` mirror in `mock_market` byte-identical to Pyth's.

## Devnet state (2026-09-13, day 3)

- Programs: `basket_dca` 4Tv5nEbh6b6EGNhep7rpeLy7NXpiz8AkRmVi36iwxVuR,
  `mock_market` A6pvN8KEYn5EXcgsRbzZUqBNjA5hFqFn6Ks2Li7SPMxS. Config, mock
  USDC and the three markets (mTSLA, mQQQ, mVOO) are in `deploy/devnet.json`.
- Demo plan 5vV866AdEP6kR5NemndnVoopUCK4ygXCuyGUG8L78LZq (owner keypair in
  `deploy/demo-user.keypair.json`, gitignored). Proof transactions:
  - Deferred, REFERENCE_STALE, real Pyth receiver, weekend:
    `5oiJcFzaxw6rvqmvTL2s73S1sVZgZgeAzTUdJv8qABwgLGuo1NAmYuriK9oFxqtJNhnKAmLpyNZ1dUq8TJdQrgWX`
  - Executed, three legs in one tx (mock reference mode):
    `Xu2vpwD6eHrYvtCCDDgsky6EHp4P4jotyhHj4WAFcy7FfthcxFJRAK6vpMoZBva179TtTZbrfPpKn9hSpeZw1nA`
- Keeper flow: `source tools/env.sh`, then in `apps/keeper`:
  `pnpm exec tsx scripts/nudge.ts <plan>` (make it due),
  `pnpm exec tsx src/index.ts --once --plan <plan>`. `OFF_HOURS_POLICY=guarded`
  submits outside the session so the on-chain deferral shows; `strict`
  (default) skips with MARKET_CLOSED in the ledger only.
- **Two reference modes.** Default is the real Pyth receiver: Hermes VAAs are
  posted in the same transaction bundle and equities are stale from Friday
  20:00 ET to Sunday 20:00 ET, so weekends can only demonstrate deferrals.
  `scripts/set-reference.ts mock` + `REFERENCE_SOURCE=mock` stamps the mock
  reference with the cluster time so a fill can be shown any time. The
  README must call this synthetic. Switch back with `set-reference.ts pyth`.
- **The host clock is ~2 minutes behind real time.** The keeper takes time
  from the cluster (`chainNow`); anything else that compares timestamps
  must do the same, or the user should sync the Windows clock.
- Neon Postgres works again from the host; the ledger table `executions`
  holds every pass (skipped/deferred/executed/error).

## Web app (day 4)

`apps/web`, Next.js 15 on port 3200. `pnpm --filter web dev` (or `build` +
`start`). It reads the chain directly and needs no keeper running.

- **Demo wallet**: a burner keypair in `localStorage`, funded by
  `POST /api/faucet` (0.05 SOL + 10 000 mock USDC, signed by
  `KEEPER_SECRET_KEY`, skipped when the wallet already holds 5 000+). No
  browser extension anywhere in the judge flow.
- **Builder** creates the plan and deposits in one transaction. Sliders
  rebalance the other legs so weights always sum to 10 000.
- `/api/prices` fetches Hermes server-side so the browser never sees
  `PYTH_API_KEY`; `/api/history` reads the keeper's Postgres ledger.
- `src/generated/` holds copies of the IDLs, the Anchor types and
  `deploy/devnet.json`, written by `scripts/sync-generated.mjs` on every
  dev/build and **committed on purpose** so Vercel builds without Anchor.
  Rerun `pnpm --filter web sync` after `anchor build` or a redeploy.
- **US equity feeds publish with exponent -5**, not -8. Prices are
  `price * 10^expo`; never hardcode 1e8 for equities.
- Anchor event `BN`s serialize to **hex**. The keeper normalizes execution
  legs to decimal strings before storing them; anything else reading events
  must do the same.

## Guard panel and demo controls (day 5)

- The guard logic lives **once**, in `packages/shared/src/guard.ts`, with the
  session calendar next to it. The keeper, the web guard panel and the
  program's own Rust must agree; the shared module is the single off-chain
  copy. `packages/shared/src/reasons.ts` holds only the labels.
- `/api/guard?plan=…` returns what `execute_basket` would decide right now.
  It models the keeper faithfully: in pyth mode the reference age comes from
  Hermes (stale all weekend by design), in mock mode the keeper restamps the
  reference in the same transaction, so the panel ages it by a few seconds
  only. Getting this wrong made the panel predict STALE for everything.
- `/api/demo` (needs `DEMO_CONTROLS=1`) signs real admin transactions.
  Divergence and liquidity are genuine manipulations; staleness and
  confidence tighten a `Config` ceiling instead, because no one can make Pyth
  publish a bad price on demand. `docs/DEMO.md` states this plainly and the
  UI labels it.
- `pnpm --filter keeper exec tsx scripts/scenarios.ts <plan>` walks all six
  reason codes end to end against the running web app, compares the panel's
  prediction with the program's recorded reason, restores everything, and
  writes `deploy/scenarios.json`. It is the regression test for the demo.

## Deployed (day 7, 2026-09-13)

- Web: https://boz-basket-web.vercel.app (Vercel project `boz-basket-web`,
  team `eldorim`, root directory `apps/web`).
- Keeper: runs **inside the web app** (`apps/web/src/lib/keeperRunner.ts`),
  started by open pages (KeeperPulse), the demo nudge, and the public
  `/api/keeper/tick` (for a cron-job.org job). The pass runs in `after()`
  with `maxDuration = 300`. The GitHub Action (`*/5`, fires irregularly) and
  `railpack.json` run the same `runPass`; **every keeper shares the Postgres
  lock in `apps/keeper/src/lock.ts`**, so there are never two passes at once.
  The web app imports the `keeper` workspace package via `transpilePackages`:
  keep `pass.ts` and `lock.ts` free of file reads and process-lifetime
  assumptions, or the Vercel build breaks. Railway credit ran out 2026-09-14.
- Never log the RPC URL: it carries the Helius API key.
- **Never `new anchor.Wallet(...)` in code the web app bundles.** Anchor 0.30's
  ESM build only assigns `exports.Wallet` inside an `if (!isBrowser)` block,
  which never becomes a real ESM export, so the Next.js bundle throws "Wallet
  is not a constructor" (found 2026-09-14). Use `keypairWallet` from
  `apps/keeper/src/chain.ts`. It tells transaction kinds apart by shape
  (`"version" in tx`), as Anchor's own class does, never by `instanceof`:
  the Pyth SDK builds transactions with a different copy of web3.js.
- **Test the keeper locally with `OFF_HOURS_POLICY=guarded`.** `.env` sets
  `strict`, so off-hours a pass skips before building any transaction, and a
  test "passes" without ever touching the Pyth SDK, signing or sending. The
  web app runs guarded only while `OFF_HOURS_POLICY` is unset in Vercel; on
  2026-09-14 it was `strict` there, visible only as `skipped 3` ledger rows
  every five minutes, so check the ledger, not the code default. A keeper test
  counts only when it yields a signature confirmed
  on devnet and a matching ledger row (learned 2026-09-14, when a skip was
  counted as a pass).
- Repo: https://github.com/elaris-xyz/bozBasket (public).
- **Upgrade authority is now `deploy/upgrade-authority.keypair.json`**, not the
  keeper key. Every `anchor deploy` from here needs
  `--upgrade-authority deploy/upgrade-authority.keypair.json`.
- **`idl/` is committed and is what the keeper and the web build read.** Run
  `node tools/sync-idl.mjs` after `anchor build` or CI breaks on a missing
  module; `target/` does not exist on a fresh checkout.
- The faucet signs with `deploy/faucet.keypair.json` (mock USDC mint
  authority + 2 SOL), never the admin key.
- **Deploy with a resumable buffer:** `solana program deploy <so> --program-id
  <keypair> --upgrade-authority deploy/upgrade-authority.keypair.json --buffer
  deploy/deploy-buffer.keypair.json --use-rpc --max-sign-attempts 1000`.
  Without `--buffer`, a network failure mid-write strands a buffer you cannot
  resume (one held 1.96 SOL on 2026-09-13 and had to be closed with
  `solana program close <buffer> --authority deploy/upgrade-authority.keypair.json`).
  With it, rerunning the same command resumes the write.
- **Never push web code that calls an instruction before it is on devnet.**
  Vercel deploys on push, so the button would fail for every visitor until
  the program caught up.
- `update_plan` (2026-09-13) changes amount, cadence and end date. Weights are
  immutable by design: per-leg cost basis is weight x total invested.
- The guard scorecard lives in `apps/web/src/lib/scorecard.ts` and is unit
  tested (`pnpm --filter web test`). Its unit is the *held-back buy*: one per
  period between executions, so hourly retries are never multiplied. Stale
  legs pair with the next fill by mint and compare reference to reference, so
  `update_plan` and the venue spread cannot distort it; losses are shown too.
  Ledger columns `forced` and `avoided_usdc` back it. The keeper migrates
  them on start; they were also applied to Neon by hand before the push.
- **Demo controls persist until Restore.** On 2026-09-13 a TSLA price override,
  $10 depth and a 0 bps confidence ceiling were found still active, which
  would have blocked every execution of the demo plan. Before relying on it,
  run `pnpm --filter keeper exec tsx scripts/status.ts <plan>`, and restore
  with `POST /api/demo {"action":"restore"}` on the live site.
- Link previews: `app/opengraph-image.tsx` must stay free of custom fonts and
  emoji, which `next/og` fetches while rendering.

## Conventions

- Code, comments, commit messages, UI strings, docs: English. Chat with the
  user in Farsi.
- Do not use browser tools for visual checks; the user does those. Claude
  does code and computational tests.
- Scope contract before every task: three lines, at most three items; log
  extra findings instead of fixing everything.

## Background research

`docs/research/stocklana_deep_analysis_FA.txt` is a Persian market analysis
the user collected. It ranks an oracle "fair-value guard" layer (it calls it
EquityGuard) first and DCA third. We took its guard idea and made it the
feature of the DCA product instead of the product itself, because the judges
ask for an app people use and we have six days. Its citations on xStocks,
Ondo, Pyth staleness and Jupiter Lend are the source of the facts above.
