# Video script (2:30)

Record at 1920×1080. Two windows: the browser at `http://localhost:3200` and a
terminal running the keeper. Put the terminal in the bottom third so the
keeper's verdict lines are readable while the page is on screen.

Before recording:

```bash
source tools/env.sh
pnpm --filter keeper exec tsx scripts/set-reference.ts mock   # so a fill can be shown off-hours
pnpm --filter web build && pnpm --filter web start
KEEPER_POLL_SECONDS=10 OFF_HOURS_POLICY=guarded pnpm --filter keeper start
```

Have a funded demo wallet with **no plans yet**, and the demo controls tab open
in a second browser tab. Afterwards run `scripts/set-reference.ts pyth`.

---

**0:00 — The problem.** *Home page on screen.*

> Tokenized stocks trade 24 hours a day. A trustworthy price does not.
> The US market is open about 32 hours a week. For the other 136, the
> reference price is stale by design, and the pools are thin. Every recurring
> buy tool on chain fires on a timer anyway.

**0:15 — Build a basket.** *Click "Try with a demo wallet", then "Build a basket".*

> No extension, no seed phrase. This generates a burner key in the browser and
> funds it with devnet USDC.
> I pick Tesla, the Nasdaq 100 and the S&P 500 — fifty, thirty, twenty — a
> hundred dollars a week.

*Click create.*

> One transaction creates the plan, creates the vault, and funds it. The vault
> is a program account whose only withdrawal authority is my key.

**0:45 — The guard.** *Plan page, scroll to the guard panel.*

> This is the part that is not a timer. Before every buy the program checks
> four things per leg: how old the Pyth price is, how wide its confidence band
> is, how far the venue's quote has drifted from it, and whether there is
> enough depth to fill my leg.
> Right now everything passes, so it would execute.

**1:00 — Break it.** *Demo controls tab, "Force divergence" on TSLA.*

> Let me make the venue quote five percent away from the reference. That is a
> real transaction changing the venue's real price.

*Back to the plan page; the panel turns amber.*

> The panel agrees: it would defer, because Tesla's venue price has diverged.

**1:20 — The keeper tries anyway.** *Click "Advance the clock". Point at the terminal.*

> The keeper does not take the panel's word for it. It builds the transaction
> and submits it, and the program decides.

*History row appears.*

> Deferred. Reason four, divergence. And this is the part I care about: the
> deferral is a successful transaction. The reason code is stored in the plan
> account and emitted as an event. Here it is on the explorer. My money did
> not move.

**1:45 — Restore and execute.** *"Restore everything", then "Advance the clock".*

> Put the venue back and try again.

*Execution lands.*

> One transaction, three legs, all or nothing. The portfolio fills in:
> units, average cost, profit and loss against the live reference price.
> Notice the average cost sits about twenty basis points above the reference.
> That is the venue spread, not a rounding error.

**2:10 — The honest part.** *Scroll to the "synthetic" note in the footer or the README.*

> On devnet there are no xStocks and no Jupiter liquidity, so the stock tokens
> and the fills are mocked, and it says so on every page. The program, the
> vaults, the schedule, the guard arithmetic, the atomic execution and the
> reason codes are all real on chain. Every one of the six reason codes has
> been reproduced on devnet; the transactions are in the README.

**2:25 — Close.**

> Tokenized stocks made the market 24/7. bozBasket makes the *buying* wait for
> a price worth trusting.

---

## If you are recording during US market hours

Skip the mock reference mode. Use the real Pyth receiver for the whole video
and force the divergence and liquidity scenarios, which are genuine
manipulations. That is the strongest version of the demo. The weekend
deferral transaction in `docs/DEMO.md` can be shown as a still.
