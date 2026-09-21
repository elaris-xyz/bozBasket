# Technical video — production brief

**For the editor.** An engineer watches this film, so the screen is code and
transactions. You still need no wallet, install or command line: every file is
a GitHub page and every transaction an explorer page, and all the links are
below. Keep the narration wording; you do not need to understand it.

**Nine tabs, nine shots.** Shot 1 is tab 1, shot 2 is tab 2, and so on to
shot 9, tab 9. Work left to right through the tabs and never go back to an
earlier one.

## 1. Deliverable

| | |
|---|---|
| Length | About 2:45. Hard limit 3:00. |
| Format | MP4, H.264, 1920×1080, 30 fps |
| Audio | Voice-over. No music, or music at least 25 dB under it. |
| Captions | Burned in, every line. |
| File | `bozbasket-technical.mp4` → YouTube, unlisted → the form's **Technical Video URL** |

It shares no footage with the pitch film, `docs/VIDEO.md`.

## 2. What you are looking at

The product buys a basket of tokenized US stocks on a schedule and refuses when
the price cannot be trusted. This film shows where that decision is made — on
the blockchain, not in the website — and that the refusals are real
transactions. **Pyth** publishes the price; **defer** means "refuse for now,
and record why".

## 3. Before you record

- Chrome, new profile, no extensions, bookmarks bar hidden, zoom 100%, window
  1920×1080, notifications off.
- **GitHub in dark theme**: profile icon → Settings → Appearance → Dark.
- Any time of day works; nothing here depends on the market.
- Open these nine links in nine tabs, in this order. On GitHub, the `#L…` part
  scrolls to and highlights the right lines — keep it.

| Tab = shot | What it is | Link |
|---|---|---|
| 1 | The repository | https://github.com/elaris-xyz/bozBasket |
| 2 | The plan account (code) | https://github.com/elaris-xyz/bozBasket/blob/main/programs/basket_dca/src/state.rs#L69-L100 |
| 3 | The four checks (code) | https://github.com/elaris-xyz/bozBasket/blob/main/programs/basket_dca/src/execute.rs#L126-L176 |
| 4 | What a refusal does (code) | https://github.com/elaris-xyz/bozBasket/blob/main/programs/basket_dca/src/execute.rs#L180-L195 |
| 5 | A real buy (explorer) | https://explorer.solana.com/tx/2NP5yUCncCSZoyoxco4bNdDJQVDYEqqHjnVanbAoAgtB6hbjSi7hq38Q3RkyxvVHy1AGti7g6kPWnTpwrUxwQLfd?cluster=devnet |
| 6 | A real refusal (explorer) | https://explorer.solana.com/tx/2HyNfzTFehzuEYCsNVWqodFo2XhMKwhYJRnMy5uDFHMmLGcxHLHkJPL6j1pG2JrBuHJKemKMdGn1L3hdSJDabHUD?cluster=devnet |
| 7 | The same refusal on the site | https://boz-basket-web.vercel.app/plan/5vV866AdEP6kR5NemndnVoopUCK4ygXCuyGUG8L78LZq |
| 8 | The shared rules (code) | https://github.com/elaris-xyz/bozBasket/blob/main/packages/shared/src/guard.ts#L75-L95 |
| 9 | The public API (site) | https://boz-basket-web.vercel.app/developers |

---

## 4. The shots

### Shot 1 · Tab 1 — What it is made of (0:00–0:15)

**Do:** Scroll slowly down the file list to the README.

**Say:**

> An Anchor program on Solana devnet. A keeper that runs as a scheduled
> function or a worker, through one code path. A Next.js app that reads the
> chain. And one package of guard rules, mirrored in Rust inside the program.
> Nine instructions; three matter: create a plan, deposit, execute.

---

### Shot 2 · Tab 2 — The account model (0:15–0:30)

**Do:** Hold on the highlighted lines, then zoom gently into the `vault` lines.

**Say:**

> A plan is one account: owner, legs and weights, amount, schedule, counters.
> The money sits in a vault the plan owns, and only the owner's key can
> withdraw. The keeper can trigger a buy; it can never move the money anywhere
> else.

**Edit:** Highlight `owner`, then the `vault` comment.

---

### Shot 3 · Tab 3 — The guard runs on chain (0:30–0:58)

**Do:** Scroll through the highlighted checks over about eight seconds.

