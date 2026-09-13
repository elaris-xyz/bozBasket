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
- [ ] **Deploy the web app to Vercel** (settings below) and put the URL in the README
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
| `DEMO_CONTROLS` | leave **unset** in production unless you want the controls public |

`DEMO_CONTROLS=1` also needs `KEEPER_SECRET_KEY`, which is the programs'
upgrade authority. Enable both only for a live demo you are driving, and
unset them afterwards. The video does not need them: record locally.

## Keeper in production

The keeper is a long-running process, so it does not belong on Vercel. Either
run it locally during judging, or deploy `apps/keeper` to a small worker host
with `KEEPER_KEYPAIR`, `PYTH_API_KEY`, `SOLANA_RPC_URL` and `DATABASE_URL`.
Without it, plans simply never execute and the app still shows everything
else — which is the honest failure mode, and one a judge can verify.

## Facts worth having at hand

- Devnet program: `4Tv5nEbh6b6EGNhep7rpeLy7NXpiz8AkRmVi36iwxVuR`
- The three Pyth equity feeds in use: TSLA, QQQ, VOO
- One-line pitch: a recurring-buy robo-investor for tokenized US stocks that
  defers the buy, with a reason on chain, when the reference price cannot be
  trusted.
