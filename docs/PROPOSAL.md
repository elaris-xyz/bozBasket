# bozBasket — Product and Technical Proposal

Name: **bozBasket**.

Status: proposal, 2026-09-12. Deadline 2026-09-18 16:00 ET.

---

## 1. One sentence

A non-custodial robo-investor on Solana: the user defines a basket of
tokenized US stocks and a recurring amount once, and a keeper buys the whole
basket atomically each period, but **only when the reference price can be
trusted**.

## 2. The problem and the user

**User:** a retail investor who already buys stocks on a schedule (weekly or
monthly) and wants that habit on-chain, in their own wallet, without
running a bot or logging in every Monday.

**Problem today:**

1. Tokenized stocks (xStocks, Ondo) trade 24/7, but the underlying market
   is open about 32 hours a week. Outside those hours the Pyth reference
   price is stale by design, on-chain liquidity is thinner, and spreads
   widen.
2. Existing recurring-buy tools (Jupiter Recurring) fire on a timer. A
   Saturday 03:00 order fills at whatever the pool says, with no reference
   check.
3. Buying a basket of N stocks means N separate orders, N fees, and drift
   between legs. Nobody offers a single atomic basket buy.

**Why Solana:** sub-cent fees make a $100 basket split four ways economic
(on Ethereum the gas would exceed the legs); a whole basket fits in one
atomic transaction; Pyth is native; the stock tokens already live here.

## 3. What is in scope (the wedge)

| Feature | In scope | Notes |
|---|---|---|
| Basket builder with percentage sliders | yes | plus 3 curated presets |
| Recurring plan: amount, cadence, optional end date | yes | weekly/daily for demo |
| Non-custodial USDC vault (PDA) | yes | user can withdraw any time |
| Atomic multi-leg execution by keeper | yes | one tx per period |
| Execution guard: Pyth staleness + confidence + session + divergence | yes | the differentiator |
| Deferral with on-chain reason code | yes | visible in UI and history |
| Portfolio: holdings, invested, value, P&L, average cost | yes | |
| DCA history with tx links | yes | |
| One-click devnet demo wallet with faucet | yes | judges have minutes |
| Mainnet execution via Jupiter | stretch | only if API reachable and funds available |
| Lending, dividends, corporate actions, social, mobile app | no | explicitly out |

## 4. Architecture

```
 Browser (Next.js, wallet adapter)
   │ create_plan / deposit / withdraw (user signs)
   ▼
 Anchor program: basket_dca
   ├─ Plan account (PDA per user+plan)
   ├─ Vault token account (USDC, PDA authority)
   └─ execute_basket (keeper signs, program checks guard + schedule)
   ▲                         │ CPI: transfer USDC, receive stock tokens
   │ execute / defer         ▼
 Keeper (Node, cron)      Fill venue
   ├─ Pyth Hermes client     ├─ devnet: mock_market program (fills at Pyth price)
   ├─ session calendar       └─ mainnet: Jupiter swap (stretch)
   └─ Postgres ledger (fills, deferrals, reasons) → read by the web app
```

The program is the source of truth for plan state, schedule, and the last
execution. The keeper is stateless apart from its ledger cache; if it dies,
another instance can resume from chain state.

## 5. On-chain program: `basket_dca`

### Accounts

```
Plan {
  owner:             Pubkey
  plan_id:           u16
  bump:              u8
  amount_per_period: u64         // USDC base units
  period_seconds:    u64         // 86400 * 7 for weekly
  next_execution:    i64         // unix ts
  end_ts:            i64         // 0 = open-ended
  legs:              [Leg; 8]    // fixed array, unused legs zeroed
  leg_count:         u8
  executions:        u32
  deferrals:         u32
  last_reason:       u8          // ReasonCode of last attempt
  total_invested:    u64
  status:            u8          // Active | Paused | Ended
}

Leg {
  mint:              Pubkey      // stock token mint
  weight_bps:        u16         // sums to 10_000 across legs
  pyth_feed_id:      [u8; 32]
  units_bought:      u64         // cumulative, for average cost
}

Config (global, admin-only) {
  keeper:               Pubkey
  max_staleness_secs:   u32      // e.g. 60 during session
  max_conf_bps:         u16      // confidence / price ceiling, e.g. 50 bps
  max_divergence_bps:   u16      // |venue - reference| ceiling, e.g. 150 bps
  min_liquidity_usdc:   u64      // per leg
  fill_program:         Pubkey   // mock_market on devnet
}
```

### Instructions

