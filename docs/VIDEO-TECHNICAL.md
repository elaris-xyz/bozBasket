# Technical video script (3:00)

The submission form has two video fields, **Pitch Video URL** and **Technical
Video URL**, and neither is required. This is the technical one; the pitch is
`docs/VIDEO.md`. They are different films and share no footage: the pitch shows
a person using the product, this one shows why a judge should believe it.

Audience: a Solana engineer who will open the repo afterwards. Every claim here
is on screen at a file path they can check.

Record at 1920×1080 with the editor and the browser side by side, or cut
between them. Keep a file on screen only while you are describing it.

**Have open before recording:** `programs/basket_dca/src/execute.rs`,
`packages/shared/src/guard.ts`, `apps/keeper/src/pass.ts`, an execution and a
deferral on the explorer, the live site's `/developers` page.

---

**0:00 — The shape of it.** *README architecture section, or the file tree.*

> An Anchor program on devnet, `basket_dca`. A keeper that runs as a Vercel
> function on a five-minute cron and as a long-running worker, both calling the
> same `runPass`. A Next.js app that reads the chain directly. And a shared
> package holding the guard logic, mirrored in Rust inside the program.
> Nine instructions, three of which matter: `create_plan`, `deposit`,
> `execute_basket`.

**0:20 — The account model.** *`programs/basket_dca/src/state.rs`.*

> A plan is one account: owner, the legs with their weights and Pyth feed ids,
> the amount per period, the schedule, and the counters. The vault is a token
> account owned by a PDA of the plan, and the only withdrawal authority is the
> owner's key. The keeper can make a plan execute. It can never move the money
> anywhere else.

**0:40 — The guard runs on chain.** *`execute.rs`, scroll through the per-leg checks.*

> This is the part that is not a dashboard. For every leg, inside the
> transaction: the reference account must be owned by the program in
> `config.reference_program` — the Pyth receiver — its feed id must equal the
> leg's feed id, its verification level must be `Full`, and the price must be
> positive. Then four numbers against the config: age against
> `max_staleness_secs`, the confidence band in basis points, the venue's
> divergence from the reference, and whether the venue's depth covers this leg.
> Any of them fails and the verdict is `Defer`.

**1:00 — What a deferral is.** *Stay in the file, on the `Verdict::Defer` arm.*

> A deferral is not an error and not a revert. The reason code and the leg go
> into the plan account, a `Deferred` event is emitted, and the instruction
> returns `Ok`. The transaction succeeds and no token moves. That is
> deliberate: a failed transaction leaves nothing a user can audit, and this
> product's whole claim is that the refusals are as visible as the buys.

**1:20 — Where the price comes from.** *`apps/keeper/src/hermes.ts`, then the explorer.*

> Nobody sponsors Pyth US equity accounts on devnet or mainnet — we measured
> them weeks stale while SOL was seconds old. So the keeper pulls the signed
> update from Hermes and posts it to the Pyth receiver with `post_update` in
> the same transaction that executes the basket. The program never trusts the
> keeper's number: it re-reads the account the receiver just wrote, checks the
> owner, the feed id and the verification level, and computes the age from the
> on-chain clock.

**1:40 — One transaction.** *An execution on the explorer, instructions expanded.*

> Post the updates, then `execute_basket`: three legs, all or nothing, one
> signature. Here is the deferral from the same plan — succeeded, no token
> balance changed, and the log carries reason one, reference price stale.

**2:00 — One guard, three readers.** *`packages/shared/src/guard.ts`, then `/developers`.*

> The Rust in the program and this TypeScript are the same rules, and the
> comment above the reason codes says to change all three files together. The
> plan page's panel, the keeper, and the public API all call this function, so
> the number a reader sees is the number the program will act on. The API is
> open: any wallet or recurring-buy tool can ask for a verdict before its own
> swap.

**2:20 — Measured against the real market.** *Home page, the mainnet panel.*

> Every five minutes the keeper asks Jupiter what a hundred dollars actually
> buys in xStocks on mainnet, compares it with Pyth, and runs that same guard
> over it. Read-only: nothing is ever bought there. The eight-weekend table
> underneath is built from real pool trades, hour by hour, against the next
> price Pyth published. Both panels say how they were measured, and VOOx is
> absent because no pool holds it.

**2:40 — What is synthetic, and the close.** *Footer note, then the test run.*

> Devnet has no xStocks and no Jupiter liquidity, so the stock tokens and the
> fills come from a `mock_market` program that fills at the reference price,
> and every page says so. The program, the vaults, the schedule, the Pyth
> updates, the guard and the deferrals are real on chain. Sixty-two tests in
> the app, more in the keeper, and the repo is in the description.

---

**If you only have two minutes:** cut 0:20 and 2:20. The guard on chain, the
deferral, the Pyth posting and the single transaction are the technical story;
the rest is context the repo also gives.
