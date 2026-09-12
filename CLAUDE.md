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
  Pyth documents that US equity feeds go stale outside market hours; the
  SDK has staleness checks. This is the core of our guard logic.
- Jupiter Lend already accepts SPYx/QQQx/NVDAx as collateral, and xStocks
  handle dividends by rebasing and splits on-chain. Do not pitch lending or
  issuance as novel.
- **The dev host is in Iran and gets 403 from many APIs.** Day-1 test done,
  see `docs/NETWORK.md` and `tools/reachability.mjs`. Through the VPN
  nothing is geo-blocked, but two things changed on Pyth's side:
  - **Hermes needs an API key since 2026-08-26** (`Authorization: Bearer`,
    free trial at terminal.pyth.network). Without it every price endpoint
    is 401. `PYTH_API_KEY` in `.env`.
  - **Devnet has no fresh US equity prices.** The Pyth push-oracle accounts
    for AAPL/NVDA/TSLA/SPY exist but are months stale; BTC/SOL are fresh.
    The keeper must post its own price updates via the Pyth receiver (live
    on devnet) or the demo mocks the price accounts.
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
  `DATABASE_URL`, RPC URL, keeper pubkey, `PYTH_API_KEY`. `.env.example` is the committed
  template. The user rotates the DB password before submission.
- **Network: everything external goes through the user's VPN.** Nobody
  will use this from Iran. When Hermes, Jupiter, devnet RPC, npm, or
  GitHub time out or return 403, stop and tell the user to turn the VPN
  on, then retry. Do not build workarounds for a blocked network.

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
