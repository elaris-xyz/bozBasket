# Submission checklist

Deadline: **Friday 2026-09-18, 16:00 ET**. Hackathon:
https://hackathons.solana.com/hackathons/stocklana

## Done

- [x] Programs deployed to devnet and verified working end to end
- [x] All six guard reason codes reproduced on chain, transactions in `docs/DEMO.md`
- [x] Web app: demo wallet, basket builder, plan page, portfolio, history, guard panel, demo controls
- [x] Keeper: session calendar, Hermes, Pyth receiver posting, Postgres ledger
- [x] Tests: 9 Rust, 30 Anchor integration, 11 guard and calendar
- [x] README: problem, architecture, quickstart, what is synthetic, why Solana
- [x] MIT license
- [x] No keypairs in git history (`*.keypair.json` and `.env` ignored from the first commit)
- [x] The public faucet signs with a dedicated key, not the program upgrade authority

## Needs you

- [ ] **Register on the hackathon site** if not already done
- [x] ~~Create the public GitHub repo and push~~ — https://github.com/elaris-xyz/bozBasket
- [x] ~~Deploy the web app to Vercel~~ — https://boz-basket-web.vercel.app
- [x] ~~Add `DEMO_CONTROLS=1` and `KEEPER_SECRET_KEY` in Vercel~~
- [ ] **Create the cron-job.org job** (steps under "Keeper in production")
- [ ] **Record the video** from `docs/VIDEO.md`, upload it, put the link in the README
- [ ] **Rotate the Neon database password** before the repo goes public
- [ ] **Submit the form**: repo link, live demo link, video link

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
- One-line pitch: a recurring-buy robo-investor for tokenized US stocks that
  defers the buy, with a reason on chain, when the reference price cannot be
  trusted.