| Instruction | Signer | What it does |
|---|---|---|
| `init_config` | admin | one-time global parameters |
| `create_plan` | user | validates weights sum to 10 000, creates Plan + vault ATA |
| `deposit` | user | transfers USDC into the vault |
| `withdraw` | user | pulls USDC out; pauses plan if balance < amount |
| `execute_basket` | keeper | see below |
| `pause` / `resume` | user | toggles status |

`execute_basket` (the whole product lives here):

1. `require!(clock.unix_timestamp >= plan.next_execution)`.
2. For each leg, read the Pyth price update account passed in remaining
   accounts. Check publish time within `max_staleness_secs` and
   `conf * 10_000 / price <= max_conf_bps`.
3. Read the fill venue's quote (mock_market price account, or on mainnet a
   quote the keeper embeds and the program sanity-checks against Pyth).
   Check divergence and liquidity.
4. If any check fails: write `last_reason`, increment `deferrals`, set
   `next_execution` to the next retry slot (e.g. +1 hour, capped at the
   next session open), emit `Deferred`, **return Ok**. Deferral is a
   successful tx so the reason is recorded on chain.
5. Otherwise compute each leg's USDC amount, CPI the fill for every leg,
   transfer stock tokens to the **owner's** ATA (not the vault), update
   `units_bought`, `total_invested`, `executions`, `next_execution += period`,
   emit `Executed`.

All legs succeed or the tx reverts. That atomicity is the demo line.

### Reason codes

```
0 OK
1 REFERENCE_STALE        Pyth publish time too old
2 CONFIDENCE_TOO_WIDE    conf/price above ceiling
3 MARKET_CLOSED          session calendar says closed and no fresh price
4 DIVERGENCE             venue price vs reference beyond ceiling
5 LOW_LIQUIDITY          venue depth below minimum
6 INSUFFICIENT_BALANCE   vault cannot cover amount_per_period
```

The program enforces 1, 2, 4, 5, 6 from data in the tx. The keeper
enforces 3 off-chain (it simply does not submit outside the window) and
records the deferral in the ledger; the UI shows both sources identically.

## 6. Session calendar

US equities regular session: Mon–Fri 09:30–16:00 America/New_York, minus
NYSE holidays. The keeper ships a static holiday list for 2026 and derives
"open" from that. Off-hours policy is a config flag:

- `strict` (default for demo): never execute off-hours.
- `guarded`: execute off-hours only if Pyth is fresh and divergence and
  liquidity pass. This exists so the pitch can say the guard, not the
  clock, is the real gate.

## 7. Fill venue

**Devnet (the demo path):** a tiny `mock_market` program. Holds the mint
authority for `mAAPL`, `mNVDA`, `mTSLA`, `mSPY` (6 decimals). The `fill`
instruction takes USDC from the caller and mints stock units at the Pyth
price plus a configurable spread. `set_liquidity` and `set_price_override`
admin instructions let the demo force LOW_LIQUIDITY and DIVERGENCE
scenarios on stage. The README must say plainly that devnet fills are
synthetic.

**Mainnet (stretch):** keeper fetches a Jupiter quote, builds the swap with
the vault PDA as the token owner, and the program's `execute_basket`
verifies the quoted out-amount against Pyth before signing via CPI. Attempt
this only after the devnet path is fully done and only if Jupiter's API
answers from the host.

## 8. Keeper

Node service, one loop every minute:

1. Load all Active plans from chain (getProgramAccounts with a memcmp on
   status), or from the ledger cache with periodic resync.
2. For each due plan: check the session calendar; fetch signed Pyth price
   updates for its feeds from Hermes (needs `PYTH_API_KEY`, see
   `docs/NETWORK.md`); build one transaction that first posts them to the
   Pyth receiver (`post_update`, live on devnet) and then calls
   `execute_basket` with those fresh price update accounts and the fill
   accounts; send. Nobody sponsors US equity feeds on devnet, so the keeper
   must post its own updates. This is also the mainnet flow.
3. Parse `Executed` / `Deferred` events into Postgres:
   `executions(plan, ts, sig, legs_json, usdc_in, reason)`.
4. Retry on RPC errors with backoff; never retry a tx that landed.

Reuse the bozPicks keeper loop and tx helpers.

## 9. Web app

Screens, in build order:

1. **Connect + demo wallet.** "Try with a demo wallet" creates a burner in
   local storage, airdrops SOL, mints 10 000 devnet USDC. Judges must not
   need Phantom.
