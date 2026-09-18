# Demo script and scenario proofs

Everything below runs on Solana devnet against the deployed programs. The
guard panel, the keeper and the program are three separate pieces that must
agree; `apps/keeper/scripts/scenarios.ts` checks that they do and writes
`deploy/scenarios.json`.

## Setup

```bash
source tools/env.sh
pnpm --filter web build && pnpm --filter web start      # http://localhost:3200
pnpm --filter keeper start                              # separate terminal
```

The keeper needs `OFF_HOURS_POLICY=guarded` to submit outside the US session.
With the default `strict` it refuses to submit at all off-hours and records
`MARKET_CLOSED` in the ledger, which is the right production behaviour but
shows nothing on chain.

## The 90-second story

| t | On screen | What is actually happening |
|---|---|---|
| 0:00 | "Tokenized stocks trade 24/7. A trustworthy price does not." | — |
| 0:10 | Click **Try with a demo wallet** | A burner keypair is generated in the browser and funded with SOL and 10 000 devnet USDC by `/api/faucet` |
| 0:25 | Build a basket: TSLA 50 / QQQ 30 / VOO 20, $100 weekly, deposit $500 | One transaction creates the plan account and its vault PDA, then moves the deposit |
| 0:45 | Plan page. Guard panel is green: prices fresh, confidence tight, venue within 20 bps, depth deep | The panel runs the same shared code the program runs, against the same on-chain thresholds |
| 0:55 | **Demo controls → Force divergence (TSLA)** | `set_price_override` makes the venue quote 5% off the reference. Real state |
| 1:05 | Guard panel turns amber: "Would defer: venue diverged from reference" | Recomputed from the changed account |
| 1:10 | **Make the plan due**, the keeper fires | `nudge_plan` makes the plan due; the keeper builds the transaction anyway |
| 1:20 | History shows **deferred · venue diverged from reference**, with an explorer link | `execute_basket` wrote `last_reason = 4`, incremented `deferrals`, emitted `Deferred`, and returned Ok. Nothing was bought |
| 1:35 | **Restore everything**, make the plan due again | Override cleared |
| 1:45 | History shows **executed**, portfolio fills in | One transaction, three `Fill` CPIs, all legs or none |
| 2:05 | Portfolio: units, average cost, P&L against the live reference | Average cost sits ~20 bps above the reference: that is the venue spread, not a rounding artefact |
| 2:20 | Architecture slide, why Solana, what is synthetic on devnet | — |

## Scenario proofs

Reproduce with:

```bash
pnpm --filter keeper exec tsx scripts/scenarios.ts <plan>
WEB_URL=https://boz-basket-web.vercel.app pnpm --filter keeper exec tsx scripts/scenarios.ts <plan>
```

For each row it changes real state through the demo API, asks the guard panel
what it predicts, submits the transaction, and compares the reason code the
program recorded. It holds the shared keeper lock throughout, so no other
keeper touches the plan mid-sweep, and restores everything when it ends.
Every attempt is also written to the ledger, marked as a demo test, so the
plan's History and chart add up to the chain and none of it counts as a
saving. (The sweeps listed here ran before that; `scripts/recover-ledger.ts`
wrote their rows back from the chain on 2026-09-18.) Run
twice on 2026-09-13 against a local web app, 6/6 both times, and on 2026-09-14
against the deployment, 6/6. The table is the deployment run.

| Scenario | Reason | Transaction |
|---|---|---|
| Baseline, everything passes | 0 Executed | `2NnPMYZzvm9NkqFxc7dr4ZNm3tVD8bXDVBnwee6dBTraSrCdaowUJFHhpptWQjAHtLx746GWVRo5aqyrmjQ4gBeW` |
| Venue quotes 5% off | 4 Divergence | `2Xxo9jTohaFbosohf5kBYa3KALpJidGEhqtHqDD1cz8P4KDKRAhTDvMRgPwShQM4DSEqxTp8ZVtPtP1MGyBZN4ok` |
| Depth drained to $10 | 5 Low liquidity | `3L6wUm2iLrCUdhbW6yc1kprh3SiRc2osjKPLeByHet2CXSS8qDjUNboC4mgzsAtpncCP1mXLg551vKL77ViW3TGy` |
| Confidence ceiling tightened | 2 Confidence too wide | `2zMYKdQX2wKrtBovKsgjxQtaVWWLHwuMD9sR2bwdRdEGBwLn1BpNbxB8yrDU6noBjCGmKUPDoHp4d98jJQ16s2C7` |
| Staleness ceiling tightened | 1 Reference stale | `2Gq8xKwiQswLygQSL7wzZnAPoifBMUUE5cViXGeaWJapEP2CA4ksK6MXe9mCx2gHGdvrbsdkGcX4E8nZnNq1cBeD` |
| Vault below one period | 6 Insufficient balance | `2aCaKfysb81BcPFytAKLWZeeH464o2j86KKtTXFUbgT5nK6MEhsqiAHSXzQi9j5HZA2A4HCzqPf5qvNPeC8QLpFr` |

The genuine, unforced version of reason 1, from the real Pyth receiver on a
Saturday with a 31-hour-old AAPL-class equity price:
`5oiJcFzaxw6rvqmvTL2s73S1sVZgZgeAzTUdJv8qABwgLGuo1NAmYuriK9oFxqtJNhnKAmLpyNZ1dUq8TJdQrgWX`

Reason 3, `MARKET_CLOSED`, is the keeper's alone, and only under `strict`,
which does not submit outside the regular session and records a skip in the
ledger, never on chain. The deployment runs `guarded`: Pyth publishes outside
the regular session, so the calendar is the wrong test, and the program's own
staleness check decides.

## What is forced and what is real

Honesty matters more than a slick demo, so, precisely:

- **Divergence and liquidity are real manipulations.** `set_price_override`
  and `set_liquidity` change the venue's actual quote and depth. The guard
  reads those accounts and reaches its own verdict. Nothing is faked.
- **Staleness and confidence are threshold changes, not corrupted feeds.**
  Nobody can make Pyth publish a stale or uncertain price on demand. The
  control tightens the ceiling in `Config` so a normal price fails it. The
  honest, unforced version of staleness is the weekend, and that transaction
  is linked above.
- **Fills are synthetic.** Devnet has no xStocks and no Jupiter liquidity, so
  `mock_market` mints mock tokens at the reference price plus a spread.
- **Reference prices have two modes.** With the real Pyth receiver, nothing
  is published for US equities from Friday 20:00 ET to Sunday 20:00 ET, so a
  demo in that window can only show deferrals. `scripts/set-reference.ts mock`
  points the program at `mock_market`, whose reference the keeper restamps
  with the current time, so a fill can be shown at any hour. The guard panel
  says which mode is active and the program enforces the account owner either
  way.
- **Everything else is real on chain**: the plan account, the vault PDA, the
  schedule, the guard arithmetic, the atomic multi-leg CPI, the reason codes,
  the deferral counter.
