# Four-day polish plan (Mon 14 — Thu 17 September)

The six-day build is done: programs on devnet, keeper working, web app
shipped, all six reason codes proven on chain. Friday 18th 16:00 ET is the
deadline, so Friday is buffer and submission only.

Judging asks one question: *could this be a real app that people will actually
use?* Everything below is chosen against that, not against a feature list.

## Progress

- **Day 1 — done.** The keeper runs as a scheduled GitHub Action with a public
  log, the app reports when it last ran, the demo controls are live, and the
  programs' upgrade authority moved to a cold key.
- **Day 2 — done, one item deferred.** `update_plan` is on devnet and editable
  from the plan page. The guard scorecard is unit tested and live, counting one
  blind fill per held-back buy. Deferred: the portfolio-over-time chart, which
  Day 2's done-when did not require.
- **Watch the next US market open.** The demo plan's weekend-deferred buy fills
  then, producing the first organic stale-savings figure. That is the number
  the video should show.

## Where we honestly stand

**Strong.** The guard is a real differentiator and it is enforced on chain,
not in a client. Deferrals are auditable transactions. The atomic multi-leg
fill is a genuine reason to be on Solana. The demo wallet removes every
onboarding step. The README is straight about what is mocked.

**Weak, in priority order.**

1. **The deployed app is a dead demo.** The keeper runs on a laptop. A judge
   who opens the Vercel URL, creates a plan and waits will see nothing
   execute, ever. This single gap undoes the "working end-to-end demo"
   criterion for everyone who does not watch the video.
2. **The value is asserted, not measured.** We say deferring protects the
   user. We never show *how much*. A number turns a feature into a product.
3. **The thesis is invisible until you click.** The landing page explains;
   it does not demonstrate. Right now, live, the market is closed and three
   equity feeds are 30+ hours stale. That fact belongs on the first screen.
4. **A plan cannot be changed.** Want $150 a week instead of $100? Create a
   second plan. That is not how a recurring-investing product behaves.
5. **Unknown on a phone.** Nine-column tables. Judges open links on phones.

## Day 1 (Mon) — make the deployed demo alive

Nothing else matters if this is not true.

- Deploy `apps/keeper` as an always-on worker on Railway (the bozPicks
  account already exists; `railpack.json` there is the template). Root
  directory `apps/keeper`, env `KEEPER_KEYPAIR` as a file or
  `KEEPER_SECRET_KEY`, plus `SOLANA_RPC_URL`, `PYTH_API_KEY`, `DATABASE_URL`,
  `OFF_HOURS_POLICY=guarded`, `KEEPER_POLL_SECONDS=60`.
  - Backup if Railway is awkward: a GitHub Actions workflow on a `*/5` cron
    calling `pnpm --filter keeper once`. Slower and sometimes delayed, but
    it runs in the repo the judges are already looking at, which is its own
    kind of proof.
- Write a heartbeat: the keeper records a `pass` row (or updates one row)
  every loop, and the web app shows "keeper last ran 40 s ago" with a red
  state when it is stale. A judge must be able to tell the difference between
  "the guard deferred" and "nothing is running".
- Put a permanent demo plan on the home page — "watch a live plan" — so the
  app is interesting before anyone connects a wallet.
- Test the whole flow from the public URL in a browser with no local process
  running and no extension.

**Done when:** from the Vercel URL alone, a new plan executes within two
minutes, and the page says when the keeper last ran.

## Day 2 (Tue) — make the value measurable, and the plan editable

- **"What the guard saved you."** For every deferral, compute the cost it
  avoided and store it with the ledger row:
  - *Divergence:* leg size × divergence. Directly computable from the
    `Deferred` event's `detail` (basis points) and the leg amount.
  - *Stale:* compare the stale price with the price at the next successful
    execution. That difference is what a blind Saturday fill would have paid.
  - Show a running total on the plan page and the home page.
  - **Label forced deferrals separately.** Most of our divergence and
    liquidity deferrals came from demo controls; counting those as savings
    would be a lie. Only organic deferrals feed the headline number.
- **`update_plan`.** A program instruction letting the owner change
  `amount_per_period`, `period_seconds` and `end_ts`. Weights stay immutable
  on purpose: per-leg invested is derived as weight × total invested, which
  is exact only while the split never changes. Changing a basket means a new
  plan, and the UI should say so. Needs a redeploy (~1.7 SOL, we hold 5.3)
  and tests.
- Portfolio over time: invested against value, from execution history.

**Done when:** the plan page answers "what has this cost me, and what did
waiting save me" with numbers a judge can trace to a transaction, and the
amount can be changed without creating a second plan.

## Day 3 (Wed) — the first sixty seconds

- **Live proof on the landing page.** A compact panel: US session state, and
  for each of the three feeds the price, confidence and publish age, right
  now. On a weekend it reads "closed, prices 38 hours old" — the entire pitch,
  demonstrated before a single click.
- **Mobile pass.** Below 640 px the guard, portfolio and history tables become
  stacked cards. Check the builder sliders with a thumb.
- Loading skeletons, empty states, and a clear message when the keeper is
  down or the ledger is unreachable.
- Open Graph image and favicon, so a pasted link looks like a product.
- Stretch, only if the above is done: wallet-adapter support alongside the
  burner, so someone with Phantom can use their own wallet.

**Done when:** the app is convincing on a phone, cold, with no wallet.

## Day 4 (Thu) — verify, document, record, submit

- Re-run `scripts/scenarios.ts` against the **deployed** stack, not localhost.
- Re-run every suite; refresh the README with the live URL, the savings
  numbers and two screenshots.
- Record the video from `docs/VIDEO.md`, adjusted for whatever changed.
- **Submit on Thursday.** Friday is for the thing that goes wrong.

## Not doing

- Mainnet or Jupiter. The program is shaped for it and the README says it is
  not built. Claiming otherwise is the fastest way to lose a judge.
- More assets. The Pyth key is entitled to TSLA, QQQ and VOO; the feed list
  is configuration, and the README should say the limit is the API tier, not
  the design.
- New program instructions beyond `update_plan`.
- A redesign. The look is fine; the gaps are substance, not styling.

## Risks

| Risk | Mitigation |
|---|---|
| Railway deploy eats a day | GitHub Actions cron fallback, decided by Monday lunchtime |
| `update_plan` redeploy breaks devnet state | Deploy and test the instruction before touching the live config; the existing plan accounts do not change shape |
| Savings numbers look invented | Only organic deferrals count, each links to its transaction, and forced ones are shown separately |
| Time runs out | The order above is the priority order. Day 1 alone materially improves the submission; day 3 alone does not |

## Needs you

- A Railway project (or a decision to use the Actions fallback).
- The Vercel URL once it is live.
- Rotating the Neon password, since the repository is now public.