2. **Basket builder.** Sliders per stock, live pie, sum locked to 100%.
   Presets: Magnificent 7, AI Basket, Index Core (SPY/QQQ). Amount and
   cadence. "Create plan" signs one tx.
3. **Plan page.** Vault balance, deposit/withdraw, next execution
   countdown, pause. Guard status panel: for each leg, reference price,
   confidence, publish age, venue price, divergence, and the resulting
   verdict. This panel is the visual proof of the differentiator.
4. **Portfolio.** Holdings, invested, current value (Pyth), P&L, average
   cost per stock, DCA-vs-lump-sum comparison line.
5. **History.** Every execution and deferral with reason and explorer link.
6. **Demo controls** (dev-only route): "advance clock", "force stale
   feed", "drain liquidity" so the 90-second story can be run live.

Stack: Next.js 15, Tailwind, shadcn/ui, Recharts, wallet adapter,
`@pythnetwork/hermes-client`, `@coral-xyz/anchor`. Reuse `apps/web` from
bozPicks for the wallet and ledger plumbing.

## 10. Demo script (video, 2–3 minutes)

| t | What is on screen |
|---|---|
| 0:00 | "Tokenized stocks trade 24/7. A trustworthy price does not." |
| 0:15 | Demo wallet, build AI Basket, $100 weekly, create plan, deposit |
| 0:45 | Advance clock to Monday 10:00 ET. Keeper fires. One tx, three legs, explorer link. Portfolio fills in |
| 1:15 | Advance to Saturday 03:00. Keeper attempts, guard panel shows stale + closed, Deferred recorded on chain with reason |
| 1:45 | Force a divergent venue price during session. Deferred: DIVERGENCE. Restore, it executes |
| 2:15 | History, P&L, average cost vs lump sum |
| 2:35 | Architecture slide, Why Solana, what is mock on devnet |

## 11. Six-day plan

| Day | Deliverable | Done when |
|---|---|---|
| 1 Sat 12/13 | repo, skeleton copied, `.gitignore`, reachability test of Hermes + Jupiter from the host, this proposal reviewed, Pyth Terminal API key obtained | `anchor build` passes on an empty program |
| 2 Sun | `basket_dca` accounts + create/deposit/withdraw; `mock_market` mints + fill | anchor tests green on localnet |
| 3 Mon | `execute_basket` with guard checks + events; keeper executes one plan on devnet | explorer shows a 3-leg tx |
| 4 Tue | web: demo wallet, basket builder, plan page, portfolio | judge flow works without Phantom |
| 5 Wed | guard panel, history, demo controls, all deferral scenarios reproducible | the 90-second script runs live twice |
| 6 Thu 17 | video, README (architecture, quickstart, what is synthetic, why Solana), submit | submitted before Thursday night; Friday is buffer |

Rule: no new feature after day 5. Register on the hackathon site on day 1.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Hermes or Jupiter blocked from the host | tested day 1, see `docs/NETWORK.md`: neither is geo-blocked, but Hermes needs an API key (free trial on the Pyth Terminal) and the devnet push oracle has no fresh equity prices. If no key arrives by day 3, `mock_market` also writes `PriceUpdateV2`-shaped accounts and the README says the reference price is synthetic too |
| Anchor build toolchain on Windows | bozPicks already builds Anchor 0.30.1 here; copy its config, do not upgrade |
| Tx size with 4 legs × (price update + fill accounts) | cap legs at 4 for the demo; use an Address Lookup Table if needed |
| Judges see "mock fills" as fake | be explicit, show the mainnet code path, keep every other part real on chain |
| Solo, six days | cut mainnet first, then the DCA-vs-lump-sum chart, then presets; never cut the guard |
| Jurisdiction: tokenized securities have eligibility rules | product is a self-custody tool; README states it does not solve eligibility or compliance |

## 13. Out of scope, on purpose

Lending against stocks (Jupiter Lend exists), issuing tokens (xStocks and
Ondo exist), dividends and splits (issuer-specific, xStocks rebases), AI
stock picking, social/copy trading, a mobile app, a general DEX.

## 14. Submission checklist

- [ ] Registered on hackathons.solana.com
- [ ] Public GitHub repo, MIT license, no keypairs in history
- [ ] README: problem, demo link, video link, architecture, quickstart,
      what is synthetic on devnet, why Solana, team
- [ ] Deployed web app (Vercel) pointing at devnet program IDs
- [ ] Video 2–3 min uploaded
- [ ] Submit form filled, teammates invited, links verified from a clean
      browser
