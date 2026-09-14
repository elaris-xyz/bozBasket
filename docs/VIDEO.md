# Video script (2:30)

Record at 1920×1080 on the live site, https://boz-basket-web.vercel.app. The
keeper runs inside the app, so there is no terminal to show: every attempt
lands in the plan's History within about a minute.

**When:** between Sunday 20:00 ET and Friday 20:00 ET, while Pyth publishes US
equity prices and the guard can pass on real data. Outside that window every
attempt defers as stale, and mock reference mode does not rescue the deployed
app, whose keeper posts real Pyth updates.

Before recording:

- `OFF_HOURS_POLICY` must be unset in Vercel, or the keeper skips every
  attempt outside the regular session (see `docs/SUBMISSION.md`).
- Open `/demo` and click **Restore everything**. The guard panel should show
  the real Pyth reference with every check passing.
- Open the demo plan in a second tab:
  `/plan/5vV866AdEP6kR5NemndnVoopUCK4ygXCuyGUG8L78LZq`. Its "What the guard
  did" card is the 1:55 shot.
- Use a fresh browser profile, so "Try with a demo wallet" starts empty.

---

**0:00 — The problem.** *Home page on screen.*

> Tokenized stocks trade around the clock, seven days a week. The price they
> are measured against does not. From Friday evening to Sunday evening no US
> equity price is published at all. The last one just sits there, aging, for
> two days, while the tokens keep trading. Recurring-buy tools on chain fire
> on a timer anyway.

**0:15 — Build a basket.** *Click "Try with a demo wallet", then "Build a basket".*

> No extension, no seed phrase. This generates a burner key in the browser and
> funds it with devnet USDC.
> I pick Tesla, the Nasdaq 100 and the S&P 500 — fifty, thirty, twenty — a
> hundred dollars a week.

*Click create.*

> One transaction creates the plan, creates the vault, and funds it. The vault
> is a program account whose only withdrawal authority is my key.

*A new plan is due at once, so its first buy appears in History within a
minute. Let it; the 1:35 execution is the second period.*

**0:40 — The guard.** *Plan page, scroll to the guard panel.*

> Before every buy the program checks four things per leg: how old the Pyth
> price is, how wide its confidence band is, how far the venue's quote has
> drifted from it, and whether there is enough depth to fill my leg.
> Right now everything passes, so it would execute.

**0:55 — Break it.** *Demo controls tab, "Force divergence" on mTSLA.*

> Let me push the venue's quote five percent away from the reference. That is
> a real transaction changing the venue's real price.

*Back to the plan page; the panel turns amber.*

> The panel agrees: it would defer, because Tesla's venue price has diverged.

**1:10 — The keeper tries anyway.** *Demo controls: select the plan, "Make the plan due". Back to History.*

> The keeper runs inside the app, and it does not take the panel's word for
> it. It builds the transaction, submits it, and the program decides.

*The History row appears.*

> Deferred. Reason four, divergence. The deferral is a successful transaction:
> the reason is stored in the plan account and emitted as an event. Here it is
> on the explorer. My money did not move.

**1:35 — Restore and execute.** *"Restore everything", then "Make the plan due" again.*

> Put the venue back and try again.

*The execution lands.*

> One transaction, three legs, all or nothing. Units, average cost, and profit
> and loss against the live reference. The average cost sits about twenty
> basis points above the reference: that is the venue spread, not rounding.

**1:55 — A real weekend.** *Second tab: the demo plan's "What the guard did" card, then its History.*

> This plan was due last Sunday, while its prices were up to two days old. The
> keeper kept trying, and every time the program said no, on chain, reason
> one. None of it was forced. At 8:26 that evening prices were live again, and
> it filled, a dollar twenty per hundred below the stale price it refused.
> That is one weekend, and it could have gone the other way. The card would
> show that, in red.

**2:15 — The honest part, and close.** *Footer "synthetic" note.*

> On devnet there are no xStocks and no Jupiter liquidity, so the stock tokens
> and the fills are mocked, and every page says so. The program, the vaults,
> the Pyth prices, the guard and the reason codes are real.
> Tokenized stocks made the market 24/7. bozBasket makes the buying wait for a
> price worth trusting.
