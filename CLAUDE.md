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
- **The dev host is in Iran and gets 403 from many APIs.** Test Pyth Hermes
  and Jupiter API reachability on day 1 before assuming either works. If
  blocked, the demo is devnet-only with mock fills. See the same lesson in
  the bozPicks project (AI providers were all geo-blocked).
- No PHP or WordPress here; that was the previous repo.

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
- Devnet wallet (keeper + deploy authority): `EMDRLzn3vREh9wVAk1SjW2HLBmsUhRLTfH2VxLT4PfxE`,
  keypair at `~/.config/solana/id.json` (same as bozPicks). Never copy it
  into the repo.
- Secrets live in `.env` (gitignored, already written): Neon Postgres
  `DATABASE_URL`, RPC URL, keeper pubkey. `.env.example` is the committed
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