**See:** Code comparing an age, a confidence figure, a divergence and a depth
with limits, each followed by `Verdict::Defer`.

**Say:**

> This is the part that is not a dashboard. Inside the transaction, for every
> leg, the price account must be one the Pyth receiver wrote, for this leg's
> feed, fully verified. Then four numbers against limits stored on chain: the
> price's age, its confidence band, the venue's divergence, and depth. Any one
> fails, and the verdict is defer.

**Edit:** Highlight each check as it is named. The most important shot; give
it room.

---

### Shot 4 · Tab 4 — A refusal is a success (0:58–1:12)

**Do:** Hold on the highlighted block.

**Say:**

> A deferral writes the reason into the plan, emits an event, and returns
> success. Deliberately: a failed transaction leaves nothing to audit, and
> this product's claim is that its refusals are as visible as its buys.

**Edit:** Highlight `return Ok(());`.

---

### Shot 5 · Tab 5 — One transaction, three stocks (1:12–1:35)

**Do:** Expand the instructions, then scroll to the token balance changes.

**See:** Success; one `ExecuteBasket` with three `Fill` calls inside; three
stock balances up and the vault down by 100; a Pyth instruction at the end.

**Say:**

> A real execution. The keeper posts Pyth's signed update to Pyth's receiver
> first; then this transaction reads it back, checks it, and buys all three
> legs — all or nothing. Three balances up, a hundred dollars out of the vault.
> Note the time: ten to five in the morning, New York, before the exchange
> opened. It filled because Pyth was publishing, not because a calendar said
> so.

**Edit:** Zoom into the instruction names, then the balance changes.

---

### Shot 6 · Tab 6 — And a refusal (1:35–1:50)

**Do:** Show **Success**. Scroll to the token balances, which are unchanged,
then to the log line that starts `Program data:`.

**Say:**

> The same plan, ten hours earlier. Success — and not one token moved. The
> reason is not printed as text; it is in this encoded event, and in the
> plan's own account.

**Note:** there is no readable reason in the log, and that is the point: the
next shot shows it decoded.

---

### Shot 7 · Tab 7 — The same refusal, decoded (1:50–2:02)

**Do:** Scroll to **History** at the bottom of the page. The row you need is
old, so it is not in the short list: click **Show all … entries** at the
bottom of History, then press Ctrl+F and search `47 h old`. Stop on the row
"deferred ×7 · Reference price stale · TSLA price 47 h old". Its transaction
link ends in `DabHUD`: the same transaction as tab 6.

**Say:**

> Decoded: reference price stale, forty-seven hours old, retry in an hour. The
> site reads the same event — this row is that same transaction.

**Edit:** Highlight the row, then its `DabHUD` link.

---

### Shot 8 · Tab 8 — One rulebook (2:02–2:17)

**Do:** Hold on the highlighted function for about five seconds.

**Say:**

> The Rust in the program and this TypeScript are the same rules. The plan
> page, the keeper and the public API all call this one function, so what a
> user sees is what the program will do.

---

### Shot 9 · Tab 9 — The open API, and what is real (2:17–2:45)

**Do:** Scroll to the verdict endpoint, `/api/v1/verdict`, and hold. Then
scroll to the very bottom of the page, to the footer line that begins "Devnet
demo. Stock tokens and fills are synthetic", and hold two seconds. Cut to
black.

**Say:**

> And any wallet can ask for the same verdict before its own swap. The same
> guard runs every five minutes against real tokenized-stock quotes on
> mainnet, read-only. On devnet the stock tokens and fills come from a mock
> market that fills at the reference price, and every page says so; the
> program, the vaults, the Pyth updates, the guard and every deferral are
> real. The repository is in the description.

**Edit:** Highlight the endpoint name, then the footer line.

---

## 5. If something goes wrong

| You see | Do |
|---|---|
| A GitHub link highlights nothing | Film the file from its top and tell the client which link missed. |
| The explorer says "not found" | Reload once, then set the network selector (top right) to **Devnet**. |
| Tab 7: no `47 h old` row | Make sure you clicked **Show all … entries** first, then search again. |
| A site page shows an error panel | Reload once, wait ten seconds; tell the client if it persists. |
| GitHub is in light theme | Fix it first (section 3). |

## 6. Delivery

The MP4, the project file and the raw capture. Upload to YouTube as unlisted
and send the link: it goes in the **Technical Video URL** field. The form
closes **Friday 25 September, 16:00 New York time**.
