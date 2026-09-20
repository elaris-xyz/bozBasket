# Submission checklist

Deadline: **Friday 2026-09-25, 16:00 ET** (extended from 09-18). Hackathon:
https://hackathons.solana.com/hackathons/stocklana

## Done

- [x] Programs deployed to devnet and verified working end to end
- [x] All six guard reason codes reproduced on chain, transactions in `docs/DEMO.md`
- [x] Web app: demo wallet, basket builder, plan page, portfolio, history, guard panel, demo controls
- [x] Keeper: session calendar, Hermes, Pyth receiver posting, Postgres ledger
- [x] Tests: 9 Rust, 32 Anchor integration (last run 2026-09-14), 28 keeper (guard,
  calendar, mainnet check, backtest), 58 web (scorecard, chart, Guard API, deferral
  wording, demo restore), keeper and web re-run 2026-09-19
- [x] Mainnet check: every keeper pass prices $100 of TSLAx and QQQx on Jupiter
  against Pyth, read-only, and records the guard's verdict; the landing page
  charts it
- [x] Guard API v1: `/api/v1/verdict` (live verdict for any size and limits),
  `/api/v1/history`, an OpenAPI 3.1 description and the `/developers` page
- [x] Demo controls restore themselves after ten idle minutes
- [x] Plan page chart: invested against value, held-back periods shaded, Pyth's
  silence dashed; the keeper stores reference prices every quarter hour
- [x] A deferral says when it will be tried again (Sunday 20:00 ET on a weekend)
- [x] The demo plan's history matches the chain (8 fills, 29 deferrals), demo
  tests marked; scorecard 2 held-back buys, $1.20
- [x] Faucet: 0.02 SOL per demo wallet, 3.87 SOL on 2026-09-18 (about 167 wallets)
- [x] Eight real weekends measured (`deploy/weekend-backtest.json`), on the landing
  page and in the README, including that waiting did not save money on average
- [x] README: problem, architecture, quickstart, what is synthetic, why Solana
- [x] MIT license
- [x] No keypairs in git history (`*.keypair.json` and `.env` ignored from the first commit)
- [x] The public faucet signs with a dedicated key, not the program upgrade authority

## Needs you

- [ ] **Register on the hackathon site** if not already done
- [x] ~~Create the public GitHub repo and push~~ — https://github.com/elaris-xyz/bozBasket
- [x] ~~Deploy the web app to Vercel~~ — https://boz-basket-web.vercel.app
- [x] ~~Add `DEMO_CONTROLS=1` and `KEEPER_SECRET_KEY` in Vercel~~
- [x] ~~Create the cron-job.org job~~ — its passes are in the ledger every five minutes on 2026-09-14
- [x] ~~Delete `OFF_HOURS_POLICY` from the Vercel environment variables~~ — done
  2026-09-14. It had been `strict`: at 02:42 ET production skipped a due plan
  as "outside regular hours" while the Pyth price was seconds old. After the
  redeploy, at 03:37 ET, production filled that plan.
- [x] ~~Screenshots for the README~~ — `docs/img/home.png` (the landing page
  with the mainnet check) and `docs/img/guard.png` (a demo control applied)
- [x] ~~The demo plan page as `docs/img/plan.png`~~ — the chart zoomed to Sunday 13 September; `home.png` retaken on a Saturday (2026-09-19), both in New York time
- [ ] **Record the pitch video** from `docs/VIDEO.md`, upload it, put the link in the README
- [ ] **Record the technical video** from `docs/VIDEO-TECHNICAL.md` (optional, but
      the form has a field for it and a technical judge is the reader)
- [x] ~~Rotate the Neon database password~~ — decided against on 2026-09-15.
  Checked first: the password and the database host appear in no commit on any
  branch and in no tracked file, and `.env` and `.env.railway` are ignored and
  were never committed. It lives only in the local `.env` files, Vercel and the
  GitHub Actions secrets.
- [ ] **Submit the form**. Its Links step has four fields and asks for at least
      one: GitHub Repository, Demo URL (the live site, not a video), Pitch Video
      URL, Technical Video URL. Edits are allowed until Friday 25 September,
      16:00 ET.

## Vercel settings

Project root directory: `apps/web`. Framework: Next.js. The build script
copies the IDLs and the deployment file into `src/generated`, which are also
committed, so the build needs neither Anchor nor a Solana toolchain.

Environment variables:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_RPC_URL` | a devnet RPC that answers (the public one rate-limits) |
| `PYTH_API_KEY` | the Pyth Terminal key |
| `PYTH_HERMES_URL` | `https://hermes.pyth.network` |
| `FAUCET_SECRET_KEY` | contents of `deploy/faucet.keypair.json` |
| `DATABASE_URL` | Neon connection string, for the history panel |
| `DEMO_CONTROLS` | `1`, so judges can break the guard and watch it react |
| `KEEPER_SECRET_KEY` | contents of `~/.config/solana/id.json`, for the demo controls |
| `OFF_HOURS_POLICY` | leave unset, so the in-app keeper runs `guarded` |

`KEEPER_SECRET_KEY` is the config admin, but since 2026-09-13 it is **not**
the programs' upgrade authority: that moved to
`deploy/upgrade-authority.keypair.json`, which never leaves the build machine.
So the worst anyone can do through the demo controls is change devnet market
state that one click of "restore" puts back. Any future `anchor deploy` needs
`--upgrade-authority deploy/upgrade-authority.keypair.json`.

## Keeper in production

The keeper runs inside the web app (see "Is it running?" in the README), so the
deployment executes plans with nothing else running, as long as someone has
the app open. Two backstops cover the hours nobody does:

1. **A free cron-job.org job, every five minutes.** Add a job: URL
   `https://boz-basket-web.vercel.app/api/keeper/tick`, method GET, schedule
   every 5 minutes, no headers. The endpoint answers at once and runs the pass
   after responding, so the service's 30-second timeout does not matter. Five
   minutes, not one: whenever someone has the app open it already runs a pass
   every minute, so the scheduler only covers unattended hours, where a weekly
   buy landing a few minutes late costs nothing and every extra run spends
   Vercel function time.
2. **The scheduled GitHub Action** (`.github/workflows/keeper.yml`, secrets
   already set). Measured on 2026-09-13, GitHub fired its five-minute schedule
   only twice in seven hours, so it is a public log and a backstop, not a clock.

Every keeper takes the same Postgres lock (`apps/keeper/src/lock.ts`): one pass
at a time and scheduled passes at most once a minute, so two keepers never
attempt the same plan or pay twice to post the same price. `railpack.json`
still runs the keeper as an always-on worker on a host that has credit.

The app says when the keeper last ran, in red when it is late, so "the guard
deferred" can never be confused with "nothing is running".

## Facts worth having at hand

- Devnet program: `4Tv5nEbh6b6EGNhep7rpeLy7NXpiz8AkRmVi36iwxVuR`
- The three Pyth equity feeds in use: TSLA, QQQ, VOO
- Guard API docs: https://boz-basket-web.vercel.app/developers
- Mainnet xStocks in the read-only check: TSLAx
  `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB`, QQQx
  `Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ`
- One-line pitch: a recurring-buy robo-investor for tokenized US stocks that
  defers the buy, with a reason on chain, when the reference price cannot be
  trusted.
